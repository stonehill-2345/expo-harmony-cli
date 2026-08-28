import * as fs from 'fs';
import * as path from 'path';
import type { HarmonyGenerationOptions } from './types';
import { resolveBundleName, resolveAppName } from './config-merger';
import { initProject } from './init-project';
import { runAutolinking, type AutolinkingResult } from './autolinking';
import { HARMONY_PACKAGE_MAPPING } from './harmony-package-mapping';
import JSON5 from 'json5';
import packageJson from '../../package.json';
import { log } from '../utils/log';
import {
  findGeneratedFileDrift, readManagedEntries, readManagedState,
  withGeneratedFileBaselines, withManagedEntries, writeManagedState,
} from '../lifecycle/managed-state';

/**
 * 编排：resolveBundleName/appName → init（模板拷贝 + 6 动态渲染 + gitignore 重命名 +
 * build-profile.template）→ autolinking（写三文件 + oh-package 合并）。
 *
 * init 流程参考官方 cli B 节。metro.config.js 不写（expo 项目已有，spec 决策）。
 */
export async function runHarmonyGeneration(
  projectRoot: string,
  expoConfig: any,
  opts: HarmonyGenerationOptions = {},
): Promise<void> {
  const bundleName = opts.bundleName ?? resolveBundleName(expoConfig);
  const appName = opts.appName ?? resolveAppName(expoConfig);
  const rnohNpmPackageName = opts.rnohNpmPackageName ?? '@react-native-oh/react-native-harmony';
  const rnohCliNpmPackageName =
    opts.rnohCliNpmPackageName ?? '@react-native-oh/react-native-harmony-cli';
  const harmonyDir = path.join(projectRoot, 'harmony');

  if (fs.existsSync(harmonyDir) && !opts.force) {
    throw new Error(
      `harmony/ 已存在。如需覆盖生成，请执行：pnpm dlx expo-harmony-cli prebuild --platform harmony --force`,
    );
  }
  if (opts.force && fs.existsSync(harmonyDir)) {
    log.warn(
      'prebuild --force 将删除整个 harmony/ 目录（含签名、资源与手工配置），此操作不可恢复；' +
        'PackageProvider 等文件中的自定义代码也会被重置，请依赖 git 恢复或先手动备份',
    );
    fs.rmSync(harmonyDir, { recursive: true, force: true });
  }

  // ① init：模板拷贝 + 6 动态渲染 + gitignore 重命名 + build-profile.template
  await initProject({
    projectRoot,
    harmonyDir,
    bundleName,
    appName,
    rnohNpmPackageName,
    rnohCliNpmPackageName,
    templateSource: opts.templateSource,
  });

  // ② autolinking：写三文件（ets/cpp/cmake）+ 合并 oh-package.json5
  await syncHarmonyAutolinking(projectRoot, { force: opts.force });
}

/**
 * 仅刷新 HarmonyOS 原生依赖的 autolinking 托管文件。
 * 不复制模板、不删除 harmony/，因此不会影响签名、资源和其他非托管配置。
 */
export type SyncAutolinkingOptions = { force?: boolean };
export type DriftedEntry = { path: string; dependency: string; currentSpec: string; expectedSpec: string; baselineSpec?: string };
export type DriftReport = { files: string[]; entries: DriftedEntry[] };

export class DriftError extends Error {
  constructor(report: DriftReport, scope: 'sync' | 'preflight') {
    super([
      scope === 'sync' ? '检测到受管文件被手动修改，已阻止覆盖：' : '检测到受管文件被手动修改，已阻止本次 install/uninstall（尚未做任何变更）：',
      ...report.files.map(file => `  - ${file}`),
      ...report.entries.map(entry => `  - ${entry.path}（${entry.dependency}：现值 ${entry.currentSpec} → 期望 ${entry.expectedSpec}）`),
      scope === 'sync' ? '请还原手动修改，或执行 sync --force 覆盖。' : '请还原手动修改，或使用 install/uninstall --force 跳过保护。',
      '如需注册自定义 Package，请在 entry/src/main/ets/PackageProvider.ets（或 cpp/PackageProvider.cpp）中追加——该文件归你管理，CLI 不会覆盖。',
    ].join('\n'));
    this.name = 'DriftError';
  }
}

export function hasDrift(report: DriftReport): boolean { return report.files.length > 0 || report.entries.length > 0; }

