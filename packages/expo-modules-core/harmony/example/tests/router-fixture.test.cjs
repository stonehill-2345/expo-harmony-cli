const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('Router assembly uses official entry and registers navigation and Splash packages', (t) => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'router-fixture-test-'));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const root = path.join(scratch, 'fixture');
  const result = spawnSync(
    process.execPath,
    [
      path.resolve(__dirname, '../tools/prepare-fixture.cjs'),
      '--sdk-root',
      path.resolve(__dirname, '../../../../..'),
      '--fixture-root',
      root,
      '--tooling-root',
      process.env.EXPO_HARMONY_TOOLING_ROOT,
      '--router',
      '--prepare-only',
    ],
    { encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stderr);
  const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.main, 'expo-router/entry');
  assert.ok(pkg.dependencies['expo-router'].startsWith('file:artifacts/'));
  assert.ok(pkg.dependencies['expo-splash-screen'].startsWith('file:artifacts/'));
  assert.equal(pkg.dependencies['@react-navigation/native-stack'], '7.3.16');
  assert.equal(pkg.dependencies['@react-navigation/native'], '7.1.17');
  assert.equal(pkg.dependencies['react-native-screens'], '4.17.1');
  assert.equal(pkg.dependencies['@react-native-ohos/react-native-screens'], '4.9.0');
  assert.equal(pkg.dependencies['@react-native-ohos/react-native-worklets'], '1.0.0');
  const prefix = 'harmony/entry/src/main/';
  for (const name of [
    'ExpoSplashScreenPackage',
    'ScreensPackage',
    'SafeAreaViewPackage',
    'GestureHandlerPackage',
    'ReanimatedWorkletPackage',
    'ReanimatedPackage',
  ]) {
    assert.ok(read(prefix + 'cpp/PackageProvider.cpp').includes(name));
  }
  for (const name of [
    'RNOHScreensPackage',
    'SafeAreaViewPackage',
    'ExpoLinkingPackage',
    'ExpoSplashScreenPackage',
  ]) {
    assert.ok(read(prefix + 'ets/PackageProvider.ets').includes(name));
  }
  const provider = read(prefix + 'ets/PackageProvider.ets');
  assert.match(provider, /new ExpoSplashScreenPackage\(ctx\)/);
  assert.doesNotMatch(provider, /new ExpoSplashScreenPackage\(ctx, /);
  assert.match(read(prefix + 'cpp/CMakeLists.txt'), /rnoh_screens rnoh_safe_area/);
  assert.match(read(prefix + 'cpp/CMakeLists.txt'), /rnoh_expo_splash_screen/);
  const ability = read(prefix + 'ets/entryability/EntryAbility.ets');
  assert.match(ability, /new ExpoSplashScreenController\(\)/);
  assert.match(
    ability,
    /AppStorage\.setOrCreate\('ExpoSplashScreenController', this\.splashScreenController\)/
  );
  assert.match(ability, /this\.splashScreenController\.destroy\(\)/);
  assert.match(ability, /AppStorage\.delete\('ExpoSplashScreenController'\)/);
  const page = read(prefix + 'ets/pages/Index.ets');
  assert.match(page, /@StorageLink\('ExpoSplashScreenController'\)/);
  assert.match(page, /private splashContent\(\) \{\s+Column\(\) \{/);
  assert.match(page, /build\(\) \{\s+Stack\(\) \{/);
  assert.match(page, /ExpoSplashScreenView\(\{/);
  assert.ok(page.indexOf('ExpoSplashScreenView({') > page.indexOf('RNApp({'));
  for (const file of [
    'ExpoSplashScreenController.ts',
    'ExpoSplashScreenPackage.ets',
    'ExpoSplashScreenTurboModule.ets',
    'ExpoSplashScreenView.ets',
  ]) {
    assert.equal(fs.existsSync(path.join(root, prefix, 'ets/splash', file)), true, file);
  }
  const oh = JSON.parse(read('harmony/entry/oh-package.json5'));
  assert.equal(
    oh.dependencies['@react-native-ohos/react-native-screens'],
    'file:../../artifacts/screens-4.9.0-content-wrapper-v1.har'
  );
  assert.equal(
    oh.dependencies['@react-native-ohos/react-native-worklets'],
    'file:../../artifacts/worklets-1.0.0-private-symbols-v2.har'
  );
  assert.equal(
    JSON.parse(read('harmony/oh-package.json5')).overrides[
      '@react-native-ohos/react-native-worklets'
    ],
    'file:../artifacts/worklets-1.0.0-private-symbols-v2.har'
  );
  assert.equal(
    JSON.parse(read('harmony/oh-package.json5')).overrides[
      '@react-native-ohos/react-native-screens'
    ],
    'file:../artifacts/screens-4.9.0-content-wrapper-v1.har'
  );
  const native = JSON.parse(read(prefix + 'module.json5')).module;
  assert.ok(
    native.abilities[0].skills.some((skill) =>
      skill.uris?.some((uri) => uri.scheme === 'lanebrouter' && !uri.host)
    )
  );
  assert.ok(read('app/_layout.tsx').includes("from 'expo-router'"));
  const archive = JSON.parse(read('source-manifest.json')).packages['expo-router'];
  assert.ok(archive.files['_ctx.harmony.js']);
  const splashArchive = JSON.parse(read('source-manifest.json')).packages['expo-splash-screen'];
  assert.ok(splashArchive.files['harmony/src/main/cpp/ExpoSplashScreenTurboModule.cpp']);
  assert.ok(splashArchive.files['harmony/src/main/ets/ExpoSplashScreenController.ts']);
  // Both generated configurations must load the same official entry.
  const configureI0Source = fs.readFileSync(
    path.resolve(__dirname, '../tools/configure-i0.cjs'),
    'utf8'
  );
  assert.match(configureI0Source, /if \(dev\) fs\.rmSync\(embeddedBundlePath/);
  const configure = require('../tools/router-entry.cjs');
  assert.equal(configure(root), 'node_modules/expo-router/entry.js');
  assert.match(configure(root, true), /node_modules\/expo-router\/entry\.bundle\?platform=harmony/);
  const configScript = path.join(root, 'node_modules/expo-constants/scripts/getAppConfig.js');
  fs.mkdirSync(path.dirname(configScript), { recursive: true });
  fs.writeFileSync(configScript, '');
  const configureI0 = path.resolve(__dirname, '../tools/configure-i0.cjs');
  for (const mode of ['debug', 'release']) {
    const configured = spawnSync(process.execPath, [configureI0, root, mode], { encoding: 'utf8' });
    assert.equal(configured.status, 0, configured.stderr);
    const configuredPage = read(prefix + 'ets/pages/Index.ets');
    assert.match(configuredPage, /build\(\) \{\s+Stack\(\) \{/);
    assert.match(configuredPage, /ExpoSplashScreenView\(\{/);
    assert.match(
      configuredPage,
      mode === 'debug' ? /new MetroJSBundleProvider/ : /new ResourceJSBundleProvider/
    );
  }
  fs.rmSync(path.join(root, 'node_modules'), { recursive: true, force: true });
  for (const forbidden of ['metro.config.js', 'index.harmony.js', 'node_modules']) {
    assert.equal(fs.existsSync(path.join(root, forbidden)), false, forbidden);
  }
});
