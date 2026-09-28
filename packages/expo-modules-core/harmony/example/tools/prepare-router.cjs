// A-owned host assembly; route screens remain the B-owned official-entry fixture.
const fs = require('node:fs');
const path = require('node:path');
module.exports = function prepareRouter(sdk, root, pkg, ts) {
  const source = path.join(sdk, 'packages/expo-router/harmony/example');
  const main = path.join(root, 'harmony/entry/src/main');
  const replaceRequired = (content, search, replacement, file) => {
    if (!content.includes(search)) throw new Error(`Router host template changed: ${file}`);
    return content.replace(search, replacement);
  };
  const versions = require('../router/navigation-dependencies.json');
  Object.assign(pkg.dependencies, versions);
  pkg.overrides = { ...pkg.overrides, ...versions };
  pkg.main = 'expo-router/entry';
  fs.cpSync(path.join(source, 'app'), path.join(root, 'app'), { recursive: true });
  fs.copyFileSync(path.join(source, 'app.json'), path.join(root, 'app.json'));
  fs.copyFileSync(
    path.join(__dirname, '../router/RouterProbe.tsx'),
    path.join(root, 'RouterProbe.tsx')
  );
  const layoutPath = path.join(root, 'app/_layout.tsx');
  const layout = fs.readFileSync(layoutPath, 'utf8');
  if (!layout.includes('return <Stack>') || !layout.includes('</Stack>;'))
    throw new Error('Router fixture layout changed; review probe placement');
  fs.writeFileSync(
    layoutPath,
    "import { RouterProbe } from '../RouterProbe';\n" +
      layout
        .replace('return <Stack>', 'return <><RouterProbe /><Stack>')
        .replace('</Stack>;', '</Stack></>;')
  );

  fs.cpSync(
    path.join(sdk, 'packages/expo-splash-screen/harmony/src/main/ets'),
    path.join(main, 'ets/splash'),
    { recursive: true }
  );
  const abilityPath = path.join(main, 'ets/entryability/EntryAbility.ets');
  let ability = fs.readFileSync(abilityPath, 'utf8');
  ability = replaceRequired(
    ability,
    "import { ExpoLinkingLifecycle } from '../linking/ExpoLinkingLifecycle';",
    "import { ExpoLinkingLifecycle } from '../linking/ExpoLinkingLifecycle';\nimport { ExpoSplashScreenController } from '../splash/ExpoSplashScreenController';",
    'EntryAbility import'
  );
  ability = replaceRequired(
    ability,
    '  private readonly linkingLifecycle = new ExpoLinkingLifecycle();',
    '  private readonly linkingLifecycle = new ExpoLinkingLifecycle();\n  private readonly splashScreenController = new ExpoSplashScreenController();',
    'EntryAbility controller'
  );
  ability = replaceRequired(
    ability,
    "    AppStorage.setOrCreate('I0LinkingLifecycle', this.linkingLifecycle);",
    "    AppStorage.setOrCreate('I0LinkingLifecycle', this.linkingLifecycle);\n    AppStorage.setOrCreate('ExpoSplashScreenController', this.splashScreenController);",
    'EntryAbility onCreate'
  );
  ability = replaceRequired(
    ability,
    '    this.linkingLifecycle.onDestroy();',
    '    this.linkingLifecycle.onDestroy();\n    this.splashScreenController.destroy();',
    'EntryAbility destroy controller'
  );
  ability = replaceRequired(
    ability,
    "    AppStorage.delete('I0LinkingLifecycle');",
    "    AppStorage.delete('I0LinkingLifecycle');\n    AppStorage.delete('ExpoSplashScreenController');",
    'EntryAbility delete controller'
  );
  fs.writeFileSync(abilityPath, ability);

  const pagePath = path.join(main, 'ets/pages/Index.ets');
  let page = fs.readFileSync(pagePath, 'utf8');
  page = replaceRequired(
    page,
    "import { getRNOHPackages } from '../PackageProvider';",
    "import { getRNOHPackages } from '../PackageProvider';\nimport { ExpoSplashScreenController } from '../splash/ExpoSplashScreenController';\nimport { ExpoSplashScreenView } from '../splash/ExpoSplashScreenView';",
    'Index imports'
  );
  page = replaceRequired(
    page,
    "  @StorageLink('RNOHCoreContext') private ctx: RNOHCoreContext | undefined = undefined;",
    "  @StorageLink('RNOHCoreContext') private ctx: RNOHCoreContext | undefined = undefined;\n  @StorageLink('ExpoSplashScreenController') private splashScreenController: ExpoSplashScreenController | undefined = undefined;",
    'Index controller'
  );
  page = replaceRequired(page, '    Column() {', '    Stack() {', 'Index root');
  page = replaceRequired(
    page,
    '  build() {',
    `  @Builder
  private splashContent() {
    Column() {
      Image($r('app.media.startIcon'))
        .width(144)
        .height(144)
    }
    .justifyContent(FlexAlign.Center)
    .width('100%')
    .height('100%')
    .backgroundColor($r('app.color.start_window_background'))
  }

  build() {`,
    'Index splash content'
  );
  page = replaceRequired(
    page,
    '      if (this.ctx) {',
    '      if (this.ctx && this.splashScreenController) {',
    'Index guard'
  );
  page = replaceRequired(
    page,
    '        })\n      }',
    `        })
        ExpoSplashScreenView({
          controller: this.splashScreenController,
          splashContent: this.splashContent,
        })
      }`,
    'Index overlay'
  );
  fs.writeFileSync(pagePath, page);

  const cpp = path.join(main, 'cpp/PackageProvider.cpp');
  fs.writeFileSync(
    cpp,
    fs
      .readFileSync(cpp, 'utf8')
      .replace(
        'using namespace rnoh;',
        '#include "ExpoSplashScreenPackage.h"\n#include "ScreensPackage.h"\n#include "SafeAreaViewPackage.h"\n#include "GestureHandlerPackage.h"\n#include "ReanimatedWorkletPackage.h"\n#include "ReanimatedPackage.h"\nusing namespace rnoh;'
      )
      .replace(
        'expo::linking::harmony::ExpoLinkingPackage>(ctx)};',
        'expo::linking::harmony::ExpoLinkingPackage>(ctx),\n      std::make_shared<expo::splashscreen::harmony::ExpoSplashScreenPackage>(ctx),\n      std::make_shared<ScreensPackage>(ctx), std::make_shared<rnoh::SafeAreaViewPackage>(ctx),\n      std::make_shared<GestureHandlerPackage>(ctx), std::make_shared<rnoh::ReanimatedWorkletPackage>(ctx), std::make_shared<rnoh::ReanimatedPackage>(ctx)};'
      )
  );
  fs.appendFileSync(
    path.join(main, 'cpp/CMakeLists.txt'),
    '\n' +
      'add_subdirectory("${NODE_MODULES}/expo-splash-screen/harmony/src/main/cpp" expo-splash-screen)\n' +
      'add_subdirectory("${CMAKE_CURRENT_SOURCE_DIR}/../../../oh_modules/@react-native-ohos/react-native-screens/src/main/cpp" screens)\n' +
      'add_subdirectory("${CMAKE_CURRENT_SOURCE_DIR}/../../../oh_modules/@react-native-ohos/react-native-safe-area-context/src/main/cpp" safe-area)\n' +
      'add_subdirectory("${CMAKE_CURRENT_SOURCE_DIR}/../../../oh_modules/@react-native-ohos/react-native-gesture-handler/src/main/cpp" gesture-handler)\n' +
      'add_subdirectory("${CMAKE_CURRENT_SOURCE_DIR}/../../../oh_modules/@react-native-ohos/react-native-worklets/src/main/cpp" worklets)\n' +
      'add_subdirectory("${CMAKE_CURRENT_SOURCE_DIR}/../../../oh_modules/@react-native-ohos/react-native-reanimated/src/main/cpp" reanimated)\n' +
      'target_link_libraries(rnoh_app PUBLIC rnoh_expo_splash_screen rnoh_screens rnoh_safe_area rnoh_gesture_handler rnoh_worklets rnoh_reanimated)\n'
  );
  const ets = path.join(main, 'ets/PackageProvider.ets');
  fs.writeFileSync(
    ets,
    "import { ExpoSplashScreenPackage } from './splash/ExpoSplashScreenPackage';\n" +
      "import RNOHScreensPackage from '@react-native-ohos/react-native-screens';\n" +
      "import { SafeAreaViewPackage } from '@react-native-ohos/react-native-safe-area-context';\n" +
      "import GestureHandlerPackage from '@react-native-ohos/react-native-gesture-handler';\n" +
      "import { ReanimatedWorkletPackage } from '@react-native-ohos/react-native-worklets';\n" +
      "import { ReanimatedPackage } from '@react-native-ohos/react-native-reanimated';\n" +
      fs
        .readFileSync(ets, 'utf8')
        .replace(
          '  return [',
          '  return [new ExpoSplashScreenPackage(ctx), new RNOHScreensPackage(ctx), new SafeAreaViewPackage(ctx), new GestureHandlerPackage(ctx), new ReanimatedWorkletPackage(ctx), new ReanimatedPackage(ctx), '
        )
  );

  const nativePath = path.join(main, 'module.json5');
  const native = ts.parseConfigFileTextToJson(
    nativePath,
    fs.readFileSync(nativePath, 'utf8')
  ).config;
  const scheme = JSON.parse(fs.readFileSync(path.join(root, 'app.json'))).expo.scheme;
  native.module.querySchemes = [scheme, 'i0missing'];
  native.module.abilities[0].skills = native.module.abilities[0].skills.filter(
    (skill) => !skill.actions?.includes('ohos.want.action.viewData')
  );
  // Permit actual route hosts such as details, rather than only I0's fixture host.
  native.module.abilities[0].skills.push({
    actions: ['ohos.want.action.viewData'],
    entities: ['entity.system.browsable'],
    uris: [{ scheme }],
  });
  fs.writeFileSync(nativePath, JSON.stringify(native, null, 2) + '\n');
  const appPath = path.join(root, 'harmony/AppScope/app.json5');
  const app = JSON.parse(fs.readFileSync(appPath));
  app.app.bundleName = 'dev.expo.harmony.router';
  fs.writeFileSync(appPath, JSON.stringify(app, null, 2) + '\n');

  const ohPath = path.join(root, 'harmony/entry/oh-package.json5');
  const oh = ts.parseConfigFileTextToJson(ohPath, fs.readFileSync(ohPath, 'utf8')).config;
  Object.assign(oh.dependencies, {
    '@react-native-ohos/react-native-screens':
      'file:../../artifacts/screens-4.9.0-content-wrapper-v1.har',
    '@react-native-ohos/react-native-safe-area-context':
      'file:../../node_modules/@react-native-ohos/react-native-safe-area-context/harmony/safe_area.har',
    '@react-native-ohos/react-native-gesture-handler':
      'file:../../node_modules/@react-native-ohos/react-native-gesture-handler/harmony/gesture_handler.har',
    '@react-native-ohos/react-native-worklets':
      'file:../../artifacts/worklets-1.0.0-private-symbols-v2.har',
    '@react-native-ohos/react-native-reanimated':
      'file:../../node_modules/@react-native-ohos/react-native-reanimated/harmony/reanimated.har',
  });
  fs.writeFileSync(ohPath, JSON.stringify(oh, null, 2) + '\n');
  const ohRootPath = path.join(root, 'harmony/oh-package.json5');
  const ohRoot = JSON.parse(fs.readFileSync(ohRootPath));
  // Official OHPM dependency override: all adapters use the one approved SDK HAR.
  ohRoot.overrides = {
    '@rnoh/react-native-openharmony': 'file:../artifacts/react_native_openharmony.har',
    '@react-native-ohos/react-native-screens':
      'file:../artifacts/screens-4.9.0-content-wrapper-v1.har',
    '@react-native-ohos/react-native-worklets':
      'file:../artifacts/worklets-1.0.0-private-symbols-v2.har',
  };
  fs.writeFileSync(ohRootPath, JSON.stringify(ohRoot, null, 2) + '\n');
  return { versions, status: 'candidate; requires Metro/native validation', entry: pkg.main };
};
