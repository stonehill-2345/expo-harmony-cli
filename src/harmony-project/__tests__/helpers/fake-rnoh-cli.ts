import * as fs from 'fs';
import * as path from 'path';

/**
 * fake 官方 CLI 装置：在临时 projectRoot 的 node_modules 下安装一个模拟
 * @react-native-oh/react-native-harmony-cli 的包，产物形状对齐真实 0.77.71 契约
 * （docs/superpowers/specs/2026-09-09-official-autolink-contract.md）。
 * fake CLI 固定「链接」两个官方包：@react-native-ohos/react-native-video 与 official-only-pkg
 * （后者模拟 mapping 外的官方独有包）。'ok-safe-area' 额外链接 safe-area-context，
 * 模拟「mapping 内的包新版本补齐了 autolinking metadata、被官方识别」的迁移场景。
 */

export type FakeCliMode = 'ok' | 'ok-safe-area' | 'ok-tpl' | 'ok-synth' | 'no-func' | 'partial' | 'throw' | 'silent-fail';

function fakeCliModule(mode: FakeCliMode): string {
  const Q = "'";
  const L = [
    'const fs = require("fs");',
    'const path = require("path");',
    'exports.commandLinkHarmony = {',
    '  func: async (_argv, _config, rawArgs) => {',
    '    const h = rawArgs.harmonyProjectPath;',
    '    const w = (rel, c) => { const p = path.join(h, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };',
    // 模拟官方 CLI 的扫描明细输出（真实 Logger.debug 走 console.debug）
    '    console.debug("[link] @react-native-ohos/react-native-video");',
    '    console.debug("[skip] @react-native-oh/react-native-harmony");',
  ];
  if (mode === 'throw') L.push('    throw new Error("boom unexpected");');
  if (mode === 'silent-fail') L.push('    return; // DescriptiveError 静默失败：不写产物');
  L.push(
    '    const oh = fs.existsSync(path.join(h, "oh-package.json5"))',
    '      ? JSON.parse(fs.readFileSync(path.join(h, "oh-package.json5"), "utf8"))',
    '      : { dependencies: {} };',
    '    const deps = { ...(oh.dependencies || {}) };',
  );
  // safe-area 增量：'ok-safe-area' 以 npm 名注册，'ok-tpl' 以 ohPackageName（tpl 域）
  // 注册——模拟 gh/screens 的真实形态（产物名与 npm 名不同域，CMake target 同名）
  const withSafeArea = mode === 'ok-safe-area' || mode === 'ok-tpl' || mode === 'ok-synth';
  const safeAreaProduct = mode === 'ok-tpl' || mode === 'ok-synth'
    ? '@react-native-oh-tpl/react-native-safe-area-context'
    : '@react-native-ohos/react-native-safe-area-context';
  if (mode !== 'partial') {
    L.push(
      `    deps["@react-native-ohos/react-native-video"] = "file:../../node_modules/@react-native-ohos/react-native-video/harmony/rn_video.har";`,
      `    deps["official-only-pkg"] = "file:../../node_modules/official-only-pkg/harmony/x.har";`,
      ...(withSafeArea ? [
        `    deps["${safeAreaProduct}"] = "file:../../node_modules/@react-native-ohos/react-native-safe-area-context/harmony/safe_area.har";`,
      ] : []),
      `    w("entry/src/main/ets/RNOHPackagesFactory.ets", [`,
      `      "import type { RNPackageContext, RNOHPackage } from '@rnoh/react-native-openharmony';",`,
      `      "import RNCVideoPackage from '@react-native-ohos/react-native-video';",`,
      `      "import OfficialOnlyPackage from 'official-only-pkg';",`,
      ...(withSafeArea ? [
        mode === 'ok-synth'
          ? `      "import SynthSafeAreaPackage from '@react-native-ohos/react-native-safe-area-context';",`
          : `      "import { SafeAreaViewPackage } from '${safeAreaProduct}';",`,
      ] : []),
      `      ${Q}${Q},`,
      `      "export function createRNOHPackages(ctx: RNPackageContext): RNOHPackage[] {",`,
      `      "  return [",`,
      `      "    new RNCVideoPackage(ctx),",`,
      `      "    new OfficialOnlyPackage(ctx),",`,
      ...(withSafeArea ? [
        mode === 'ok-synth'
          ? `      "    new SynthSafeAreaPackage(ctx),",`
          : `      "    new SafeAreaViewPackage(ctx),",`,
      ] : []),
      `      "  ];",`,
      `      "}",`,
      `      ${Q}${Q},`,
      `    ].join("\\n"));`,
      `    w("entry/src/main/cpp/RNOHPackagesFactory.h", [`,
      `      ${Q}#include "RNOH/Package.h"${Q},`,
      `      ${Q}#include "RNCVideoPackage.h"${Q},`,
      `      ${Q}#include "OfficialOnlyPackage.h"${Q},`,
      ...(withSafeArea ? [
        mode === 'ok-synth'
          ? `      ${Q}#include "SynthSafeAreaPackage.h"${Q},`
          : `      ${Q}#include "SafeAreaViewPackage.h"${Q},`,
      ] : []),
      `      ${Q}${Q},`,
      `      "std::vector<rnoh::Package::Shared> createRNOHPackages(const rnoh::Package::Context &ctx) {",`,
      `      "  return {",`,
      `      "    std::make_shared<rnoh::RNCVideoPackage>(ctx),",`,
      `      "    std::make_shared<rnoh::OfficialOnlyPackage>(ctx),",`,
      ...(withSafeArea ? [
        mode === 'ok-synth'
          ? `      "    std::make_shared<rnoh::SynthSafeAreaPackage>(ctx),",`
          : `      "    std::make_shared<rnoh::SafeAreaViewPackage>(ctx),",`,
      ] : []),
      `      "  };",`,
      `      "}",`,
      `      ${Q}${Q},`,
      `    ].join("\\n"));`,
      `    w("entry/src/main/cpp/autolinking.cmake", [`,
      `      ${Q}cmake_minimum_required(VERSION 3.5)${Q},`,
      `      ${Q}function(autolink_libraries target)${Q},`,
      `      "    add_subdirectory(\\"\${OH_MODULES_DIR}/@react-native-ohos/react-native-video/src/main/cpp\\" ./rnoh_video)",`,
      `      "    add_subdirectory(\\"\${OH_MODULES_DIR}/official-only-pkg/src/main/cpp\\" ./rnoh_official_only)",`,
      ...(withSafeArea ? [
        `      "    add_subdirectory(\\"\${OH_MODULES_DIR}/${safeAreaProduct}/src/main/cpp\\" ./rnoh_safe_area)",`,
      ] : []),
      `      ${Q}${Q},`,
      `      ${Q}    set(AUTOLINKED_LIBRARIES${Q},`,
      `      ${Q}        rnoh_video${Q},`,
      `      ${Q}        rnoh_official_only${Q},`,
      ...(withSafeArea ? [
        `      ${Q}        rnoh_safe_area${Q},`,
      ] : []),
      `      ${Q}    )${Q},`,
      `      "    foreach(lib \${AUTOLINKED_LIBRARIES})",`,
      `      "        target_link_libraries(\${target} PUBLIC \${lib})",`,
      `      ${Q}    endforeach()${Q},`,
      `      ${Q}endfunction()${Q},`,
      `      ${Q}${Q},`,
      `    ].join("\\n"));`,
    );
  }
  L.push(
    '    w("oh-package.json5", JSON.stringify({ ...oh, dependencies: deps }, null, 2));',
    '    console.debug("\\u2022 " + path.relative(process.cwd(), path.join(h, "oh-package.json5")));',
    '    console.log("info updated 4 file(s), linked 2 libraries, skipped 5 libraries");',
    '  },',
    '};',
  );
  return L.join('\n');
}

