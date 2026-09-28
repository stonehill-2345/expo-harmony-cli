import { RNOHPackage } from '@rnoh/react-native-openharmony';
import type { RNPackageContext, UITurboModule, UITurboModuleContext } from '@rnoh/react-native-openharmony';
import { ExpoFontLoaderTurboModule } from './ExpoFontLoaderTurboModule';
export class ExpoFontLoaderPackage extends RNOHPackage {
  public override getUITurboModuleFactoryByNameMap(): Map<string, (ctx: UITurboModuleContext) => UITurboModule | null> {
    return new Map<string, (ctx: UITurboModuleContext) => UITurboModule>().set(
      ExpoFontLoaderTurboModule.NAME,
      (ctx: UITurboModuleContext) => new ExpoFontLoaderTurboModule(ctx)
    );
  }
  public override getDebugName(): string { return 'expo-font'; }
}
