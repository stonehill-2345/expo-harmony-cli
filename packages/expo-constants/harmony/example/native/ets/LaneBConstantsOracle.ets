import { RNOHPackage, UITurboModule } from '@rnoh/react-native-openharmony';
import type { UITurboModuleContext } from '@rnoh/react-native-openharmony';
import bundleManager from '@ohos.bundle.bundleManager';
import deviceInfo from '@ohos.deviceInfo';
import display from '@ohos.display';
import font from '@ohos.font';
import webview from '@ohos.web.webview';
import window from '@ohos.window';

interface AppVersion { versionCode: number; versionName: string; }
interface NativePlatform { harmony: AppVersion; }
interface Snapshot {
  deviceName: string;
  systemVersion: string;
  statusBarPx: number;
  statusBarHeight: number;
  systemFonts: string[];
  debugMode: boolean;
  userAgent: string;
  platform: NativePlatform;
}

// Test-only oracle: queries system APIs without importing production Constants code.
class LaneBConstantsOracle extends UITurboModule {
  public getSnapshot(): Snapshot {
    const app = bundleManager.getBundleInfoForSelfSync(
      bundleManager.BundleFlag.GET_BUNDLE_INFO_WITH_APPLICATION
    );
    const mainWindow = this.ctx.uiAbilityContext.windowStage.getMainWindowSync();
    const statusBarPx = mainWindow.getWindowAvoidArea(window.AvoidAreaType.TYPE_SYSTEM).topRect.height;
    const density = display.getDefaultDisplaySync().densityPixels;
    let fonts = font.getSystemFontList();
    if (fonts.length === 0) {
      const config = font.getUIFontConfig();
      const names: string[] = [];
      for (const generic of config.generic) {
        names.push(generic.family);
        for (const alias of generic.alias) names.push(alias.name);
      }
      for (const group of config.fallbackGroups) {
        names.push(group.fontSetName);
        for (const fallback of group.fallback) names.push(fallback.family);
      }
      fonts = Array.from(new Set(names.filter((name: string) => name.length > 0))).sort();
    }
    webview.WebviewController.initializeWebEngine();
    return {
      deviceName: deviceInfo.productModel,
      systemVersion: deviceInfo.osFullName,
      statusBarPx,
      statusBarHeight: statusBarPx / density,
      systemFonts: fonts,
      debugMode: this.ctx.isDebugModeEnabled,
      userAgent: webview.WebviewController.getDefaultUserAgent(),
      platform: { harmony: { versionCode: app.versionCode, versionName: app.versionName } },
    };
  }
}

export class LaneBConstantsOraclePackage extends RNOHPackage {
  public override getUITurboModuleFactoryByNameMap(): Map<string, (ctx: UITurboModuleContext) => UITurboModule | null> {
    return new Map<string, (ctx: UITurboModuleContext) => UITurboModule>().set(
      'LaneBConstantsOracle', (ctx: UITurboModuleContext) => new LaneBConstantsOracle(ctx)
    );
  }
}
