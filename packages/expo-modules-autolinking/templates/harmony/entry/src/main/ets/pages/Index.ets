import {
  MetroJSBundleProvider,
  ResourceJSBundleProvider,
  RNApp,
  RNOHCoreContext,
} from '@rnoh/react-native-openharmony';
import { getExpoModulesPackages } from '../generated/ExpoModulesPackages';
import { ExpoModulesAppOverlays } from '../generated/ExpoModulesAppOverlays';

@Entry
@Component
struct Index {
  @StorageLink('RNOHCoreContext') private ctx: RNOHCoreContext | undefined = undefined;

  build() {
    Stack() {
      if (this.ctx) {
        RNApp({
          rnInstanceConfig: {
            name: '__EXPO_APP_NAME__',
            createRNPackages: getExpoModulesPackages,
            fontResourceByFontFamily: {},
            enableDebugger: this.ctx.isDebugModeEnabled,
          },
          appKey: 'main',
          jsBundleProvider: this.ctx.isDebugModeEnabled
            ? new MetroJSBundleProvider(
                'http://127.0.0.1:8081/index.bundle?platform=harmony&dev=true&minify=false',
                ['main']
              )
            : new ResourceJSBundleProvider(
                this.ctx.uiAbilityContext.resourceManager,
                'bundle.harmony.js'
              ),
        });
        ExpoModulesAppOverlays();
      }
    }
    .width('100%')
    .height('100%');
  }
}
