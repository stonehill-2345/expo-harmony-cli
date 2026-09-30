import type { RNPackageContext, RNPackage } from '@rnoh/react-native-openharmony';
import { ExpoModulesCorePackage } from './ExpoModulesCorePackage';
import { ExpoCoreInteropProbePackage } from './ExpoCoreInteropProbePackage';
export function getRNOHPackages(ctx: RNPackageContext): RNPackage[] {
  return [new ExpoModulesCorePackage(ctx), new ExpoCoreInteropProbePackage(ctx)];
}
