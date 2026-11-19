import React, { useEffect, useState } from 'react';
import { Button, ScrollView, Text, View } from 'react-native';
import { reloadAppAsync } from 'expo-modules-core';
import * as WebBrowser from 'expo-web-browser';

const boot = Date.now();
const server = 'http://10.0.2.2:18082';
const redirect = 'lanebbrowser://callback';
const report = (kind: string, data: object = {}) =>
  console.log('A04_WEB_BROWSER=' + JSON.stringify({ boot, dev: __DEV__, kind, ...data }));
const message = (error: unknown) => ({
  code: (error as { code?: string })?.code,
  error: String(error),
});

report('boot');

export default function WebBrowserApp() {
  const [status, setStatus] = useState('Ready');

  useEffect(() => {
    void (async () => {
      const checks: string[] = [];
      for (const [name, run, code] of [
        ['invalid-url', () => WebBrowser.openBrowserAsync('javascript:alert(1)'), 'ERR_WEB_BROWSER_INVALID_URL'],
        ['ephemeral-auth', () => WebBrowser.openAuthSessionAsync(`${server}/auth`, redirect, { preferEphemeralSession: true }), 'ERR_WEB_BROWSER_UNSUPPORTED_OPTION'],
        ['dismiss-empty', () => WebBrowser.dismissBrowser(), 'ERR_WEB_BROWSER_NOT_OPEN'],
      ] as const) {
        try { await run(); throw new Error(`${name} did not reject`); }
        catch (error) {
          if ((error as { code?: string })?.code !== code) throw error;
          checks.push(name);
        }
      }
      for (const [name, run] of [
        ['warm-up', () => WebBrowser.warmUpAsync()],
        ['cool-down', () => WebBrowser.coolDownAsync()],
        ['may-init', () => WebBrowser.mayInitWithUrlAsync(`${server}/page`)],
        ['custom-tabs', () => WebBrowser.getCustomTabsSupportingBrowsersAsync()],
      ] as const) {
        try { await run(); throw new Error(`${name} did not reject`); }
        catch (error) {
          if ((error as { code?: string })?.code !== 'ERR_UNAVAILABLE') throw error;
          checks.push(name);
        }
      }
      const completion = WebBrowser.maybeCompleteAuthSession();
      if (completion.type !== 'failed') throw new Error('maybeCompleteAuthSession should be unsupported');
      checks.push('web-completion');
      report('baseline-pass', { checks });
    })().catch((error) => report('failure', message(error)));
  }, []);

  const run = async (name: string, operation: () => Promise<object>) => {
    setStatus(name);
    report('request', { name });
    try {
      const result = await operation();
      report('result', { name, result });
      setStatus(`${name}: ${JSON.stringify(result)}`);
    } catch (error) {
      report('rejection', { name, ...message(error) });
      setStatus(`${name}: ${String(error)}`);
    }
  };

  const programmatic = () => run('programmatic-dismiss', async () => {
    const pending = WebBrowser.openBrowserAsync(`${server}/page?case=programmatic`);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const dismissed = await WebBrowser.dismissBrowser();
    return { dismissed, opened: await pending };
  });

  const concurrent = () => run('concurrent', async () => {
    const first = WebBrowser.openBrowserAsync(`${server}/page?case=first`);
    const second = await WebBrowser.openBrowserAsync(`${server}/page?case=second`);
    const dismissed = await WebBrowser.dismissBrowser();
    return { second, dismissed, first: await first };
  });

  const authDismiss = () => run('auth-dismiss', async () => {
    const first = WebBrowser.openAuthSessionAsync(`${server}/page?case=auth-dismiss`, redirect);
    let concurrentCode: string | undefined;
    try { await WebBrowser.openAuthSessionAsync(`${server}/page?case=auth-concurrent`, redirect); }
    catch (error) { concurrentCode = (error as { code?: string })?.code; }
    await new Promise((resolve) => setTimeout(resolve, 1200));
    WebBrowser.dismissAuthSession();
    return { concurrentCode, first: await first };
  });

  const pendingReload = async () => {
    report('request', { name: 'pending-reload' });
    const pending = WebBrowser.openBrowserAsync(`${server}/page?case=reload`);
    pending.then(
      (result) => report('result', { name: 'pending-reload-old', result }),
      (error) => report('rejection', { name: 'pending-reload-old', ...message(error) })
    );
    await new Promise((resolve) => setTimeout(resolve, 1200));
    report('reload-request');
    await reloadAppAsync('A04 WebBrowser pending session');
  };

  return <ScrollView contentContainerStyle={{ padding: 28, paddingTop: 56, backgroundColor: 'white' }}>
    <Text style={{ color: '#111827', fontSize: 24 }}>WebBrowser acceptance</Text>
    <Text accessibilityLabel="browser-status" style={{ color: '#374151', fontSize: 15, marginVertical: 14 }}>{status}</Text>
    <View style={{ gap: 10 }}>
      <Button title="Open browser" onPress={() => void run('manual-open', () => WebBrowser.openBrowserAsync(
        `${server}/page?case=manual`, { toolbarColor: '#b42318', controlsColor: '#ffffff' }
      ))} />
      <Button title="Programmatic dismiss" onPress={() => void programmatic()} />
      <Button title="Concurrent open" onPress={() => void concurrent()} />
      <Button title="Auth redirect" onPress={() => void run('auth-success', () =>
        WebBrowser.openAuthSessionAsync(`${server}/auth`, redirect))} />
      <Button title="Dismiss auth session" onPress={() => void authDismiss()} />
      <Button title="Wrong auth redirect" onPress={() => void run('auth-wrong-redirect', () =>
        WebBrowser.openAuthSessionAsync(`${server}/auth-wrong`, redirect))} />
      <Button title="Load failure" onPress={() => void run('load-failure', () =>
        WebBrowser.openBrowserAsync(`${server}/reset`))} />
      <Button title="Reload pending browser" onPress={() => void pendingReload().catch((error) =>
        report('failure', message(error)))} />
    </View>
  </ScrollView>;
}
