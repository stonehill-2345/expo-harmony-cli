import { RNAbility, RNOHMarkerId } from '@rnoh/react-native-openharmony';
import { Want, AbilityConstant } from '@kit.AbilityKit';
import { ExpoSplashScreenLifecycle } from '../splash/ExpoSplashScreenLifecycle';
class TestLifecycle extends ExpoSplashScreenLifecycle {
  public override logMarker(id: RNOHMarkerId, tag: string, timestamp: number): void {
    if (id === RNOHMarkerId.CONTENT_APPEARED) console.info('A04_SPLASH_NATIVE=' + JSON.stringify({ kind: 'content', runtime: this.getState().runtime, tag }));
    if (id === RNOHMarkerId.RUN_JS_BUNDLE_STOP) console.info('A04_SPLASH_NATIVE=' + JSON.stringify({ kind: 'bundle-stop', runtime: this.getState().runtime, tag }));
    super.logMarker(id, tag, timestamp);
  }
}
export default class EntryAbility extends RNAbility {
  private readonly splash = new TestLifecycle();
  override getPagePath() { return 'pages/Index'; }
  override onCreate(want: Want, launchParam?: AbilityConstant.LaunchParam): void {
    const scenario = want.parameters?.scenario;
    AppStorage.setOrCreate('A04Scenario', typeof scenario === 'string' ? scenario : 'user');
    AppStorage.setOrCreate('A04Splash', this.splash);
    this.splash.onCreate(want);
    this.splash.subscribe(state => console.info('A04_SPLASH_NATIVE=' + JSON.stringify({ kind: 'state', runtime: state.runtime, visible: state.visible })));
    super.onCreate(want, launchParam);
  }
  override onDestroy(): void {
    this.splash.onDestroy();
    console.info('A04_SPLASH_NATIVE=' + JSON.stringify({ kind: 'destroy', visible: this.splash.getState().visible }));
    AppStorage.delete('A04Splash'); AppStorage.delete('A04Scenario');
    super.onDestroy();
  }
}
