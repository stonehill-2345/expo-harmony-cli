import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  cleanupManagedPackage,
  readManagedState,
  recordManagedPackage,
} from '../src/lifecycle/managed-state';

describe('HarmonyOS managed state', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'managed-state-'));
    fs.mkdirSync(path.join(tmp, 'shims'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'patches'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({
      dependencies: {
        'react-native-webview': '13.15.0',
        '@react-native-ohos/react-native-webview': '13.15.1',
      },
    }));
    fs.writeFileSync(path.join(tmp, 'shims/.alias-map.json'), JSON.stringify({
      'react-native-webview': '@react-native-ohos/react-native-webview',
      '@expo/metro-runtime': './shims/expo-metro-runtime.ts',
    }));
    fs.writeFileSync(path.join(tmp, 'patches/webview.patch'), 'managed patch');
  });

  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('记录并读取 CLI 管理的伴随资产', () => {
    recordManagedPackage(tmp, 'react-native-webview', {
      harmonyPackage: '@react-native-ohos/react-native-webview',
      alias: 'react-native-webview',
      patchFiles: [{ targetPath: 'patches/webview.patch' }],
      needsAutolink: true,
    });

    expect(readManagedState(tmp).packages['react-native-webview']).toMatchObject({
      harmonyPackage: '@react-native-ohos/react-native-webview',
      alias: 'react-native-webview',
      needsAutolink: true,
    });
    expect(fs.readFileSync(path.join(tmp, '.gitignore'), 'utf8')).toContain('.expo-harmony/');
  });

  it('清理状态所属的伴随包、alias 与文件，保留无关 alias', () => {
    recordManagedPackage(tmp, 'react-native-webview', {
      harmonyPackage: '@react-native-ohos/react-native-webview',
      alias: 'react-native-webview',
      patchFiles: [{ targetPath: 'patches/webview.patch' }],
      needsAutolink: true,
    });

    const result = cleanupManagedPackage(tmp, 'react-native-webview');
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    const aliases = JSON.parse(fs.readFileSync(path.join(tmp, 'shims/.alias-map.json'), 'utf8'));

    expect(result.needsAutolink).toBe(true);
    expect(pkg.dependencies['react-native-webview']).toBeUndefined();
    expect(pkg.dependencies['@react-native-ohos/react-native-webview']).toBeUndefined();
    expect(aliases['react-native-webview']).toBeUndefined();
    expect(aliases['@expo/metro-runtime']).toBe('./shims/expo-metro-runtime.ts');
    expect(fs.existsSync(path.join(tmp, 'patches/webview.patch'))).toBe(false);
    expect(readManagedState(tmp).packages['react-native-webview']).toBeUndefined();
  });

  it('共享同一 HarmonyOS 包时，先移除引用的一方不会删除伴随包', () => {
    recordManagedPackage(tmp, 'first', { harmonyPackage: '@react-native-ohos/react-native-webview' });
    recordManagedPackage(tmp, 'second', { harmonyPackage: '@react-native-ohos/react-native-webview' });

    cleanupManagedPackage(tmp, 'first');
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));

    expect(pkg.dependencies['@react-native-ohos/react-native-webview']).toBe('13.15.1');
    expect(readManagedState(tmp).packages.second).toBeTruthy();
  });

  it('不删除已被用户修改的托管文件', () => {
    recordManagedPackage(tmp, 'react-native-webview', {
      patchFiles: [{ targetPath: 'patches/webview.patch', contentHash: 'not-the-current-file' }],
    });

    cleanupManagedPackage(tmp, 'react-native-webview');

    expect(fs.readFileSync(path.join(tmp, 'patches/webview.patch'), 'utf8')).toBe('managed patch');
  });

  it('不删除用户改写过的 alias', () => {
    recordManagedPackage(tmp, 'react-native-webview', {
      harmonyPackage: '@react-native-ohos/react-native-webview',
      alias: 'react-native-webview',
    });
    fs.writeFileSync(path.join(tmp, 'shims/.alias-map.json'), JSON.stringify({
      'react-native-webview': './shims/custom-webview.ts',
    }));

    cleanupManagedPackage(tmp, 'react-native-webview');

    const aliases = JSON.parse(fs.readFileSync(path.join(tmp, 'shims/.alias-map.json'), 'utf8'));
    expect(aliases['react-native-webview']).toBe('./shims/custom-webview.ts');
  });
});
