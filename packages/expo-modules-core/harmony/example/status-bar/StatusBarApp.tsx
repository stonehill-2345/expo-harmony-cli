import { StatusBar, setStatusBarBackgroundColor, setStatusBarHidden, setStatusBarNetworkActivityIndicatorVisible, setStatusBarStyle, setStatusBarTranslucent } from 'expo-status-bar';
import { requireNativeModule } from 'expo-modules-core';
import React, { useEffect, useState } from 'react';
import { Appearance, Text, TurboModuleRegistry, View } from 'react-native';
import BaseApp from '__BASE_APP__';

const boot = Date.now();
const direct = TurboModuleRegistry.getEnforcing<any>('StatusBarOracle');
const core = requireNativeModule<any>('StatusBarOracle');
const report = (kind: string, value: object = {}) => console.log('I0_STATUS_BAR=' + JSON.stringify({ boot, kind, ...value }));
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function snapshot(label: string) {
  const raw = direct.getSnapshot(); const viaCore = core.getSnapshot();
  if (JSON.stringify(raw) !== JSON.stringify(viaCore)) throw new Error('StatusBar oracle Core/direct mismatch');
  report('snapshot', { label, colorScheme: Appearance.getColorScheme(), ...raw });
}
export default function StatusBarApp() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    void (async () => {
      try {
        await pause(700); snapshot('component-dark');
        setPhase(1); await pause(700); snapshot('stack-light');
        setPhase(0); await pause(700); snapshot('stack-restore-dark');
        setPhase(2); await pause(300);
        setStatusBarBackgroundColor('#445566'); setStatusBarStyle('light'); setStatusBarTranslucent(true); setStatusBarHidden(false);
        await pause(700); snapshot('imperative-light-translucent');
        setStatusBarHidden(true, 'none'); await pause(700); snapshot('imperative-hidden');
        setStatusBarHidden(false, 'none'); setPhase(3); await pause(700); snapshot('component-auto');
        setPhase(4); await pause(700); snapshot('component-inverted');
        setStatusBarNetworkActivityIndicatorVisible(true); await pause(200); report('network-indicator-noop-boundary');
        report('public-pass');
      } catch (error) { report('failure', { error: String(error) }); }
    })();
  }, []);
  return <View style={{ flex: 1 }}>
    {phase === 0 && <StatusBar style="dark" backgroundColor="#112233" translucent={false} hidden={false} animated={false} />}
    {phase === 1 && <><StatusBar style="dark" backgroundColor="#112233" translucent={false} /><StatusBar style="light" backgroundColor="#223344" translucent={false} /></>}
    {phase === 3 && <StatusBar style="auto" backgroundColor="#334455" translucent={false} hidden={false} />}
    {phase === 4 && <StatusBar style="inverted" backgroundColor="#556677" translucent={false} hidden={false} />}
    <View style={{ paddingTop: 42, paddingHorizontal: 24 }}><Text accessibilityLabel="status-bar-phase">StatusBar phase {phase}</Text></View>
    <View style={{ flex: 1 }}><BaseApp /></View>
  </View>;
}
