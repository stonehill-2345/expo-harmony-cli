import React, { useEffect, useState } from 'react';
import { Text, TurboModuleRegistry, View } from 'react-native';
import * as Linking from 'expo-linking';
import { requireNativeModule } from 'expo-modules-core';
import Constants from 'expo-constants';
import I0App from './I0App';

const boot = Date.now();
const direct = TurboModuleRegistry.getEnforcing<any>('ExpoLinking');
const native = requireNativeModule<any>('ExpoLinking');
const report = (kind: string, data: object = {}) => console.log('I0_LINKING=' + JSON.stringify({ boot, kind, ...data }));
const fail = (error: unknown) => report('failure', { error: String(error) });
function check(value: unknown, message: string) { if (!value) throw new Error(message); }
// At bundle evaluation, before React mounts: no async fallback for this contract.
const initialLatest = Linking.getLinkingURL();
check(initialLatest === direct.getLinkingURL() && initialLatest === native.getLinkingURL(), 'Top-level public lookup mismatch');
report('top-level', { latest: initialLatest, dev: __DEV__ });

function HookProbe({ generation }: { generation: number }) {
  const url = Linking.useLinkingURL();
  useEffect(() => { report('hook', { url, generation }); }, [url]);
  useEffect(() => () => { report('hook-unmount', { generation }); }, []);
  return <Text>Linking: {url ?? '(null)'}</Text>;
}

async function probe() {
  const created = Linking.createURL('fixture/a b', { queryParams: { q: '资源' } });
  const expected = `${Constants.expoConfig!.scheme}://fixture/a%20b?q=%E8%B5%84%E6%BA%90`;
  check(created === expected, 'createURL did not use real public config');
  const parsed = Linking.parse(created);
  check(parsed.hostname === 'fixture' && parsed.path === 'a%20b' && parsed.queryParams?.q === '资源', 'parse round trip');
  check(Linking.resolveScheme({}) === Constants.expoConfig!.scheme, 'resolveScheme');
  report('config-pass', { created, parsed, scheme: Linking.resolveScheme({}) });
  for (const url of [Linking.createURL('fixture/self-open'), 'i0missing://fixture/absent']) {
    const supported = await Linking.canOpenURL(url);
    check(supported === !url.startsWith('i0missing:'), 'canOpenURL mismatch');
    report('can-open', { url, supported });
    let result: boolean;
    try {
      result = await Linking.openURL(url);
    } catch (error) {
      if (!url.startsWith('i0missing:')) throw error;
      report('open-rejected', { url, error: String(error) });
      continue;
    }
    check(!url.startsWith('i0missing:') && result === true, 'openURL false success');
    report('open-pass', { url, result });
  }
  let rejected = false;
  try { await Linking.openURL(''); } catch { rejected = true; }
  check(rejected, 'empty URL was accepted');
  report('probe-pass');
}

export default function LinkingApp() {
  const [hook, setHook] = useState(true);
  const [generation, setGeneration] = useState(1);
  useEffect(() => {
    let received = 0, raw = 0, secondary = 0, removed = 0, rn = 0;
    const removedSubscription = native.addListener('onURLReceived', () => { removed++; report('removed-callback'); });
    removedSubscription.remove(); removedSubscription.remove();
    const rawSubscription = direct.onURLReceived(() => { raw++; });
    const secondarySubscription = native.addListener('onURLReceived', () => { secondary++; });
    const subscription = native.addListener('onURLReceived', ({ url }: { url: string }) => {
      received++;
      setTimeout(() => {
        try {
          check(removed === 0, 'Removed listener fired');
          check(Linking.getLinkingURL() === url && native.getLinkingURL() === url && direct.getLinkingURL() === url, 'Latest URL mismatch');
          report('event', { url, latest: Linking.getLinkingURL(), received, raw, secondary, removed, rn });
          if (url.endsWith('/remove-secondary')) { secondarySubscription.remove(); secondarySubscription.remove(); }
          if (url.endsWith('/unmount-hook')) setHook(false);
          if (url.endsWith('/remount-hook')) { setGeneration(value => value + 1); setHook(true); }
          if (url.endsWith('/remove-all')) {
            subscription.remove(); rawSubscription.remove(); secondarySubscription.remove(); rnSubscription.remove();
            setHook(false); report('all-removed');
          }
          if (url.endsWith('/probe')) void probe().catch(fail);
          if (url.endsWith('/settings')) void Linking.openSettings().then(
            () => report('settings-resolved'), error => report('settings-rejected', { error: String(error) }));
        } catch (error) { fail(error); }
      }, 0);
    });
    const rnSubscription = Linking.addEventListener('url', ({ url }) => { rn++; report('rn-event', { url, rn }); });
    Linking.getInitialURL().then(url => report('initial', { url }), fail);
    report('ready', { latest: Linking.getLinkingURL() });
    return () => { subscription.remove(); rawSubscription.remove(); secondarySubscription.remove(); rnSubscription.remove(); };
  }, []);
  return <View style={{ flex: 1 }}>
    <View style={{ paddingTop: 45, paddingHorizontal: 24 }}>{hook && <HookProbe generation={generation} />}</View>
    <View style={{ flex: 1 }}><I0App /></View>
  </View>;
}
