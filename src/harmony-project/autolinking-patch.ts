import * as fs from 'fs';
import * as path from 'path';
import JSON5 from 'json5';
import type { HarmonyPackageMappingEntry } from './types';
import { buildPackageSnippets, type PackageSnippets } from './autolinking';
import type { OfficialAutolinkingResult } from './official-autolinking';

/**
 * 官方产物锚点补充（任务三）：对官方未覆盖的包，用 mapping 片段插入官方三工厂，
 * 并合并/改写 oh-package。锚点形状依据 0.77.71 真实产物契约（见
 * docs/superpowers/specs/2026-09-09-official-autolink-contract.md）。
 *
 * 阻断语义：跨包同名 symbol/target 冲突、部分注册无法归属时抛 AutolinkingPatchError，
 * 由调用方决定回退批量自研——不得发布重复注册或损坏文件。
 */

export interface PatchedFile {
  path: string;
  content: string;
}

export interface PatchReport {
  files: PatchedFile[];
  /** mapping 补充成功的包。 */
  patched: string[];
  /** mapping 命中但 HAR 无效的包及原因。 */
  skippedNoHar: Array<{ package: string; reason: string }>;
  /** 未覆盖且 mapping 未收录（提示 skill）。 */
  remainingGaps: string[];
}

export class AutolinkingPatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AutolinkingPatchError';
  }
}

/** 官方产物中已注册的 ets/cpp 实例 symbol（new X(ctx) / make_shared<ns::X>）。 */
function collectRegisteredSymbols(ets: string, cpp: string): Map<string, string[]> {
  const symbols = new Map<string, string[]>();
  const add = (name: string) => symbols.set(name, [...(symbols.get(name) ?? []), name]);
  for (const m of ets.matchAll(/new\s+([A-Za-z_]\w*)\(ctx\)/g)) add(m[1]);
  for (const m of cpp.matchAll(/make_shared<(?:\w+::)?([A-Za-z_]\w*)>\(ctx\)/g)) add(m[1]);
  return symbols;
}

function snippetSymbols(pkg: string, snippets: PackageSnippets): Map<string, string[]> {
  const symbols = new Map<string, string[]>();
  const add = (name: string) => symbols.set(name, [...(symbols.get(name) ?? []), pkg]);
  for (const line of snippets.etsInstances) {
    const m = line.match(/new\s+([A-Za-z_]\w*)\(ctx\)/);
    if (m) add(m[1]);
  }
  for (const line of snippets.cppInstances) {
    const m = line.match(/make_shared<(?:\w+::)?([A-Za-z_]\w*)>\(ctx\)/);
    if (m) add(m[1]);
  }
  return symbols;
}

/** 在 lines 中找 predicate 命中行的下标，找不到返回 -1。 */
function findLine(lines: string[], predicate: (line: string) => boolean): number {
  return lines.findIndex(predicate);
}

/** 官方 oh-package 产物里的临时目录深相对路径 → 真实项目相对路径（root 级 ../node_modules）。 */
export function rewriteOhPackageSpec(spec: string): string {
  const m = spec.match(/^file:(?:\.\.\/)+(.*node_modules\/(.+))$/);
  if (!m) return spec;
  return `file:../node_modules/${m[2]}`;
}

