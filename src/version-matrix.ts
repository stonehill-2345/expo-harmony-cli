import * as fs from 'fs';
import * as path from 'path';

export const VERSION_MATRIX_52 = {
  react: '18.3.1',
  reactDom: '18.3.1',
  reactTypes: '18.3.18',
  reactNative: '0.77.1',
  expo: '52.0.49',
  expoSdk: 'sdk-52',
  expoRouter: '4.0.22',
  reactNavigationNative: '7.3.18',
  reactNavigationElements: '2.9.30',
  babelRuntime: '7.29.7',
  reactNativeCommunityCli: '20.1.1',
  rnoh: '0.77.71',
  rnohCli: '0.77.71',
  metro: '0.81.5',
  rnScreens: '4.8.0',
  rnReanimated: '3.18.0',
  rnWorklets: '0.7.1',
  rnGestureHandler: '2.30.0',
  rnSafeArea: '5.6.2',
} as const;

export const VERSION_MATRIX_54 = {
  react: '19.1.1',
  reactDom: '19.1.1',
  reactTypes: '19.1.17',
  reactNative: '0.82.1',
  expo: '54.0.37',
  expoSdk: 'sdk-54',
  expoRouter: '6.0.24',
  reactNavigationNative: '7.3.18',
  reactNavigationElements: '2.9.30',
  babelRuntime: '7.29.7',
  reactNativeCommunityCli: '20.1.1',
  rnoh: '0.82.30',
  rnohCli: '0.82.30',
  metro: '0.83.3',
  rnScreens: '4.17.1',
  rnReanimated: '4.2.1',
  rnWorklets: '0.7.1',
  rnGestureHandler: '2.30.0',
  rnSafeArea: '5.6.2',
} as const;

export type SdkVersion = 'sdk-52' | 'sdk-54';

export type VersionMatrix = typeof VERSION_MATRIX_52 | typeof VERSION_MATRIX_54;

export function getVersionMatrix(sdk: SdkVersion): VersionMatrix {
  return sdk === 'sdk-52' ? VERSION_MATRIX_52 : VERSION_MATRIX_54;
}

/** 从项目 package.json 的 expo 版本自动检测 SDK；明确拒绝 SDK 53，无法检测时默认 SDK 54。 */
export function detectSdkVersion(projectRoot: string): SdkVersion {
  let expoVersion: unknown;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
    expoVersion = pkg.dependencies?.expo || pkg.devDependencies?.expo;
  } catch { /* 无法读取版本时保留默认基线 */ }
  if (typeof expoVersion === 'string') {
    const major = parseInt(expoVersion.replace(/^[~^]/, '').split('.')[0], 10);
    if (major === 53) {
      throw new Error('暂不支持 Expo SDK 53 的 HarmonyOS 适配；请使用 Expo SDK 52 或 54。');
    }
    if (major >= 54) return 'sdk-54';
    if (major <= 52) return 'sdk-52';
  }
  return 'sdk-54';
}

/** @deprecated Use getVersionMatrix(sdk) instead. Defaults to SDK 54 for backward compat. */
export const VERSION_MATRIX = VERSION_MATRIX_54;
