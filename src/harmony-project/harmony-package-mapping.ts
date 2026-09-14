import Case from 'case';
import type { HarmonyPackageMappingEntry } from './types';

/**
 * npm 包名 → ETS/C++ Package 类名（PascalCase + Package 后缀）。参考 D.4。
 *
 * scoped 包（@scope/name）：scope 与 name 各自 PascalCase 后拼接，再加 Package 后缀。
 *   例：@react-native-ohos/camera-roll → ReactNativeOhos + CameraRoll + Package
 *                             = ReactNativeOhosCameraRollPackage
 * 非scoped 包：直接 PascalCase + Package。
 *   例：foo → FooPackage
 */
export function npmToPascalPackage(fullNpmPackageName: string): string {
  if (fullNpmPackageName.startsWith('@')) {
    const [scope, name] = fullNpmPackageName.replace('@', '').split('/');
    return Case.pascal(scope) + Case.pascal(name) + 'Package';
  }
  return Case.pascal(fullNpmPackageName) + 'Package';
}

/**
 * npm 包名 → CMake target（rnoh__snake）。参考 D.4。
 *
 * scoped 包（@scope/name）：rnoh__<snake(scope)>__<snake(name)>
 *   例：@react-native-ohos/camera-roll → rnoh__react_native_ohos__camera_roll
 * 非scoped 包：rnoh__<snake(name)>
 */
export function npmToCmakeTarget(fullNpmPackageName: string): string {
  if (fullNpmPackageName.startsWith('@')) {
    const [scope, name] = fullNpmPackageName.replace('@', '').split('/');
    return 'rnoh__' + Case.snake(scope) + '__' + Case.snake(name);
  }
  return 'rnoh__' + Case.snake(fullNpmPackageName);
}

/**
 * 鸿蒙原生包映射表。数据从 ohrn 实物提取（ground truth）：
 *   - cmakeLibraryTargetName: ohrn harmony/entry/src/main/cpp/CMakeLists.txt 的 target_link_libraries
 *   - etsPackageClassName / importStatement: ohrn harmony/entry/src/main/ets/RNPackagesFactory.ets
 *   - cppPackageClassName: ohrn harmony/entry/src/main/cpp/PackageProvider.cpp 的 #include
 *   - harName: ohrn harmony/entry/oh-package.json5 的 file: 引用末段
 *
 * native-stack（@react-native-ohos/native-stack）经查证为纯 JS 路由层
 * （无 harmony 目录、无 .har、package.json harmony 仅含 alias），不入此表。
 * spec §6 验收第 4 条以 screens 注册为准。
 *
 * P0 含 expo-router 必装 5 包；其余包为 P1 create 的 scanAndAdapt 扩展范围。
 */
