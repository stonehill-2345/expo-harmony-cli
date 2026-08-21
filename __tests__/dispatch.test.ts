import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/commands/create', () => ({ create: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../src/commands/prebuild', () => ({ prebuild: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../src/commands/install', () => ({ install: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../src/commands/scan', () => ({ scan: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../src/commands/list', () => ({ list: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../src/commands/sync', () => ({ sync: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../src/commands/uninstall', () => ({ uninstall: vi.fn().mockResolvedValue(undefined) }));

const mockCreate = (await import('../src/commands/create')).create as ReturnType<typeof vi.fn>;
const mockPrebuild = (await import('../src/commands/prebuild')).prebuild as ReturnType<typeof vi.fn>;
const mockInstall = (await import('../src/commands/install')).install as ReturnType<typeof vi.fn>;
const mockScan = (await import('../src/commands/scan')).scan as ReturnType<typeof vi.fn>;
const mockList = (await import('../src/commands/list')).list as ReturnType<typeof vi.fn>;
const mockSync = (await import('../src/commands/sync')).sync as ReturnType<typeof vi.fn>;
const mockUninstall = (await import('../src/commands/uninstall')).uninstall as ReturnType<typeof vi.fn>;

describe('命令分发', () => {
  beforeEach(() => {
    mockCreate.mockClear();
    mockPrebuild.mockClear();
    mockInstall.mockClear();
    mockScan.mockClear();
    mockList.mockClear();
    mockSync.mockClear();
    mockUninstall.mockClear();
  });

  it('无命令 → 调 create（交互模式）', async () => {
    const { dispatch } = await import('../src/index');
    await dispatch([]);
    expect(mockCreate).toHaveBeenCalledWith([]);
  });

  it('--version/-v → 输出 package.json 版本且不创建项目', async () => {
    const { dispatch } = await import('../src/index');
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await dispatch(['--version']);
    await dispatch(['-v']);

    expect(output).toHaveBeenNthCalledWith(1, '1.0.0');
    expect(output).toHaveBeenNthCalledWith(2, '1.0.0');
    expect(mockCreate).not.toHaveBeenCalled();
    output.mockRestore();
  });

  it('create 命令 → 调 create', async () => {
    const { dispatch } = await import('../src/index');
    await dispatch(['create', 'my-app']);
    expect(mockCreate).toHaveBeenCalledWith(['my-app']);
  });

  it('裸项目名 → 当 create <name>', async () => {
    const { dispatch } = await import('../src/index');
    await dispatch(['my-app']);
    expect(mockCreate).toHaveBeenCalledWith(['my-app']);
  });

  it('未知 flag → 报错并打印 help，不落入 create', async () => {
    const { dispatch } = await import('../src/index');
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await expect(dispatch(['--platfrom', 'harmony'])).rejects.toThrow(/未知选项/);
    expect(output).toHaveBeenCalledWith(expect.stringContaining('Commands:'));
    expect(mockCreate).not.toHaveBeenCalled();
    output.mockRestore();
  });

  it('近似拼写的子命令 → 提示疑似命令后仍按项目名创建', async () => {
    const { dispatch } = await import('../src/index');
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await dispatch(['prebuld']);
    expect(err).toHaveBeenCalledWith(expect.stringContaining('prebuild'));
    expect(mockCreate).toHaveBeenCalledWith(['prebuld']);
    err.mockRestore();
  });

  it('裸项目名 + flag（如 --pnpm）→ 放行落入 create，不误判未知命令', async () => {
    const { dispatch } = await import('../src/index');
    await dispatch(['myapp', '--pnpm']);
    expect(mockCreate).toHaveBeenCalledWith(['myapp', '--pnpm']);
  });

  it('未知首项 + 位置参数 → 报未知命令并打印 help，不落入 create', async () => {
    const { dispatch } = await import('../src/index');
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await expect(dispatch(['prebuld', 'foo'])).rejects.toThrow(/未知命令/);
    expect(output).toHaveBeenCalledWith(expect.stringContaining('Commands:'));
    expect(mockCreate).not.toHaveBeenCalled();
    output.mockRestore();
  });

  it('prebuild/install/scan/list/sync → 调对应命令', async () => {
    const { dispatch } = await import('../src/index');

    await dispatch(['prebuild', '--platform', 'harmony']);
    expect(mockPrebuild).toHaveBeenCalledWith(['--platform', 'harmony']);

    await dispatch(['install', 'foo']);
    expect(mockInstall).toHaveBeenCalledWith(['foo']);

    await dispatch(['scan']);
    expect(mockScan).toHaveBeenCalledWith([]);

    await dispatch(['list']);
    expect(mockList).toHaveBeenCalledWith([]);

    await dispatch(['sync']);
    expect(mockSync).toHaveBeenCalledWith([]);

    await dispatch(['uninstall', 'foo']);
    expect(mockUninstall).toHaveBeenCalledWith(['foo']);

    await dispatch(['remove', 'foo']);
    expect(mockUninstall).toHaveBeenCalledWith(['foo']);
  });
});
