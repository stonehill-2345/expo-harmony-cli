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
    expect(pkg.dependencies['@react-native-ohos/flash-list']).toBe('2.1.1-rc.1');
    const aliasMap = JSON.parse(fs.readFileSync(path.join(tmp, 'shims/.alias-map.json'), 'utf8'));
    expect(aliasMap['@shopify/flash-list']).toBe('@react-native-ohos/flash-list');
  });

  it('native（MMKV）→ 加鸿蒙包 + Metro alias，并要求原生 autolinking', () => {
    const initial = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    initial.dependencies['react-native-mmkv'] = '4.3.2';
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify(initial));

    const r = adaptPackage('react-native-mmkv', tmp);
    expect(r.status).toBe('native');
    expect(r.needsAutolink).toBe(true);
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    expect(pkg.dependencies['react-native-mmkv']).toBe('3.3.1');
    expect(pkg.dependencies['@react-native-ohos/react-native-mmkv']).toBe('3.3.1-rc.1');
    const aliasMap = JSON.parse(fs.readFileSync(path.join(tmp, 'shims/.alias-map.json'), 'utf8'));
    expect(aliasMap['react-native-mmkv']).toBe('@react-native-ohos/react-native-mmkv');
  });

  it('native + patch（fast-image）→ 加鸿蒙包、alias 并复制 RNOH 兼容补丁', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    pkg.dependencies['react-native-fast-image'] = '^8.6.3';
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify(pkg));

    const r = adaptPackage('react-native-fast-image', tmp);

    expect(r.status).toBe('native');
    expect(r.needsAutolink).toBe(true);
    expect(r.patchPath).toBe('patches/@react-native-oh-tpl+react-native-fast-image+8.6.3-0.4.17.patch');
    expect(fs.existsSync(path.join(tmp, r.patchPath!))).toBe(true);
    const pkg2 = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    expect(pkg2.dependencies['react-native-fast-image']).toBe('8.6.3');
    expect(pkg2.dependencies['@react-native-oh-tpl/react-native-fast-image']).toBe('8.6.3-0.4.17');
  });

  it('先适配 permissions 再安装其他包时，为 Expo 插件补齐空的 iosPermissions 配置', () => {
    fs.writeFileSync(path.join(tmp, 'app.json'), JSON.stringify({ expo: { name: 'test' } }));

    adaptPackage('react-native-permissions', tmp);
    adaptPackage('react-native-video', tmp);

    const app = JSON.parse(fs.readFileSync(path.join(tmp, 'app.json'), 'utf8'));
    expect(app.expo.plugins).toContainEqual(['react-native-permissions', { iosPermissions: [] }]);
  });

  it('TurboModule（blob-util）→ 锁定 ohrn 版本对并标记 codegen 后置要求', () => {
    const initial = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    initial.dependencies['react-native-blob-util'] = '0.24.10';
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify(initial));

    const r = adaptPackage('react-native-blob-util', tmp);
    expect(r.status).toBe('native');
    expect(r.needsAutolink).toBe(true);
    expect(r.requiresCodegen).toBe(true);
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    expect(pkg.dependencies['react-native-blob-util']).toBe('0.19.6');
    expect(pkg.dependencies['@react-native-oh-tpl/react-native-blob-util']).toBe('0.19.7-rc.1');
  });

  it('patch-only（expo-constants）→ 锁定原包版本为 patch 版本并复制 patch', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    pkg.dependencies['expo-constants'] = '~17.0.8';
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify(pkg));

    const r = adaptPackage('expo-constants', tmp);
    expect(r.status).toBe('patch-only');
    expect(r.patchPath).toBe('patches/expo-constants+17.0.8.patch');
    expect(fs.existsSync(path.join(tmp, 'patches/expo-constants+17.0.8.patch'))).toBe(true);
    const pkg2 = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    expect(pkg2.dependencies['expo-constants']).toBe('17.0.8');
  });

  it('alias-only + patch（expo-router）→ 锁定原包版本、加鸿蒙包并复制 patch，不需要 autolinking', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    pkg.dependencies['expo-router'] = '~4.0.22';
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify(pkg));

    const r = adaptPackage('expo-router', tmp);
    expect(r.status).toBe('alias-only');
    expect(r.needsAutolink).toBe(false);
    expect(r.patchPath).toBe('patches/expo-router+4.0.22.patch');
    const pkg2 = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    expect(pkg2.dependencies['expo-router']).toBe('4.0.22');
    expect(pkg2.dependencies['@react-native-ohos/native-stack']).toBe('7.3.11-rc.1');
    expect(fs.existsSync(path.join(tmp, 'patches/expo-router+4.0.22.patch'))).toBe(true);
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
    expect(pkg.dependencies['@react-native-ohos/flash-list']).toBe('2.1.1-rc.1');
  });
});
