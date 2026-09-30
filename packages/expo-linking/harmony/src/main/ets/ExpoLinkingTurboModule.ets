import { UITurboModule } from '@rnoh/react-native-openharmony';
import type { UITurboModuleContext } from '@rnoh/react-native-openharmony';
import { ExpoLinkingLifecycle } from './ExpoLinkingLifecycle';

interface URLEvent { url: string; }

export class ExpoLinkingTurboModule extends UITurboModule {
  public static readonly NAME = 'ExpoLinking';
  private readonly unsubscribe: () => void;
  private destroyed = false;

  private readonly lifecycle: ExpoLinkingLifecycle;

  public constructor(ctx: UITurboModuleContext, lifecycle: ExpoLinkingLifecycle) {
    super(ctx);
    this.lifecycle = lifecycle;
    this.unsubscribe = lifecycle.subscribe((url: string) => {
      const event: URLEvent = { url };
      this.ctx.rnInstance.postMessageToCpp('ExpoLinking:onURLReceived', event);
    });
  }

  public getLinkingURL(): string | null {
    if (this.destroyed) throw new Error('ExpoLinking module was destroyed');
    return this.lifecycle.getLinkingURL();
  }

  public override __onDestroy__(): void {
    this.destroyed = true;
    this.unsubscribe();
    super.__onDestroy__();
  }
}
