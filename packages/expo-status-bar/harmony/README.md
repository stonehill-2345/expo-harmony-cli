# expo-status-bar Harmony validation

Expo StatusBar is a JavaScript wrapper over React Native StatusBar and does not
need another Expo native module on Harmony. RNOH 0.82.30 already exposes the
Harmony `StatusBarManager` delegate for style, color, hidden and translucent
state. The SDK fixture uses a test-only Window oracle to verify actual system-bar
properties; applications continue to import `expo-status-bar` normally.

RNOH's Harmony host sets the RN window to full-screen for SafeArea support and
its `setTranslucent` implementation explicitly reports that translucency is not
configurable. `translucent={false}` therefore cannot switch the window out of
immersive layout and is recorded as a platform limitation.

`setStatusBarNetworkActivityIndicatorVisible` is also a platform no-op in the
current RNOH delegate, not a successful Harmony capability. Platform animation
details are not claimed beyond the final system state observed in device tests.
