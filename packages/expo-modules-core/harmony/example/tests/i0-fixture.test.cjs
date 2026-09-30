const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const sdk = path.resolve(__dirname, '../../../../..');

test('I0 assembly archives real modules and registers both native sides without app shims', () => {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'i0-fixture-test-')), 'fixture');
  execFileSync(process.execPath, [path.resolve(__dirname, '../tools/prepare-fixture.cjs'),
    '--sdk-root', sdk, '--fixture-root', root, '--tooling-root', process.env.EXPO_HARMONY_TOOLING_ROOT,
    '--i0', '--prepare-only'], { stdio: 'pipe' });
  const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
  const manifest = JSON.parse(read('source-manifest.json'));
  for (const name of ['expo-constants', 'expo-asset', 'expo-system-ui']) {
    assert.ok(manifest.packages[name].files['harmony/README.md']);
    assert.ok(JSON.parse(read('package.json')).dependencies[name].startsWith('file:artifacts/'));
  }
  const cpp = read('harmony/entry/src/main/cpp/PackageProvider.cpp');
  const ets = read('harmony/entry/src/main/ets/PackageProvider.ets');
  const cmake = read('harmony/entry/src/main/cpp/CMakeLists.txt');
  for (const name of ['ExpoModulesCore', 'ExponentConstants', 'ExpoAsset', 'ExpoSystemUI', 'LaneBConstantsOracle', 'LaneBAssetOracle']) {
    assert.ok(cpp.includes(name + 'Package'), name + ' C++');
    assert.ok(ets.includes(name + 'Package'), name + ' ETS');
  }
  for (const target of ['rnoh_expo_constants', 'rnoh_expo_asset', 'rnoh_expo_system_ui', 'lane_b_asset_oracle']) assert.ok(cmake.includes(target));
  assert.equal(fs.existsSync(path.join(root, 'harmony/entry/src/main/ets/system-ui/ExpoSystemUITurboModule.ets')), true);
  assert.match(read('.source-build/expo-constants/package/scripts/build/getAppConfig.js'), /isPublicConfig: true/);
  assert.ok(fs.existsSync(path.join(root, 'fixtures/lane-b.svg')));
  assert.match(read('expo-entry.ts'), /import \{ registerRootComponent \} from 'expo'/);
  assert.equal(read('index.ts'), fs.readFileSync(path.resolve(__dirname, '../index.ts'), 'utf8'));
  for (const name of ['metro.config.js', 'index.harmony.js', 'node_modules', 'harmony/entry/.cxx']) {
    assert.equal(fs.existsSync(path.join(root, name)), false, name);
  }
});
