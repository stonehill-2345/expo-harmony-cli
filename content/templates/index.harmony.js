/**
 * HarmonyOS entry point.
 *
 * Bootstrap: initialize Expo globals that must exist before expo-router
 * loads, then delegate registration to expo-router.
 * iOS/Android 不走此文件——它们用 index.ts → registerRootComponent。
 */

// ===== 1. Expo globals polyfill（expo-router import 阶段就需要）=====
class ExpoEventEmitter {
  _listeners = new Map();
  addListener(eventName, listener) {
    if (!this._listeners.has(eventName)) this._listeners.set(eventName, new Set());
    this._listeners.get(eventName).add(listener);
    return { remove: () => this.removeListener(eventName, listener) };
  }
  removeListener(eventName, listener) {
    this._listeners.get(eventName)?.delete(listener);
  }
  removeAllListeners(eventName) {
    if (eventName == null) {
      this._listeners.clear();
      return;
    }
    this._listeners.delete(eventName);
  }
  emit(eventName, ...args) {
    this._listeners.get(eventName)?.forEach((l) => l(...args));
  }
}
class ExpoNativeModule {}
class ExpoSharedObject {}
class ExpoSharedRef {}

const expo = globalThis.expo ?? {};
expo.modules ??= {};
expo.EventEmitter ??= ExpoEventEmitter;
expo.NativeModule ??= ExpoNativeModule;
expo.SharedObject ??= ExpoSharedObject;
expo.SharedRef ??= ExpoSharedRef;
expo.reloadAppAsync ??= async () => {};
globalThis.expo = expo;

// ===== 2. window.location polyfill（expo-router 链接解析需要）=====
if (typeof window !== 'undefined' && !window.location) {
  window.location = {
    href: '{{scheme}}://',
    origin: '{{scheme}}://',
    pathname: '/',
    search: '',
    hash: '',
  };
}

// ===== 3. Metro runtime + expo-router bootstrap =====
// @expo/metro-runtime 经 metro.config.js 的 alias 重定向到 no-op shim（鸿蒙无 dev server）
require('@expo/metro-runtime');

const React = require('react');
const { renderRootComponent } = require('expo-router/build/renderRootComponent');
const { ExpoRoot } = require('expo-router');

const ctx = require.context(
  './app',
  true,
  /^(?:\.\/)(?!(?:(?:(?:.*\+api)|(?:\+html)))\.[tj]sx?$).*\.[tj]sx?$/
);

function App() {
  return React.createElement(ExpoRoot, { context: ctx });
}

renderRootComponent(App);
