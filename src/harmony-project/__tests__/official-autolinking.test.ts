import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runOfficialAutolinking } from '../official-autolinking';
import { HARMONY_PACKAGE_MAPPING } from '../harmony-package-mapping';
import { installFakeRnohCli as installFakeRnohCliHelper, installAdapterPkg as installAdapterPkgHelper } from './helpers/fake-rnoh-cli';

/**
 * 任务二测试：官方 link-harmony 调用适配器。
 * 契约依据 docs/superpowers/specs/2026-09-09-official-autolink-contract.md（0.77.71 真实 fixture 验证）。
 * fake CLI 模拟官方行为：在 harmonyProjectPath 下写 4 产物，oh-package 在既有内容上合并。
 */

let projectRoot: string;
let harmonyDir: string;

function write(rel: string, content: string): void {
  const p = path.join(projectRoot, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

/** 生成 fake 官方 CLI 模块内容：mode 控制其行为，产物形状对齐真实 0.77.71 契约。 */
function fakeCliModule(mode: 'ok' | 'no-func' | 'partial' | 'throw' | 'silent-fail'): string {
  const Q = "'";
  const L = [
    'const fs = require("fs");',
    'const path = require("path");',
    'exports.commandLinkHarmony = {',
    '  func: async (_argv, _config, rawArgs) => {',
    '    const h = rawArgs.harmonyProjectPath;',
    '    const w = (rel, c) => { const p = path.join(h, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };',
  ];
  if (mode === 'throw') L.push('    throw new Error("boom unexpected");');
  if (mode === 'silent-fail') L.push('    return; // DescriptiveError 静默失败：不写产物');
  L.push(
    '    const oh = fs.existsSync(path.join(h, "oh-package.json5"))',
    '      ? JSON.parse(fs.readFileSync(path.join(h, "oh-package.json5"), "utf8"))',
    '      : { dependencies: {} };',
    '    const deps = { ...(oh.dependencies || {}) };',
  );
  if (mode !== 'partial') {
    L.push(
      `    deps["@react-native-ohos/react-native-video"] = "file:../../node_modules/@react-native-ohos/react-native-video/harmony/rn_video.har";`,
      `    deps["official-only-pkg"] = "file:../../node_modules/official-only-pkg/harmony/x.har";`,
      `    w("entry/src/main/ets/RNOHPackagesFactory.ets", [`,
      `      "import type { RNPackageContext, RNOHPackage } from '@rnoh/react-native-openharmony';",`,
      `      "import RNCVideoPackage from '@react-native-ohos/react-native-video';",`,
      `      "import OfficialOnlyPackage from 'official-only-pkg';",`,
      `      ${Q}${Q},`,
      `      ${Q}export function createRNOHPackages(ctx: RNPackageContext): RNOHPackage[] {${Q},`,
      `      ${Q}  return [${Q},`,
      `      ${Q}    new RNCVideoPackage(ctx),${Q},`,
      `      ${Q}    new OfficialOnlyPackage(ctx),${Q},`,
      `      ${Q}  ];${Q},`,
      `      ${Q}}${Q},`,
      `      ${Q}${Q},`,
      `    ].join("\\n"));`,
      `    w("entry/src/main/cpp/RNOHPackagesFactory.h", [`,
      `      ${Q}#include "RNOH/Package.h"${Q},`,
      `      ${Q}#include "RNCVideoPackage.h"${Q},`,
      `      ${Q}#include "OfficialOnlyPackage.h"${Q},`,
      `      ${Q}${Q},`,
      `      ${Q}std::vector<rnoh::Package::Shared> createRNOHPackages(const rnoh::Package::Context &ctx) {${Q},`,
      `      ${Q}  return {${Q},`,
      `      ${Q}    std::make_shared<rnoh::RNCVideoPackage>(ctx),${Q},`,
      `      ${Q}    std::make_shared<rnoh::OfficialOnlyPackage>(ctx),${Q},`,
      `      ${Q}  };${Q},`,
      `      ${Q}}${Q},`,
      `      ${Q}${Q},`,
      `    ].join("\\n"));`,
      `    w("entry/src/main/cpp/autolinking.cmake", [`,
      `      ${Q}cmake_minimum_required(VERSION 3.5)${Q},`,
      `      ${Q}function(autolink_libraries target)${Q},`,
      `      ${Q}    add_subdirectory("\${OH_MODULES_DIR}/@react-native-ohos/react-native-video/src/main/cpp" ./rnoh_video)${Q},`,
      `      ${Q}    add_subdirectory("\${OH_MODULES_DIR}/official-only-pkg/src/main/cpp" ./rnoh_official_only)${Q},`,
      `      ${Q}${Q},`,
      `      ${Q}    set(AUTOLINKED_LIBRARIES${Q},`,
      `      ${Q}        rnoh_video${Q},`,
      `      ${Q}        rnoh_official_only${Q},`,
      `      ${Q}    )${Q},`,
      `      ${Q}    foreach(lib \${AUTOLINKED_LIBRARIES})${Q},`,
      `      ${Q}        target_link_libraries(\${target} PUBLIC \${lib})${Q},`,
      `      ${Q}    endforeach()${Q},`,
      `      ${Q}endfunction()${Q},`,
      `      ${Q}${Q},`,
      `    ].join("\\n"));`,
    );
  }
  L.push(
    '    w("oh-package.json5", JSON.stringify({ ...oh, dependencies: deps }, null, 2));',
    '  },',
    '};',
  );
  return L.join('\n');
}

/** 安装 fake 官方 CLI：mode 控制其行为。 */
function installFakeCli(mode: 'ok' | 'no-func' | 'partial' | 'throw' | 'silent-fail'): void {
  const dist = mode === 'no-func'
    ? 'module.exports = { commandLinkHarmony: {} };'
    : fakeCliModule(mode);
  write('node_modules/@react-native-oh/react-native-harmony-cli/package.json', JSON.stringify({ name: '@react-native-oh/react-native-harmony-cli', version: '0.77.71-fake' }));
  write('node_modules/@react-native-oh/react-native-harmony-cli/dist/commands/link-harmony.js', dist);
}

/** 安装一个带 harmony 目录的适配包（无 metadata，属于 mapping 补充目标）。 */
function installAdapterPkg(name: string, harName: string): void {
  write(`node_modules/${name}/package.json`, JSON.stringify({ name, version: '1.0.0', harmony: { alias: name } }));
  write(`node_modules/${name}/harmony/${harName}`, 'fake har bytes');
}

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ehc-official-test-'));
  harmonyDir = path.join(projectRoot, 'harmony');
  fs.mkdirSync(path.join(harmonyDir, 'entry/src/main/ets'), { recursive: true });
  fs.writeFileSync(path.join(harmonyDir, 'oh-package.json5'), JSON.stringify({
    name: 'root',
    dependencies: { 'user-manual-dep': '1.0.0' },
  }));
});

