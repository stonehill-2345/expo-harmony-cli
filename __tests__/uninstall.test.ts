import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('../src/utils/exec', () => ({ runFile: vi.fn() }));
const { runFile: mockRunFile } = await import('../src/utils/exec');
vi.mock('../src/harmony-project', () => ({ syncHarmonyAutolinking: vi.fn(() => ({ linked: [] })) }));
const { syncHarmonyAutolinking: mockSync } = await import('../src/harmony-project');

describe('runUninstall', () => {
  let tmp: string;

  beforeEach(() => {
    mockRunFile.mockClear();
    mockSync.mockClear();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uninstall-'));
    fs.mkdirSync(path.join(tmp, 'harmony'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'shims'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({
      dependencies: {
        'react-native-webview': '13.15.0',
        '@react-native-ohos/react-native-webview': '13.15.1',
      },
    }));
    fs.writeFileSync(path.join(tmp, 'shims/.alias-map.json'), JSON.stringify({
      'react-native-webview': '@react-native-ohos/react-native-webview',
    }));
    process.chdir(tmp);
  });

  afterEach(() => {
    process.chdir(__dirname);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('卸载 native 包会清理 CLI 管理资产并增量同步原生工程', async () => {
    const { recordManagedPackage } = await import('../src/lifecycle/managed-state');
    recordManagedPackage(tmp, 'react-native-webview', {
      harmonyPackage: '@react-native-ohos/react-native-webview',
      alias: 'react-native-webview',
      needsAutolink: true,
    });
    const { runUninstall } = await import('../src/installer/uninstaller');

    await runUninstall(['react-native-webview']);

    expect(mockRunFile).toHaveBeenCalledWith(
      'pnpm', ['remove', 'react-native-webview', '@react-native-ohos/react-native-webview'],
      expect.anything(),
    );
    expect(mockSync).toHaveBeenCalledWith(fs.realpathSync(tmp));
    expect(mockRunFile).toHaveBeenCalledWith(expect.any(String), ['install', '--all'], expect.anything());
  });

  it('未知包只执行包管理器卸载，不清理未知 HarmonyOS 资产', async () => {
    const { runUninstall } = await import('../src/installer/uninstaller');
    await runUninstall(['lodash']);

    expect(mockRunFile).toHaveBeenCalledWith('pnpm', ['remove', 'lodash'], expect.anything());
    expect(mockSync).not.toHaveBeenCalled();
  });
});
