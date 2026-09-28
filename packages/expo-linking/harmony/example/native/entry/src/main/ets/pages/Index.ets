import { ComponentBuilderContext, ResourceJSBundleProvider, RNApp, RNOHCoreContext } from '@rnoh/react-native-openharmony';
import { createRNPackages } from '../RNOHPackagesFactory';

@Builder
function buildCustomRNComponent(ctx: ComponentBuilderContext) {}
const customBuilder = wrapBuilder(buildCustomRNComponent);

@Entry
@Component
struct Index {
  @StorageLink('RNOHCoreContext') private core: RNOHCoreContext | undefined = undefined;

  onBackPress(): boolean {
    this.core?.dispatchBackPress();
    return true;
  }

  build() {
    Column() {
      if (this.core) {
        RNApp({
          rnInstanceConfig: {
            createRNPackages,
            enableNDKTextMeasuring: true,
            enableBackgroundExecutor: false,
            enableCAPIArchitecture: true,
            arkTsComponentNames: []
          },
          appKey: 'LaneBLinking',
          wrappedCustomRNComponentBuilder: customBuilder,
          onSetUp: (instance) => { instance.enableFeatureFlag('ENABLE_RN_INSTANCE_CLEAN_UP'); },
          jsBundleProvider: new ResourceJSBundleProvider(this.core.uiAbilityContext.resourceManager, 'bundle.harmony.js')
        })
      }
    }.width('100%').height('100%')
  }
}
