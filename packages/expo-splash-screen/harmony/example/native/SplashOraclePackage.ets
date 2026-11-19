import { RNOHPackage, UITurboModule } from '@rnoh/react-native-openharmony';
import type { UITurboModuleContext } from '@rnoh/react-native-openharmony';
import { ExpoSplashScreenLifecycle } from './splash/ExpoSplashScreenLifecycle';
interface SplashSnapshot { runtime: number; visible: boolean; fade: boolean; duration: number; scenario: string; }
class SplashOracle extends UITurboModule {
  public getSnapshot(): SplashSnapshot {
    const controller = AppStorage.get<ExpoSplashScreenLifecycle>('A04Splash');
    if (!controller) throw new Error('Missing A04 Splash lifecycle');
    const state = controller.getState();
    return { runtime: state.runtime, visible: state.visible, fade: state.options.fade,
      duration: state.options.duration, scenario: AppStorage.get<string>('A04Scenario') ?? 'user' };
  }
}
export class SplashOraclePackage extends RNOHPackage {
  public override getUITurboModuleFactoryByNameMap(): Map<string, (ctx: UITurboModuleContext) => UITurboModule | null> {
    return new Map<string, (ctx: UITurboModuleContext) => UITurboModule>().set('SplashOracle', ctx => new SplashOracle(ctx));
  }
}
