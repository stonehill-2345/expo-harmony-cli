// Native-backend diagnostic only. This does not exercise Expo's public entry.
import React from 'react';
import { AppRegistry, DevSettings, Linking, Text, TurboModuleRegistry } from 'react-native';

const native = TurboModuleRegistry.getEnforcing('ExpoLinking');
const report = (kind, value) => console.log('LANE_B_LINKING ' + JSON.stringify({ kind, ...value }));
let received = 0;
let secondary = 0;
let removed = 0;
const removedSubscription = native.onURLReceived(() => { removed++; });
removedSubscription.remove();
removedSubscription.remove();
const secondarySubscription = native.onURLReceived(() => { secondary++; });
native.onURLReceived(({ url }) => {
  received++;
  // Allow all listeners for this event to run before observing their counts.
  setTimeout(() => {
    report('event', { url, latest: native.getLinkingURL(), received, secondary, removed });
    if (url.endsWith('/remove-secondary')) secondarySubscription.remove();
    if (url.endsWith('/reload')) DevSettings.reload();
    if (url.endsWith('/probe')) probe();
  }, 0);
});
Linking.addEventListener('url', ({ url }) => report('rn-event', { url }));
report('ready', { latest: native.getLinkingURL(), dev: __DEV__ });
Linking.getInitialURL().then((url) => report('initial', { url }));

async function probe() {
  for (const url of ['laneblinking://fixture/self-open', 'lanebmissing://fixture/absent']) {
    try {
      report('canOpenURL', { url, result: await Linking.canOpenURL(url) });
    } catch (error) {
      report('canOpenURL-error', { url, code: error?.code, message: error?.message ?? String(error) });
    }
    try {
      const result = await Linking.openURL(url);
      report('openURL', { url, result: result === undefined ? '<undefined>' : result });
    } catch (error) {
      report('openURL-error', { url, code: error?.code, message: error?.message ?? String(error) });
    }
  }
}

AppRegistry.registerComponent('LaneBLinking', () => () =>
  React.createElement(Text, { style: { marginTop: 80, padding: 24 } }, 'ExpoLinking native diagnostics — see LANE_B_LINKING logs')
);
