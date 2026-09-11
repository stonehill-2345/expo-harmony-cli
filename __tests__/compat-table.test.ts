import { describe, it, expect } from 'vitest';
import { HARMONY_PACKAGE_MAPPING } from '../src/harmony-project/harmony-package-mapping';
import { COMPAT_TABLE } from '../src/scanner/compat-table';

describe('COMPAT_TABLE', () => {
  it('含 default 模版核心依赖', () => {
    expect(COMPAT_TABLE['react-native'].status).toBe('bump-native');
    expect(COMPAT_TABLE['expo-router'].status).toBe('alias-only');
    expect(COMPAT_TABLE['expo-haptics'].status).toBe('remove');
    expect(COMPAT_TABLE['expo-splash-screen'].status).toBe('unsupported');
    expect(COMPAT_TABLE['expo-constants'].status).toBe('patch-only');
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
    expect(COMPAT_TABLE['expo-router']).toMatchObject({
      originalVersion: '6.0.24',
      harmony: { package: '@react-native-ohos/native-stack', version: '7.4.0-beta.13' },
    });
    expect(COMPAT_TABLE['react-native-screens']).toMatchObject({ bumpTo: '4.17.1', harmony: { version: '4.9.0' } });
    expect(COMPAT_TABLE['react-native-reanimated']).toMatchObject({ bumpTo: '4.2.1', harmony: { version: '4.0.2' } });
    expect(COMPAT_TABLE['react-native-gesture-handler']).toMatchObject({ bumpTo: '2.30.0', harmony: { version: '2.30.2' } });
    expect(COMPAT_TABLE['react-native-safe-area-context']).toMatchObject({ bumpTo: '5.6.2', harmony: { version: '5.6.4' } });
  });
  it('Reanimated 4 同时适配 Worklets 原包和 Harmony 包', () => {
    expect(COMPAT_TABLE['react-native-worklets']).toMatchObject({
      status: 'bump-native',
      bumpTo: '0.7.1',
      harmony: {
        package: '@react-native-ohos/react-native-worklets',
        version: '1.0.1',
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
    const removed = ['expo-blur', 'expo-font', 'expo-haptics', 'expo-symbols', 'expo-system-ui', 'expo-web-browser'];
    for (const p of removed) expect(COMPAT_TABLE[p].status).toBe('remove');
    expect(COMPAT_TABLE['expo-splash-screen'].status).toBe('unsupported');
  });
  it('SDK 54 下只自动应用已有 0.82 原生闭环的 Expo patch', () => {
    const patchOnly = ['expo-constants', 'expo-status-bar', 'expo-linking', 'expo-image'];
    for (const p of patchOnly) expect(COMPAT_TABLE[p].status).toBe('patch-only');

    expect(COMPAT_TABLE['expo-linear-gradient']).toMatchObject({
      originalVersion: '15.0.8',
      status: 'native',
      harmony: { package: '@react-native-ohos/react-native-linear-gradient', version: '3.2.0' },
    });
    expect(COMPAT_TABLE['expo-document-picker']).toMatchObject({
      originalVersion: '14.0.8',
      status: 'native',
      harmony: { package: '@react-native-ohos/react-native-document-picker', version: '9.4.0' },
    });

    const unsupported = ['expo-clipboard', 'expo-image-picker', 'expo-media-library'];
    for (const p of unsupported) expect(COMPAT_TABLE[p].status).toBe('unsupported');
  });

  it('默认 SDK 54 Expo 模块使用对应发布版本的 patch', () => {
    expect(COMPAT_TABLE['expo-constants'].patch?.targetPath).toBe('patches/expo-constants+18.0.14.patch');
    expect(COMPAT_TABLE['expo-linking'].patch?.targetPath).toBe('patches/expo-linking+8.0.12.patch');
    expect(COMPAT_TABLE['expo-image'].patch?.targetPath).toBe('patches/expo-image+3.0.11.patch');
    expect(COMPAT_TABLE['expo-status-bar'].patch?.targetPath).toBe('patches/expo-status-bar+3.0.9.patch');
    expect(COMPAT_TABLE['expo-linear-gradient'].patch?.targetPath).toBe('patches/expo-linear-gradient+15.0.8.patch');
    expect(COMPAT_TABLE['expo-document-picker'].patch?.targetPath).toBe('patches/expo-document-picker+14.0.8.patch');
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
});