afterEach(() => {
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

describe('runOfficialAutolinking', () => {
  it('CLI 未安装时返回 ok=false 且不抛错', async () => {
    installAdapterPkg('@react-native-ohos/react-native-safe-area-context', 'safe_area.har');
    const result = await runOfficialAutolinking({ projectRoot, harmonyDir });
    expect(result.ok).toBe(false);
    expect(result.failureReason).toMatch(/CLI/i);
  });

  it('入口缺少 func 时返回 ok=false', async () => {
    installFakeCli('no-func');
    const result = await runOfficialAutolinking({ projectRoot, harmonyDir });
    expect(result.ok).toBe(false);
    expect(result.failureReason).toBeTruthy();
  });

  it('官方成功：产物读出、覆盖以产物交叉验证、含 mapping 外的官方独有包', async () => {
    installFakeCli('ok');
    installAdapterPkg('@react-native-ohos/react-native-safe-area-context', 'safe_area.har');
    const result = await runOfficialAutolinking({ projectRoot, harmonyDir });
    expect(result.ok).toBe(true);
    expect(result.cliVersion).toBe('0.77.71-fake');
    // 官方独有包（不在任何 mapping）也能被识别
    expect(result.officialPackages).toContain('official-only-pkg');
    expect(result.officialPackages).toContain('@react-native-ohos/react-native-video');
    // 产物文件指向真实 harmonyDir
    const ets = result.files.find(f => f.path.endsWith('RNOHPackagesFactory.ets'));
    expect(ets?.content).toContain('new RNCVideoPackage(ctx)');
    // 工厂返回类型改写为 RNPackage[]（旧式 extends RNPackage 包的类型兼容）
    expect(ets?.content).toContain('): RNPackage[] {');
    expect(ets?.content).not.toContain('RNOHPackage[]');
    // 临时目录已清理（os.tmpdir 下无本次残留 probe/ehc-link 前缀目录的依据：官方产物在 result 中且 tmp 清理）
    // （清理以 finally 语义保证，见下个用例的 throw 场景）
  });

  it('拷贝的既有 oh-package 旧键不被误判为官方覆盖', async () => {
    installFakeCli('ok');
    const result = await runOfficialAutolinking({ projectRoot, harmonyDir });
    expect(result.ok).toBe(true);
    expect(result.officialPackages).not.toContain('user-manual-dep');
    // oh-package 产物保留了用户旧依赖（官方在其上合并）
    const oh = result.files.find(f => f.path.endsWith('oh-package.json5'));
    expect(oh?.content).toContain('user-manual-dep');
  });

  it('带非受管旧键的包被官方注册时仍算官方覆盖（迁移场景不降级）', async () => {
    installFakeCli('ok');
    // 既有 oh-package 带 video 的非受管 file: 旧键（历史自研安装或手写）；
    // 官方全量扫描只看 node_modules metadata、不看 oh-package 键，产物 ETS/CMake 已注册 video
    fs.writeFileSync(path.join(harmonyDir, 'oh-package.json5'), JSON.stringify({
      name: 'root',
      dependencies: {
        'user-manual-dep': '1.0.0',
        '@react-native-ohos/react-native-video': 'file:../node_modules/@react-native-ohos/react-native-video/harmony/rn_video.har',
      },
    }));
    const result = await runOfficialAutolinking({ projectRoot, harmonyDir });
    expect(result.ok).toBe(true);
    expect(result.officialPackages).toContain('@react-native-ohos/react-native-video');
    expect(result.uncoveredPackages).not.toContain('@react-native-ohos/react-native-video');
  });

  it('官方产物以 ohPackageName（tpl 域）注册时归一为 npm 名，不误判未覆盖', async () => {
    // 真实形态（0.77.71 源码实证）：产物 ETS/CMake/oh-package 用 harmony.autolinking.ohPackageName
    // 注册，gh/screens 等配置为 @react-native-oh-tpl 域，与 node_modules 的 npm 名不同域
    installFakeRnohCliHelper(projectRoot, 'ok-tpl');
    installAdapterPkgHelper(projectRoot, '@react-native-ohos/react-native-safe-area-context', 'safe_area.har', {
      ohPackageName: '@react-native-oh-tpl/react-native-safe-area-context',
    });
    const result = await runOfficialAutolinking({ projectRoot, harmonyDir });
    expect(result.ok).toBe(true);
    expect(result.officialPackages).toContain('@react-native-ohos/react-native-safe-area-context');
    expect(result.officialPackages).not.toContain('@react-native-oh-tpl/react-native-safe-area-context');
    expect(result.uncoveredPackages).not.toContain('@react-native-ohos/react-native-safe-area-context');
  });

  it('部分产物缺失（静默失败）时 ok=false 并记录原因', async () => {
    installFakeCli('partial');
    const result = await runOfficialAutolinking({ projectRoot, harmonyDir });
    expect(result.ok).toBe(false);
    expect(result.failureReason).toMatch(/产物/);
  });

  it('官方抛意外错误时 ok=false 不向上抛', async () => {
    installFakeCli('throw');
    const result = await runOfficialAutolinking({ projectRoot, harmonyDir });
    expect(result.ok).toBe(false);
    expect(result.failureReason).toMatch(/boom/);
  });

  it('官方静默失败（DescriptiveError 语义）靠产物检查兜底', async () => {
    installFakeCli('silent-fail');
    const result = await runOfficialAutolinking({ projectRoot, harmonyDir });
    expect(result.ok).toBe(false);
  });

  it('扫描项目已装原生包：含 harmony 目录的无 metadata 包进入候选，不受 mapping 限制', async () => {
    installFakeCli('ok');
    installAdapterPkg('@react-native-ohos/react-native-safe-area-context', 'safe_area.har');
    installAdapterPkg('not-in-mapping-pkg', 'whatever.har');
    const result = await runOfficialAutolinking({ projectRoot, harmonyDir });
    expect(result.ok).toBe(true);
    expect(result.uncoveredPackages).toContain('@react-native-ohos/react-native-safe-area-context');
    expect(result.uncoveredPackages).toContain('not-in-mapping-pkg');
    // 已被官方覆盖的不在缺口
    expect(result.uncoveredPackages).not.toContain('@react-native-ohos/react-native-video');
  });

  it('throw 场景下临时目录也被清理', async () => {
    installFakeCli('throw');
    const before = fs.readdirSync(os.tmpdir()).filter(n => n.startsWith('ehc-link-')).length;
    await runOfficialAutolinking({ projectRoot, harmonyDir });
    const after = fs.readdirSync(os.tmpdir()).filter(n => n.startsWith('ehc-link-')).length;
    expect(after).toBe(before);
  });

  it('官方合成类名（metadata 缺类名）矫正为 mapping 真实类名', async () => {
    // 真实形态（gh/screens 实证）：metadata 只有 target 与 ohPackageName、缺
    // etsPackageClassName/cppPackageClassName，官方按包名合成类名——CPP include 指向
    // 包内不存在的头文件（ninja fatal），须矫正为 mapping 真实类名
    installFakeRnohCliHelper(projectRoot, 'ok-synth');
    installAdapterPkgHelper(projectRoot, '@react-native-ohos/react-native-safe-area-context', 'safe_area.har', {
      ohPackageName: '@react-native-oh-tpl/react-native-safe-area-context',
    });
    const result = await runOfficialAutolinking({ projectRoot, harmonyDir, mapping: HARMONY_PACKAGE_MAPPING });
    expect(result.ok).toBe(true);
    const ets = result.files.find(f => f.path.endsWith('RNOHPackagesFactory.ets'))!;
    expect(ets.content).toContain('import { SafeAreaViewPackage }');
    expect(ets.content).toContain('new SafeAreaViewPackage(ctx)');
    expect(ets.content).not.toContain('SynthSafeAreaPackage');
    const cpp = result.files.find(f => f.path.endsWith('RNOHPackagesFactory.h'))!;
    expect(cpp.content).toContain('#include "SafeAreaViewPackage.h"');
    expect(cpp.content).toContain('std::make_shared<rnoh::SafeAreaViewPackage>(ctx)');
    expect(cpp.content).not.toContain('SynthSafeAreaPackage');
  });

  it('官方过程输出过滤：临时路径与 info updated 恒滤，quiet 时连 [link]/[skip] 一并静默', async () => {
    installFakeRnohCliHelper(projectRoot, 'ok');
    const logs: string[] = [];
    const spyLog = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    const spyDebug = vi.spyOn(console, 'debug').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    try {
      await runOfficialAutolinking({ projectRoot, harmonyDir });
      expect(logs.some(l => l.includes('ehc-link-'))).toBe(false); // 临时产物路径（debug 通道）
      expect(logs.some(l => l.includes('info updated'))).toBe(false); // 官方汇总行（log 通道）
      expect(logs.some(l => l.trim().startsWith('[link]'))).toBe(true); // 非 quiet 保留扫描明细
      logs.length = 0;
      await runOfficialAutolinking({ projectRoot, harmonyDir, quiet: true });
      expect(logs.some(l => l.trim().startsWith('[link]') || l.trim().startsWith('[skip]'))).toBe(false);
    } finally {
      spyLog.mockRestore();
      spyDebug.mockRestore();
    }
  });
});
