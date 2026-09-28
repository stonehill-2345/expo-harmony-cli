// Diagnostic only: executes the unchanged B implementation and records lifetime.
// Not used by the standard acceptance package list.
import { RNOHPackage, AnyThreadTurboModule, AnyThreadTurboModuleContext } from '@rnoh/react-native-openharmony';
import { ExpoAssetTurboModule } from './asset/ExpoAssetTurboModule';

class ObservedAsset extends ExpoAssetTurboModule {
  private diagnosticDestroyed = false;
  public override async downloadAsync(url: string, hash: string | null, type: string): Promise<string> {
    try {
      return await super.downloadAsync(url, hash, type);
    } finally {
      if (url.includes('/slow?')) {
        console.info(`I0_ASSET_NATIVE_SETTLED time=${Date.now()} destroyed=${this.diagnosticDestroyed} url=${url}`);
      }
    }
  }
  public override __onDestroy__(): void {
    this.diagnosticDestroyed = true;
    console.info(`I0_ASSET_NATIVE_DESTROY_BEGIN time=${Date.now()}`);
    super.__onDestroy__();
    console.info(`I0_ASSET_NATIVE_DESTROY_END time=${Date.now()}`);
  }
}
export class ObservedAssetPackage extends RNOHPackage {
  public override getAnyThreadTurboModuleFactoryByNameMap(): Map<string, (ctx: AnyThreadTurboModuleContext) => AnyThreadTurboModule | null> {
    return new Map<string, (ctx: AnyThreadTurboModuleContext) => AnyThreadTurboModule>().set(
      ExpoAssetTurboModule.NAME, (ctx) => new ObservedAsset(ctx));
  }
}
