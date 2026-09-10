import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

vi.mock('../src/utils/exec', () => ({ runFile: vi.fn() }));
const { runFile: mockRunFile } = await import('../src/utils/exec');

vi.mock('../src/harmony-project', () => ({
  runHarmonyGeneration: vi.fn().mockResolvedValue(undefined),
}));
const { runHarmonyGeneration: mockGen } = await import('../src/harmony-project');

vi.mock('@expo/config', () => ({
  getConfig: vi.fn(() => ({ exp: { name: 'X', slug: 'x' } })),
}));

vi.mock('../src/injector/metro-config', () => ({ writeMetroConfig: vi.fn() }));
const { writeMetroConfig: mockWriteMetroConfig } = await import('../src/injector/metro-config');

describe('prebuild 命令', () => {
  let tmp: string;
  beforeEach(() => {
    vi.resetModules();
    mockRunFile.mockClear();
    mockGen.mockClear();
    mockWriteMetroConfig.mockClear();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prebuild-'));
    fs.writeFileSync(
      path.join(tmp, 'app.json'),
      JSON.stringify({ expo: { name: 'X', slug: 'x' } })
    );
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ dependencies: {} }));
    fs.mkdirSync(path.join(tmp, 'node_modules', 'expo'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'components', 'ui'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'components', 'ui', 'TabBarBackground.ios.tsx'), "import { BlurView } from 'expo-blur';\n");
    fs.writeFileSync(path.join(tmp, 'components', 'ui', 'IconSymbol.ios.tsx'), "import { SymbolView } from 'expo-symbols';\n");
    process.chdir(tmp);
  });
  afterEach(() => {
    process.chdir(__dirname);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('无 --platform → 调 expo prebuild（native）+ runHarmonyGeneration（harmony）', async () => {
    const { prebuild } = await import('../src/commands/prebuild');
    await prebuild([]);
    expect(mockRunFile).toHaveBeenCalledWith(
      'npx', ['--no-install', 'expo', 'prebuild'],
      expect.anything()
    );
    expect(mockGen).toHaveBeenCalledTimes(1);
  });

  it('无 --platform --force → 将 Expo native 参数映射为 --clean', async () => {
    const { prebuild } = await import('../src/commands/prebuild');
    await prebuild(['--force']);
    expect(mockRunFile).toHaveBeenCalledWith(
      'npx', ['--no-install', 'expo', 'prebuild', '--clean'],
      expect.anything()
    );
    expect(mockGen).toHaveBeenCalledWith(expect.any(String), { name: 'X', slug: 'x' }, { force: true });
  });

  it('--platform harmony → 仅调 runHarmonyGeneration，不调 expo prebuild', async () => {
    const { prebuild } = await import('../src/commands/prebuild');
    await prebuild(['--platform', 'harmony']);
    expect(mockRunFile).not.toHaveBeenCalled();
    expect(mockGen).toHaveBeenCalledTimes(1);
    expect(mockGen).toHaveBeenCalledWith(expect.any(String), { name: 'X', slug: 'x' }, { force: false });
    expect(mockWriteMetroConfig).toHaveBeenCalledWith(expect.any(String));
  });

  it('--platform harmony --force → 覆盖已有 harmony 目录', async () => {
    const { prebuild } = await import('../src/commands/prebuild');
    await prebuild(['--platform', 'harmony', '--force']);
    expect(mockRunFile).not.toHaveBeenCalled();
    expect(mockGen).toHaveBeenCalledWith(expect.any(String), { name: 'X', slug: 'x' }, { force: true });
  });

  it('--platform ios → 仅调 expo prebuild，不调 runHarmonyGeneration', async () => {
    const { prebuild } = await import('../src/commands/prebuild');
    await prebuild(['--platform', 'ios']);
    expect(mockRunFile).toHaveBeenCalledWith(
      'npx', ['--no-install', 'expo', 'prebuild', '--platform', 'ios'],
      expect.anything()
    );
    expect(mockGen).not.toHaveBeenCalled();
    expect(mockWriteMetroConfig).not.toHaveBeenCalled();
  });

  it('--platform ios --force → 透传给 expo 的是 --clean 而非 --force', async () => {
    const { prebuild } = await import('../src/commands/prebuild');
    await prebuild(['--platform', 'ios', '--force']);
    expect(mockRunFile).toHaveBeenCalledWith(
      'npx', ['--no-install', 'expo', 'prebuild', '--platform', 'ios', '--clean'],
      expect.anything()
    );
    expect(mockGen).not.toHaveBeenCalled();
  });

  it('迁移旧项目：依赖已移除时，prebuild 清理遗留的 iOS 模板覆盖文件', async () => {
    const { prebuild } = await import('../src/commands/prebuild');
    await prebuild(['--platform', 'ios']);
    expect(fs.existsSync(path.join(tmp, 'components/ui/TabBarBackground.ios.tsx'))).toBe(false);
    expect(fs.existsSync(path.join(tmp, 'components/ui/IconSymbol.ios.tsx'))).toBe(false);
  });

  it('工程未装依赖（node_modules 无 expo）→ 拦截并提示先安装，不调 npx', async () => {
    fs.rmSync(path.join(tmp, 'node_modules', 'expo'), { recursive: true });
    const { prebuild } = await import('../src/commands/prebuild');
    await expect(prebuild(['--platform', 'ios'])).rejects.toThrow(/pnpm install|安装依赖/);
    expect(mockRunFile).not.toHaveBeenCalled();
  });

  it('非项目根（无 app.json）→ 抛错', async () => {
    fs.unlinkSync(path.join(tmp, 'app.json'));
    const { prebuild } = await import('../src/commands/prebuild');
    await expect(prebuild([])).rejects.toThrow(/项目根|app\.json/i);
  });
});
