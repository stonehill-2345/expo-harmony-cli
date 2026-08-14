import mustache from 'mustache';

const TEMPLATE = `
import {
  AnyJSBundleProvider,
  MetroJSBundleProvider,
  RNApp,
  RNOHErrorDialog,
  ResourceJSBundleProvider,
  RNOHCoreContext
} from '@rnoh/react-native-openharmony';
import { preferences } from '@kit.ArkData';
import { getRNOHPackages } from '../PackageProvider';

function createMetroJSBundleProvider(ctx: RNOHCoreContext): MetroJSBundleProvider {
  const dataPreferences: preferences.Preferences =
    preferences.getPreferencesSync(ctx.uiAbilityContext, { name: 'devSettings' });
  const address: preferences.ValueType = dataPreferences.getSync('devHostAndPortAddress', '');
  const hostAndPort = address.toString() ? address.toString() : 'localhost:8081';
  return new MetroJSBundleProvider(
    'http://' + hostAndPort + '/index.bundle?platform=harmony&dev=true&minify=false',
    ['main'],
  );
}

@Entry
@Component
struct Index {
  @StorageLink('RNOHCoreContext') private rnohCoreContext: RNOHCoreContext | undefined = undefined

  build() {
    Column() {
      if (this.rnohCoreContext) {
        if (this.rnohCoreContext?.isDebugModeEnabled) {
          RNOHErrorDialog({ ctx: this.rnohCoreContext })
        }
        RNApp({
          rnInstanceConfig: {
            name: "{{name}}",
            createRNPackages: getRNOHPackages,
            fontResourceByFontFamily: {},
            enableDebugger: this.rnohCoreContext?.isDebugModeEnabled,
          },
          appKey: "main",
          jsBundleProvider: this.rnohCoreContext?.isDebugModeEnabled ?
            new AnyJSBundleProvider([
              createMetroJSBundleProvider(this.rnohCoreContext),
              new ResourceJSBundleProvider(this.rnohCoreContext.uiAbilityContext.resourceManager, 'bundle.harmony.js'),
            ]) :
            new ResourceJSBundleProvider(this.rnohCoreContext.uiAbilityContext.resourceManager, 'bundle.harmony.js'),
        })
      }
    }
    .height('100%')
    .width('100%')
  }
}
`;

export class EntryIndexTemplate {
  constructor(private name: string) {}

  build(): string {
    return mustache.render(TEMPLATE.trimStart(), {
      name: this.name,
    });
  }
}
