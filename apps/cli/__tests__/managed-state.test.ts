import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  cleanupManagedPackage,
  readManagedState,
  recordManagedPackage,
  writeManagedState,
  findGeneratedFileDrift,
  recordGeneratedFileBaselines,
  readManagedEntries,
  recordManagedEntries,
  withGeneratedFileBaselines,
  withManagedEntries,
} from '../src/lifecycle/managed-state';
import { renameAtomic } from '../src/utils/atomic-rename';

// vitest 下 spyOn 无法拦截被测模块内部的 fs 调用，改 mock atomic-rename 模块本身；
// 默认透传真实实现，个别用例用 mockImplementationOnce 注入故障。
vi.mock('../src/utils/atomic-rename', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/atomic-rename')>();
  return { ...actual, renameAtomic: vi.fn(actual.renameAtomic) };
});

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

  it('卸载时同步清除两级 oh-package 受管条目，保留无关包条目（规范 §5）', () => {
    recordManagedPackage(tmp, 'react-native-webview', {
      harmonyPackage: '@react-native-ohos/react-native-webview',
      alias: 'react-native-webview',
      needsAutolink: true,
    });
    // 模拟 sync 产出的 managedEntries：本包两级 + 无关包一条
    recordManagedEntries(tmp, [
      { path: 'harmony/oh-package.json5', dependency: '@react-native-ohos/react-native-webview', spec: 'file:../node_modules/@react-native-ohos/react-native-webview/harmony/rn_webview.har' },
      { path: 'harmony/entry/oh-package.json5', dependency: '@react-native-ohos/react-native-webview', spec: 'file:../../node_modules/@react-native-ohos/react-native-webview/harmony/rn_webview.har' },
      { path: 'harmony/oh-package.json5', dependency: '@react-native-ohos/react-native-svg', spec: 'file:../node_modules/@react-native-ohos/react-native-svg/harmony/svg.har' },
    ], '1.2.0');

    cleanupManagedPackage(tmp, 'react-native-webview');

    const keys = Object.keys(readManagedEntries(tmp));
    expect(keys.some(k => k.endsWith(':@react-native-ohos/react-native-webview'))).toBe(false);
    expect(keys.some(k => k.endsWith(':@react-native-ohos/react-native-svg'))).toBe(true);
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


describe('managed-state v2（generatedFiles / managedEntries 基线）', () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mstate-')); });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('兼容读取 v1 状态并归一化为 v2', () => {
    fs.mkdirSync(path.join(tmp, '.expo-harmony'));
    fs.writeFileSync(path.join(tmp, '.expo-harmony', 'managed-state.json'), JSON.stringify({
      version: 1, packages: { 'some-pkg': { alias: 'x' } },
    }));
    const state = readManagedState(tmp);
    expect(state.version).toBe(2);
    expect(state.packages['some-pkg']).toEqual({ alias: 'x' });
    expect(state.generatedFiles).toBeUndefined();
  });

  it('损坏 JSON → 空状态（version 2）', () => {
    fs.mkdirSync(path.join(tmp, '.expo-harmony'));
    fs.writeFileSync(path.join(tmp, '.expo-harmony', 'managed-state.json'), '{oops');
    expect(readManagedState(tmp)).toEqual({ version: 2, packages: {} });
  });

  it('generatedFiles 形状损坏 -> 丢弃该字段（等效无基线，packages 保留）', () => {
    fs.mkdirSync(path.join(tmp, '.expo-harmony'));
    fs.writeFileSync(path.join(tmp, '.expo-harmony', 'managed-state.json'), JSON.stringify({
      version: 2,
      packages: { 'some-pkg': { alias: 'x' } },
      generatedFiles: { 'RNOHPackagesFactory.ets': { contentHash: 123, cliVersion: '1.2.0' } },
    }));
    const state = readManagedState(tmp);
    expect(state.version).toBe(2);
    expect(state.packages['some-pkg']).toEqual({ alias: 'x' });
    expect(state.generatedFiles).toBeUndefined();
  });

  it('generatedFiles 键含 .. 逃逸项目根 → 丢弃该字段', () => {
    fs.mkdirSync(path.join(tmp, '.expo-harmony'));
    fs.writeFileSync(path.join(tmp, '.expo-harmony', 'managed-state.json'), JSON.stringify({
      version: 2,
      packages: {},
      generatedFiles: { '../../outside.ets': { contentHash: 'a'.repeat(64), cliVersion: '1.2.0' } },
    }));
    expect(readManagedState(tmp).generatedFiles).toBeUndefined();
  });

  it('generatedFiles 键为绝对路径 → 丢弃该字段', () => {
    fs.mkdirSync(path.join(tmp, '.expo-harmony'));
    fs.writeFileSync(path.join(tmp, '.expo-harmony', 'managed-state.json'), JSON.stringify({
      version: 2,
      packages: {},
      generatedFiles: { '/etc/passwd': { contentHash: 'a'.repeat(64), cliVersion: '1.2.0' } },
    }));
    expect(readManagedState(tmp).generatedFiles).toBeUndefined();
  });

  it('managedEntries 形状损坏 -> 丢弃该字段（generatedFiles 不受影响）', () => {
    fs.mkdirSync(path.join(tmp, '.expo-harmony'));
    fs.writeFileSync(path.join(tmp, '.expo-harmony', 'managed-state.json'), JSON.stringify({
      version: 2,
      packages: {},
      generatedFiles: { 'a.ets': { contentHash: 'a'.repeat(64), cliVersion: '1.2.0' } },
      managedEntries: { 'harmony/oh-package.json5:x': { path: 'harmony/oh-package.json5', dependency: 123, spec: 'file:../x', cliVersion: '1.2.0' } },
    }));
    const state = readManagedState(tmp);
    expect(state.managedEntries).toBeUndefined();
    expect(state.generatedFiles?.['a.ets']).toBeTruthy();
  });

  it('managedEntries path 不安全 -> 丢弃该字段', () => {
    fs.mkdirSync(path.join(tmp, '.expo-harmony'));
    fs.writeFileSync(path.join(tmp, '.expo-harmony', 'managed-state.json'), JSON.stringify({
      version: 2,
      packages: {},
      managedEntries: { 'evil:x': { path: '../../outside.json5', dependency: 'x', spec: 'file:../x', cliVersion: '1.2.0' } },
    }));
    expect(readManagedState(tmp).managedEntries).toBeUndefined();
  });

  it('recordManagedEntries → readManagedEntries 往返（键格式 path:dependency）', () => {
    recordManagedEntries(tmp, [{ path: 'harmony/oh-package.json5', dependency: '@react-native-ohos/x', spec: 'file:../node_modules/@react-native-ohos/x/harmony/x.har' }], '1.2.0');
    const entries = readManagedEntries(tmp);
    expect(entries['harmony/oh-package.json5:@react-native-ohos/x'].spec)
      .toBe('file:../node_modules/@react-native-ohos/x/harmony/x.har');
    expect(entries['harmony/oh-package.json5:@react-native-ohos/x'].cliVersion).toBe('1.2.0');
  });

  it('withXxx 纯函数合成 + 单次原子写 → A/B 两类基线一次落齐（Task 7 落账同构）', () => {
    fs.writeFileSync(path.join(tmp, 'RNOHPackagesFactory.ets'), 'content');
    let state = readManagedState(tmp);
    state = withGeneratedFileBaselines(tmp, state, ['RNOHPackagesFactory.ets'], '1.2.0');
    state = withManagedEntries(state, [{ path: 'harmony/oh-package.json5', dependency: '@react-native-ohos/x', spec: 'file:../x.har' }], '1.2.0');
    writeManagedState(tmp, state);
    const after = readManagedState(tmp);
    expect(after.generatedFiles?.['RNOHPackagesFactory.ets']?.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(after.managedEntries?.['harmony/oh-package.json5:@react-native-ohos/x']?.spec).toBe('file:../x.har');
  });

  it('writeManagedState 原子性：rename 失败 → 抛错、原状态文件未被破坏、无 tmp 残留', () => {
    fs.mkdirSync(path.join(tmp, '.expo-harmony'));
    const statePath = path.join(tmp, '.expo-harmony', 'managed-state.json');
    fs.writeFileSync(statePath, JSON.stringify({ version: 2, packages: { keep: {} } }));
    const before = fs.readFileSync(statePath, 'utf8');
    vi.mocked(renameAtomic).mockImplementationOnce(() => { throw new Error('mock rename 故障'); });
    expect(() => writeManagedState(tmp, { version: 2, packages: {} })).toThrow();
    expect(fs.readFileSync(statePath, 'utf8')).toBe(before);      // 原文件未被破坏
    expect(fs.existsSync(`${statePath}.cli-tmp`)).toBe(false);   // tmp 已清理
  });

  it('记录基线后 drift 检测：内容未变 → 无 drift；被改 → 命中', () => {
    const file = path.join(tmp, 'RNOHPackagesFactory.ets');
    fs.writeFileSync(file, 'original');
    recordGeneratedFileBaselines(tmp, ['RNOHPackagesFactory.ets'], '1.2.0-beta.1');
    expect(findGeneratedFileDrift(tmp, ['RNOHPackagesFactory.ets'])).toEqual([]);

    fs.writeFileSync(file, 'user edited');
    expect(findGeneratedFileDrift(tmp, ['RNOHPackagesFactory.ets'])).toEqual(['RNOHPackagesFactory.ets']);
  });

  it('无基线记录的文件不算 drift（新 clone 场景）', () => {
    fs.writeFileSync(path.join(tmp, 'RNOHPackagesFactory.ets'), 'whatever');
    expect(findGeneratedFileDrift(tmp, ['RNOHPackagesFactory.ets'])).toEqual([]);
  });

  it('重新记录基线后 drift 清零（覆盖后基线更新）', () => {
    const file = path.join(tmp, 'autolinking.cmake');
    fs.writeFileSync(file, 'v1');
    recordGeneratedFileBaselines(tmp, ['autolinking.cmake'], '1.2.0');
    fs.writeFileSync(file, 'v2');
    recordGeneratedFileBaselines(tmp, ['autolinking.cmake'], '1.2.0');
    expect(findGeneratedFileDrift(tmp, ['autolinking.cmake'])).toEqual([]);
    const state = readManagedState(tmp);
    expect(state.generatedFiles?.['autolinking.cmake']?.cliVersion).toBe('1.2.0');
  });
});
