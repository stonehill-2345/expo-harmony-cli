import type { RNPackageContext, RNPackage } from '@rnoh/react-native-openharmony';
import { ExpoModulesCorePackage } from './ExpoModulesCorePackage';
import { ExpoCoreInteropProbePackage } from './ExpoCoreInteropProbePackage';
import { ExponentConstantsPackage } from './constants/ExponentConstantsPackage';
import { ExpoAssetPackage } from './asset/ExpoAssetPackage';
import { ExpoSystemUIPackage } from './system-ui/ExpoSystemUIPackage';
import { LaneBConstantsOraclePackage } from './constants-oracle/LaneBConstantsOracle';
import { LaneBAssetOraclePackage } from './asset-oracle/LaneBAssetOraclePackage';
export function getRNOHPackages(ctx: RNPackageContext): RNPackage[] {
  return [new ExpoModulesCorePackage(ctx), new ExpoCoreInteropProbePackage(ctx),
    new ExponentConstantsPackage(ctx), new ExpoAssetPackage(ctx), new ExpoSystemUIPackage(ctx),
    new LaneBConstantsOraclePackage(ctx), new LaneBAssetOraclePackage(ctx)];
}
