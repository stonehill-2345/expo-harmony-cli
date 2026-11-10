import React, { useEffect, useState } from 'react';
import { AppState, Button, Text, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar, setStatusBarHidden, setStatusBarStyle, setStatusBarBackgroundColor } from 'expo-status-bar';
import { reloadAppAsync, requireNativeModule } from 'expo-modules-core';

const boot = Date.now();
const splash = requireNativeModule<any>('ExpoSplashScreen');
const oracle = requireNativeModule<any>('SplashOracle');
const bars = requireNativeModule<any>('StatusBarOracle');
const scenario = oracle.getSnapshot().scenario as 'user' | 'internal' | 'auto';
const report = (value: object) => console.log('A04_SPLASH_STATUS=' + JSON.stringify({ boot, dev: __DEV__, scenario, ...value }));
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const check = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const held = scenario === 'user' ? SplashScreen.preventAutoHideAsync()
  : scenario === 'internal' ? splash.internalPreventAutoHideAsync() : Promise.resolve(false);
SplashScreen.setOptions({ fade: scenario === 'user', duration: scenario === 'user' ? 2400 : 0 });
report({ kind: 'boot', splash: oracle.getSnapshot() });
const phases = ['stack-light', 'stack-restore', 'component-hidden', 'shown', 'imperative-hidden', 'imperative-shown'];

export default function SplashStatusApp() {
  const [phase, setPhase] = useState(-1);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(true);
  const [status, setStatus] = useState('Waiting for splash');
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const prevented = await held;
        await pause(800);
        if (!active) return;
        if (scenario !== 'auto') {
          check(prevented === true, 'Prevention must return true');
          if (scenario === 'user') await splash.internalMaybeHideAsync();
          check(oracle.getSnapshot().visible, 'Splash must remain held after content appeared');
          report({ kind: 'held', splash: oracle.getSnapshot() });
          await pause(10000);
          if (!active) return;
          report({ kind: 'hide-request', splash: oracle.getSnapshot() });
          if (scenario === 'user') { await SplashScreen.hideAsync(); SplashScreen.hide(); }
          else await splash.internalMaybeHideAsync();
          await pause(scenario === 'user' ? 2900 : 400);
        }
        check(!oracle.getSnapshot().visible, 'Splash must be hidden');
        if (!active) return;
        report({ kind: 'hidden', splash: oracle.getSnapshot(), bars: bars.getSnapshot() });
        setReady(true); setBusy(false); setStatus('Splash hidden; base dark');
      } catch (error) { report({ kind: 'failure', error: (error as any)?.message || String(error) }); }
    })();
    const listener = AppState.addEventListener('change', state => {
      report({ kind: 'app-state', state, splash: oracle.getSnapshot(), bars: bars.getSnapshot() });
    });
    return () => { active = false; listener.remove(); };
  }, []);
  const next = async () => {
    setBusy(true);
    const nextPhase = phase + 1;
    try {
      setPhase(nextPhase);
      await pause(400);
      if (nextPhase === 4) setStatusBarHidden(true, 'none');
      if (nextPhase === 5) {
        setStatusBarHidden(false, 'none'); setStatusBarStyle('light'); setStatusBarBackgroundColor('#445566');
      }
      await pause(500);
      const snapshot = bars.getSnapshot();
      const hidden = nextPhase === 2 || nextPhase === 4;
      check(hidden ? snapshot.visibleTopHeight === 0 : snapshot.visibleTopHeight > 0, 'Status bar visibility mismatch');
      const light = nextPhase === 0 || nextPhase === 5;
      if (!hidden) check(snapshot.isStatusBarLightIcon === light, 'Status bar icon style mismatch');
      if (!hidden) check(snapshot.statusBarColor.toLowerCase() === (nextPhase === 0 ? '#ff223344' : nextPhase === 5 ? '#ff445566' : '#ff112233'), 'Status bar color mismatch');
      report({ kind: 'stage', name: phases[nextPhase], bars: snapshot, splash: oracle.getSnapshot() });
      setStatus(phases[nextPhase]);
    } catch (error) { report({ kind: 'failure', error: (error as any)?.message || String(error) }); }
    finally { setBusy(false); }
  };
  return <View style={{ flex: 1, backgroundColor: '#204060' }}>
    {phase < 4 && <StatusBar style="dark" backgroundColor="#112233" hidden={phase === 2} animated={false} />}
    {phase === 0 && <StatusBar style="light" backgroundColor="#223344" hidden={false} animated={false} />}
    <View style={{ margin: 24, marginTop: 64, padding: 18, backgroundColor: 'white' }}>
      <Text style={{ color: 'black', fontSize: 22 }}>Splash / StatusBar lifecycle</Text>
      <Text style={{ color: 'black', marginVertical: 12 }}>{scenario}: {status}</Text>
      <Button title="Next status phase" disabled={!ready || busy || phase === 5} onPress={next} />
      <View style={{ height: 12 }} />
      <Button title="Reload splash" disabled={!ready || busy} onPress={() => {
        report({ kind: 'reload-request' });
        reloadAppAsync('A04 Splash lifecycle').catch(error => report({ kind: 'failure', error: error?.message || String(error) }));
      }} />
    </View>
  </View>;
}
