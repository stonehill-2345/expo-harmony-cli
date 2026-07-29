import { VERSION_MATRIX as V } from '../version-matrix';

export type CompatStatus = 'bump-native' | 'native' | 'alias-only' | 'shim' | 'patch-only' | 'remove' | 'replace' | 'unsupported';

export type CompatEntry = {
  original: string;
  /** 与鸿蒙实现共同通过 API/真机验证的原包精确版本。 */
  originalVersion?: string;
  status: CompatStatus;
  bumpTo?: string;
  harmony?: { package: string; version: string; alias?: string; requiresCodegen?: boolean };
  shim?: { sourceFile: string; targetPath: string };
  patch?: { sourceFile: string; targetPath: string; dependencyVersion?: string };
  replaceWith?: { package: string; version: string };
};

export const COMPAT_TABLE: Record<string, CompatEntry> = {
  // ===== B 类：bump + native =====
  'react-native': { original: 'react-native', status: 'bump-native', bumpTo: V.reactNative, harmony: { package: '@react-native-oh/react-native-harmony', version: V.rnoh } },
  'react-native-screens': { original: 'react-native-screens', status: 'bump-native', bumpTo: V.rnScreens, harmony: { package: '@react-native-ohos/react-native-screens', version: '4.8.1-rc.7' } },
  'react-native-reanimated': { original: 'react-native-reanimated', status: 'bump-native', bumpTo: V.rnReanimated, harmony: { package: '@react-native-ohos/react-native-reanimated', version: '3.18.1-rc.1' } },
  'react-native-gesture-handler': { original: 'react-native-gesture-handler', status: 'bump-native', bumpTo: V.rnGestureHandler, harmony: { package: '@react-native-ohos/react-native-gesture-handler', version: '2.23.2-rc.1' } },
  'react-native-safe-area-context': { original: 'react-native-safe-area-context', status: 'bump-native', bumpTo: V.rnSafeArea, harmony: { package: '@react-native-ohos/react-native-safe-area-context', version: '5.1.1-rc.1' } },

  // ===== C 类：仅 native（不 bump）=====
  // native-stack 是 JS/alias 替代层，无 HAR/C++/ETS Package；不触发 RNOH autolinking。
  'expo-router': { original: 'expo-router', originalVersion: '4.0.22', status: 'alias-only', harmony: { package: '@react-native-ohos/native-stack', version: '7.3.11-rc.1' }, patch: { sourceFile: 'content/patches/expo-router+4.0.22.patch', targetPath: 'patches/expo-router+4.0.22.patch' } },
  'react-native-webview': { original: 'react-native-webview', originalVersion: '13.15.0', status: 'native', harmony: { package: '@react-native-ohos/react-native-webview', version: '13.15.1' } },
  'react-native-mmkv': { original: 'react-native-mmkv', originalVersion: '3.3.1', status: 'native', harmony: { package: '@react-native-ohos/react-native-mmkv', version: '3.3.1-rc.1', alias: 'react-native-mmkv' } },
  'react-native-pager-view': { original: 'react-native-pager-view', originalVersion: '6.9.1', status: 'native', harmony: { package: '@react-native-ohos/react-native-pager-view', version: '6.7.2-rc.1', alias: 'react-native-pager-view' } },
  'react-native-linear-gradient': { original: 'react-native-linear-gradient', originalVersion: '2.8.3', status: 'native', harmony: { package: '@react-native-ohos/react-native-linear-gradient', version: '3.1.0', alias: 'react-native-linear-gradient' } },
  '@react-native-clipboard/clipboard': { original: '@react-native-clipboard/clipboard', originalVersion: '1.16.2', status: 'native', harmony: { package: '@react-native-ohos/clipboard', version: '1.16.3-rc.2', alias: '@react-native-clipboard/clipboard' } },
  'react-native-svg': { original: 'react-native-svg', originalVersion: '15.12.0', status: 'native', harmony: { package: '@react-native-ohos/react-native-svg', version: '15.12.1', alias: 'react-native-svg' } },
  'react-native-permissions': { original: 'react-native-permissions', originalVersion: '5.3.0', status: 'native', harmony: { package: '@react-native-ohos/react-native-permissions', version: '5.3.1-rc.1', alias: 'react-native-permissions' } },
  'react-native-device-info': { original: 'react-native-device-info', originalVersion: '14.0.4', status: 'native', harmony: { package: '@react-native-ohos/react-native-device-info', version: '14.0.5', alias: 'react-native-device-info' } },
  'react-native-fast-image': {
    original: 'react-native-fast-image', originalVersion: '8.6.3', status: 'native',
    harmony: { package: '@react-native-oh-tpl/react-native-fast-image', version: '8.6.3-0.4.17', alias: 'react-native-fast-image' },
    // 该版本仍使用已被 RN 0.77 移除的 butter::map；补丁改用 folly::dynamic。
    patch: {
      sourceFile: 'content/patches/@react-native-oh-tpl+react-native-fast-image+8.6.3-0.4.17.patch',
      targetPath: 'patches/@react-native-oh-tpl+react-native-fast-image+8.6.3-0.4.17.patch',
      dependencyVersion: '8.6.3',
    },
  },
  'react-native-video': { original: 'react-native-video', originalVersion: '6.13.0', status: 'native', harmony: { package: '@react-native-ohos/react-native-video', version: '6.14.0', alias: 'react-native-video' } },
  'react-native-document-picker': { original: 'react-native-document-picker', originalVersion: '9.3.1', status: 'native', harmony: { package: '@react-native-ohos/react-native-document-picker', version: '9.2.2', alias: 'react-native-document-picker' } },
  'react-native-fs': { original: 'react-native-fs', originalVersion: '2.20.0', status: 'native', harmony: { package: '@react-native-ohos/react-native-fs', version: '2.21.0', alias: 'react-native-fs' } },
  'lottie-react-native': { original: 'lottie-react-native', originalVersion: '7.3.4', status: 'native', harmony: { package: '@react-native-ohos/lottie-react-native', version: '7.3.0', alias: 'lottie-react-native' } },
  '@react-native-community/slider': { original: '@react-native-community/slider', originalVersion: '5.0.0', status: 'native', harmony: { package: '@react-native-ohos/slider', version: '5.0.1-rc.1', alias: '@react-native-community/slider' } },
  'react-native-keyboard-controller': { original: 'react-native-keyboard-controller', originalVersion: '1.16.6', status: 'native', harmony: { package: '@react-native-ohos/react-native-keyboard-controller', version: '1.16.6-rc.1', alias: 'react-native-keyboard-controller' } },
  'react-native-blob-util': { original: 'react-native-blob-util', originalVersion: '0.19.6', status: 'native', harmony: { package: '@react-native-oh-tpl/react-native-blob-util', version: '0.19.7-rc.1', alias: 'react-native-blob-util', requiresCodegen: true } },
  // 鸿蒙版 FlashList 是 JS/TS 替代实现，仅需 alias，不需要 RNOH autolinking。
  '@shopify/flash-list': { original: '@shopify/flash-list', originalVersion: '1.8.3', status: 'alias-only', harmony: { package: '@react-native-ohos/flash-list', version: '2.1.1-rc.1', alias: '@shopify/flash-list' } },

  // 当前 ohrn 未安装这些原包，无法给出经验证的原包/鸿蒙包版本对；禁止自动 alias。
  'react-native-image-picker': { original: 'react-native-image-picker', status: 'unsupported' },
  'react-native-sound': { original: 'react-native-sound', status: 'unsupported' },

  // ===== H 类：删除 / 替换（default 模版自带但鸿蒙不支持）=====
  'expo-blur': { original: 'expo-blur', status: 'remove' },
  'expo-font': { original: 'expo-font', status: 'remove' },
  'expo-haptics': { original: 'expo-haptics', status: 'remove' },
  'expo-symbols': { original: 'expo-symbols', status: 'remove' },
  'expo-system-ui': { original: 'expo-system-ui', status: 'remove' },
  'expo-web-browser': { original: 'expo-web-browser', status: 'remove' },
  // 默认模板在 create 阶段已移除 Splash。用户后续安装时不静默改写业务依赖。
  'expo-splash-screen': { original: 'expo-splash-screen', status: 'unsupported' },

  // ===== patch-only：鸿蒙可跑但需 patch 修正（不增删依赖）=====
  'expo-constants': { original: 'expo-constants', status: 'patch-only', patch: { sourceFile: 'content/patches/expo-constants+17.0.8.patch', targetPath: 'patches/expo-constants+17.0.8.patch' } },
  'expo-status-bar': { original: 'expo-status-bar', status: 'patch-only', patch: { sourceFile: 'content/patches/expo-status-bar+3.0.9.patch', targetPath: 'patches/expo-status-bar+3.0.9.patch' } },
  'expo-linking': { original: 'expo-linking', status: 'patch-only', patch: { sourceFile: 'content/patches/expo-linking+7.0.5.patch', targetPath: 'patches/expo-linking+7.0.5.patch' } },
  'expo-clipboard': { original: 'expo-clipboard', status: 'patch-only', patch: { sourceFile: 'content/patches/expo-clipboard+7.0.1.patch', targetPath: 'patches/expo-clipboard+7.0.1.patch' } },
  'expo-linear-gradient': { original: 'expo-linear-gradient', status: 'patch-only', patch: { sourceFile: 'content/patches/expo-linear-gradient+14.0.2.patch', targetPath: 'patches/expo-linear-gradient+14.0.2.patch' } },
  'expo-image': { original: 'expo-image', status: 'patch-only', patch: { sourceFile: 'content/patches/expo-image+2.0.7.patch', targetPath: 'patches/expo-image+2.0.7.patch' } },
  'expo-image-picker': { original: 'expo-image-picker', status: 'patch-only', patch: { sourceFile: 'content/patches/expo-image-picker+16.0.6.patch', targetPath: 'patches/expo-image-picker+16.0.6.patch' } },
  'expo-media-library': { original: 'expo-media-library', status: 'patch-only', patch: { sourceFile: 'content/patches/expo-media-library+17.0.6.patch', targetPath: 'patches/expo-media-library+17.0.6.patch' } },
  'expo-document-picker': { original: 'expo-document-picker', status: 'patch-only', patch: { sourceFile: 'content/patches/expo-document-picker+13.0.3.patch', targetPath: 'patches/expo-document-picker+13.0.3.patch' } },

  // @expo/vector-icons 经 expo-font 依赖 ExpoFontLoader，HarmonyOS 不走默认自动适配。
  // 默认模板改用 react-native-svg；业务项目若需字体图标，应自行验证 react-native-vector-icons 适配链路。
};
