import { UITurboModule } from '@rnoh/react-native-openharmony';
import type { UITurboModuleContext } from '@rnoh/react-native-openharmony';
import { ExpoWebBrowserController, ExpoWebBrowserOptions, ExpoWebBrowserResult } from './ExpoWebBrowserController';

export class ExpoWebBrowserTurboModule extends UITurboModule {
  public static readonly NAME = 'ExpoWebBrowser';
  private readonly controller: ExpoWebBrowserController;
  private readonly runtime: number;
  private readonly unsubscribeReload: () => void;
  private destroyed = false;

  public constructor(ctx: UITurboModuleContext, controller: ExpoWebBrowserController, runtime: number) {
    super(ctx);
    this.controller = controller;
    this.runtime = runtime;
    this.unsubscribeReload = ctx.devToolsController.eventEmitter.subscribe('RELOAD', () => {
      this.controller.endRuntime(this.runtime);
    });
  }

  public async openBrowserAsync(url: string, options: ExpoWebBrowserOptions): Promise<ExpoWebBrowserResult> {
    return this.controller.open(this.runtime, url, options, false);
  }

  public async dismissBrowser(): Promise<ExpoWebBrowserResult> {
    return this.controller.dismiss(this.runtime);
  }

  public async openAuthSessionAsync(url: string, redirectUrl: string | null, options: ExpoWebBrowserOptions): Promise<ExpoWebBrowserResult> {
    return this.controller.open(this.runtime, url, options, true, redirectUrl);
  }

  public dismissAuthSession(): void {
    this.controller.dismiss(this.runtime, true);
  }

  public override __onDestroy__(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribeReload();
    this.controller.endRuntime(this.runtime);
    super.__onDestroy__();
  }
}
