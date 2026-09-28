import { RNOHPackage } from '@rnoh/react-native-openharmony';
import type { RNPackageContext, UITurboModule, UITurboModuleContext } from '@rnoh/react-native-openharmony';
import { ExpoLinkingLifecycle } from './ExpoLinkingLifecycle';
import { ExpoLinkingTurboModule } from './ExpoLinkingTurboModule';

export class ExpoLinkingPackage extends RNOHPackage {
  private readonly lifecycle: ExpoLinkingLifecycle;

  public constructor(ctx: RNPackageContext, lifecycle: ExpoLinkingLifecycle) {
    super(ctx);
    this.lifecycle = lifecycle;
  }

  public override getUITurboModuleFactoryByNameMap(): Map<string, (ctx: UITurboModuleContext) => UITurboModule | null> {
    return new Map<string, (ctx: UITurboModuleContext) => UITurboModule>().set(
      ExpoLinkingTurboModule.NAME,
      (ctx: UITurboModuleContext) => new ExpoLinkingTurboModule(ctx, this.lifecycle)
    );
  }

  public override getDebugName(): string { return 'expo-linking'; }
}
