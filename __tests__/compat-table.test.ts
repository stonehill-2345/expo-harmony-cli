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
  it('react-native bump 到 0.77.1 + 鸿蒙包', () => {
    const e = COMPAT_TABLE['react-native'];
    expect(e.bumpTo).toBe('0.77.1');
    expect(e.harmony?.package).toBe('@react-native-oh/react-native-harmony');
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
  it('patch-only 9 包', () => {
    const patchOnly = ['expo-constants', 'expo-status-bar', 'expo-linking', 'expo-clipboard', 'expo-linear-gradient', 'expo-image', 'expo-image-picker', 'expo-media-library', 'expo-document-picker'];
    for (const p of patchOnly) expect(COMPAT_TABLE[p].status).toBe('patch-only');
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
