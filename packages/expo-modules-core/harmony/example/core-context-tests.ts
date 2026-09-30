import { requireNativeModule } from 'expo-modules-core';

const expectedVersion = require('expo-modules-core/package.json').version as string;
type Probe = {
  checkCoreContextInvalidation(): boolean;
  failFromDestroyedCoreAsync(): Promise<void>;
  getDirectoryOracle(): { cacheDir: string; documentsDir: string };
  roundTripFile(directory: string, value: string): { value: string; removed: boolean };
};
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function runCoreContextTests() {
  const results: { name: string; passed: boolean; detail: string }[] = [];
  const test = async (name: string, body: () => void | Promise<void>) => {
    try { await body(); results.push({ name, passed: true, detail: 'PASS' }); }
    catch (error) { results.push({ name, passed: false, detail: String(error) }); }
  };
  await test('version.from-package', () => {
    const version = globalThis.expo?.expoModulesCoreVersion;
    check(version?.version === expectedVersion, 'Core native version does not match package.json');
    const [major, minor, patch] = expectedVersion.split('-')[0].split('.').map(Number);
    check(version.major === major && version.minor === minor && version.patch === patch, 'Core native version components differ');
  });
  for (const key of ['cacheDir', 'documentsDir'] as const) {
    await test(`${key}.native-oracle`, () => {
      const oracle = requireNativeModule<Probe>('ExpoCoreInteropProbe').getDirectoryOracle();
      const directory = globalThis.expo?.[key];
      check(typeof directory === 'string' && directory.startsWith('/'), 'Core directory is not a native absolute path');
      check(directory === oracle[key], 'Core directory differs from real platform context');
      console.log('EXPO_CORE_DIRECTORY=' + JSON.stringify({ key, directory, oracle: oracle[key] }));
    });
    await test(`${key}.native-file-io`, () => {
      const directory = globalThis.expo?.[key];
      check(typeof directory === 'string' && directory.length > 0, 'Core directory unavailable');
      const value = `Core native IO / 鸿蒙 / ${key} / ${Date.now()}`;
      const result = requireNativeModule<Probe>('ExpoCoreInteropProbe').roundTripFile(directory, value);
      check(result.value === value, 'Native file read differs from written content');
      check(result.removed, 'Native temporary file not removed');
    });
  }
  await test('context.reject-access-after-destroy', () => {
    check(requireNativeModule<Probe>('ExpoCoreInteropProbe').checkCoreContextInvalidation(), 'Destroyed Core context remains accessible');
  });
  await test('context.reload-rejects-after-destroy', async () => {
    let rejected = false;
    try { await requireNativeModule<Probe>('ExpoCoreInteropProbe').failFromDestroyedCoreAsync(); }
    catch (error) {
      rejected = true;
      const nativeError = error as { code?: string; message?: string };
      check(nativeError.code === 'ERR_CORE_CONTEXT_DESTROYED' && nativeError.message === 'Expo Core context destroyed', 'Destroyed context rejection lost its native error');
    }
    check(rejected, 'Destroyed context reload falsely succeeded');
  });
  console.log('EXPO_CORE_CONTEXT_RESULTS=' + JSON.stringify(results));
}
