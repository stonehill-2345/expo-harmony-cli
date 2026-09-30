import spawnAsync from '@expo/spawn-async';
import { vol } from 'memfs';
import { buildHarmonyAsync } from '../build';
import { resolveHarmonyToolchain } from '../paths';
import { resolveHarmonyDeviceAsync, reverseHarmonyPortAsync } from '../device';

describe('Harmony CLI primitives', () => {
  beforeEach(() => {
    vol.reset();
    jest.mocked(spawnAsync).mockReset();
  });

  it('detects the standard macOS DevEco Studio installation without environment variables', () => {
    vol.fromJSON({
      '/Applications/DevEco-Studio.app/Contents/tools/ohpm/bin/ohpm': '',
      '/Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw': '',
    });

    expect(resolveHarmonyToolchain({}, 'darwin')).toEqual({
      devecoHome: '/Applications/DevEco-Studio.app/Contents',
      ohpm: '/Applications/DevEco-Studio.app/Contents/tools/ohpm/bin/ohpm',
      hvigor: '/Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw',
      hdc: 'hdc',
    });
  });

  it('prefers the HDC configured on PATH over the bundled DevEco HDC', () => {
    vol.fromJSON({
      '/Applications/DevEco-Studio.app/Contents/tools/ohpm/bin/ohpm': '',
      '/Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw': '',
      '/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains/hdc': '',
      '/open-harmony-sdk/hdc': '',
    });
    vol.chmodSync('/open-harmony-sdk/hdc', 0o755);

    expect(resolveHarmonyToolchain({ PATH: '/open-harmony-sdk' }, 'darwin').hdc).toBe(
      '/open-harmony-sdk/hdc'
    );
  });
  it('runs OHPM and Hvigor with the selected mode', async () => {
    vol.fromJSON({
      '/app/harmony/entry/build/default/outputs/default/entry-default-unsigned.hap': 'hap',
    });
    jest
      .mocked(spawnAsync)
      .mockResolvedValue({ stdout: '', stderr: '', status: 0, signal: null, output: [] } as any);
    await expect(
      buildHarmonyAsync('/app', 'release', {
        devecoHome: '/deveco',
        ohpm: '/ohpm',
        hvigor: '/hvigor',
        hdc: '/hdc',
      })
    ).resolves.toContain('entry-default-unsigned.hap');
    expect(spawnAsync).toHaveBeenNthCalledWith(
      1,
      '/ohpm',
      ['install'],
      expect.objectContaining({ cwd: '/app/harmony/entry' })
    );
    expect(spawnAsync).toHaveBeenNthCalledWith(
      2,
      '/hvigor',
      expect.arrayContaining(['buildMode=release', 'assembleHap']),
      expect.objectContaining({ cwd: '/app/harmony' })
    );
  });
  it('selects one device without restarting a healthy HDC server', async () => {
    jest.mocked(spawnAsync).mockResolvedValueOnce({ stdout: '127.0.0.1:5555\n' } as any);

    await expect(resolveHarmonyDeviceAsync('/hdc')).resolves.toBe('127.0.0.1:5555');

    expect(spawnAsync).toHaveBeenCalledTimes(1);
    expect(spawnAsync).toHaveBeenCalledWith('/hdc', ['list', 'targets']);
  });

  it('restarts the HDC server once after a connection failure and retries device discovery', async () => {
    jest
      .mocked(spawnAsync)
      .mockRejectedValueOnce(hdcError('Connect server failed'))
      .mockResolvedValueOnce({ stdout: '' } as any)
      .mockResolvedValueOnce({ stdout: '127.0.0.1:5555\n' } as any);

    await expect(resolveHarmonyDeviceAsync('/hdc')).resolves.toBe('127.0.0.1:5555');

    expect(jest.mocked(spawnAsync).mock.calls).toEqual([
      ['/hdc', ['list', 'targets']],
      ['/hdc', ['start', '-r']],
      ['/hdc', ['list', 'targets']],
    ]);
  });

  it('restarts HDC when device discovery reports a connection failure on stdout', async () => {
    jest
      .mocked(spawnAsync)
      .mockResolvedValueOnce({ stdout: 'Connect server failed\n', stderr: '' } as any)
      .mockResolvedValueOnce({ stdout: '', stderr: '' } as any)
      .mockResolvedValueOnce({ stdout: '127.0.0.1:5555\n', stderr: '' } as any);

    await expect(resolveHarmonyDeviceAsync('/hdc')).resolves.toBe('127.0.0.1:5555');

    expect(spawnAsync).toHaveBeenCalledTimes(3);
  });

  it('throws a clear error when device discovery still cannot connect after restarting HDC', async () => {
    jest
      .mocked(spawnAsync)
      .mockRejectedValueOnce(hdcError('Connect server failed'))
      .mockResolvedValueOnce({ stdout: '' } as any)
      .mockRejectedValueOnce(hdcError('Connect server failed'));

    await expect(resolveHarmonyDeviceAsync('/hdc')).rejects.toThrow(
      'Unable to connect to the Harmony HDC server after restarting it.'
    );

    expect(spawnAsync).toHaveBeenCalledTimes(3);
  });

  it('throws a clear error when restarting the HDC server also cannot connect', async () => {
    jest
      .mocked(spawnAsync)
      .mockRejectedValueOnce(hdcError('Connect server failed'))
      .mockRejectedValueOnce(hdcError('Connect server failed'));

    await expect(resolveHarmonyDeviceAsync('/hdc')).rejects.toThrow(
      'Unable to connect to the Harmony HDC server after restarting it.'
    );

    expect(spawnAsync).toHaveBeenCalledTimes(2);
  });

  it('does not restart HDC when no device is connected', async () => {
    jest.mocked(spawnAsync).mockResolvedValueOnce({ stdout: '[Empty]\n' } as any);

    await expect(resolveHarmonyDeviceAsync('/hdc')).rejects.toThrow(
      'No Harmony device is connected.'
    );

    expect(spawnAsync).toHaveBeenCalledTimes(1);
  });

  it('does not restart HDC when multiple devices are connected', async () => {
    jest
      .mocked(spawnAsync)
      .mockResolvedValueOnce({ stdout: '127.0.0.1:5555\n127.0.0.1:5556\n' } as any);

    await expect(resolveHarmonyDeviceAsync('/hdc')).rejects.toThrow(
      'Specify --device when multiple Harmony targets are connected.'
    );

    expect(spawnAsync).toHaveBeenCalledTimes(1);
  });

  it('does not restart HDC for a non-server connection error', async () => {
    const error = hdcError('Permission denied');
    jest.mocked(spawnAsync).mockRejectedValueOnce(error);

    await expect(resolveHarmonyDeviceAsync('/hdc')).rejects.toBe(error);

    expect(spawnAsync).toHaveBeenCalledTimes(1);
  });

  it('stops a timed out discovery before restarting HDC', async () => {
    jest.useFakeTimers();
    try {
      const timedOutList = pendingSpawn();
      jest
        .mocked(spawnAsync)
        .mockReturnValueOnce(timedOutList.promise as any)
        .mockResolvedValueOnce({ stdout: '' } as any)
        .mockResolvedValueOnce({ stdout: '127.0.0.1:5555\n' } as any);

      const device = resolveHarmonyDeviceAsync('/hdc');
      await jest.runAllTimersAsync();

      await expect(device).resolves.toBe('127.0.0.1:5555');
      expect(timedOutList.kill).toHaveBeenCalledWith('SIGKILL');
      expect(jest.getTimerCount()).toBe(0);
      expect(spawnAsync).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it('reverses the Metro port for the selected device', async () => {
    jest.mocked(spawnAsync).mockResolvedValueOnce({ stdout: 'OK' } as any);

    await reverseHarmonyPortAsync('/hdc', '127.0.0.1:5555', 8081);

    expect(spawnAsync).toHaveBeenCalledWith('/hdc', [
      '-t',
      '127.0.0.1:5555',
      'rport',
      'tcp:8081',
      'tcp:8081',
    ]);
  });
});

function hdcError(message: string) {
  return Object.assign(new Error(`hdc exited: ${message}`), { stderr: message, stdout: '' });
}

function pendingSpawn() {
  let reject!: (error: Error) => void;
  const promise = new Promise((_, rejectPromise) => {
    reject = rejectPromise;
  }) as any;
  const kill = jest.fn(() => {
    reject(hdcError('Timed out'));
    return true;
  });
  promise.child = { kill };
  return { promise, kill };
}
