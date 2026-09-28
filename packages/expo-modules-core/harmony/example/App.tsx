import CoreViewBoundary, { CoreViewBoundaryHandle } from './CoreViewBoundary';
import { runCoreBoundaryTests } from './core-boundary-tests';
import { runCoreUuidTests } from './core-uuid-tests';
import { runCoreContextTests } from './core-context-tests';
import { beginInteropReloadCheck, runInteropTests } from './interop-tests';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Button, DevSettings, ScrollView, StyleSheet, Text, View } from 'react-native';
import { requireNativeModule, requireNativeViewManager, reloadAppAsync, SharedObject } from 'expo-modules-core';

const bootId = Date.now();
console.log('EXPO_CORE_BOOT=' + JSON.stringify({ id: bootId, dev: __DEV__ }));

type Result = { name: string; passed: boolean; detail: string };
type Resource = InstanceType<typeof SharedObject> & { getValue(): number };
type CoreTestModule = {
  sum(a: number, b: number): number;
  emitValue(value: number): void;
  addListener(name: 'value', listener: (value: number) => void): { remove(): void };
  createResource(value: number): Resource;
  resourcesAlive(): number;
  workAsync(value: number, delayMs: number, fail: boolean): Promise<number>;
  cancelLastAsync(): void;
  pendingAsyncCount(): number;
};

// Most Expo plugins require their module during bundle evaluation, before React mounts.
let nativeAtImport: CoreTestModule | undefined;
let importError: unknown;
try { nativeAtImport = requireNativeModule<CoreTestModule>('ExpoCoreTest'); }
catch (error) { importError = error; }

type ProbeHandle = { setText(value: string): void };
type ProbeProps = {
  ref?: React.Ref<ProbeHandle>;
  label: string;
  style: { height: number; marginBottom: number };
  onValue(event: { nativeEvent: { value: string } }): void;
};
let Probe: React.ComponentType<ProbeProps> | undefined;
let viewImportError: unknown;
try { Probe = requireNativeViewManager<ProbeProps>('ExpoCoreTest'); }
catch (error) { viewImportError = error; }

