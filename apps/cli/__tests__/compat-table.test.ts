import { describe, it, expect } from 'vitest';
import { HARMONY_PACKAGE_MAPPING } from '../src/harmony-project/harmony-package-mapping';
import { COMPAT_TABLE, getCompatTable } from '../src/scanner/compat-table';

describe('COMPAT_TABLE', () => {
  it('screens 的 SDK 54 补丁不影响 SDK 52 的版本配对', () => {
    const entry = getCompatTable('sdk-52')['react-native-screens'];
    expect(entry.harmony?.version).toBe('4.8.1-rc.7');
    expect(entry.patch).toBeUndefined();
  });
  it('含 default 模版核心依赖', () => {
    expect(COMPAT_TABLE['react-native'].status).toBe('bump-native');
    expect(COMPAT_TABLE['expo-router'].status).toBe('package-patch');
    expect(COMPAT_TABLE['expo-haptics'].status).toBe('remove');
    expect(COMPAT_TABLE['expo-splash-screen'].status).toBe('package-patch');
    expect(COMPAT_TABLE['expo-constants'].status).toBe('package-patch');
    expect(COMPAT_TABLE['@shopify/flash-list'].status).toBe('alias-only');
  });
  it('expo-splash-screen 不提供自动替换实现', () => {
    expect(COMPAT_TABLE['expo-splash-screen'].replaceWith).toBeUndefined();
  });
  it('react-native bump 到 0.82.1 + RNOH 0.82.30', () => {
    const e = COMPAT_TABLE['react-native'];
    expect(e).toMatchObject({
      bumpTo: '0.82.1',
      harmony: { package: '@react-native-oh/react-native-harmony', version: '0.82.30' },
    });
  });
  it('Expo Router 6 的原生依赖使用 0.82 兼容版本闭包', () => {
    expect(COMPAT_TABLE['expo-router']).toMatchObject({ originalVersion: '6.0.24', status: 'package-patch' });
    expect(COMPAT_TABLE['react-native-screens']).toMatchObject({ bumpTo: '4.17.1', harmony: { version: '4.9.0' } });
    expect(COMPAT_TABLE['react-native-reanimated']).toMatchObject({ bumpTo: '4.2.1', harmony: { version: '4.0.1' } });
    expect(COMPAT_TABLE['react-native-gesture-handler']).toMatchObject({ bumpTo: '2.30.0', harmony: { version: '2.30.1' } });
    expect(COMPAT_TABLE['react-native-safe-area-context']).toMatchObject({ bumpTo: '5.6.2', harmony: { version: '5.6.3' } });
  });
  it('Reanimated 4 同时适配 Worklets 原包和 Harmony 包', () => {
    expect(COMPAT_TABLE['react-native-worklets']).toMatchObject({
      status: 'bump-native',
      bumpTo: '0.7.1',
      harmony: {
        package: '@react-native-ohos/react-native-worklets',
        version: '1.0.0',
        alias: 'react-native-worklets',
      },
    });
  });
  it('blob-util 使用 0.82 新包且不额外执行 codegen', () => {
    expect(COMPAT_TABLE['react-native-blob-util']).toMatchObject({
      originalVersion: '0.24.10',
      harmony: { package: '@react-native-ohos/react-native-blob-util', version: '0.23.0' },
    });
    expect(COMPAT_TABLE['react-native-blob-util'].harmony?.requiresCodegen).toBeUndefined();
  });
  it('WebView 保留按需安装的原生适配与生成器映射', () => {
    expect(COMPAT_TABLE['react-native-webview']).toMatchObject({
      status: 'native',
      harmony: { package: '@react-native-ohos/react-native-webview' },
    });
    expect(HARMONY_PACKAGE_MAPPING['@react-native-ohos/react-native-webview']).toBeTruthy();
  });
  it('H 类 6 个默认模板移除包，Splash 仅标记为未自动适配', () => {
    const removed = ['expo-blur', 'expo-haptics', 'expo-symbols'];
    for (const p of removed) expect(COMPAT_TABLE[p].status).toBe('remove');
    expect(COMPAT_TABLE['expo-splash-screen'].status).toBe('package-patch');
  });
  it('SDK 54 下只自动应用已有 0.82 原生闭环的 Expo patch', () => {
    const packagePatch = ['expo-router', 'expo-modules-core', 'expo-constants', 'expo-status-bar', 'expo-linking', 'expo-font', 'expo-system-ui', 'expo-web-browser', 'expo-splash-screen'];
    for (const p of packagePatch) expect(COMPAT_TABLE[p].status).toBe('package-patch');

    expect(COMPAT_TABLE['expo-linear-gradient'].status).toBe('unsupported');
    expect(COMPAT_TABLE['expo-document-picker'].status).toBe('unsupported');

    const unsupported = ['expo-clipboard', 'expo-image-picker', 'expo-media-library'];
    for (const p of unsupported) expect(COMPAT_TABLE[p].status).toBe('unsupported');
  });

  it('默认 SDK 54 Expo 模块使用对应发布版本的 patch', () => {
    expect(COMPAT_TABLE['expo-constants'].status).toBe('package-patch');
    expect(COMPAT_TABLE['expo-linking'].status).toBe('package-patch');
    expect(COMPAT_TABLE['expo-image'].status).toBe('unsupported');
    expect(COMPAT_TABLE['expo-status-bar'].status).toBe('package-patch');
    expect(COMPAT_TABLE['expo-linear-gradient'].status).toBe('unsupported');
    expect(COMPAT_TABLE['expo-document-picker'].status).toBe('unsupported');
  });

  it('按 0.82 发布物锁定可自动适配的三方包版本', () => {
    expect(COMPAT_TABLE['react-native-webview']).toMatchObject({ originalVersion: '13.16.0', harmony: { version: '13.16.2' } });
    expect(COMPAT_TABLE['react-native-pager-view']).toMatchObject({ originalVersion: '7.0.2', harmony: { version: '7.0.3' } });
    expect(COMPAT_TABLE['react-native-linear-gradient']).toMatchObject({ originalVersion: '3.0.0', harmony: { version: '3.2.0' } });
    expect(COMPAT_TABLE['react-native-svg']).toMatchObject({ originalVersion: '15.15.0', harmony: { version: '15.13.1' } });
    expect(COMPAT_TABLE['react-native-video']).toMatchObject({ originalVersion: '6.19.2', harmony: { version: '6.15.0' } });
    expect(COMPAT_TABLE['@react-native-community/slider']).toMatchObject({ originalVersion: '5.1.1', harmony: { version: '5.1.2' } });
    expect(COMPAT_TABLE['react-native-keyboard-controller']).toMatchObject({ originalVersion: '1.21.8', harmony: { version: '1.17.0' } });
    expect(COMPAT_TABLE['@shopify/flash-list']).toMatchObject({ originalVersion: '2.1.0', harmony: { version: '2.1.1' } });
  });

  it('缺少 0.82 发布物或额外 Nitro 闭环的三方包不自动适配', () => {
    const unsupported = [
      'react-native-mmkv',
      'react-native-fast-image',
      '@react-native-clipboard/clipboard',
      'react-native-permissions',
      'react-native-device-info',
      'react-native-fs',
    ];
    for (const p of unsupported) expect(COMPAT_TABLE[p].status).toBe('unsupported');
  });

  it('native / bump-native 的鸿蒙包必须有生成器 autolinking 映射', () => {
    const runtimePackages = new Set(['@react-native-oh/react-native-harmony']);
    for (const entry of Object.values(COMPAT_TABLE)) {
      const harmonyPackage = entry.harmony?.package;
      if (!harmonyPackage || runtimePackages.has(harmonyPackage)) continue;
      if (entry.status === 'native' || entry.status === 'bump-native') {
        expect(
          HARMONY_PACKAGE_MAPPING[harmonyPackage],
          `${entry.original} -> ${harmonyPackage} 标记为 ${entry.status}，必须补 HARMONY_PACKAGE_MAPPING`,
        ).toBeTruthy();
      }
    }
  });

  it('生成器映射只保留 compat-table 可达的原生包', () => {
    const activeHarmonyPackages = new Set(
      Object.values(COMPAT_TABLE)
        .filter(entry => entry.status === 'native' || entry.status === 'bump-native')
        .map(entry => entry.harmony?.package)
        .filter((packageName): packageName is string => Boolean(packageName)),
    );
    activeHarmonyPackages.delete('@react-native-oh/react-native-harmony');

    expect(Object.keys(HARMONY_PACKAGE_MAPPING).sort()).toEqual([...activeHarmonyPackages].sort());
  });

  it('所有带鸿蒙包的兼容项必须声明精确的原包版本', () => {
    for (const entry of Object.values(COMPAT_TABLE)) {
      if (!entry.harmony) continue;
      expect(
        entry.bumpTo ?? entry.originalVersion,
        `${entry.original} 配置了鸿蒙包，必须声明已验证的原包版本`,
      ).toMatch(/^\d+\.\d+\.\d+(?:-[\w.]+)?$/);
    }
  });

  it('ohrn 未安装原包的 image-picker、sound 不得自动适配', () => {
    expect(COMPAT_TABLE['react-native-image-picker'].status).toBe('unsupported');
    expect(COMPAT_TABLE['react-native-sound'].status).toBe('unsupported');
  });
  it('SDK54 package-patch table 使用本轮已验收外部版本', () => {
    const table = getCompatTable('sdk-54');
    expect(table['react-native-gesture-handler'].harmony?.version).toBe('2.30.1');
    expect(table['react-native-reanimated'].harmony?.version).toBe('4.0.1');
    expect(table['react-native-safe-area-context'].harmony?.version).toBe('5.6.3');
    expect(table['react-native-screens'].harmony?.version).toBe('4.9.0');
    expect(table['react-native-worklets'].harmony?.version).toBe('1.0.0');
  });

  it('已迁移 Expo 包不再删除或标记旧 unsupported', () => {
    const table = getCompatTable('sdk-54');
    for (const name of ['expo-font', 'expo-system-ui', 'expo-web-browser', 'expo-splash-screen']) {
      expect(['remove', 'unsupported']).not.toContain(table[name].status);
    }
    expect(table['expo-image'].status).toBe('unsupported');
  });

});