export const HARMONY_PACKAGE_MAPPING: Record<string, HarmonyPackageMappingEntry> = {
  '@react-native-ohos/react-native-safe-area-context': {
    npmPackageName: '@react-native-ohos/react-native-safe-area-context',
    cmakeLibraryTargetName: 'rnoh_safe_area',
    etsPackageClassName: 'SafeAreaViewPackage',
    cppPackageClassName: 'SafeAreaViewPackage',
    cppPackageNamespace: 'rnoh',
    importStatement:
      "import { SafeAreaViewPackage } from '@react-native-ohos/react-native-safe-area-context/ts';",
    harName: 'safe_area.har',
  },
  '@react-native-ohos/react-native-gesture-handler': {
    npmPackageName: '@react-native-ohos/react-native-gesture-handler',
    cmakeLibraryTargetName: 'rnoh_gesture_handler',
    etsPackageClassName: 'GestureHandlerPackage',
    cppPackageClassName: 'GestureHandlerPackage',
    cppPackageNamespace: 'rnoh',
    importStatement:
      "import GestureHandlerPackage from '@react-native-ohos/react-native-gesture-handler';",
    harName: 'gesture_handler.har',
  },
  '@react-native-ohos/react-native-reanimated': {
    npmPackageName: '@react-native-ohos/react-native-reanimated',
    cmakeLibraryTargetName: 'rnoh_reanimated',
    etsPackageClassName: 'ReanimatedPackage',
    cppPackageClassName: 'ReanimatedPackage',
    cppPackageNamespace: 'rnoh',
    importStatement:
      "import { ReanimatedPackage } from '@react-native-ohos/react-native-reanimated/ts';",
    harName: 'reanimated.har',
  },
  '@react-native-ohos/react-native-worklets': {
    npmPackageName: '@react-native-ohos/react-native-worklets',
    cmakeLibraryTargetName: 'rnoh_worklets',
    harName: 'worklets.har',
    cppSourcePath: 'harmony/worklets/src/main/cpp',
    ohpmOverride: true,
    etsPackages: [{ importStatement: "import { ReanimatedWorkletPackage } from '@react-native-ohos/react-native-worklets/ts';", classNames: ['ReanimatedWorkletPackage'] }],
    cppPackages: [{ className: 'ReanimatedWorkletPackage', namespace: 'rnoh' }],
  },
  '@react-native-ohos/react-native-screens': {
    npmPackageName: '@react-native-ohos/react-native-screens',
    cmakeLibraryTargetName: 'rnoh_screens',
    etsPackageClassName: 'RNOHScreensPackage',
    cppPackageClassName: 'ScreensPackage',
    cppPackageNamespace: null,
    importStatement: "import RNOHScreensPackage from '@react-native-ohos/react-native-screens';",
    harName: 'screens.har',
  },
  '@react-native-ohos/react-native-webview': {
    npmPackageName: '@react-native-ohos/react-native-webview',
    cmakeLibraryTargetName: 'rnoh_webview',
    harName: 'rn_webview.har',
    cppSourcePath: 'harmony/rn_webview/src/main/cpp',
    etsPackages: [{ importStatement: "import { WebViewPackage } from '@react-native-ohos/react-native-webview/ts';", classNames: ['WebViewPackage'] }],
    cppPackages: [{ className: 'WebViewPackage', namespace: 'rnoh' }],
  },

  '@react-native-ohos/react-native-pager-view': {
    npmPackageName: '@react-native-ohos/react-native-pager-view', cmakeLibraryTargetName: 'rnoh_pager_view', harName: 'pager_view.har', cppSourcePath: 'harmony/pager_view/src/main/cpp',
    etsPackages: [{ importStatement: "import { ViewPagerPackage } from '@react-native-ohos/react-native-pager-view/ts';", classNames: ['ViewPagerPackage'] }], cppPackages: [{ className: 'ViewPagerPackage', namespace: 'rnoh' }],
  },
  '@react-native-ohos/react-native-linear-gradient': {
    npmPackageName: '@react-native-ohos/react-native-linear-gradient', cmakeLibraryTargetName: 'rnoh_linear_gradient', harName: 'linear_gradient.har', cppSourcePath: 'harmony/linear_gradient/src/main/cpp', etsPackages: [], cppPackages: [{ className: 'LinearGradientPackage', namespace: 'rnoh' }],
  },
  '@react-native-ohos/react-native-svg': {
    npmPackageName: '@react-native-ohos/react-native-svg', cmakeLibraryTargetName: 'rnoh_svg', harName: 'svg.har', cppSourcePath: 'harmony/svg/src/main/cpp', etsPackages: [{ importStatement: "import { SvgPackage } from '@react-native-ohos/react-native-svg/ts';", classNames: ['SvgPackage'] }], cppPackages: [{ className: 'SVGPackage', namespace: 'rnoh' }],
  },
  '@react-native-ohos/react-native-video': {
    npmPackageName: '@react-native-ohos/react-native-video', cmakeLibraryTargetName: 'rnoh_video', harName: 'rn_video.har', cppSourcePath: 'harmony/rn_video/src/main/cpp', etsPackages: [{ importStatement: "import { RNCVideoPackage } from '@react-native-ohos/react-native-video/ts';", classNames: ['RNCVideoPackage'] }], cppPackages: [{ className: 'RNCVideoPackage', namespace: 'rnoh' }],
  },
  '@react-native-ohos/react-native-document-picker': {
    npmPackageName: '@react-native-ohos/react-native-document-picker', cmakeLibraryTargetName: 'rnoh_document_picker', harName: 'document_picker.har', cppSourcePath: 'harmony/document_picker/src/main/cpp', etsPackages: [{ importStatement: "import { DocumentPickerPackage } from '@react-native-ohos/react-native-document-picker/ts';", classNames: ['DocumentPickerPackage'] }], cppPackages: [{ className: 'DocumentPickerPackage', namespace: 'rnoh' }],
  },
  '@react-native-ohos/lottie-react-native': {
    npmPackageName: '@react-native-ohos/lottie-react-native', cmakeLibraryTargetName: 'rnoh_lottie', harName: 'lottie.har', cppSourcePath: 'harmony/lottie/src/main/cpp', etsPackages: [{ importStatement: "import { LottieAnimationViewPackage } from '@react-native-ohos/lottie-react-native/ts';", classNames: ['LottieAnimationViewPackage'] }], cppPackages: [{ className: 'LottieAnimationViewPackage', namespace: 'rnoh' }],
  },
  '@react-native-ohos/slider': {
    npmPackageName: '@react-native-ohos/slider', cmakeLibraryTargetName: 'rnoh_slider', harName: 'slider.har', cppSourcePath: 'harmony/slider/src/main/cpp', etsPackages: [], cppPackages: [{ className: 'SliderPackage', namespace: 'rnoh' }],
  },
  '@react-native-ohos/react-native-keyboard-controller': {
    npmPackageName: '@react-native-ohos/react-native-keyboard-controller', cmakeLibraryTargetName: 'rnoh_keyboard_controller', harName: 'keyboard_controller.har', cppSourcePath: 'harmony/keyboard_controller/src/main/cpp', etsPackages: [{ importStatement: "import { RNKeyboardControllerPackage, RNStatusBarManagerCompatPackage } from '@react-native-ohos/react-native-keyboard-controller/ts';", classNames: ['RNKeyboardControllerPackage', 'RNStatusBarManagerCompatPackage'] }], cppPackages: [{ className: 'KeyboardControllerPackage', namespace: 'rnoh' }],
  },
  '@react-native-ohos/react-native-blob-util': {
    npmPackageName: '@react-native-ohos/react-native-blob-util', cmakeLibraryTargetName: 'rnoh_blob_util', harName: 'blobUtil.har', cppSourcePath: 'harmony/blobUtil/src/main/cpp', etsPackages: [{ importStatement: "import { BlobUtilPackage } from '@react-native-ohos/react-native-blob-util/ts';", classNames: ['BlobUtilPackage'] }], cppPackages: [{ className: 'BlobUtilPackage', namespace: 'rnoh' }],
  },
};
