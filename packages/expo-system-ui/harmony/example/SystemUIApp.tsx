import React, { useEffect, useState } from 'react';
import { AppState, Appearance, Button, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { reloadAppAsync, requireNativeModule } from 'expo-modules-core';

const boot = Date.now();
const oracle = requireNativeModule<any>('StatusBarOracle');
const report = (value: object) => console.log('A04_SYSTEM_UI=' + JSON.stringify({ boot, dev: __DEV__, ...value }));
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const check = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const stages = ['solid', 'concurrent', 'dark-reset', 'light-reset', 'persist'];
report({ kind: 'boot', colorScheme: Appearance.getColorScheme() });

async function theme(value: 'light' | 'dark') {
  Appearance.setColorScheme(value);
  for (let attempt = 0; attempt < 50; attempt++) {
    if (Appearance.getColorScheme() === value) return;
    await pause(100);
  }
  throw new Error('Appearance did not reach ' + value);
}

export default function SystemUIApp() {
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState('Starting');
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let active = true;
    SystemUI.getBackgroundColorAsync().then(async color => {
      await pause(300);
      report({ kind: 'stage', name: 'restore', color, colorScheme: Appearance.getColorScheme(), bars: oracle.getSnapshot() });
      if (active) { setStatus('restore: ' + color); setBusy(false); }
    }).catch(error => report({ kind: 'failure', error: error?.message || String(error) }));
    const listener = AppState.addEventListener('change', state => {
      report({ kind: 'app-state', state });
      if (state === 'active') {
        SystemUI.getBackgroundColorAsync().then(color => report({ kind: 'foreground', color, bars: oracle.getSnapshot() }))
          .catch(error => report({ kind: 'failure', error: error?.message || String(error) }));
      }
    });
    return () => { active = false; listener.remove(); };
  }, []);
  const next = async () => {
    setBusy(true);
    const name = stages[index];
    try {
      let expected = '#336699';
      if (name === 'solid') {
        expected = '#b42318'; await SystemUI.setBackgroundColorAsync(expected);
      } else if (name === 'concurrent') {
        const colors = Array.from({ length: 16 }, (_, i) => i === 15 ? '#336699' : i % 2 ? '#112233' : '#aabbcc');
        await Promise.all(colors.map(color => SystemUI.setBackgroundColorAsync(color)));
      } else if (name === 'dark-reset' || name === 'light-reset') {
        const mode = name === 'dark-reset' ? 'dark' : 'light';
        await theme(mode); await SystemUI.setBackgroundColorAsync(null);
        expected = mode === 'dark' ? '#000000' : '#ffffff';
      } else {
        await SystemUI.setBackgroundColorAsync(expected);
      }
      const color = await SystemUI.getBackgroundColorAsync();
      check(color === expected, `${name}: expected ${expected}, got ${color}`);
      await pause(300);
      const bars = oracle.getSnapshot();
      if (name === 'dark-reset') check(bars.isStatusBarLightIcon, 'Dark theme requires light status icons');
      if (name === 'light-reset') check(!bars.isStatusBarLightIcon, 'Light theme requires dark status icons');
      report({ kind: 'stage', name, color, colorScheme: Appearance.getColorScheme(), bars });
      setStatus(name + ': ' + color); setIndex(index + 1);
    } catch (error) {
      const message = (error as { message?: string })?.message || String(error);
      report({ kind: 'failure', error: message }); setStatus(message);
    } finally { setBusy(false); }
  };
  return <View style={{ flex: 1, backgroundColor: 'transparent' }}>
    <StatusBar style="auto" backgroundColor="transparent" hidden={false} />
    <View style={{ margin: 24, marginTop: 64, padding: 18, backgroundColor: 'white' }}>
      <Text style={{ fontSize: 22, color: 'black' }}>SystemUI lifecycle</Text>
      <Text style={{ fontSize: 16, color: 'black', marginVertical: 12 }}>{status}</Text>
      <Button title="Next SystemUI phase" disabled={busy || index === stages.length} onPress={next} />
      <View style={{ height: 12 }} />
      <Button title="Reload SystemUI" disabled={busy} onPress={() => { report({ kind: 'reload-request' });
        reloadAppAsync('A04 SystemUI').catch(error => report({ kind: 'failure', error: error?.message || String(error) })); }} />
    </View>
  </View>;
}
