import { Want } from '@kit.AbilityKit';
import { RNOHMarker, RNOHMarkerId } from '@rnoh/react-native-openharmony';
import type { RNOHMarkerListener } from '@rnoh/react-native-openharmony';
import { ExpoSplashScreenController } from './ExpoSplashScreenController';

export class ExpoSplashScreenLifecycle
  extends ExpoSplashScreenController
  implements RNOHMarkerListener {
  private markerRegistered = false;
  private contentAppearedRuntime = 0;
  private javaScriptBundleFinished = false;

  public override beginRuntime(): number {
    this.contentAppearedRuntime = 0;
    this.javaScriptBundleFinished = false;
    return super.beginRuntime();
  }

  public onCreate(_want: Want): void {
    if (this.markerRegistered) return;
    this.markerRegistered = true;
    RNOHMarker.addListener(this);
  }

  public onNewWant(_want: Want): void {}

  public logMarker(markerId: RNOHMarkerId, _tag: string, _timestamp: number): void {
    if (markerId === RNOHMarkerId.RUN_JS_BUNDLE_START) {
      this.javaScriptBundleFinished = false;
      return;
    }
    if (markerId === RNOHMarkerId.RUN_JS_BUNDLE_STOP) {
      this.javaScriptBundleFinished = true;
      this.maybeAutoHide();
      return;
    }
    if (markerId === RNOHMarkerId.CONTENT_APPEARED) {
      this.contentAppearedRuntime = this.getState().runtime;
      this.maybeAutoHide();
    }
  }

  public onDestroy(): void {
    if (this.markerRegistered) {
      this.markerRegistered = false;
      RNOHMarker.removeListener(this);
    }
    this.destroy();
  }

  private maybeAutoHide(): void {
    if (!this.javaScriptBundleFinished || this.contentAppearedRuntime === 0) return;
    const runtime = this.contentAppearedRuntime;
    this.contentAppearedRuntime = 0;
    this.onContentAppeared(runtime);
  }
}