export function collectDrift(projectRoot: string, result: AutolinkingResult): DriftReport {
  const relPaths = result.files.filter(file => !file.path.endsWith('oh-package.json5')).map(file => path.relative(projectRoot, file.path));
  const report: DriftReport = { files: findGeneratedFileDrift(projectRoot, relPaths), entries: [] };
  const baselines = readManagedEntries(projectRoot);
  for (const { ohPackagePath, expected } of result.managedOhPackageEntries) {
    if (!fs.existsSync(ohPackagePath)) continue;
    let deps: Record<string, string>;
    try { deps = (JSON5.parse(fs.readFileSync(ohPackagePath, 'utf8')).dependencies ?? {}) as Record<string, string>; } catch { continue; }
    const rel = path.relative(projectRoot, ohPackagePath);
    for (const [dependency, expectedSpec] of Object.entries(expected)) {
      const currentSpec = deps[dependency];
      if (currentSpec === undefined || currentSpec === expectedSpec) continue;
      const baseline = baselines[`${rel}:${dependency}`];
      if (baseline && currentSpec === baseline.spec) continue;
      if (!baseline && /^file:/.test(currentSpec)) continue;
      report.entries.push({ path: rel, dependency, currentSpec, expectedSpec, ...(baseline ? { baselineSpec: baseline.spec } : {}) });
    }
  }
  return report;
}

/** 事务回滚：单个恢复失败不中断后续恢复、不掩盖原始错误；返回未能自动恢复的相对路径。 */
function rollbackTransaction(
  projectRoot: string,
  replaced: string[],
  backups: Array<{ bakPath: string; targetPath: string }>,
  staged: Array<{ tmpPath: string; targetPath: string }>,
): string[] {
  const failures: string[] = [];
  for (const targetPath of replaced) {
    try {
      if (fs.existsSync(targetPath)) fs.rmSync(targetPath, { force: true });
    } catch {
      failures.push(path.relative(projectRoot, targetPath));
    }
  }
  for (const backup of backups) {
    try {
      if (fs.existsSync(backup.bakPath)) fs.renameSync(backup.bakPath, backup.targetPath);
    } catch {
      failures.push(path.relative(projectRoot, backup.bakPath));
    }
  }
  for (const s of staged) {
    try {
      if (fs.existsSync(s.tmpPath)) fs.rmSync(s.tmpPath, { force: true });
    } catch {
      // tmp 残留无害：下次 sync 步骤 0 自动清理。
    }
  }
  return failures;
}

/** 步骤 0 扫描时跳过的构建产物/依赖目录：受管文件不会位于其中，跳过可避免遍历海量文件。 */
const ARTIFACT_SCAN_SKIP_DIRS = new Set(['oh_modules', 'node_modules', '.hvigor', '.cxx', 'build']);

/**
 * 步骤 0：上次中断残留三态（tmp 清理 / bak+目标缺失恢复 / bak+目标并存阻断）。
 * 扫盘而非依赖 autolinking 结果——runAutolinking 需读磁盘 oh-package，恢复必须先于它执行；
 * 扫盘同时覆盖"残留文件本次已不再受管"的场景，避免 bak 永久残留。
 */
function recoverInterruptedArtifacts(projectRoot: string, harmonyDir: string, opts: SyncAutolinkingOptions): string[] {
  const conflicts: string[] = [];
  const stateTmpPath = path.join(projectRoot, '.expo-harmony', 'managed-state.json.cli-tmp');
  if (fs.existsSync(stateTmpPath)) {
    fs.rmSync(stateTmpPath, { force: true });
    log.info(`清理上次中断的状态暂存文件：${path.relative(projectRoot, stateTmpPath)}`);
  }
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!ARTIFACT_SCAN_SKIP_DIRS.has(entry.name)) walk(full);
        continue;
      }
      if (full.endsWith('.cli-tmp')) {
        fs.rmSync(full, { force: true });
        log.info(`清理上次中断的暂存文件：${path.relative(projectRoot, full)}`);
      } else if (full.endsWith('.cli-bak')) {
        const target = full.slice(0, -'.cli-bak'.length);
        if (!fs.existsSync(target)) {
          fs.renameSync(full, target);
          log.info(`从备份恢复受管文件：${path.relative(projectRoot, target)}`);
        } else if (opts.force) {
          fs.rmSync(full, { force: true });
          log.info(`清理上次中断的备份文件：${path.relative(projectRoot, full)}`);
        } else conflicts.push(path.relative(projectRoot, full));
      }
    }
  };
  walk(harmonyDir);
  return conflicts;
}

