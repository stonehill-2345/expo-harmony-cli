// Shared synthetic Other-log builder for C's log checker tests.
// Synthetic parser inputs only; never device acceptance evidence.
// Markers and values mirror the frozen product fixtures:
//   packages/expo-splash-screen/harmony/example/SplashStatusApp.tsx
//   packages/expo-system-ui/harmony/example/SystemUIApp.tsx
//   packages/expo-web-browser/harmony/example/WebBrowserApp.tsx
//   packages/expo-modules-core/harmony/example/router/RouterProbe.tsx
//   packages/expo-linking/harmony/example/public.tsx

const line = (marker, value) => `${marker}=${JSON.stringify(value)}`;

export function completeOtherLog({ splashScenario = 'user', statusBarStages = true, systemUiStages = true, browserCases = true, systemUiReloadReplay = false } = {}) {
  const rows = [];
  const splashBoot = 1793344000000, nextSplashBoot = 1793344009000;
  const splash = (kind, extra = {}) => line('A04_SPLASH_STATUS', { boot: splashBoot, dev: false, scenario: splashScenario, kind, ...extra });
  rows.push(`11-14 00:00:00.000 12345 I C01587/${'.'.repeat(5)}/jsapp: ${splash('boot', { splash: { visible: true } })}`);
  if (splashScenario !== 'auto') {
    rows.push(`${splash('held', { splash: { visible: true } })}`);
    rows.push(`${splash('hide-request', { splash: { visible: true } })}`);
  }
  rows.push(`${splash('hidden', { splash: { visible: false }, bars: { visibleTopHeight: 136, isStatusBarLightIcon: false, statusBarColor: '#ff112233' } })}`);
  if (statusBarStages) {
    const phases = [
      ['stack-light', 136, true, '#ff223344'],
      ['stack-restore', 136, false, '#ff112233'],
      ['component-hidden', 0, false, '#ff112233'],
      ['shown', 136, false, '#ff112233'],
      ['imperative-hidden', 0, false, '#ff112233'],
      ['imperative-shown', 136, true, '#ff445566'],
    ];
    for (const [name, height, light, color] of phases) {
      rows.push(`${splash('stage', { name, bars: { visibleTopHeight: height, isStatusBarLightIcon: light, statusBarColor: color } })}`);
    }
  }
  rows.push(`${splash('reload-request')}`);
  // After reload the splash lifecycle fully replays in the new runtime.
  const nextSplash = (kind, extra = {}) => line('A04_SPLASH_STATUS', { boot: nextSplashBoot, dev: false, scenario: splashScenario, kind, ...extra });
  rows.push(nextSplash('boot', { splash: { visible: true } }));
  if (splashScenario !== 'auto') {
    rows.push(nextSplash('held', { splash: { visible: true } }));
    rows.push(nextSplash('hide-request', { splash: { visible: true } }));
  }
  rows.push(nextSplash('hidden', { splash: { visible: false } }));

  const uiBoot = 1793345000000;
  const ui = (kind, extra = {}) => line('A04_SYSTEM_UI', { boot: uiBoot, dev: false, kind, ...extra });
  rows.push(`${ui('boot', { colorScheme: 'light' })}`);
  rows.push(`${ui('stage', { name: 'restore', color: '#336699', colorScheme: 'light', bars: { isStatusBarLightIcon: false } })}`);
  if (systemUiStages) {
    rows.push(`${ui('stage', { name: 'solid', color: '#b42318', colorScheme: 'light', bars: { isStatusBarLightIcon: false } })}`);
    rows.push(`${ui('stage', { name: 'concurrent', color: '#336699', colorScheme: 'light', bars: { isStatusBarLightIcon: false } })}`);
    rows.push(`${ui('stage', { name: 'dark-reset', color: '#000000', colorScheme: 'dark', bars: { isStatusBarLightIcon: true } })}`);
    rows.push(`${ui('stage', { name: 'light-reset', color: '#ffffff', colorScheme: 'light', bars: { isStatusBarLightIcon: false } })}`);
    rows.push(`${ui('stage', { name: 'persist', color: '#336699', colorScheme: 'light', bars: { isStatusBarLightIcon: false } })}`);
  }
  rows.push(`${ui('app-state', { state: 'background' })}`);
  rows.push(`${ui('app-state', { state: 'active' })}`);
  rows.push(`${ui('foreground', { color: '#336699', bars: { isStatusBarLightIcon: false } })}`);
  if (systemUiReloadReplay) {
    // Mirrors the real capture (outputs/v1.7.0/B/20261114-02-capture): the
    // full boot requests the public reload, and the new runtime only restores
    // (fixture README forbids further setters before the restore check).
    rows.push(`${ui('reload-request')}`);
    const uiBoot2 = 1793345001000;
    const ui2 = (kind, extra = {}) => line('A04_SYSTEM_UI', { boot: uiBoot2, dev: false, kind, ...extra });
    rows.push(`${ui2('boot', { colorScheme: 'light' })}`);
    rows.push(`${ui2('stage', { name: 'restore', color: '#336699', colorScheme: 'light', bars: { isStatusBarLightIcon: false } })}`);
  }

  const browserBoot = 1793346000000;
  const browser = (kind, extra = {}) => line('A04_WEB_BROWSER', { boot: browserBoot, dev: false, kind, ...extra });
  rows.push(`${browser('boot')}`);
  rows.push(`${browser('baseline-pass', { checks: ['invalid-url', 'ephemeral-auth', 'dismiss-empty', 'warm-up', 'cool-down', 'may-init', 'custom-tabs', 'web-completion'] })}`);
  if (browserCases) {
    rows.push(`${browser('request', { name: 'manual-open' })}`);
    rows.push(`${browser('result', { name: 'manual-open', result: { type: 'cancel' } })}`);
    rows.push(`${browser('request', { name: 'programmatic-dismiss' })}`);
    rows.push(`${browser('result', { name: 'programmatic-dismiss', result: { dismissed: { type: 'dismiss' }, opened: { type: 'dismiss' } } })}`);
    rows.push(`${browser('request', { name: 'concurrent' })}`);
    rows.push(`${browser('result', { name: 'concurrent', result: { second: { type: 'locked' }, dismissed: { type: 'dismiss' }, first: { type: 'dismiss' } } })}`);
    rows.push(`${browser('request', { name: 'auth-success' })}`);
    rows.push(`${browser('result', { name: 'auth-success', result: { type: 'success', url: 'lanebbrowser://callback?code=123&state=device' } })}`);
    rows.push(`${browser('request', { name: 'auth-wrong-redirect' })}`);
    rows.push(`${browser('rejection', { name: 'auth-wrong-redirect', code: 'ERR_WEB_BROWSER_UNSUPPORTED_SCHEME', error: 'x' })}`);
    rows.push(`${browser('request', { name: 'load-failure' })}`);
    rows.push(`${browser('rejection', { name: 'load-failure', code: 'ERR_WEB_BROWSER_LOAD_FAILED', error: 'x' })}`);
    rows.push(`${browser('request', { name: 'pending-reload' })}`);
    rows.push(`${browser('reload-request')}`);
    rows.push(`${browser('rejection', { name: 'pending-reload-old', code: 'ERR_WEB_BROWSER_UNAVAILABLE', error: 'x' })}`);
    rows.push(line('A04_WEB_BROWSER', { boot: 1793346009000, dev: false, kind: 'boot' }));
    rows.push(line('A04_WEB_BROWSER', { boot: 1793346009000, dev: false, kind: 'baseline-pass',
      checks: ['invalid-url', 'ephemeral-auth', 'dismiss-empty', 'warm-up', 'cool-down', 'may-init', 'custom-tabs', 'web-completion'] }));
  }

  const routerBoot = 'b71e0f6a';
  rows.push(line('A_ROUTER_PROBE', { boot: routerBoot, dev: false, pathname: '/', latestURL: null, state: { index: 0 }, insets: { top: 96 }, frame: { width: 1320, height: 2856 }, nativeMetrics: {} }));
  rows.push(line('A_ROUTER_APP_STATE', { boot: routerBoot, from: 'active', to: 'background', at: '2026-11-14T00:00:01.000Z' }));
  rows.push('LANE_B_LINKING_PUBLIC_READY {"latest":null,"nativeLatest":null}');
  rows.push('EXPO_CORE_BOOT=' + JSON.stringify({ id: 1, dev: false }));
  rows.push('EXPO_CORE_BOOT=' + JSON.stringify({ id: 2, dev: false }));
  return rows.join('\n');
}
