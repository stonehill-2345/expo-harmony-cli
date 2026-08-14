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

  // 返回空数组对齐真实 API（真实 loadAsync 返回 Asset[]），避免业务
  // `const [a] = await Asset.loadAsync(1)` 解构时 Asset 不可迭代而崩。
  static async loadAsync(): Promise<Asset[]> {
    return [];
  }
  static async fromMetadata(): Promise<Asset[]> {
    return [];
  }
  async downloadAsync(): Promise<Asset> {
    this.downloaded = true;
    return this;
  }
}

// useAssets 返回 [空数组, false]（loading 位 false 对齐真实 boolean），避免解构后 .map 二次崩溃
export const useAssets = (): [Asset[], boolean] => [[], false];

export default Asset;
