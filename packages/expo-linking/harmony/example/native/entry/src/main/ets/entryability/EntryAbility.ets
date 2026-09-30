import { AbilityConstant, Want } from '@kit.AbilityKit';
import { RNAbility } from '@rnoh/react-native-openharmony';
import { ExpoLinkingLifecycle } from '../expo_linking/ExpoLinkingLifecycle';

export default class EntryAbility extends RNAbility {
  private readonly linkingLifecycle = new ExpoLinkingLifecycle();

  onCreate(want: Want, launchParam?: AbilityConstant.LaunchParam): void {
    this.linkingLifecycle.onCreate(want);
    AppStorage.setOrCreate('LaneBLinkingLifecycle', this.linkingLifecycle);
    super.onCreate(want, launchParam);
  }

  onNewWant(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    this.linkingLifecycle.onNewWant(want);
    super.onNewWant(want, launchParam);
  }

  getPagePath(): string { return 'pages/Index'; }

  onDestroy(): void {
    this.linkingLifecycle.onDestroy();
    AppStorage.delete('LaneBLinkingLifecycle');
    super.onDestroy();
  }
}
