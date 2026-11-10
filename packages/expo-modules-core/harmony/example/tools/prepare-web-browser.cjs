const fs = require('node:fs');
const path = require('node:path');

module.exports = function prepareWebBrowser(sdk, root) {
  const main = path.join(root, 'harmony/entry/src/main');
  const browser = path.join(sdk, 'packages/expo-web-browser');
  fs.cpSync(path.join(browser, 'harmony/src/main/ets'), path.join(main, 'ets/web-browser'), {
    recursive: true,
  });
  fs.copyFileSync(
    path.join(browser, 'harmony/example/WebBrowserApp.tsx'),
    path.join(root, 'WebBrowserApp.tsx')
  );

  const entry = path.join(root, 'expo-entry.ts');
  fs.writeFileSync(entry, fs.readFileSync(entry, 'utf8').replace("from './I0App'", "from './WebBrowserApp'"));

  fs.writeFileSync(
    path.join(main, 'ets/entryability/EntryAbility.ets'),
    `import { AbilityConstant, Want } from '@kit.AbilityKit';
import { RNAbility } from '@rnoh/react-native-openharmony';
import { ExpoWebBrowserLifecycle } from '../web-browser/ExpoWebBrowserLifecycle';

export default class EntryAbility extends RNAbility {
  private readonly webBrowserController = new ExpoWebBrowserLifecycle();

  override onCreate(want: Want, launchParam?: AbilityConstant.LaunchParam): void {
    this.webBrowserController.onCreate(want);
    AppStorage.setOrCreate('ExpoWebBrowserController', this.webBrowserController);
    super.onCreate(want, launchParam);
  }

  override onNewWant(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    this.webBrowserController.onNewWant(want);
    super.onNewWant(want, launchParam);
  }

  override getPagePath(): string { return 'pages/Index'; }

  override onDestroy(): void {
    this.webBrowserController.onDestroy();
    AppStorage.delete('ExpoWebBrowserController');
    super.onDestroy();
  }
}
`
  );

  const pagePath = path.join(main, 'ets/pages/Index.ets');
  let page = fs.readFileSync(pagePath, 'utf8');
  page = page.replace(
    "import { getRNOHPackages } from '../PackageProvider';",
    "import { getRNOHPackages } from '../PackageProvider';\nimport { ExpoWebBrowserLifecycle } from '../web-browser/ExpoWebBrowserLifecycle';\nimport { ExpoWebBrowserView } from '../web-browser/ExpoWebBrowserView';"
  );
  page = page.replace(
    "  @StorageLink('RNOHCoreContext') private ctx: RNOHCoreContext | undefined = undefined;",
    "  @StorageLink('RNOHCoreContext') private ctx: RNOHCoreContext | undefined = undefined;\n  @StorageLink('ExpoWebBrowserController') private webBrowserController: ExpoWebBrowserLifecycle | undefined = undefined;"
  );
  page = page.replace('    Column() {', '    Stack() {');
  page = page.replace('      if (this.ctx) {', '      if (this.ctx && this.webBrowserController) {');
  page = page.replace(
    '        })\n      }',
    '        })\n        ExpoWebBrowserView({ controller: this.webBrowserController })\n      }'
  );
  if (!page.includes('ExpoWebBrowserView({ controller: this.webBrowserController })')) {
    throw new Error('WebBrowser Index template changed');
  }
  fs.writeFileSync(pagePath, page);

  const etsPath = path.join(main, 'ets/PackageProvider.ets');
  let ets = fs.readFileSync(etsPath, 'utf8');
  ets =
    "import { ExpoWebBrowserController } from './web-browser/ExpoWebBrowserController';\n" +
    "import { ExpoWebBrowserPackage } from './web-browser/ExpoWebBrowserPackage';\n" +
    ets.replace(
      '  return [',
      "  const browser = AppStorage.get<ExpoWebBrowserController>('ExpoWebBrowserController');\n  if (!browser) throw new Error('Owning Ability WebBrowser lifecycle is missing');\n  return [new ExpoWebBrowserPackage(ctx, browser), "
    );
  fs.writeFileSync(etsPath, ets);

  const cppPath = path.join(main, 'cpp/PackageProvider.cpp');
  let cpp = fs.readFileSync(cppPath, 'utf8');
  cpp = cpp.replace(
    '#include "LaneBAssetOraclePackage.h"',
    '#include "LaneBAssetOraclePackage.h"\n#include "ExpoWebBrowserPackage.h"'
  );
  cpp = cpp.replace(
    'std::make_shared<lane_b::asset_oracle::LaneBAssetOraclePackage>(ctx)};',
    'std::make_shared<lane_b::asset_oracle::LaneBAssetOraclePackage>(ctx),\n      std::make_shared<expo::webbrowser::harmony::ExpoWebBrowserPackage>(ctx)};'
  );
  if (!cpp.includes('expo::webbrowser::harmony::ExpoWebBrowserPackage')) {
    throw new Error('WebBrowser C++ PackageProvider template changed');
  }
  fs.writeFileSync(cppPath, cpp);
  fs.appendFileSync(
    path.join(main, 'cpp/CMakeLists.txt'),
    '\nadd_subdirectory("${NODE_MODULES}/expo-web-browser/harmony/src/main/cpp" expo-web-browser)\n' +
      'target_link_libraries(rnoh_app PUBLIC rnoh_expo_web_browser)\n'
  );

  const appPath = path.join(root, 'harmony/AppScope/app.json5');
  const app = JSON.parse(fs.readFileSync(appPath));
  app.app.bundleName = 'dev.expo.harmony.browser';
  fs.writeFileSync(appPath, JSON.stringify(app, null, 2) + '\n');
};
