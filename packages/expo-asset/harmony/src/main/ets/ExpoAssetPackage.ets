import type {
  AnyThreadTurboModule,
  AnyThreadTurboModuleContext,
} from '@rnoh/react-native-openharmony';
import { RNOHPackage } from '@rnoh/react-native-openharmony';

import { ExpoAssetTurboModule } from './ExpoAssetTurboModule';

export class ExpoAssetPackage extends RNOHPackage {
  public override getAnyThreadTurboModuleFactoryByNameMap(): Map<
    string,
    (ctx: AnyThreadTurboModuleContext) => AnyThreadTurboModule | null
  > {
    return new Map<string, (ctx: AnyThreadTurboModuleContext) => AnyThreadTurboModule>().set(
      ExpoAssetTurboModule.NAME,
      (ctx) => new ExpoAssetTurboModule(ctx)
    );
  }

  public override getDebugName(): string {
    return 'expo-asset';
  }
}
