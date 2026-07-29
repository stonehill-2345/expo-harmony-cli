export const VERSION_MATRIX = {
  react: '18.3.1',
  reactNative: '0.77.1',
  expo: '52.0.49',
  expoSdk: 'sdk-52',
  expoRouter: '4.0.22',
  reactNavigationElements: '2.9.30',
  babelRuntime: '7.29.7',
  reactNativeCommunityCli: '20.1.1',
  // RNOH 0.77.71 keeps the RN 0.77.x baseline while carrying newer HarmonyOS
  // runtime fixes. Keep react-native pinned independently at 0.77.1.
  rnoh: '0.77.71',
  rnohCli: '0.77.71',
  metro: '0.81.5',
  // RN 0.77 的 ImageResizeMode 包含 None；4.0.0 在 Xcode 16.4+ 会因未覆盖该枚举而编译失败。
  rnScreens: '4.8.0',
  rnReanimated: '3.18.0',
  rnGestureHandler: '2.30.0',
  rnSafeArea: '5.6.2',
} as const;