/** 删除 gap 包在产物中的部分注册残留（import 行 / cmake 定位行 / 依赖键），返回是否发现残留。 */
function stripPartialRegistration(
  lines: { ets: string[]; cmake: string[] },
  cmakeTargets: string[],
  pkg: string,
  ohDeps: Record<string, string>,
): boolean {
  let found = false;
  const importIdx = findLine(lines.ets, l => new RegExp(`^import\\s+.*from\\s+'${pkg}(/ts)?';$`).test(l));
  if (importIdx >= 0) {
    lines.ets.splice(importIdx, 1);
    found = true;
  }
  // cmake：resolve_oh_package_cpp("pkg") 与 OH_MODULES_DIR}/pkg/ 两形态，连带其 set(AUTOLINKED_CPP_DIR) 前导行
  for (let i = lines.cmake.length - 1; i >= 0; i--) {
    const line = lines.cmake[i];
    if (new RegExp(`resolve_oh_package_cpp\\([^)]*"${pkg}"`).test(line) || line.includes(`\${OH_MODULES_DIR}/${pkg}/`)) {
      if (i > 0 && /set\(AUTOLINKED_CPP_DIR/.test(lines.cmake[i - 1])) lines.cmake.splice(i - 1, 2);
      else lines.cmake.splice(i, 1);
      found = true;
    }
  }
  for (const target of cmakeTargets) {
    const idx = findLine(lines.cmake, l => l.trim() === target);
    if (idx >= 0 && found) lines.cmake.splice(idx, 1);
  }
  if (pkg in ohDeps) {
    delete ohDeps[pkg];
    found = true;
  }
  return found;
}

export function patchOfficialArtifacts(opts: {
  projectRoot: string;
  harmonyDir: string;
  official: OfficialAutolinkingResult;
  mapping: Record<string, HarmonyPackageMappingEntry>;
}): PatchReport {
  const { official, mapping } = opts;

  // ① 缺口分类：mapping 命中且 HAR 有效 → 待补充；HAR 无效 → 跳过；未收录 → remainingGaps
  const patched: string[] = [];
  const skippedNoHar: Array<{ package: string; reason: string }> = [];
  const remainingGaps: string[] = [];
  const toPatch: HarmonyPackageMappingEntry[] = [];
  for (const pkg of official.uncoveredPackages) {
    const entry = mapping[pkg];
    if (!entry) {
      remainingGaps.push(pkg);
      continue;
    }
    const harPath = path.join(opts.projectRoot, 'node_modules', pkg, 'harmony', entry.harName);
    if (!fs.existsSync(harPath) || fs.statSync(harPath).size === 0) {
      skippedNoHar.push({ package: pkg, reason: `缺少有效 HAR: ${path.relative(opts.projectRoot, harPath)}` });
      continue;
    }
    toPatch.push(entry);
  }
  toPatch.sort((a, b) => a.npmPackageName.localeCompare(b.npmPackageName));

  const etsFile = official.files.find(f => f.path.endsWith('RNOHPackagesFactory.ets'))!;
  const cppFile = official.files.find(f => f.path.endsWith('RNOHPackagesFactory.h'))!;
  const cmakeFile = official.files.find(f => f.path.endsWith('autolinking.cmake'))!;
  const ohFile = official.files.find(f => f.path.endsWith('oh-package.json5'))!;

  const etsLines = etsFile.content.split('\n');
  const cppLines = cppFile.content.split('\n');
  const cmakeLines = cmakeFile.content.split('\n');
  let ohPackage: { dependencies?: Record<string, string> };
  try {
    ohPackage = JSON5.parse(ohFile.content) as { dependencies?: Record<string, string> };
  } catch (err) {
    throw new AutolinkingPatchError(`官方 oh-package 产物不可解析：${err instanceof Error ? err.message : String(err)}`);
  }
  const ohDeps: Record<string, string> = { ...(ohPackage.dependencies ?? {}) };

  // ② 冲突检测：官方已注册 symbol 与待插 symbol、待插相互之间同名即报错（不得去重掩盖）
  const officialSymbols = collectRegisteredSymbols(etsFile.content, cppFile.content);
  const pending = new Map<string, PackageSnippets>(toPatch.map(lib => [lib.npmPackageName, buildPackageSnippets(lib)]));
  const cmakeTargetOwners = new Map<string, string>(
    [...cmakeFile.content.matchAll(/^\s+(rnoh__?\w+)\s*$/gm)].map(m => [m[1], '__official__']),
  );
  const conflicts: string[] = [];
  const seen = new Map<string, string>();
  for (const [pkg, snippets] of pending) {
    for (const [symbol, owners] of snippetSymbols(pkg, snippets)) {
      if (officialSymbols.has(symbol)) {
        conflicts.push(`ETS/C++ symbol ${symbol}（${pkg}）与官方已注册的 ${symbol} 冲突`);
      } else if (seen.has(symbol)) {
        conflicts.push(`ETS/C++ symbol ${symbol} 同时属于 ${seen.get(symbol)} 与 ${pkg}`);
      } else {
        seen.set(symbol, pkg);
      }
    }
    for (const line of snippets.cmakeTargets) {
      const target = line.trim();
      const owner = cmakeTargetOwners.get(target);
      if (owner && owner !== pkg) {
        conflicts.push(`CMake target ${target}（${pkg}）与 ${owner === '__official__' ? '官方产物' : owner} 冲突`);
      } else if (!owner) {
        cmakeTargetOwners.set(target, pkg);
      }
    }
  }
  if (conflicts.length) {
    throw new AutolinkingPatchError(`检测到跨插件注册冲突，已中止补充（原文工程保留）：\n${conflicts.join('\n')}`);
  }

  // ③ 部分注册残留清理（可凭包名唯一定位的行级替换）
  for (const [pkg, snippets] of pending) {
    stripPartialRegistration(
      { ets: etsLines, cmake: cmakeLines },
      snippets.cmakeTargets.map(t => t.trim()),
      pkg,
      ohDeps,
    );
  }

  // ④ 锚点插入：行级定位官方产物结构
  const insertAfter = (lines: string[], from: number, to: number, additions: string[]): number => {
    lines.splice(to + 1, 0, ...additions);
    return additions.length;
  };

  const snippetsOf = (pkg: string) => pending.get(pkg)!;
  const patchedNames = [...pending.keys()];

  // ETS import 区末（最后一个 import 行后）
  let lastImport = -1;
  for (let i = 0; i < etsLines.length; i++) if (/^import\s+/.test(etsLines[i])) lastImport = i;
  if (lastImport < 0) throw new AutolinkingPatchError('官方 ETS 产物缺少 import 锚点');
  insertAfter(etsLines, lastImport, lastImport, patchedNames.flatMap(p => snippetsOf(p).etsImports));

  // ETS 实例区（"  ];" 前）
  const etsClose = findLine(etsLines, l => l.trim() === '];');
  if (etsClose < 0) throw new AutolinkingPatchError('官方 ETS 产物缺少实例数组锚点');
  etsLines.splice(etsClose, 0, ...patchedNames.flatMap(p => snippetsOf(p).etsInstances));

  // CPP include 区末
  let lastInclude = -1;
  for (let i = 0; i < cppLines.length; i++) if (/^#include\s+"/.test(cppLines[i])) lastInclude = i;
  if (lastInclude < 0) throw new AutolinkingPatchError('官方 CPP 产物缺少 include 锚点');
  insertAfter(cppLines, lastInclude, lastInclude, patchedNames.flatMap(p => snippetsOf(p).cppIncludes));

  // CPP 实例区（"  };" 前）
  const cppClose = findLine(cppLines, l => l.trim() === '};');
  if (cppClose < 0) throw new AutolinkingPatchError('官方 CPP 产物缺少实例数组锚点');
  cppLines.splice(cppClose, 0, ...patchedNames.flatMap(p => snippetsOf(p).cppInstances));

  // CMake：add_subdirectory 区（"    set(AUTOLINKED_LIBRARIES" 行前）
  const setIdx = findLine(cmakeLines, l => /^\s*set\(AUTOLINKED_LIBRARIES/.test(l));
  if (setIdx < 0) throw new AutolinkingPatchError('官方 CMake 产物缺少 AUTOLINKED_LIBRARIES 锚点');
  cmakeLines.splice(setIdx, 0, ...patchedNames.flatMap(p => snippetsOf(p).cmakeSubdirectories).flat());

  // CMake：target 集合（set( 后第一个 "    )" 前）
  const setClose = (() => {
    for (let i = setIdx + 1; i < cmakeLines.length; i++) if (cmakeLines[i].trim() === ')') return i;
    return -1;
  })();
  if (setClose < 0) throw new AutolinkingPatchError('官方 CMake 产物缺少 target 集合闭合锚点');
  cmakeLines.splice(setClose, 0, ...patchedNames.flatMap(p => snippetsOf(p).cmakeTargets));

  // ⑤ oh-package：改写官方深路径 + 补充 gap 包 HAR 引用
  for (const [name, spec] of Object.entries(ohDeps)) {
    ohDeps[name] = rewriteOhPackageSpec(String(spec));
  }
  for (const pkg of patchedNames) {
    const entry = mapping[pkg];
    ohDeps[pkg] = `file:../node_modules/${pkg}/harmony/${entry.harName}`;
  }
  ohPackage.dependencies = ohDeps;

  const etsContent = etsLines.join('\n');
  const cppContent = cppLines.join('\n');
  const cmakeContent = cmakeLines.join('\n');
  // 序列化与官方产物形状保持一致（标准 JSON）：官方 CLI 与 hvigor 均按 JSON5 读取，
  // 但标准 JSON 额外兼容纯 JSON.parse 的消费方，且避免裸键在二轮调用中破坏解析。
  const ohContent = JSON.stringify(ohPackage, null, 2) + '\n';

  // ⑥ 插入后校验：所需片段必须全部存在
  const missing: string[] = [];
  for (const [pkg, snippets] of pending) {
    for (const s of [...snippets.etsImports, ...snippets.etsInstances, ...snippets.cppIncludes, ...snippets.cppInstances, ...snippets.cmakeTargets]) {
      if (!(s.startsWith('    set(AUTOLINKED') ? cmakeContent.includes(s) || cmakeContent.includes(s.trim()) : (etsContent.includes(s) || cppContent.includes(s) || cmakeContent.includes(s)))) {
        missing.push(`${pkg}: ${s.trim()}`);
      }
    }
    if (!ohContent.includes(`file:../node_modules/${pkg}/harmony/`)) missing.push(`${pkg}: oh-package HAR 引用缺失`);
  }
  if (missing.length) {
    throw new AutolinkingPatchError(`补充片段插入后校验失败：\n${missing.join('\n')}`);
  }

  patched.push(...patchedNames);
  return {
    files: [
      { path: etsFile.path, content: etsContent },
      { path: cppFile.path, content: cppContent },
      { path: cmakeFile.path, content: cmakeContent },
      { path: ohFile.path, content: ohContent },
    ],
    patched,
    skippedNoHar,
    remainingGaps,
  };
}
