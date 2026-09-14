import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { adaptPackage } from '../src/installer/adapt-package';

describe('adaptPackage', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adapt-'));
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ dependencies: {} }));
    fs.mkdirSync(path.join(tmp, 'shims'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'shims/.alias-map.json'), '{}');
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('SDK 54 单包安装 screens 时复制 Harmony patch，不把原包降到补丁包版本', () => {
    const patchPath = 'patches/@react-native-ohos+react-native-screens+4.9.0.patch';
    const result = adaptPackage('react-native-screens', tmp);
    expect(result.patchPath).toBe(patchPath);
    expect(fs.existsSync(path.join(tmp, patchPath))).toBe(true);
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    expect(pkg.dependencies['react-native-screens']).toBe('4.17.1');
    expect(pkg.dependencies['@react-native-ohos/react-native-screens']).toBe('4.9.0');
  });

  it('未命中 → skipped，不动 package.json', () => {
    const r = adaptPackage('lodash', tmp);
    expect(r.status).toBe('skipped');
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    expect(pkg.dependencies).toEqual({});
  });

  it('alias-only（@shopify/flash-list）→ 加鸿蒙包 + alias，不需要 autolinking', () => {
    const r = adaptPackage('@shopify/flash-list', tmp);
    expect(r.status).toBe('alias-only');
    expect(r.needsAutolink).toBe(false);
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    expect(pkg.dependencies['@react-native-ohos/flash-list']).toBe('2.1.1');
    const aliasMap = JSON.parse(fs.readFileSync(path.join(tmp, 'shims/.alias-map.json'), 'utf8'));
    expect(aliasMap['@shopify/flash-list']).toBe('@react-native-ohos/flash-list');
  });

  it('MMKV 缺少 Nitro 伴随依赖闭环时不自动改写', () => {
    const initial = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    initial.dependencies['react-native-mmkv'] = '4.3.2';
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify(initial));

    const r = adaptPackage('react-native-mmkv', tmp);
    expect(r.status).toBe('unsupported');
    expect(r.needsAutolink).toBeUndefined();
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    expect(pkg.dependencies['react-native-mmkv']).toBe('4.3.2');
    expect(pkg.dependencies['@react-native-ohos/react-native-mmkv']).toBeUndefined();
    const aliasMap = JSON.parse(fs.readFileSync(path.join(tmp, 'shims/.alias-map.json'), 'utf8'));
    expect(aliasMap['react-native-mmkv']).toBeUndefined();
  });

  it('fast-image 的 React 19 peer 未兼容时不自动改写', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    pkg.dependencies['react-native-fast-image'] = '^8.6.3';
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify(pkg));

    const r = adaptPackage('react-native-fast-image', tmp);

    expect(r.status).toBe('unsupported');
    expect(r.needsAutolink).toBeUndefined();
    expect(r.patchPath).toBeUndefined();
    const pkg2 = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    expect(pkg2.dependencies['react-native-fast-image']).toBe('8.6.3');
    expect(pkg2.dependencies['@react-native-ohos/react-native-fast-image']).toBeUndefined();
  });

  it('先适配 permissions 再安装其他包时，为 Expo 插件补齐空的 iosPermissions 配置', () => {
    fs.writeFileSync(path.join(tmp, 'app.json'), JSON.stringify({ expo: { name: 'test' } }));

    adaptPackage('react-native-permissions', tmp);
    adaptPackage('react-native-video', tmp);

    const app = JSON.parse(fs.readFileSync(path.join(tmp, 'app.json'), 'utf8'));
    expect(app.expo.plugins).toContainEqual(['react-native-permissions', { iosPermissions: [] }]);
  });

  it('blob-util → 锁定 0.82 版本对并使用包内生成代码', () => {
    const initial = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    initial.dependencies['react-native-blob-util'] = '0.24.10';
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify(initial));

    const r = adaptPackage('react-native-blob-util', tmp);
    expect(r.status).toBe('native');
    expect(r.needsAutolink).toBe(true);
    expect(r.requiresCodegen).toBeUndefined();
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    expect(pkg.dependencies['react-native-blob-util']).toBe('0.24.10');
    expect(pkg.dependencies['@react-native-ohos/react-native-blob-util']).toBe('0.23.0');
  });

  it('patch-only（expo-constants）→ 锁定原包版本为 patch 版本并复制 patch', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    pkg.dependencies['expo-constants'] = '~18.0.9';
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify(pkg));

    const r = adaptPackage('expo-constants', tmp);
    expect(r.status).toBe('patch-only');
    expect(r.patchPath).toBe('patches/expo-constants+18.0.14.patch');
    expect(fs.existsSync(path.join(tmp, 'patches/expo-constants+18.0.14.patch'))).toBe(true);
    const pkg2 = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    expect(pkg2.dependencies['expo-constants']).toBe('18.0.14');
  });

  it('expo-linear-gradient → 同时锁定 SDK 54 patch 和 0.82 Harmony 包', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    pkg.dependencies['expo-linear-gradient'] = '~15.0.8';
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify(pkg));

    const r = adaptPackage('expo-linear-gradient', tmp);

    expect(r.status).toBe('native');
    expect(r.needsAutolink).toBe(true);
    expect(r.patchPath).toBe('patches/expo-linear-gradient+15.0.8.patch');
    const nextPkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    expect(nextPkg.dependencies['expo-linear-gradient']).toBe('15.0.8');
    expect(nextPkg.dependencies['@react-native-ohos/react-native-linear-gradient']).toBe('3.2.0');
  });

  it('expo-document-picker → 同时锁定 SDK 54 patch 和 0.82 Harmony 包', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    pkg.dependencies['expo-document-picker'] = '~14.0.8';
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify(pkg));

    const r = adaptPackage('expo-document-picker', tmp);

    expect(r.status).toBe('native');
    expect(r.needsAutolink).toBe(true);
    expect(r.patchPath).toBe('patches/expo-document-picker+14.0.8.patch');
    const nextPkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    expect(nextPkg.dependencies['expo-document-picker']).toBe('14.0.8');
    expect(nextPkg.dependencies['@react-native-ohos/react-native-document-picker']).toBe('9.4.0');
  });

  it('alias-only + patch（expo-router）→ 锁定原包版本、加鸿蒙包并复制 patch，不需要 autolinking', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    pkg.dependencies['expo-router'] = '~6.0.10';
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify(pkg));

    const r = adaptPackage('expo-router', tmp);
    expect(r.status).toBe('alias-only');
    expect(r.needsAutolink).toBe(false);
    expect(r.patchPath).toBe('patches/expo-router+6.0.24.patch');
    const pkg2 = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    expect(pkg2.dependencies['expo-router']).toBe('6.0.24');
    expect(pkg2.dependencies['@react-native-ohos/native-stack']).toBe('7.4.0-beta.13');
    expect(fs.existsSync(path.join(tmp, 'patches/expo-router+6.0.24.patch'))).toBe(true);
  });

  it('remove（expo-haptics）→ 从 package.json 删除', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    pkg.dependencies['expo-haptics'] = '~14.0.1';
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify(pkg));
    const r = adaptPackage('expo-haptics', tmp);
    expect(r.status).toBe('remove');
    const pkg2 = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    expect(pkg2.dependencies['expo-haptics']).toBeUndefined();
  });

  it('unsupported（expo-splash-screen）→ 保留用户依赖与 app.json plugins', () => {
    // 默认模板不再注入 Splash；用户手动安装时 CLI 仅提示尚未适配，不应改写配置。
    fs.writeFileSync(path.join(tmp, 'app.json'), JSON.stringify({
      expo: { plugins: [['expo-splash-screen', { some: 'opts' }]] },
    }));
    // package.json 已有 expo-splash-screen
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    pkg.dependencies['expo-splash-screen'] = '~0.29.24';
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify(pkg));

    const r = adaptPackage('expo-splash-screen', tmp);
    expect(r.status).toBe('unsupported');
    const pkg2 = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    expect(pkg2.dependencies['expo-splash-screen']).toBe('0.29.24');
    expect(pkg2.dependencies['expo-splash-screen2']).toBeUndefined();
    const app = JSON.parse(fs.readFileSync(path.join(tmp, 'app.json'), 'utf8'));
    expect(app.expo.plugins[0][0]).toBe('expo-splash-screen');
    expect(app.expo.plugins[0][1]).toEqual({ some: 'opts' });
  });

  it('adaptPackage 锁定所有依赖版本，不能保留 ~ 或 ^', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    pkg.dependencies.expo = '~52.0.49';
    pkg.devDependencies = { 'patch-package': '^8.0.0' };
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify(pkg));

    adaptPackage('@shopify/flash-list', tmp);

    const pkg2 = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    const versions = Object.values({ ...(pkg2.dependencies || {}), ...(pkg2.devDependencies || {}) });
    expect(versions.filter(version => typeof version === 'string' && /^[~^]/.test(version))).toEqual([]);
  });

  it('@version 包名 strip 后查表命中（I-2）', () => {
    const r = adaptPackage('@shopify/flash-list@2.0.0', tmp);
    expect(r.status).toBe('alias-only');
    expect(r.needsAutolink).toBe(false);
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    expect(pkg.dependencies['@react-native-ohos/flash-list']).toBe('2.1.1');
  });
});
