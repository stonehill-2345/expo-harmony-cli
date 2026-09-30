import { RNOHPackage } from '@rnoh/react-native-openharmony';
import type {
  RNPackageContext,
  UITurboModule,
  UITurboModuleContext,
} from '@rnoh/react-native-openharmony';
import { ExpoSplashScreenController } from './ExpoSplashScreenController';
import { ExpoSplashScreenTurboModule } from './ExpoSplashScreenTurboModule';

export class ExpoSplashScreenPackage extends RNOHPackage {
  private readonly controller: ExpoSplashScreenController;
  private readonly runtime: number;

  public constructor(ctx: RNPackageContext, controller: ExpoSplashScreenController) {
    super(ctx);
    this.controller = controller;
    this.runtime = controller.beginRuntime();
  }

  public override getUITurboModuleFactoryByNameMap(): Map<string, (ctx: UITurboModuleContext) => UITurboModule | null> {
    return new Map<string, (ctx: UITurboModuleContext) => UITurboModule>().set(
      ExpoSplashScreenTurboModule.NAME,
      (ctx: UITurboModuleContext) => new ExpoSplashScreenTurboModule(ctx, this.controller, this.runtime),
    );
  }

  public override getDebugName(): string {
    return 'expo-splash-screen';
  }
}
