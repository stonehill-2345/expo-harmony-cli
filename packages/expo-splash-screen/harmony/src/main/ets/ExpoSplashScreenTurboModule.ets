import { UITurboModule } from '@rnoh/react-native-openharmony';
import type { UITurboModuleContext } from '@rnoh/react-native-openharmony';
import {
  ExpoSplashScreenController,
  ExpoSplashScreenOptions,
} from './ExpoSplashScreenController';

export class ExpoSplashScreenTurboModule extends UITurboModule {
  public static readonly NAME = 'ExpoSplashScreen';

  private readonly controller: ExpoSplashScreenController;
  private readonly runtime: number;
  private readonly unsubscribeReload: () => void;
  private destroyed = false;

  public constructor(
    ctx: UITurboModuleContext,
    controller: ExpoSplashScreenController,
    runtime: number,
  ) {
    super(ctx);
    this.controller = controller;
    this.runtime = runtime;
    this.unsubscribeReload = this.ctx.devToolsController.eventEmitter.subscribe('RELOAD', () => {
      if (!this.destroyed) this.controller.beginRuntime();
    });
  }

  public setOptions(options: ExpoSplashScreenOptions): void {
    this.assertActive();
    this.controller.setOptions(this.runtime, options);
  }

  public hide(): void {
    this.assertActive();
    this.controller.hide(this.runtime);
  }

  public async hideAsync(): Promise<void> {
    this.assertActive();
    await this.controller.hideAsync(this.runtime);
  }

  public async preventAutoHideAsync(): Promise<boolean> {
    this.assertActive();
    return this.controller.preventAutoHideAsync(this.runtime);
  }

  public async internalPreventAutoHideAsync(): Promise<boolean> {
    this.assertActive();
    return this.controller.internalPreventAutoHideAsync(this.runtime);
  }

  public async internalMaybeHideAsync(): Promise<void> {
    this.assertActive();
    await this.controller.internalMaybeHideAsync(this.runtime);
  }

  public override __onDestroy__(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribeReload();
    super.__onDestroy__();
  }

  private assertActive(): void {
    if (this.destroyed) throw new Error('ExpoSplashScreen module was destroyed');
  }
}
