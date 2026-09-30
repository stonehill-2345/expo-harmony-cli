import type { UITurboModule, UITurboModuleContext } from '@rnoh/react-native-openharmony';
import { RNOHPackage } from '@rnoh/react-native-openharmony';

import { ExponentConstantsTurboModule } from './ExponentConstantsTurboModule';

export class ExponentConstantsPackage extends RNOHPackage {
  public override getUITurboModuleFactoryByNameMap(): Map<
    string,
    (ctx: UITurboModuleContext) => UITurboModule | null
  > {
    return new Map<string, (ctx: UITurboModuleContext) => UITurboModule>().set(
      ExponentConstantsTurboModule.NAME,
      (ctx) => new ExponentConstantsTurboModule(ctx)
    );
  }

  public override getDebugName(): string {
    return 'expo-constants';
  }
}
