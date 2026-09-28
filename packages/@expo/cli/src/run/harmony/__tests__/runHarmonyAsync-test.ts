jest.mock('../../startBundler', () => ({ startBundlerAsync: jest.fn() }));
jest.mock('../../../harmony/bundle', () => ({ bundleHarmonyReleaseAsync: jest.fn() }));
jest.mock('../../../harmony/build', () => ({ buildHarmonyAsync: jest.fn() }));
jest.mock('../../../harmony/device', () => ({
  installHarmonyAppAsync: jest.fn(),
  launchHarmonyAppAsync: jest.fn(),
  resolveHarmonyDeviceAsync: jest.fn(),
  reverseHarmonyPortAsync: jest.fn(),
}));
jest.mock('../../../harmony/paths', () => ({ resolveHarmonyToolchain: jest.fn() }));
jest.mock('../../../prebuild/harmony/prebuildHarmonyAsync', () => ({
  prebuildHarmonyAsync: jest.fn(),
}));
import { vol } from 'memfs';
import { runHarmonyAsync } from '../runHarmonyAsync';
const base = () => ({
  prebuildHarmonyAsync: jest.fn(async () => ({ harmonyRoot: '/app/harmony' })),
  startBundlerAsync: jest.fn(),
  bundleHarmonyReleaseAsync: jest.fn(),
  buildHarmonyAsync: jest.fn(async () => '/app/app.hap'),
  installHarmonyAppAsync: jest.fn(),
  launchHarmonyAppAsync: jest.fn(),
  resolveHarmonyDeviceAsync: jest.fn(async () => 'dev'),
  reverseHarmonyPortAsync: jest.fn(),
  resolveHarmonyToolchain: jest.fn(() => ({ hdc: '/hdc' })),
});
describe(runHarmonyAsync, () => {
  beforeEach(() => {
    vol.reset();
    delete process.env.NODE_ENV;
  });
  it('runs Debug with Metro and reverse port', async () => {
    vol.fromJSON({
      '/app/harmony/AppScope/app.json5': JSON.stringify({ app: { bundleName: 'dev.app' } }),
      '/app/harmony/entry/src/main/ets/pages/Index.ets':
        'http://127.0.0.1:8081/node_modules/expo-router/entry.bundle',
      '/app/harmony/entry/src/main/resources/rawfile/bundle.harmony.js': 'release',
    });
    const d = base();
    d.prebuildHarmonyAsync.mockImplementationOnce(async () => {
      expect(process.env.NODE_ENV).toBe('development');
      return { harmonyRoot: '/app/harmony' };
    });
    await runHarmonyAsync('/app', { port: 9090 }, d);
    expect(vol.existsSync('/app/harmony/entry/src/main/resources/rawfile/bundle.harmony.js')).toBe(
      false
    );
    expect(d.startBundlerAsync).toHaveBeenCalledWith('/app', {
      port: 9090,
      headless: false,
      hostType: 'localhost',
      showInterface: false,
    });
    expect(d.reverseHarmonyPortAsync).toHaveBeenCalledWith('/hdc', 'dev', 9090);
    expect(vol.readFileSync('/app/harmony/entry/src/main/ets/pages/Index.ets', 'utf8')).toContain(
      'http://127.0.0.1:9090/node_modules/expo-router/entry.bundle'
    );
    expect(d.bundleHarmonyReleaseAsync).not.toHaveBeenCalled();
  });
  it('runs Release bundle without Metro or port reverse', async () => {
    vol.fromJSON({
      '/app/harmony/AppScope/app.json5': JSON.stringify({ app: { bundleName: 'dev.app' } }),
    });
    const d = base();
    d.prebuildHarmonyAsync.mockImplementationOnce(async () => {
      expect(process.env.NODE_ENV).toBe('production');
      return { harmonyRoot: '/app/harmony' };
    });
    await runHarmonyAsync('/app', { configuration: 'Release' }, d);
    expect(d.bundleHarmonyReleaseAsync).toHaveBeenCalledWith('/app');
    expect(d.startBundlerAsync).not.toHaveBeenCalled();
    expect(d.reverseHarmonyPortAsync).not.toHaveBeenCalled();
  });
});
