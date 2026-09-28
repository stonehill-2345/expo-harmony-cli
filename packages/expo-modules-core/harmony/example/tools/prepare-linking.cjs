const fs = require('node:fs');
const path = require('node:path');
module.exports = function prepareLinking(sdk, root, ts) {
  const source = path.join(sdk, 'packages/expo-modules-core/harmony/example/linking');
  const main = path.join(root, 'harmony/entry/src/main');
  fs.cpSync(path.join(sdk, 'packages/expo-linking/harmony/src/main/ets'), path.join(main, 'ets/linking'), { recursive: true });
  fs.copyFileSync(path.join(source, 'EntryAbility.ets'), path.join(main, 'ets/entryability/EntryAbility.ets'));
  fs.copyFileSync(path.join(source, 'LinkingApp.tsx'), path.join(root, 'LinkingApp.tsx'));
  const cpp = path.join(main, 'cpp/PackageProvider.cpp');
  fs.writeFileSync(cpp, fs.readFileSync(cpp, 'utf8').replace('using namespace rnoh;', '#include "ExpoLinkingPackage.h"\nusing namespace rnoh;')
    .replace('LaneBAssetOraclePackage>(ctx)};', 'LaneBAssetOraclePackage>(ctx),\n      std::make_shared<expo::linking::harmony::ExpoLinkingPackage>(ctx)};'));
  fs.appendFileSync(path.join(main, 'cpp/CMakeLists.txt'), '\nadd_subdirectory("${NODE_MODULES}/expo-linking/harmony/src/main/cpp" expo-linking)\ntarget_link_libraries(rnoh_app PUBLIC rnoh_expo_linking)\n');
  const ets = path.join(main, 'ets/PackageProvider.ets');
  fs.writeFileSync(ets, "import { ExpoLinkingPackage } from './linking/ExpoLinkingPackage';\nimport { ExpoLinkingLifecycle } from './linking/ExpoLinkingLifecycle';\n" + fs.readFileSync(ets, 'utf8')
    .replace('  return [', "  const lifecycle = AppStorage.get<ExpoLinkingLifecycle>('I0LinkingLifecycle');\n  if (!lifecycle) throw new Error('Owning Ability Linking lifecycle is missing');\n  return [new ExpoLinkingPackage(ctx, lifecycle), "));
  const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json')));
  const nativePath = path.join(main, 'module.json5');
  const parsed = ts.parseConfigFileTextToJson(nativePath, fs.readFileSync(nativePath, 'utf8'));
  if (parsed.error) throw new Error('Invalid fixture module JSON');
  const native = parsed.config;
  native.module.querySchemes.push(config.expo.scheme, 'i0missing');
  native.module.abilities[0].launchType = 'singleton';
  native.module.abilities[0].exported = true;
  native.module.abilities[0].skills.push({ actions: ['ohos.want.action.viewData'], entities: ['entity.system.browsable'],
    uris: [{ scheme: config.expo.scheme, host: 'fixture' }] });
  fs.writeFileSync(nativePath, JSON.stringify(native, null, 2) + '\n');
  const entry = path.join(root, 'expo-entry.ts');
  fs.writeFileSync(entry, fs.readFileSync(entry, 'utf8').replace("from './I0App'", "from './LinkingApp'"));
};
