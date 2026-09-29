import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

vi.mock('../../src/utils/exec', () => ({ runFile: vi.fn() }));
vi.mock('../../src/harmony-project', () => ({ runHarmonyGeneration: vi.fn(), syncHarmonyAutolinking: vi.fn() }));
vi.mock('../../src/scanner/scan', () => ({ scanAndAdapt: vi.fn() }));
vi.mock('../../src/installer/adapt-package', () => ({ adaptPackage: vi.fn() }));
vi.mock('@expo/config', () => ({ getConfig: vi.fn(() => ({ exp: {} })) }));
vi.mock('../../src/injector/metro-config', () => ({ writeMetroConfig: vi.fn() }));
vi.mock('../../src/prebuild/preflight', () => ({ preflight: vi.fn() }));
vi.mock('../../src/prebuild/postflight', () => ({ postflight: vi.fn() }));
vi.mock('../../src/h-cleanup', () => ({ cleanupStaleIosTemplateOverrides: vi.fn() }));

const { runFile } = await import('../../src/utils/exec');
const harmonyProject = await import('../../src/harmony-project');
const scanner = await import('../../src/scanner/scan');

describe('SDK54 package-patch command routing', () => {
  let root: string;
  beforeEach(() => {
    vi.clearAllMocks();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-command-routing-'));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { expo: '54.0.37' } }));
    fs.mkdirSync(path.join(root, '.expo-harmony'), { recursive: true });
    fs.writeFileSync(path.join(root, '.expo-harmony/managed-state.json'), JSON.stringify({
      version: 2, packages: {}, sdk54: { sdk: 'sdk-54', mode: 'sdk54-package-patch', template: 'default', patchSet: 'sdk54-mvp-1', expo: '54.0.37', rnoh: '0.82.30' },
    }));
    process.chdir(root);
  });
  afterEach(() => { process.chdir(__dirname); fs.rmSync(root, { recursive: true, force: true }); });

  it('prebuild forwards Harmony to local patched Expo and skips the legacy generator', async () => {
    const { prebuild } = await import('../../src/commands/prebuild');
    await prebuild(['--platform', 'harmony']);
    expect(runFile).toHaveBeenCalledWith('npx', ['--no-install', 'expo', 'prebuild', '--platform', 'harmony'], { cwd: fs.realpathSync(root) });
    expect(harmonyProject.runHarmonyGeneration).not.toHaveBeenCalled();
  });

  it('sync and scan fail closed without invoking legacy logic', async () => {
    const { sync } = await import('../../src/commands/sync');
    const { scan } = await import('../../src/commands/scan');
    await expect(sync([])).rejects.toThrow(/官方.*prebuild|package-patch/);
    await expect(scan(['--apply'])).rejects.toThrow(/1\.5\.0|fresh|package-patch/);
    expect(harmonyProject.syncHarmonyAutolinking).not.toHaveBeenCalled();
    expect(scanner.scanAndAdapt).not.toHaveBeenCalled();
  });

  it('install and uninstall fail closed before package manager side effects', async () => {
    const { runInstall } = await import('../../src/installer/installer');
    const { runUninstall } = await import('../../src/installer/uninstaller');
    await expect(runInstall(['react-native-video'])).rejects.toThrow(/1\.5\.0|fresh|package-patch/);
    await expect(runUninstall(['react-native-video'])).rejects.toThrow(/1\.5\.0|fresh|package-patch/);
    expect(runFile).not.toHaveBeenCalled();
  });
});