function syncHarmonyAutolinkingImpl(projectRoot: string, opts: SyncAutolinkingOptions = {}): AutolinkingResult {
  const harmonyDir = path.join(projectRoot, 'harmony');
  if (!fs.existsSync(harmonyDir)) {
    throw new Error(
      'harmony/ 尚未生成。请先执行：pnpm dlx expo-harmony-cli prebuild --platform harmony',
    );
  }

  const conflicts = recoverInterruptedArtifacts(projectRoot, harmonyDir, opts);
  if (conflicts.length) {
    throw new Error(
      `检测到上次中断遗留的备份文件：${conflicts.join(', ')}。请执行 sync --force 清理；` +
        '若需保留备份内容，请先将 .cli-bak 手动重命名回原路径（去掉 .cli-bak 后缀）后重试',
    );
  }
  const result = runAutolinking({
    projectRoot,
    harmonyDir,
    mapping: HARMONY_PACKAGE_MAPPING,
  });
  const previousState = readManagedState(projectRoot);
  const firstBaseline =
    !Object.keys(previousState.generatedFiles ?? {}).length &&
    !Object.keys(previousState.managedEntries ?? {}).length;
  if (firstBaseline) log.info('首次同步：建立受管文件基线，此后手动修改受管文件将被保护性阻断');
  const report = collectDrift(projectRoot, result);
  if (hasDrift(report) && !opts.force) throw new DriftError(report, 'sync');
  const staged: Array<{ tmpPath: string; targetPath: string }> = [];
  try {
    for (const file of result.files) {
      fs.mkdirSync(path.dirname(file.path), { recursive: true });
      const tmpPath = `${file.path}.cli-tmp`;
      fs.writeFileSync(tmpPath, file.content);
      staged.push({ tmpPath, targetPath: file.path });
    }
  } catch (err) {
    staged.forEach(s => fs.rmSync(s.tmpPath, { force: true }));
    throw new Error(`受管文件写入失败（已回退，磁盘文件未变动）：${err instanceof Error ? err.message : err}`);
  }
  const backups: Array<{ bakPath: string; targetPath: string }> = [];
  const replaced: string[] = [];
  let stage: 'replace' | 'state' = 'replace';
  try {
    // ③ 备份 + 替换
    for (const { targetPath } of staged) {
      if (fs.existsSync(targetPath)) {
        const bakPath = `${targetPath}.cli-bak`;
        fs.renameSync(targetPath, bakPath);
        backups.push({ bakPath, targetPath });
      }
    }
    for (const { tmpPath, targetPath } of staged) { fs.renameSync(tmpPath, targetPath); replaced.push(targetPath); }
    // ④ 状态原子落账（先于删 bak：落账失败则回滚文件，避免"新文件+旧基线"错配）
    stage = 'state';
    let nextState = readManagedState(projectRoot);
    const generated = result.files.filter(file => !file.path.endsWith('oh-package.json5')).map(file => path.relative(projectRoot, file.path));
    nextState = withGeneratedFileBaselines(projectRoot, nextState, generated, packageJson.version);
    nextState = withManagedEntries(nextState, result.managedOhPackageEntries.flatMap(({ ohPackagePath, expected }) => Object.entries(expected).map(([dependency, spec]) => ({ path: path.relative(projectRoot, ohPackagePath), dependency, spec }))), packageJson.version);
    writeManagedState(projectRoot, nextState);
  } catch (err) {
    const failed = rollbackTransaction(projectRoot, replaced, backups, staged);
    const head = stage === 'state' ? '基线状态写入失败，已回滚' : '受管文件事务失败，已回滚';
    const detail = err instanceof Error ? err.message : err;
    const tail = failed.length
      ? `；以下文件未能自动恢复：${failed.join(', ')}。请手动将 .cli-bak 重命名回原路径后重试，或执行 sync --force 清理`
      : '';
    throw new Error(`${head}：${detail}${tail}`);
  }
  // ⑤ 清理备份（落账成功后）
  backups.forEach(b => fs.rmSync(b.bakPath, { force: true }));
  return result;
}

/**
 * 仅刷新 HarmonyOS 原生依赖的 autolinking 托管文件（async：为后续官方链路接入保持签名稳定）。
 */
export async function syncHarmonyAutolinking(
  projectRoot: string,
  opts: SyncAutolinkingOptions = {},
): Promise<AutolinkingResult> {
  return syncHarmonyAutolinkingImpl(projectRoot, opts);
}

export function assertNoDrift(projectRoot: string): void {
  const harmonyDir = path.join(projectRoot, 'harmony');
  if (!fs.existsSync(harmonyDir)) return;
  try {
    const report = collectDrift(projectRoot, runAutolinking({ projectRoot, harmonyDir, mapping: HARMONY_PACKAGE_MAPPING }));
    if (hasDrift(report)) throw new DriftError(report, 'preflight');
  } catch (err) {
    if (err instanceof DriftError) throw err;
    const keys = Object.keys(readManagedState(projectRoot).generatedFiles ?? {});
    const files = findGeneratedFileDrift(projectRoot, keys);
    if (files.length) throw new DriftError({ files, entries: [] }, 'preflight');
  }
}
