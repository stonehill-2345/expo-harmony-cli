import { RNPackageContext, RNOHPackage } from '@rnoh/react-native-openharmony';
import { ExpoLinkingLifecycle } from './expo_linking/ExpoLinkingLifecycle';
import { ExpoLinkingPackage } from './expo_linking/ExpoLinkingPackage';

export function createRNPackages(ctx: RNPackageContext): RNOHPackage[] {
  const lifecycle = AppStorage.get<ExpoLinkingLifecycle>('LaneBLinkingLifecycle');
  if (!lifecycle) throw new Error('EntryAbility must initialize ExpoLinkingLifecycle');
  return [new ExpoLinkingPackage(ctx, lifecycle)];
}
