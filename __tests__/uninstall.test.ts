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
    expect(mockSync).toHaveBeenCalledWith(fs.realpathSync(tmp), { force: false });
    expect(mockRunFile).toHaveBeenCalledWith(expect.any(String), ['install', '--all'], expect.anything());
  });

  it('未知包只执行包管理器卸载，不清理未知 HarmonyOS 资产', async () => {
    const { runUninstall } = await import('../src/installer/uninstaller');
    await runUninstall(['lodash']);

    expect(mockRunFile).toHaveBeenCalledWith('pnpm', ['remove', 'lodash'], expect.anything());
    expect(mockSync).not.toHaveBeenCalled();
  });

  // drift preflight：真实链路（assertNoDrift 走 harmony-project/standalone 子模块，不受 index mock 影响）
  it('drift（受管文件被手动修改）→ 在任何卸载动作前阻断，磁盘快照不变', async () => {
    const { syncHarmonyAutolinking: syncReal } = await import('../src/harmony-project/standalone');
    // 覆盖 beforeEach 的空 harmony/，建立完整工程 + 真实基线
    fs.rmSync(path.join(tmp, 'harmony'), { recursive: true, force: true });
    fs.mkdirSync(path.join(tmp, 'harmony', 'entry'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'harmony', 'oh-package.json5'), JSON.stringify({ dependencies: {} }));
    fs.writeFileSync(path.join(tmp, 'harmony', 'entry', 'oh-package.json5'), JSON.stringify({ dependencies: {} }));
    fs.mkdirSync(path.join(tmp, 'node_modules', '@react-native-ohos', 'react-native-safe-area-context', 'harmony'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'node_modules', '@react-native-ohos', 'react-native-safe-area-context', 'harmony', 'safe_area.har'), 'har');
    fs.mkdirSync(path.join(tmp, 'node_modules', '@react-native-oh', 'react-native-harmony'), { recursive: true });
    const quiet = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await syncReal(tmp); // 建立真实基线
    } finally {
      quiet.mockRestore();
    }
    fs.writeFileSync(path.join(tmp, 'harmony', 'entry', 'src', 'main', 'ets', 'RNOHPackagesFactory.ets'), '// manual edit\n');

    const pkgBefore = fs.readFileSync(path.join(tmp, 'package.json'), 'utf8');
    const { runUninstall } = await import('../src/installer/uninstaller');
    await expect(runUninstall(['react-native-webview'])).rejects.toThrow(/已阻止本次 install\/uninstall/);
    expect(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8')).toBe(pkgBefore); // 尚未做任何变更
    expect(mockRunFile).not.toHaveBeenCalled(); // 卸载动作未发生
  });

  it('drift + --force → 跳过 drift 保护继续卸载', async () => {
    const { syncHarmonyAutolinking: syncReal } = await import('../src/harmony-project/standalone');
    fs.rmSync(path.join(tmp, 'harmony'), { recursive: true, force: true });
    fs.mkdirSync(path.join(tmp, 'harmony', 'entry'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'harmony', 'oh-package.json5'), JSON.stringify({ dependencies: {} }));
    fs.writeFileSync(path.join(tmp, 'harmony', 'entry', 'oh-package.json5'), JSON.stringify({ dependencies: {} }));
    fs.mkdirSync(path.join(tmp, 'node_modules', '@react-native-ohos', 'react-native-safe-area-context', 'harmony'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'node_modules', '@react-native-ohos', 'react-native-safe-area-context', 'harmony', 'safe_area.har'), 'har');
    fs.mkdirSync(path.join(tmp, 'node_modules', '@react-native-oh', 'react-native-harmony'), { recursive: true });
    const quiet = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await syncReal(tmp);
    } finally {
      quiet.mockRestore();
    }
    fs.writeFileSync(path.join(tmp, 'harmony', 'entry', 'src', 'main', 'ets', 'RNOHPackagesFactory.ets'), '// manual edit\n');

    const { recordManagedPackage } = await import('../src/lifecycle/managed-state');
    recordManagedPackage(tmp, 'react-native-webview', {
      harmonyPackage: '@react-native-ohos/react-native-webview',
      alias: 'react-native-webview',
      needsAutolink: true,
    });
    const { runUninstall } = await import('../src/installer/uninstaller');
    await runUninstall(['react-native-webview', '--force']);
    expect(mockRunFile).toHaveBeenCalledWith(
      'pnpm', ['remove', 'react-native-webview', '@react-native-ohos/react-native-webview'],
      expect.anything(),
    );
  });
});
