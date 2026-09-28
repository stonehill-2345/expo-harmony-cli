// SDK-owned test-host assembly. No production module logic or installed-file edits.
const fs = require('node:fs');
const path = require('node:path');
module.exports = function prepareI0(sdk, root) {
  const example = path.join(sdk, 'packages/expo-modules-core/harmony/example');
  const constants = path.join(sdk, 'packages/expo-constants/harmony');
  const asset = path.join(sdk, 'packages/expo-asset/harmony');
  const systemUI = path.join(sdk, 'packages/expo-system-ui/harmony');
  const main = path.join(root, 'harmony/entry/src/main');
  const copy = (source, target) => fs.cpSync(source, target, { recursive: true });
  for (const [name, source] of [['constants', constants], ['asset', asset]]) {
    copy(path.join(source, 'src/main/ets'), path.join(main, 'ets', name));
    copy(path.join(source, 'example/native/ets'), path.join(main, 'ets', name + '-oracle'));
    copy(path.join(source, 'example/public-checks.js'), path.join(root, name + '-public-checks.js'));
  }
  copy(path.join(systemUI, 'src/main/ets'), path.join(main, 'ets/system-ui'));
  copy(path.join(constants, 'example/app.json'), path.join(root, 'app.json'));
  copy(path.join(asset, 'example/fixtures'), path.join(root, 'fixtures'));
  copy(path.join(asset, 'example/rawfile'), path.join(main, 'resources/rawfile'));
  copy(path.join(example, 'i0/I0App.tsx'), path.join(root, 'I0App.tsx'));
  for (const file of ['PackageProvider.cpp', 'CMakeLists.txt']) copy(path.join(example, 'i0', file), path.join(main, 'cpp', file));
  copy(path.join(example, 'i0/PackageProvider.ets'), path.join(main, 'ets/PackageProvider.ets'));
  const entry = path.join(root, 'expo-entry.ts');
  fs.writeFileSync(entry, fs.readFileSync(entry, 'utf8').replace("from './App'", "from './I0App'"));
  // Dedicated test application identity, not a separate initialization mechanism.
  const appPath = path.join(root, 'harmony/AppScope/app.json5');
  const app = JSON.parse(fs.readFileSync(appPath));
  app.app.bundleName = 'dev.expo.harmony.i0';
  fs.writeFileSync(appPath, JSON.stringify(app, null, 2) + '\n');
};
