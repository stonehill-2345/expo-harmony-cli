import type {
  RNPackageContext,
  UITurboModule,
  UITurboModuleContext,
} from '@rnoh/react-native-openharmony';
import { RNOHPackage } from '@rnoh/react-native-openharmony';
import { ExpoSystemUITurboModule } from './ExpoSystemUITurboModule';

export class ExpoSystemUIPackage extends RNOHPackage {
  public override getUITurboModuleFactoryByNameMap(): Map<
    string,
    (ctx: UITurboModuleContext) => UITurboModule | null
  > {
    return new Map<string, (ctx: UITurboModuleContext) => UITurboModule>().set(
      ExpoSystemUITurboModule.NAME,
      (ctx: UITurboModuleContext) => new ExpoSystemUITurboModule(ctx),
    );
  }

  public override getDebugName(): string {
    return 'expo-system-ui';
  }
}
