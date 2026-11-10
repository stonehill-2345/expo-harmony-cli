import { RNApp, ResourceJSBundleProvider, RNOHCoreContext } from '@rnoh/react-native-openharmony';
import { getRNOHPackages } from '../PackageProvider';
import { ExpoSplashScreenLifecycle } from '../splash/ExpoSplashScreenLifecycle';
import { ExpoSplashScreenView } from '../splash/ExpoSplashScreenView';
@Entry
@Component
struct Index {
  @StorageLink('RNOHCoreContext') private ctx: RNOHCoreContext | undefined = undefined;
  @StorageLink('A04Splash') private splash: ExpoSplashScreenLifecycle | undefined = undefined;
  @Builder
  private content() {
    Column() { Text('A04 native splash').fontSize(32).fontColor('#ffffff') }
      .justifyContent(FlexAlign.Center).width('100%').height('100%').backgroundColor('#e06020')
  }
  build() {
    Stack() {
      if (this.ctx && this.splash) {
        RNApp({
          rnInstanceConfig: { name: 'ExpoCoreTest', createRNPackages: getRNOHPackages, fontResourceByFontFamily: {}, enableDebugger: false },
          appKey: 'main', jsBundleProvider: new ResourceJSBundleProvider(this.ctx.uiAbilityContext.resourceManager, 'bundle.harmony.js'),
        })
        ExpoSplashScreenView({ controller: this.splash, splashContent: this.content })
      }
    }.width('100%').height('100%')
  }
}
