import { TurboModuleRegistry } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

type Constants = { source: string; cacheDir: string };
type Probe = {
  getConstants(): Constants;
  addAsync(a: number, b: number): Promise<number>;
  echoNullable(value: string | null): string | null;
  failAsync(): Promise<never>;
  failStringAsync(): Promise<never>;
  failUncodedAsync(): Promise<never>;
  failLaterAsync(delayMs: number): Promise<never>;
};
type PublicProbe = Probe & Constants & { __turboModule: unknown };
type Result = { name: string; passed: boolean; detail: string };
const check = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };

// Preserve bundle-evaluation lookup coverage while running the test groups serially.
let rawAtImport: Probe | null = null;
let rawImportError: unknown;
let coreAtImport: PublicProbe | undefined;
let coreImportError: unknown;
try { rawAtImport = TurboModuleRegistry.get('ExpoCoreInteropProbe') as Probe | null; }
catch (error) { rawImportError = error; }
try { coreAtImport = requireNativeModule<PublicProbe>('ExpoCoreInteropProbe'); }
catch (error) { coreImportError = error; }

// Separate from (and never counted as) the original eight JSI regression tests.
export async function runInteropTests() {
  const results: Result[] = [];
  const test = async (name: string, body: () => unknown | Promise<unknown>) => {
    try { await body(); results.push({ name, passed: true, detail: 'PASS' }); }
    catch (error) { results.push({ name, passed: false, detail: String(error) }); }
  };
  let raw: Probe | null = null;
  let core: PublicProbe | undefined;
  await test('raw.lookup', () => {
    if (rawImportError) throw rawImportError;
    raw = rawAtImport;
    check(raw !== null, 'Real RNOH probe is missing');
  });
  await test('core.lookup.identity', () => {
    if (coreImportError) throw coreImportError;
    core = coreAtImport!;
    check(!!raw && core.__turboModule === raw, 'Not backed by the same real RNOH module');
  });
  for (const route of ['raw', 'core'] as const) {
    await test(`${route}.constants`, () => {
      const c = route === 'raw' ? raw!.getConstants() : core!;
      check(c.source === 'native-interop-probe', 'Native constant lost');
      check(typeof c.cacheDir === 'string' && c.cacheDir.startsWith('/'), 'Native context/cache missing');
      console.log('EXPO_CORE_INTEROP_CONTEXT=' + JSON.stringify({ route, source: c.source, cacheDir: c.cacheDir }));
    });
    const get = () => route === 'raw' ? raw! : core!;
    await test(`${route}.sync.string`, () => check(get().echoNullable('native-同步') === 'native-同步', 'Sync result lost'));
    await test(`${route}.sync.null`, () => check(get().echoNullable(null) === null, 'Null argument changed'));
    await test(`${route}.promise.resolve`, async () => {
      const promise = get().addAsync(20, 22);
      check(typeof promise?.then === 'function', 'Not a Promise');
      check(await promise === 42, 'Native async result lost');
    });
    await test(`${route}.promise.reject.code-message`, async () => {
      let rejected = false;
      try { await get().failAsync(); } catch (error) {
        rejected = true;
        const nativeError = error as { code?: string; message?: string };
        console.log('EXPO_CORE_INTEROP_ERROR=' + JSON.stringify({ route, code: nativeError.code ?? null, message: nativeError.message }));
        check(nativeError.message === 'Native interop probe failure', 'Native error message lost');
        check(nativeError.code === 'ERR_CORE_PROBE', 'Native error code lost');
      }
      check(rejected, 'Native rejection unexpectedly resolved');
    });
    for (const kind of ['string', 'uncoded'] as const) {
      await test(`${route}.promise.reject.${kind}`, async () => {
        let rejected = false;
        try {
          if (kind === 'string') await get().failStringAsync();
          else await get().failUncodedAsync();
        } catch (error) {
          rejected = true;
          const nativeError = error as { code?: string; message?: string };
          const expected = kind === 'string' ? 'Native string rejection' : 'Native uncoded failure';
          check(nativeError.message === expected, 'Uncoded/string rejection message changed');
          check(nativeError.code === undefined, 'Bridge invented an error code');
        }
        check(rejected, 'Native rejection unexpectedly resolved');
      });
    }
  }
  console.log('EXPO_CORE_INTEROP_RESULTS=' + JSON.stringify(results));
  return results;
}

export function beginInteropReloadCheck(bootId: number) {
  const probe = requireNativeModule<PublicProbe>('ExpoCoreInteropProbe');
  probe.failLaterAsync(1500).then(
    () => console.error('EXPO_CORE_STALE_CALLBACK=interop-' + bootId),
    () => console.error('EXPO_CORE_STALE_REJECTION=interop-' + bootId));
}
