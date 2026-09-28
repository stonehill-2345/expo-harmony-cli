import { AbilityConstant, Want } from '@kit.AbilityKit';
import { RNAbility } from '@rnoh/react-native-openharmony';
import { ExpoLinkingLifecycle } from '../linking/ExpoLinkingLifecycle';

// This test host has one Ability. Its state survives RN reload, not Ability destroy.
export default class EntryAbility extends RNAbility {
  private readonly linkingLifecycle = new ExpoLinkingLifecycle();
  override onCreate(want: Want, launchParam?: AbilityConstant.LaunchParam): void {
    this.linkingLifecycle.onCreate(want);
    AppStorage.setOrCreate('I0LinkingLifecycle', this.linkingLifecycle);
    super.onCreate(want, launchParam);
  }
  override onNewWant(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    this.linkingLifecycle.onNewWant(want);
    super.onNewWant(want, launchParam);
  }
  override getPagePath(): string { return 'pages/Index'; }
  override onDestroy(): void {
    this.linkingLifecycle.onDestroy();
    AppStorage.delete('I0LinkingLifecycle');
    super.onDestroy();
  }
}
