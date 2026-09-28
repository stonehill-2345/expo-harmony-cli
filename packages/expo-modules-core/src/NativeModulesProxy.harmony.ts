import { ensureNativeModulesAreInstalled } from './ensureNativeModulesAreInstalled';
import type { ProxyNativeModule } from './NativeModulesProxy.types';

// RNOH's buffered GlobalJSIBinder can run after bundle evaluation. Use the
// synchronous native installation path before exposing the real module table.
ensureNativeModulesAreInstalled();

if (!globalThis.expo?.modules) {
  throw new Error('Expo Modules Core Harmony native module registry is not installed');
}

export default globalThis.expo.modules as Record<string, ProxyNativeModule>;
