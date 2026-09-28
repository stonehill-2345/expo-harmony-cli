import { Want } from '@kit.AbilityKit';
import { RNOHMarker, RNOHMarkerId } from '@rnoh/react-native-openharmony';
import type { RNOHMarkerListener } from '@rnoh/react-native-openharmony';
import { ExpoSplashScreenController } from './ExpoSplashScreenController';

export class ExpoSplashScreenLifecycle
  extends ExpoSplashScreenController
  implements RNOHMarkerListener {
  private markerRegistered = false;

  public onCreate(_want: Want): void {
    if (this.markerRegistered) return;
    this.markerRegistered = true;
    RNOHMarker.addListener(this);
  }

  public onNewWant(_want: Want): void {}

  public logMarker(markerId: RNOHMarkerId, _tag: string, _timestamp: number): void {
    if (markerId !== RNOHMarkerId.CONTENT_APPEARED) return;
    const runtime = this.getState().runtime;
    if (runtime !== 0) this.onContentAppeared(runtime);
  }

  public onDestroy(): void {
    if (this.markerRegistered) {
      this.markerRegistered = false;
      RNOHMarker.removeListener(this);
    }
    this.destroy();
  }
}
