import type { UITurboModuleContext } from '@rnoh/react-native-openharmony';
import { UITurboModule } from '@rnoh/react-native-openharmony';
import window from '@ohos.window';

interface StatusBarSnapshot {
  statusBarColor: string;
  statusBarContentColor: string;
  isStatusBarLightIcon: boolean;
  visibleTopHeight: number;
  fullTopHeight: number;
  isLayoutFullScreen: boolean;
}
export class StatusBarOracleTurboModule extends UITurboModule {
  public static readonly NAME = 'StatusBarOracle';
  public constructor(ctx: UITurboModuleContext) { super(ctx); }
  public getSnapshot(): StatusBarSnapshot {
    const main = this.ctx.uiAbilityContext.windowStage.getMainWindowSync();
    const bars = main.getWindowSystemBarProperties();
    const visible = main.getWindowAvoidArea(window.AvoidAreaType.TYPE_SYSTEM).topRect.height;
    const full = main.getWindowAvoidAreaIgnoringVisibility(window.AvoidAreaType.TYPE_SYSTEM).topRect.height;
    return {
      statusBarColor: bars.statusBarColor ?? '',
      statusBarContentColor: bars.statusBarContentColor ?? '',
      isStatusBarLightIcon: bars.isStatusBarLightIcon === true,
      visibleTopHeight: visible,
      fullTopHeight: full,
      isLayoutFullScreen: main.getWindowProperties().isLayoutFullScreen,
    };
  }
}
