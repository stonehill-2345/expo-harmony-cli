import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

vi.mock('../src/utils/exec', () => ({ run: vi.fn(), getOutput: vi.fn() }));
const { run: mockRun } = await import('../src/utils/exec');

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
    mockRun.mockClear();
    mockGen.mockClear();
    mockWriteMetroConfig.mockClear();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prebuild-'));
    fs.writeFileSync(
      path.join(tmp, 'app.json'),
      JSON.stringify({ expo: { name: 'X', slug: 'x' } })
    );
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ dependencies: {} }));
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
    expect(mockRun).toHaveBeenCalledWith(
      expect.stringContaining('expo prebuild'),
      expect.anything()
    );
    expect(mockGen).toHaveBeenCalledTimes(1);
  });

  it('--platform harmony → 仅调 runHarmonyGeneration，不调 expo prebuild', async () => {
    const { prebuild } = await import('../src/commands/prebuild');
    await prebuild(['--platform', 'harmony']);
    expect(mockRun).not.toHaveBeenCalled();
    expect(mockGen).toHaveBeenCalledTimes(1);
    expect(mockGen).toHaveBeenCalledWith(expect.any(String), { name: 'X', slug: 'x' }, { force: false });
    expect(mockWriteMetroConfig).toHaveBeenCalledWith(expect.any(String));
  });

  it('--platform harmony --force → 覆盖已有 harmony 目录', async () => {
    const { prebuild } = await import('../src/commands/prebuild');
    await prebuild(['--platform', 'harmony', '--force']);
    expect(mockRun).not.toHaveBeenCalled();
    expect(mockGen).toHaveBeenCalledWith(expect.any(String), { name: 'X', slug: 'x' }, { force: true });
  });

  it('--platform ios → 仅调 expo prebuild，不调 runHarmonyGeneration', async () => {
    const { prebuild } = await import('../src/commands/prebuild');
    await prebuild(['--platform', 'ios']);
    expect(mockRun).toHaveBeenCalledWith(
      expect.stringContaining('--platform ios'),
      expect.anything()
    );
    expect(mockGen).not.toHaveBeenCalled();
    expect(mockWriteMetroConfig).not.toHaveBeenCalled();
  });

  it('迁移旧项目：依赖已移除时，prebuild 清理遗留的 iOS 模板覆盖文件', async () => {
    const { prebuild } = await import('../src/commands/prebuild');
    await prebuild(['--platform', 'ios']);
    expect(fs.existsSync(path.join(tmp, 'components/ui/TabBarBackground.ios.tsx'))).toBe(false);
    expect(fs.existsSync(path.join(tmp, 'components/ui/IconSymbol.ios.tsx'))).toBe(false);
  });

  it('非项目根（无 app.json）→ 抛错', async () => {
    fs.unlinkSync(path.join(tmp, 'app.json'));
    const { prebuild } = await import('../src/commands/prebuild');
    await expect(prebuild([])).rejects.toThrow(/项目根|app\.json/i);
  });
});
