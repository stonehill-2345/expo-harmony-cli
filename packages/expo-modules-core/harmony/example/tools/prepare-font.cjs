const fs = require('node:fs');
const path = require('node:path');
module.exports = function prepareFont(sdk, root, pkg) {
  const source = path.join(sdk, 'packages/expo-modules-core/harmony/example/font');
  const main = path.join(root, 'harmony/entry/src/main');
  fs.cpSync(path.join(sdk, 'packages/expo-font/harmony/src/main/ets'), path.join(main, 'ets/font'), { recursive: true });
  const base = fs.existsSync(path.join(root, 'LinkingApp.tsx')) ? './LinkingApp' : './I0App';
  fs.writeFileSync(path.join(root, 'FontApp.tsx'), fs.readFileSync(path.join(source, 'FontApp.tsx'), 'utf8').replace('__BASE_APP__', base));
  const cpp = path.join(main, 'cpp/PackageProvider.cpp');
  let cppText = fs.readFileSync(cpp, 'utf8').replace('using namespace rnoh;', '#include "ExpoFontLoaderPackage.h"\nusing namespace rnoh;');
  const cppMarker = ')};\n}';
  const cppIndex = cppText.lastIndexOf(cppMarker);
  if (cppIndex < 0) throw new Error('Unexpected C++ PackageProvider shape');
  cppText = cppText.slice(0, cppIndex) + '),\n      std::make_shared<expo::font::harmony::ExpoFontLoaderPackage>(ctx)};\n}' +
    cppText.slice(cppIndex + cppMarker.length);
  fs.writeFileSync(cpp, cppText);
  fs.appendFileSync(path.join(main, 'cpp/CMakeLists.txt'), '\nadd_subdirectory("${NODE_MODULES}/expo-font/harmony/src/main/cpp" expo-font)\ntarget_link_libraries(rnoh_app PUBLIC rnoh_expo_font)\n');
  const ets = path.join(main, 'ets/PackageProvider.ets');
  fs.writeFileSync(ets, "import { ExpoFontLoaderPackage } from './font/ExpoFontLoaderPackage';\n" +
    fs.readFileSync(ets, 'utf8').replace('  return [', '  return [new ExpoFontLoaderPackage(ctx), '));
  const entry = path.join(root, 'expo-entry.ts');
  fs.writeFileSync(entry, fs.readFileSync(entry, 'utf8').replace(base, './FontApp'));
  pkg.dependencies['@expo/vector-icons'] = '15.1.1';
};
