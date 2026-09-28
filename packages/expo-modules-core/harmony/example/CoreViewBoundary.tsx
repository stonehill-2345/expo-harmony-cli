import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { requireNativeViewManager } from 'expo-modules-core';

type NativeHandle = { nativeTag: number | null; setText(value: string): void; getTextAsync(delay: number): Promise<string> };
type Props = { ref?: React.Ref<NativeHandle>; label: string; style: { height: number }; onValue(e: { nativeEvent: { value: string } }): void };
let Named: React.ComponentType<Props> | undefined;
let importError: unknown;
try { Named = requireNativeViewManager<Props>('ExpoCoreTest', 'Named'); } catch (error) { importError = error; }
function check(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
async function waitFor(body: () => boolean) {
  const end = Date.now() + 5000;
  while (!body()) {
    if (Date.now() > end) throw new Error('Native named view timed out');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
export type CoreViewBoundaryHandle = { run(): Promise<void>; beginReload(bootId: number): void };
export default forwardRef<CoreViewBoundaryHandle>(function CoreViewBoundary(_, ref) {
  const nativeRef = useRef<NativeHandle>(null);
  const events = useRef<string[]>([]);
  const runNumber = useRef(0);
  const [visible, setVisible] = useState(true);
  const [label, setLabel] = useState('named-initial');
  useImperativeHandle(ref, () => ({ beginReload: (bootId: number) => {
    check(nativeRef.current, 'Native view not available for pending reload test');
    console.log('EXPO_CORE_VIEW_PENDING_RELOAD=' + bootId);
    nativeRef.current.getTextAsync(1000).then(
      () => console.error('EXPO_CORE_STALE_CALLBACK=view-' + bootId),
      () => console.error('EXPO_CORE_STALE_REJECTION=view-' + bootId));
  }, run: async () => {
    const results: { name: string; passed: boolean; detail: string }[] = [];
    const test = async (name: string, body: () => void | Promise<void>) => {
      try { await body(); results.push({ name, passed: true, detail: 'PASS' }); }
      catch (error) { results.push({ name, passed: false, detail: String(error) }); }
    };
    const sequence = ++runNumber.current;
    let retired: NativeHandle | undefined;
    let pending: Promise<{ rejected: boolean; code?: string }> | undefined;
    await test('view.named-public-config', () => {
      if (importError) throw importError;
      check(globalThis.expo.getViewConfig('ExpoCoreTest', 'Named')?.validAttributes.label, 'Named view config missing');
    });
    await test('view.named-props-event-ref-native-read', async () => {
      await waitFor(() => nativeRef.current !== null);
      const value = 'named-props-' + sequence;
      setLabel(value);
      await waitFor(() => events.current.includes(value));
      check(await nativeRef.current!.getTextAsync(0) === value, 'Native ArkUI text differs from prop');
      const updated = 'named-ref-' + sequence;
      nativeRef.current!.setText(updated);
      await waitFor(() => events.current.includes(updated));
      check(await nativeRef.current!.getTextAsync(0) === updated, 'Native ArkUI text differs from ref command');
    });
    await test('view.unmount-revokes-ref', async () => {
      retired = nativeRef.current!;
      check(retired, 'Native view never mounted');
      pending = retired.getTextAsync(300).then(() => ({ rejected: false }), e => ({ rejected: true, code: e.code }));
      setVisible(false);
      await waitFor(() => nativeRef.current === null);
      check(retired.nativeTag === null, 'Unmounted wrapper retains a native tag');
      let rejected = false;
      try { retired.setText('must-not-run'); } catch { rejected = true; }
      check(rejected, 'Unmounted imperative call falsely succeeded');
    });
    await test('view.pending-read-rejects-after-unmount', async () => {
      check(pending, 'Native read was not started');
      const value = 'named-replacement-' + sequence;
      setLabel(value); setVisible(true);
      await waitFor(() => nativeRef.current !== null && events.current.includes(value));
      const result = await pending;
      check(result.rejected && result.code === 'ERR_VIEW_UNMOUNTED', 'Late native read falsely succeeded/lost its error');
    });
    await test('view.stale-ref-cannot-address-a-new-real-view', async () => {
      check(retired, 'Retired native ref unavailable');
      const value = 'named-remounted-' + sequence;
      setLabel(value); setVisible(true);
      await waitFor(() => nativeRef.current !== null && events.current.includes(value));
      // Simulate stale tag reuse without replacing/faking the real native view.
      retired.nativeTag = nativeRef.current!.nativeTag;
      try {
        let rejected = false;
        try { await retired.getTextAsync(0); } catch { rejected = true; }
        check(rejected, 'Retired binding addressed a new native instance');
        check(await nativeRef.current!.getTextAsync(0) === value, 'Live replacement view changed');
      } finally { retired.nativeTag = null; }
    });
    console.log('EXPO_CORE_VIEW_RESULTS=' + JSON.stringify(results));
  } }));
  return visible && Named ? <Named ref={nativeRef} label={label} style={{ height: 48 }}
    onValue={e => { events.current.push(e.nativeEvent.value); }} /> : null;
});
