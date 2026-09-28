import { RNApp, ResourceJSBundleProvider, RNOHCoreContext } from '@rnoh/react-native-openharmony';
import { getRNOHPackages } from '../PackageProvider';

@Entry
@Component
struct Index {
  @StorageLink('RNOHCoreContext') private ctx: RNOHCoreContext | undefined = undefined;

  build() {
    Column() {
      if (this.ctx) {
        RNApp({
          rnInstanceConfig: {
            name: 'ExpoCoreTest',
            createRNPackages: getRNOHPackages,
            fontResourceByFontFamily: {},
            enableDebugger: false,
          },
          appKey: 'main',
          jsBundleProvider: new ResourceJSBundleProvider(this.ctx.uiAbilityContext.resourceManager, 'bundle.harmony.js'),
        })
      }
    }.width('100%').height('100%')
  }
}
