import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { scanAndAdapt } from '../src/scanner/scan';
import { recordManagedPackage } from '../src/lifecycle/managed-state';

describe('scanAndAdapt', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-'));
    // 假 default 模版 package.json（含 B/C/H/A′ 各类）
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({
      dependencies: {
        'react-native': '0.76.9',
        'react-native-screens': '4.4.0',
        'expo-router': '~4.0.22',
        'expo-haptics': '~14.0.1',
        'expo-splash-screen': '~0.29.24',
        'expo-constants': '~17.0.8',
        'expo-status-bar': '2.0.1',
      },
    }));
    // 假 default 模版 app.json（含 plugins，I-2 同步验证用）
    fs.writeFileSync(path.join(tmp, 'app.json'), JSON.stringify({
      expo: {
        name: 'testapp',
        slug: 'testapp',
        plugins: [
          'expo-router',
          ['expo-splash-screen', { image: './splash.png', resizeMode: 'contain' }],
        ],
      },
    }));
    // 假 injector 已写的初始 alias-map（@expo/metro-runtime）
    fs.mkdirSync(path.join(tmp, 'shims'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'shims/.alias-map.json'), JSON.stringify({ '@expo/metro-runtime': './shims/expo-metro-runtime.ts' }));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('bump-native: react-native → 0.77.1 + 加鸿蒙包', () => {
    const report = scanAndAdapt(tmp);
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    expect(pkg.dependencies['react-native']).toBe('0.77.1');
    expect(pkg.dependencies['@react-native-oh/react-native-harmony']).toBe('0.77.71');
    expect(report.bumped.find(b => b.from === 'react-native')).toBeTruthy();
  });

  it('bump-native: react-native-screens 升级到 Xcode 16.4 兼容版本并添加鸿蒙配套包', () => {
    const report = scanAndAdapt(tmp);
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    expect(pkg.dependencies['react-native-screens']).toBe('4.8.0');
    expect(pkg.dependencies['@react-native-ohos/react-native-screens']).toBe('4.8.1-rc.7');
    expect(report.bumped).toContainEqual(expect.objectContaining({
      from: 'react-native-screens',
      to: '4.8.0',
    }));
  });

  it('alias-only: expo-router 加 @react-native-ohos/native-stack + copy patch，不计入 native', () => {
    scanAndAdapt(tmp);
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    expect(pkg.dependencies['@react-native-ohos/native-stack']).toBe('7.3.11-rc.1');
    expect(fs.existsSync(path.join(tmp, 'patches/expo-router+4.0.22.patch'))).toBe(true);
  });

  it('alias-only: @shopify/flash-list 加 @react-native-ohos/flash-list + alias，不计入 native', () => {
    const pkg0 = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    pkg0.dependencies['@shopify/flash-list'] = '1.8.3';
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify(pkg0));

    const report = scanAndAdapt(tmp);
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    const aliasMap = JSON.parse(fs.readFileSync(path.join(tmp, 'shims/.alias-map.json'), 'utf8'));

    expect(pkg.dependencies['@react-native-ohos/flash-list']).toBe('2.1.1-rc.1');
    expect(aliasMap['@shopify/flash-list']).toBe('@react-native-ohos/flash-list');
    expect(report.addedAliasOnly).toContainEqual({
      original: '@shopify/flash-list',
      harmonyPackage: '@react-native-ohos/flash-list',
      alias: '@shopify/flash-list',
    });
    expect(report.addedNative.find(item => item.original === '@shopify/flash-list')).toBeUndefined();
  });

  it('native: MMKV 同时锁定原包与鸿蒙包版本，避免 alias API 错配', () => {
    const pkg0 = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    pkg0.dependencies['react-native-mmkv'] = '4.3.2';
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify(pkg0));

    scanAndAdapt(tmp);

    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    expect(pkg.dependencies['react-native-mmkv']).toBe('3.3.1');
    expect(pkg.dependencies['@react-native-ohos/react-native-mmkv']).toBe('3.3.1-rc.1');
  });

  it('native + patch: fast-image 复制 RNOH 兼容补丁', () => {
    const pkg0 = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    pkg0.dependencies['react-native-fast-image'] = '^8.6.3';
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify(pkg0));

    const report = scanAndAdapt(tmp);
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));

    expect(pkg.dependencies['react-native-fast-image']).toBe('8.6.3');
    expect(pkg.dependencies['@react-native-oh-tpl/react-native-fast-image']).toBe('8.6.3-0.4.17');
    expect(fs.existsSync(path.join(tmp, 'patches/@react-native-oh-tpl+react-native-fast-image+8.6.3-0.4.17.patch'))).toBe(true);
    expect(report.patched).toContainEqual({
      original: 'react-native-fast-image',
      patchPath: 'patches/@react-native-oh-tpl+react-native-fast-image+8.6.3-0.4.17.patch',
    });
  });

  it('remove: expo-haptics 从 package.json 删除', () => {
    const report = scanAndAdapt(tmp);
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    expect(pkg.dependencies['expo-haptics']).toBeUndefined();
    expect(report.removed).toContain('expo-haptics');
  });

  it('unsupported: expo-splash-screen 不自动替换或删除用户依赖', () => {
    const report = scanAndAdapt(tmp);
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    expect(pkg.dependencies['expo-splash-screen']).toBe('0.29.24');
    expect(pkg.dependencies['expo-splash-screen2']).toBeUndefined();
    expect(report.unsupported).toContain('expo-splash-screen');
  });

  it('unsupported: scan 不修改用户 app.json 中的 Splash plugin', () => {
    scanAndAdapt(tmp);
    const app = JSON.parse(fs.readFileSync(path.join(tmp, 'app.json'), 'utf8'));
    const plugins = app.expo.plugins;
    // 字符串插件不受影响
    expect(plugins).toContain('expo-router');
    const splashPlugin = plugins.find((p: unknown) =>
      (typeof p === 'string' && p === 'expo-splash-screen') ||
      (Array.isArray(p) && p[0] === 'expo-splash-screen'));
    expect(splashPlugin).toEqual(['expo-splash-screen', { image: './splash.png', resizeMode: 'contain' }]);
  });

  it('patch-only: expo-constants copy patch（不改依赖）', () => {
    const report = scanAndAdapt(tmp);
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    expect(pkg.dependencies['expo-constants']).toBe('17.0.8');
    expect(fs.existsSync(path.join(tmp, 'patches/expo-constants+17.0.8.patch'))).toBe(true);
    expect(report.patched.find(p => p.original === 'expo-constants')).toBeTruthy();
  });

  it('强制注入: 只注入顶层 RNOH 核心 patch，并清理旧的 expo-modules-core 传递依赖 patch', () => {
    fs.mkdirSync(path.join(tmp, 'patches'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'patches/expo-modules-core+2.2.3.patch'), 'legacy patch');

    scanAndAdapt(tmp);

    expect(fs.existsSync(path.join(tmp, 'patches/@react-native-oh+react-native-harmony+0.77.71.patch'))).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'patches/expo-modules-core+2.2.3.patch'))).toBe(false);
  });

  it('patch-only: 命中 patch 时强制依赖版本等于 patch 版本并复制 patch', () => {
    const report = scanAndAdapt(tmp);
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    expect(pkg.dependencies['expo-status-bar']).toBe('3.0.9');
    expect(fs.existsSync(path.join(tmp, 'patches/expo-status-bar+3.0.9.patch'))).toBe(true);
    expect(report.patched.find(p => p.original === 'expo-status-bar')).toBeTruthy();
  });

  it('生成 package.json 依赖版本必须锁定，不能保留 ~ 或 ^', () => {
    scanAndAdapt(tmp);
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    const versions = Object.values({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }) as string[];
    expect(versions.filter(version => /^[~^]/.test(version))).toEqual([]);
  });

  it('alias-map 合并: 保留 injector 写的 @expo/metro-runtime', () => {
    scanAndAdapt(tmp);
    const aliasMap = JSON.parse(fs.readFileSync(path.join(tmp, 'shims/.alias-map.json'), 'utf8'));
    expect(aliasMap['@expo/metro-runtime']).toBe('./shims/expo-metro-runtime.ts');
  });

  it('对账：用户手工移除原包后，scan 只回收 CLI 管理的伴随资产', () => {
    const pkg0 = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    pkg0.dependencies['@react-native-ohos/react-native-webview'] = '13.15.1';
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify(pkg0));
    const aliases = JSON.parse(fs.readFileSync(path.join(tmp, 'shims/.alias-map.json'), 'utf8'));
    aliases['react-native-webview'] = '@react-native-ohos/react-native-webview';
    fs.writeFileSync(path.join(tmp, 'shims/.alias-map.json'), JSON.stringify(aliases));
    recordManagedPackage(tmp, 'react-native-webview', {
      harmonyPackage: '@react-native-ohos/react-native-webview',
      alias: 'react-native-webview',
      needsAutolink: true,
    });

    const report = scanAndAdapt(tmp);
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    const nextAliases = JSON.parse(fs.readFileSync(path.join(tmp, 'shims/.alias-map.json'), 'utf8'));

    expect(report.reconciled).toContain('react-native-webview');
    expect(pkg.dependencies['@react-native-ohos/react-native-webview']).toBeUndefined();
    expect(nextAliases['react-native-webview']).toBeUndefined();
  });

  it('scan 写入的 alias 状态可在后续对账中安全清理', () => {
    const pkg0 = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    pkg0.dependencies['react-native-webview'] = '13.15.0';
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify(pkg0));
    scanAndAdapt(tmp);

    const afterFirstScan = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    delete afterFirstScan.dependencies['react-native-webview'];
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify(afterFirstScan));

    scanAndAdapt(tmp);
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    const aliases = JSON.parse(fs.readFileSync(path.join(tmp, 'shims/.alias-map.json'), 'utf8'));

    expect(pkg.dependencies['@react-native-ohos/react-native-webview']).toBeUndefined();
    expect(aliases['react-native-webview']).toBeUndefined();
  });
});
