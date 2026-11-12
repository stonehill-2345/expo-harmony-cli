// A-owned acceptance observations. No route actions run automatically.
import { useEffect } from 'react';
import { AppState, Button, TurboModuleRegistry, View } from 'react-native';
import { usePathname, useRootNavigationState } from 'expo-router';
import * as Linking from 'expo-linking';
import { reloadAppAsync, uuid } from 'expo-modules-core';
import { useSafeAreaFrame, useSafeAreaInsets } from 'react-native-safe-area-context';

const boot = uuid.v4();
const nativeMetrics = TurboModuleRegistry.getEnforcing<{
  getConstants(): { initialWindowMetrics: unknown };
}>('RNCSafeAreaContext').getConstants().initialWindowMetrics;

export function RouterProbe() {
  useEffect(() => {
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', next => {
      console.info('A_ROUTER_APP_STATE=' + JSON.stringify({ boot, from: previous, to: next, at: new Date().toISOString() }));
      previous = next;
    });
    return () => subscription.remove();
  }, []);
  const pathname = usePathname();
  const state = useRootNavigationState();
  const insets = useSafeAreaInsets();
  const frame = useSafeAreaFrame();
  useEffect(() => {
    console.info('A_ROUTER_PROBE=' + JSON.stringify({
      boot,
      dev: __DEV__,
      pathname,
      latestURL: Linking.getLinkingURL(),
      state,
      insets,
      frame,
      nativeMetrics,
    }));
  }, [pathname, state, insets, frame]);
  return (
    <View style={{ position: 'absolute', right: 8, top: insets.top + 48, zIndex: 100 }}>
      <Button title="Reload Router" onPress={async () => {
        console.info('A_ROUTER_RELOAD_REQUEST=' + boot);
        try { await reloadAppAsync(); }
        catch (error) { console.error('A_ROUTER_RELOAD_ERROR=' + String(error)); }
      }} />
    </View>
  );
}
