import { AbilityConstant, Want } from '@kit.AbilityKit';
import { RNAbility } from '@rnoh/react-native-openharmony';
import { ExpoModulesLifecycle } from '../generated/ExpoModulesLifecycle';

export default class EntryAbility extends RNAbility {
  private readonly expoModulesLifecycle = new ExpoModulesLifecycle();

  override onCreate(want: Want, launchParam?: AbilityConstant.LaunchParam): void {
    this.expoModulesLifecycle.onCreate(want);
    super.onCreate(want, launchParam);
  }

  override onNewWant(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    this.expoModulesLifecycle.onNewWant(want);
    super.onNewWant(want, launchParam);
  }

  override getPagePath(): string {
    return 'pages/Index';
  }

  override onDestroy(): void {
    this.expoModulesLifecycle.onDestroy();
    super.onDestroy();
  }
}
