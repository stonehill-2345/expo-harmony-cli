import { RNOHPackage } from '@rnoh/react-native-openharmony';
import type { RNPackageContext, UITurboModule, UITurboModuleContext } from '@rnoh/react-native-openharmony';
import { ExpoWebBrowserController } from './ExpoWebBrowserController';
import { ExpoWebBrowserTurboModule } from './ExpoWebBrowserTurboModule';

export class ExpoWebBrowserPackage extends RNOHPackage {
  private readonly controller: ExpoWebBrowserController;
  private readonly runtime: number;

  public constructor(ctx: RNPackageContext, controller: ExpoWebBrowserController) {
    super(ctx);
    this.controller = controller;
    this.runtime = controller.beginRuntime();
  }

  public override getUITurboModuleFactoryByNameMap(): Map<string, (ctx: UITurboModuleContext) => UITurboModule | null> {
    return new Map<string, (ctx: UITurboModuleContext) => UITurboModule>().set(
      ExpoWebBrowserTurboModule.NAME,
      (ctx: UITurboModuleContext) => new ExpoWebBrowserTurboModule(ctx, this.controller, this.runtime),
    );
  }

  public override getDebugName(): string {
    return 'expo-web-browser';
  }
}
