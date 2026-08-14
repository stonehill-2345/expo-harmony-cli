/**
 * expo-asset 鸿蒙降级 shim
 *
 * 根因：Expo SDK52 Expo.fx 聚合初始化顶层 `import 'expo-asset'`（副作用），
 * 触发入口 build/ExpoAsset.js 顶层 `requireNativeModule('ExpoAsset')`，
 * 鸿蒙 RNOH 无该原生模块 → 崩。
 *
 * 本 shim 提供 JS 层空实现，让 import 'expo-asset' 不触发原生模块调用。
 * 鸿蒙 app 用 react-native Image + require() 加载本地图片，不依赖 expo-asset
 * 的 Asset 类下载能力，故 no-op 降级不影响启动。
 */
export class Asset {
  uri = '';
  localUri?: string;
  width?: number;
  height?: number;
  downloaded = false;

  static async loadAsync(): Promise<Asset> {
    return new Asset();
  }
  static async fromMetadata(): Promise<Asset> {
    return new Asset();
  }
  async downloadAsync(): Promise<Asset> {
    this.downloaded = true;
    return this;
  }
}

// useAssets 返回空数组（而非 undefined），避免解构后 .map 二次崩溃
export const useAssets = (): [Asset[], null] => [[], null];

export default Asset;
