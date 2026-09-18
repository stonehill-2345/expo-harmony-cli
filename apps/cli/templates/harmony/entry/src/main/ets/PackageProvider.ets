import type { RNPackage, RNPackageContext } from '@rnoh/react-native-openharmony';
import { createRNOHPackages as createRNOHPackagesAutolinking } from "./RNOHPackagesFactory"

// 本文件归你管理：CLI 的 sync/install/uninstall 不会覆盖它。
// 如需注册自定义 Package，直接在下方数组中追加，例如：
//   import { MyCustomPackage } from '../MyCustomPackage';
//   ...createRNOHPackagesAutolinking(ctx),
//   new MyCustomPackage(ctx),
export function getRNOHPackages(ctx: RNPackageContext): RNPackage[] {
  return [
    ...createRNOHPackagesAutolinking(ctx)
  ]
}
