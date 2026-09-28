import { Want } from '@kit.AbilityKit';
import { ExpoWebBrowserController } from './ExpoWebBrowserController';

export class ExpoWebBrowserLifecycle extends ExpoWebBrowserController {
  public onCreate(_want: Want): void {}
  public onNewWant(_want: Want): void {}
  public onDestroy(): void {
    this.destroy();
  }
}