async function waitFor(condition: () => boolean) {
  const deadline = Date.now() + 3000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('Native view event timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function check(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

type AcceptanceHooks = { onTestsComplete?: () => Promise<void>; onBeforeReload?: () => Promise<void> };
export default function App({ onTestsComplete, onBeforeReload }: AcceptanceHooks = {}) {
  const [results, setResults] = useState<Result[]>([]);
  const [label, setLabel] = useState('native-initial');
  const viewRef = useRef<ProbeHandle>(null);
  const boundaryViewRef = useRef<CoreViewBoundaryHandle>(null);
  const viewEvents = useRef<string[]>([]);
  const running = useRef(false);
  const runNumber = useRef(0);

  const run = async () => {
    if (running.current) return;
    running.current = true;
    const sequence = ++runNumber.current;
    const next: Result[] = [];
    const test = async (name: string, body: () => void | Promise<void>) => {
      try {
        await body();
        next.push({ name, passed: true, detail: 'PASS' });
      } catch (error) {
        next.push({ name, passed: false, detail: String(error) });
      }
    };
    let native: CoreTestModule;
    await test('Public requireNativeModule', () => {
      if (importError) throw importError;
      native = nativeAtImport!;
      check(typeof native.sum === 'function', 'Native sum not exported');
    });
    if (native!) {
      await test('Synchronous native call', () => {
        check(native.sum(20, 22) === 42, 'Unexpected native sum');
      });
      await test('Native event and unsubscribe', () => {
        let total = 0;
        const subscription = native.addListener('value', (value) => { total += value; });
        try {
          native.emitValue(7);
          check(total === 7, 'Native event not delivered');
        } finally {
          subscription.remove();
        }
        native.emitValue(5);
        check(total === 7, 'Event delivered after unsubscribe');
      });
      await test('SharedObject resource release', () => {
        const initial = native.resourcesAlive();
        const resource = native.createResource(42);
        check(resource instanceof SharedObject, 'Not an Expo SharedObject');
        try {
          check(resource.getValue() === 42, 'Native resource value incorrect');
          check(native.resourcesAlive() === initial + 1, 'Resource not retained');
        } finally {
          resource.release();
        }
        resource.release();
        check(native.resourcesAlive() === initial, 'Resource not released');
        let failed = false;
        try { resource.getValue(); } catch { failed = true; }
        check(failed, 'Released resource remains usable');
      });
    }
    if (native!) {
      await test('Worker Promise resolve / JS remains responsive', async () => {
        let ticked = false;
        const timer = setTimeout(() => { ticked = true; }, 0);
        try {
          const pending = native.workAsync(42, 80, false);
          check(pending instanceof Promise, 'Not a real Promise');
          check(await pending === 42, 'Native async result mismatch');
          check(ticked, 'JS thread was blocked by native work');
        } finally { clearTimeout(timer); }
        check(native.pendingAsyncCount() === 0, 'Resolved callback retained');
      });
      await test('Worker Promise rejection', async () => {
        let error: any;
        try { await native.workAsync(0, 10, true); } catch (caught) { error = caught; }
        check(error?.code === 'ERR_NATIVE_ASYNC', 'Native error code not propagated');
        check(error?.message === 'Requested native failure', 'Native error message not propagated');
        check(native.pendingAsyncCount() === 0, 'Rejected callback retained');
      });
      await test('Async cancellation / late completion', async () => {
        const outcome = native.workAsync(7, 80, false).then(
          () => 'unexpected resolve', (error) => error.code);
        native.cancelLastAsync();
        check(await outcome === 'ERR_CANCELED', 'Cancellation not rejected');
        await new Promise((resolve) => setTimeout(resolve, 120));
        check(native.pendingAsyncCount() === 0, 'Canceled callback retained');
      });
    }
    await test('Native view props / events / imperative ref', async () => {
      if (viewImportError) throw viewImportError;
      check(!!Probe, 'Native view not exported');
      await waitFor(() => viewEvents.current.length > 0);
      const propertyValue = 'prop-update-' + sequence;
      setLabel(propertyValue);
      await waitFor(() => viewEvents.current.includes(propertyValue));
      check(typeof viewRef.current?.setText === 'function', 'Native view ref method missing');
      const refValue = 'ref-update-' + sequence;
      viewRef.current!.setText(refValue);
      await waitFor(() => viewEvents.current.includes(refValue));
    });
    setResults(next);
    console.log('EXPO_CORE_EXAMPLE_RESULTS=' + JSON.stringify(next));
    // Keep synchronous platform probes out of the original JS-responsiveness test.
    try {
      await runInteropTests();
      await runCoreContextTests();
      await runCoreUuidTests();
      await runCoreBoundaryTests();
      await boundaryViewRef.current!.run();
      await onTestsComplete?.();
    } finally {
      running.current = false;
    }
  };

  useEffect(() => {
    void run();
    const subscription = AppState.addEventListener('change', (state) => {
      console.log('EXPO_CORE_APP_STATE=' + state);
      if (state === 'active') void run();
    });
    return () => subscription.remove();
  }, []);
  const reload = () => {
    if (running.current) return;
    console.log('EXPO_CORE_RELOAD_REQUEST=' + bootId);
    beginInteropReloadCheck(bootId);
    boundaryViewRef.current!.beginReload(bootId);
    nativeAtImport!.workAsync(999, 1500, false).then(
      () => console.error('EXPO_CORE_STALE_CALLBACK=' + bootId),
      () => console.error('EXPO_CORE_STALE_REJECTION=' + bootId));
    DevSettings.reload('Expo Core pending-work lifecycle test');
  };
  const reloadPublic = async () => {
    if (running.current) return;
    await onBeforeReload?.();
    console.log('EXPO_CORE_PUBLIC_RELOAD_REQUEST=' + bootId);
    beginInteropReloadCheck(bootId);
    boundaryViewRef.current!.beginReload(bootId);
    nativeAtImport!.workAsync(999, 1500, false).then(
      () => console.error('EXPO_CORE_STALE_CALLBACK=public-' + bootId),
      () => console.error('EXPO_CORE_STALE_REJECTION=public-' + bootId));
    try {
      await reloadAppAsync('Core-v1 public API acceptance');
      console.log('EXPO_CORE_PUBLIC_RELOAD_RESOLVED=' + bootId);
    } catch (error) {
      console.error('EXPO_CORE_PUBLIC_RELOAD_ERROR=' + String(error));
    }
  };
  const passed = results.filter((result) => result.passed).length;
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.title}>Expo Core · Harmony</Text>
      <Text style={styles.summary}>Native integration: {passed}/{results.length}</Text>
      {__DEV__ && <Button title="Reload with native work pending" onPress={reload} />}
      <Button title="Reload through Expo public API" onPress={reloadPublic} />
      {Probe && <Probe ref={viewRef} label={label} style={{ height: 56, marginBottom: 12 }}
        onValue={(event) => {
          viewEvents.current.push(event.nativeEvent.value);
          console.log('EXPO_CORE_NATIVE_VIEW_EVENT=' + event.nativeEvent.value);
        }} />}
      <CoreViewBoundary ref={boundaryViewRef} />
      {results.map((result) => (
        <View key={result.name} style={styles.row}>
          <Text style={[styles.name, { color: result.passed ? '#16803b' : '#b42318' }]}>{result.name}</Text>
          <Text selectable>{result.detail}</Text>
        </View>
      ))}
      <Button title="Run native tests again" onPress={run} />
      <Text style={styles.note}>This is the Core test fixture, not the default Expo Router app.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, padding: 24, paddingTop: 72, backgroundColor: '#f5f7fa' },
  title: { fontSize: 26, fontWeight: '700', color: '#172b4d' },
  summary: { fontSize: 18, marginVertical: 20, color: '#172b4d' },
  row: { padding: 16, backgroundColor: '#fff', marginBottom: 12, borderRadius: 8 },
  name: { fontSize: 17, fontWeight: '600', marginBottom: 6 },
  note: { marginTop: 24, color: '#52606d' },
});
