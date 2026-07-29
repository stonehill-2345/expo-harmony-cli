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
