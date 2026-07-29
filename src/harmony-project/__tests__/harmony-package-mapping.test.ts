import { describe, it, expect } from 'vitest';
import {
  HARMONY_PACKAGE_MAPPING,
  npmToPascalPackage,
  npmToCmakeTarget,
} from '../harmony-package-mapping';

describe('harmony-package-mapping', () => {
  it('含 expo-router 必需包', () => {
    const keys = Object.keys(HARMONY_PACKAGE_MAPPING);
    expect(keys).toContain('@react-native-ohos/react-native-screens');
    expect(keys).toContain('@react-native-ohos/react-native-safe-area-context');
    expect(keys).toContain('@react-native-ohos/react-native-gesture-handler');
    expect(keys).toContain('@react-native-ohos/react-native-reanimated');
  });

  it('safe-area-context 条目字段完整且与 ohrn 实物一致', () => {
    const e = HARMONY_PACKAGE_MAPPING['@react-native-ohos/react-native-safe-area-context'];
    expect(e).toEqual({
      npmPackageName: '@react-native-ohos/react-native-safe-area-context',
      cmakeLibraryTargetName: 'rnoh_safe_area',
      etsPackageClassName: 'SafeAreaViewPackage',
      cppPackageClassName: 'SafeAreaViewPackage',
      cppPackageNamespace: 'rnoh',
      importStatement:
        "import { SafeAreaViewPackage } from '@react-native-ohos/react-native-safe-area-context/ts';",
      harName: 'safe_area.har',
    });
  });

  it('screens 条目（ets=RNOHScreensPackage default import / cpp=ScreensPackage）', () => {
    const e = HARMONY_PACKAGE_MAPPING['@react-native-ohos/react-native-screens'];
    expect(e?.etsPackageClassName).toBe('RNOHScreensPackage');
    expect(e?.cppPackageClassName).toBe('ScreensPackage');
    expect(e?.cppPackageNamespace).toBeNull();
    expect(e?.importStatement).toMatch(/^import RNOHScreensPackage from/);
    expect(e?.cmakeLibraryTargetName).toBe('rnoh_screens');
    expect(e?.harName).toBe('screens.har');
  });

  it('gesture-handler 条目（default import）与 ohrn 实物一致', () => {
    const e = HARMONY_PACKAGE_MAPPING['@react-native-ohos/react-native-gesture-handler'];
    expect(e).toEqual({
      npmPackageName: '@react-native-ohos/react-native-gesture-handler',
      cmakeLibraryTargetName: 'rnoh_gesture_handler',
      etsPackageClassName: 'GestureHandlerPackage',
      cppPackageClassName: 'GestureHandlerPackage',
      cppPackageNamespace: 'rnoh',
      importStatement:
        "import GestureHandlerPackage from '@react-native-ohos/react-native-gesture-handler';",
      harName: 'gesture_handler.har',
    });
  });

  it('reanimated 条目（named/ts import）与 ohrn 实物一致', () => {
    const e = HARMONY_PACKAGE_MAPPING['@react-native-ohos/react-native-reanimated'];
    expect(e).toEqual({
      npmPackageName: '@react-native-ohos/react-native-reanimated',
      cmakeLibraryTargetName: 'rnoh_reanimated',
      etsPackageClassName: 'ReanimatedPackage',
      cppPackageClassName: 'ReanimatedPackage',
      cppPackageNamespace: 'rnoh',
      importStatement:
        "import { ReanimatedPackage } from '@react-native-ohos/react-native-reanimated/ts';",
      harName: 'reanimated.har',
    });
  });

  it('camera-roll 条目与 ohrn 实物一致', () => {
    const e = HARMONY_PACKAGE_MAPPING['@react-native-ohos/camera-roll'];
    expect(e).toEqual({
      npmPackageName: '@react-native-ohos/camera-roll',
      cmakeLibraryTargetName: 'rnoh_camera_roll',
      etsPackageClassName: 'CameraRollPackage',
      cppPackageClassName: 'CameraRollPackage',
      cppPackageNamespace: 'rnoh',
      importStatement: "import { CameraRollPackage } from '@react-native-ohos/camera-roll/ts';",
      harName: 'camera_roll.har',
    });
  });

  it('webview 条目与 ohrn 实物一致', () => {
    const e = HARMONY_PACKAGE_MAPPING['@react-native-ohos/react-native-webview'];
    expect(e).toEqual({
      npmPackageName: '@react-native-ohos/react-native-webview',
      cmakeLibraryTargetName: 'rnoh_webview',
      harName: 'rn_webview.har',
      cppSourcePath: 'harmony/rn_webview/src/main/cpp',
      etsPackages: [{
        importStatement: "import { WebViewPackage } from '@react-native-ohos/react-native-webview/ts';",
        classNames: ['WebViewPackage'],
      }],
      cppPackages: [{ className: 'WebViewPackage', namespace: 'rnoh' }],
    });
  });

  it('P1 常用三方原生包均有映射', () => {
    const required = [
      '@react-native-ohos/react-native-mmkv',
      '@react-native-ohos/react-native-pager-view',
      '@react-native-ohos/react-native-linear-gradient',
      '@react-native-ohos/clipboard',
      '@react-native-ohos/react-native-svg',
      '@react-native-ohos/react-native-permissions',
      '@react-native-ohos/react-native-device-info',
      '@react-native-oh-tpl/react-native-fast-image',
      '@react-native-ohos/react-native-image-picker',
      '@react-native-ohos/react-native-video',
      '@react-native-ohos/react-native-sound',
      '@react-native-ohos/react-native-document-picker',
      '@react-native-ohos/react-native-fs',
      '@react-native-ohos/lottie-react-native',
      '@react-native-ohos/slider',
      '@react-native-ohos/react-native-keyboard-controller',
      '@react-native-oh-tpl/react-native-blob-util',
    ];
    for (const packageName of required) {
      expect(HARMONY_PACKAGE_MAPPING[packageName], packageName).toBeDefined();
    }
  });

  it('native-stack 为纯 JS 路由层，不入映射表（spec §6 验收以 screens 注册为准）', () => {
    // 查证：@react-native-ohos/native-stack 无 harmony 目录、无 .har 文件、
    //       package.json harmony 字段仅含 { alias: '@react-navigation/native-stack' }，
    //       main 为 ./lib/module/index.js（纯 JS）。故无独立原生实现，不入映射表。
    expect(HARMONY_PACKAGE_MAPPING['@react-native-ohos/native-stack']).toBeUndefined();
  });

  it('每个映射表条目具备 HAR，且 ETS/C++ 注册字段完整', () => {
    for (const [key, entry] of Object.entries(HARMONY_PACKAGE_MAPPING)) {
      expect(entry.npmPackageName, `${key}.npmPackageName`).toBe(key);
      expect(entry.harName, `${key}.harName`).toMatch(/\.har$/);
      for (const etsPackage of entry.etsPackages || []) {
        expect(etsPackage.importStatement, `${key}.importStatement`).toMatch(/^import /);
        expect(etsPackage.classNames.length, `${key}.classNames`).toBeGreaterThan(0);
      }
      for (const cppPackage of entry.cppPackages || []) {
        expect(cppPackage.className, `${key}.cppPackageClassName`).toBeTruthy();
      }
    }
  });

  it('命名推导：scoped 包名 → PascalCase + Package', () => {
    expect(npmToPascalPackage('@react-native-ohos/camera-roll')).toBe(
      'ReactNativeOhosCameraRollPackage',
    );
    expect(npmToPascalPackage('foo')).toBe('FooPackage');
  });

  it('命名推导：包名 → rnoh__snake CMake target', () => {
    expect(npmToCmakeTarget('@react-native-ohos/camera-roll')).toBe(
      'rnoh__react_native_ohos__camera_roll',
    );
  });
});