export function installFakeRnohCli(projectRoot: string, mode: FakeCliMode = 'ok'): void {
  const cliDir = path.join(projectRoot, 'node_modules', '@react-native-oh', 'react-native-harmony-cli');
  fs.mkdirSync(path.join(cliDir, 'dist/commands'), { recursive: true });
  fs.writeFileSync(path.join(cliDir, 'package.json'), JSON.stringify({
    name: '@react-native-oh/react-native-harmony-cli',
    version: '0.77.71-fake',
  }));
  fs.writeFileSync(
    path.join(cliDir, 'dist/commands/link-harmony.js'),
    mode === 'no-func' ? 'module.exports = { commandLinkHarmony: {} };' : fakeCliModule(mode),
  );
}

/** 安装一个带 harmony 目录与 HAR 的适配包（默认 harmony 字段仅 alias，即 mapping 补充目标）。 */
export function installAdapterPkg(
  projectRoot: string,
  name: string,
  harName: string,
  opts: { withAutolinkingMetadata?: boolean; ohPackageName?: string } = {},
): void {
  const pkgDir = path.join(projectRoot, 'node_modules', name);
  fs.mkdirSync(path.join(pkgDir, 'harmony'), { recursive: true });
  fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
    name,
    version: '1.0.0',
    harmony: {
      alias: name,
      ...(opts.ohPackageName ? { autolinking: { ohPackageName: opts.ohPackageName } } : {}),
      ...(opts.withAutolinkingMetadata ? { autolinking: { etsPackageClassName: 'FakePkg', cmakeLibraryTargetName: 'rnoh_fake' } } : {}),
    },
  }));
  fs.writeFileSync(path.join(pkgDir, 'harmony', harName), 'fake har bytes');
}
