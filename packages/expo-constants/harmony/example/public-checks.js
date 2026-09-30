import Constants, { ExecutionEnvironment } from 'expo-constants';
import { requireNativeModule } from 'expo-modules-core';
import { TurboModuleRegistry } from 'react-native';

function equal(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
  }
}

// expectedConfig must be the input to the official getAppConfig script.
// expectedDebugMode must come from the HAP build mode, not from JS __DEV__.
export async function checkConstants(expectedConfig, expectedDebugMode) {
  const direct = TurboModuleRegistry.getEnforcing('ExponentConstants');
  const native = requireNativeModule('ExponentConstants');
  const oracle = TurboModuleRegistry.getEnforcing('LaneBConstantsOracle').getSnapshot();
  const raw = direct.getConstants();
  equal(Constants.executionEnvironment, ExecutionEnvironment.Bare, 'bare environment');
  equal(Constants.appOwnership, null, 'ownership');
  equal(Constants.expoVersion, null, 'Expo Go version');
  equal(Constants.isHeadless, false, 'UI fixture');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.sessionId)) {
    throw new Error('sessionId is not a native UUID v4');
  }
  equal(direct.getConstants().sessionId, raw.sessionId, 'stable native session');
  equal(native.sessionId, raw.sessionId, 'Core session');
  equal(Constants.sessionId, raw.sessionId, 'public session');
  for (const key of ['name', 'slug', 'version', 'scheme']) {
    equal(raw.manifest?.[key], expectedConfig[key], `native manifest.${key}`);
    equal(Constants.expoConfig?.[key], expectedConfig[key], `expoConfig.${key}`);
  }
  for (const key of ['deviceName', 'systemVersion', 'statusBarHeight', 'systemFonts', 'platform']) {
    equal(native[key], raw[key], `Core ${key}`);
    if (key === 'statusBarHeight') {
      if (!Number.isFinite(Constants[key]) || Math.abs(Constants[key] - oracle[key]) > 0.00001) {
        throw new Error('statusBarHeight differs from independent px/density oracle');
      }
    } else {
      equal(Constants[key], oracle[key], `oracle ${key}`);
    }
  }
  if (oracle.systemFonts.length === 0) throw new Error('No real fonts');
  equal(Constants.debugMode, expectedDebugMode, 'HAP debug mode');
  equal(Constants.debugMode, oracle.debugMode, 'native debug mode');
  if ('installationId' in Constants) throw new Error('Deprecated installationId present');
  if (typeof native.getWebViewUserAgentAsync !== 'function') {
    throw new Error('Core lost getWebViewUserAgentAsync');
  }
  const directUA = await direct.getWebViewUserAgentAsync();
  equal(await native.getWebViewUserAgentAsync(), directUA, 'Core UA');
  equal(await Constants.getWebViewUserAgentAsync(), oracle.userAgent, 'public UA');
  return { sessionId: Constants.sessionId, debugMode: Constants.debugMode,
    jsDev: __DEV__, statusBarPx: oracle.statusBarPx, statusBarVp: Constants.statusBarHeight,
    fontCount: Constants.systemFonts.length, publicConfig: Constants.expoConfig };
}
