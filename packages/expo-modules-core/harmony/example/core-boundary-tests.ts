import { TurboModuleRegistry } from 'react-native';
import { requireNativeModule, requireOptionalNativeModule, SharedObject, Platform } from 'expo-modules-core';

type Resource = InstanceType<typeof SharedObject> & { getValue(): number };
type Probe = {
  createResource(value: number): Resource;
  resourcesAlive(): number;
  retainLastResource(): void;
  releaseExternalResource(): void;
  failWithCodeAsync(): Promise<void>;
};
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function runCoreBoundaryTests() {
  const results: { name: string; passed: boolean; detail: string }[] = [];
  const test = async (name: string, body: () => void | Promise<void>) => {
    try { await body(); results.push({ name, passed: true, detail: 'PASS' }); }
    catch (error) { results.push({ name, passed: false, detail: String(error) }); }
  };
  await test('platform.harmony-selection', () => {
    check(Platform.OS === 'harmony', 'Wrong public Platform.OS');
    check(Platform.select({ harmony: 'harmony', native: 'native', default: 'default' }) === 'harmony', 'Harmony selection did not win');
    check(Platform.select({ native: 'native', default: 'default' }) === 'native', 'Native fallback differs');
    check(Platform.select({ default: 'default' }) === 'default', 'Default fallback differs');
  });
  await test('module.missing-public-contract' , () => {
    check(requireOptionalNativeModule('MissingCoreV1Probe') === null, 'Missing optional module must be null');
    let rejected = false;
    try { requireNativeModule('MissingCoreV1Probe'); } catch { rejected = true; }
    check(rejected, 'Missing required module was accepted');
  });
  await test('installer.repeated-identity', () => {
    const core = globalThis.expo;
    const NativeModule = core.NativeModule;
    const module = requireNativeModule('ExpoCoreTest');
    const installer = TurboModuleRegistry.get('ExpoModulesCore') as { installModules(): void } | null;
    check(installer, 'Real Core installer missing');
    installer.installModules();
    installer.installModules();
    check(globalThis.expo === core && core.NativeModule === NativeModule, 'Installer replaced runtime classes');
    check(requireNativeModule('ExpoCoreTest') === module, 'Installer reinitialized an existing native module');
  });
  await test('async.coded-native-error', async () => {
    let rejected = false;
    try { await requireNativeModule<Probe>('ExpoCoreTest').failWithCodeAsync(); }
    catch (error) {
      rejected = true;
      const nativeError = error as { code?: string; message?: string };
      check(error instanceof Error, 'Native rejection is not an Error');
      check(nativeError.code === 'ERR_CORE_ASYNC_PROBE' && nativeError.message === 'Typed native failure', 'Core JSI async lost native code/message');
    }
    check(rejected, 'Native failure resolved');
  });
  await test('resource.release-revokes-binding-with-external-owner', () => {
    const probe = requireNativeModule<Probe>('ExpoCoreTest');
    const initial = probe.resourcesAlive();
    const resource = probe.createResource(42);
    try {
      probe.retainLastResource();
      check(resource.getValue() === 42, 'Native resource unavailable before release');
      resource.release();
      resource.release();
      check(probe.resourcesAlive() === initial + 1, 'JS release destroyed another native owner');
      let rejected = false;
      try { resource.getValue(); } catch { rejected = true; }
      check(rejected, 'Released JS binding remains usable while native owner retains resource');
      probe.releaseExternalResource();
      check(probe.resourcesAlive() === initial, 'Last native owner did not reclaim resource');
    } finally {
      resource.release();
      probe.releaseExternalResource();
    }
  });
  console.log('EXPO_CORE_BOUNDARY_RESULTS=' + JSON.stringify(results));
}
