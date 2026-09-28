import type { UITurboModuleContext } from '@rnoh/react-native-openharmony';
import { UITurboModule } from '@rnoh/react-native-openharmony';
import type { BusinessError } from '@ohos.base';
import bundleManager from '@ohos.bundle.bundleManager';
import deviceInfo from '@ohos.deviceInfo';
import font from '@ohos.font';
import util from '@ohos.util';
import webview from '@ohos.web.webview';
import window from '@ohos.window';

import { buildConstants, parseAppConfig } from './ConstantsData';

const APP_CONFIG_RAW_FILE = 'app.config';
const RAW_FILE_NOT_FOUND = 9001005;

declare function px2vp(value: number): number;

export class ExponentConstantsTurboModule extends UITurboModule {
  public static readonly NAME = 'ExponentConstants';

  private readonly sessionId = util.generateRandomUUID();

  public constructor(ctx: UITurboModuleContext) {
    super(ctx);
  }

  public getConstants(): Object {
    const bundleInfo = bundleManager.getBundleInfoForSelfSync(
      bundleManager.BundleFlag.GET_BUNDLE_INFO_WITH_APPLICATION
    );

    return buildConstants({
      sessionId: this.sessionId,
      manifest: this.readManifest(),
      deviceName: deviceInfo.productModel,
      systemVersion: deviceInfo.osFullName,
      statusBarHeight: this.readStatusBarHeight(),
      systemFonts: this.readSystemFonts(),
      debugMode: this.ctx.isDebugModeEnabled === true,
      launchUri: this.ctx.launchUri,
      versionCode: bundleInfo.versionCode,
      versionName: bundleInfo.versionName,
    });
  }

  public async getWebViewUserAgentAsync(): Promise<string | null> {
    webview.WebviewController.initializeWebEngine();
    return webview.WebviewController.getDefaultUserAgent();
  }

  private readManifest() {
    try {
      const bytes = this.ctx.uiAbilityContext.resourceManager.getRawFileContentSync(
        APP_CONFIG_RAW_FILE
      );
      const rawConfig = util.TextDecoder.create('utf-8', { fatal: true }).decode(bytes);
      return parseAppConfig(rawConfig);
    } catch (error) {
      if ((error as BusinessError).code === RAW_FILE_NOT_FOUND) {
        return null;
      }
      throw new Error(`Failed to read embedded app.config: ${String(error)}`);
    }
  }

  private readStatusBarHeight(): number {
    const mainWindow = this.ctx.uiAbilityContext.windowStage.getMainWindowSync();
    const avoidArea = mainWindow.getWindowAvoidArea(window.AvoidAreaType.TYPE_SYSTEM);
    return px2vp(avoidArea.topRect.height);
  }

  private readSystemFonts(): string[] {
    const systemFonts = font.getSystemFontList();
    if (systemFonts.length > 0) {
      return systemFonts;
    }

    const configuredFonts = new Set<string>();
    const fontConfig = font.getUIFontConfig();
    fontConfig.generic.forEach((genericInfo) => {
      configuredFonts.add(genericInfo.family);
      genericInfo.alias.forEach((aliasInfo) => configuredFonts.add(aliasInfo.name));
    });
    fontConfig.fallbackGroups.forEach((fallbackGroup) => {
      if (fallbackGroup.fontSetName.length > 0) {
        configuredFonts.add(fallbackGroup.fontSetName);
      }
      fallbackGroup.fallback.forEach((fallbackInfo) => configuredFonts.add(fallbackInfo.family));
    });

    const result = Array.from(configuredFonts).filter((name) => name.length > 0).sort();
    if (result.length === 0) {
      throw new Error('Harmony returned no configured system fonts');
    }
    return result;
  }
}
