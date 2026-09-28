const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const sdk = path.resolve(__dirname, '../../../../..');
test('Linking assembly wires the real module and Ability Wants while retaining I0', () => {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'linking-fixture-')), 'fixture');
  execFileSync(process.execPath, [path.resolve(__dirname, '../tools/prepare-fixture.cjs'),
    '--sdk-root', sdk, '--fixture-root', root, '--tooling-root', process.env.EXPO_HARMONY_TOOLING_ROOT,
    '--i0', '--linking', '--prepare-only'], { stdio: 'pipe' });
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const manifest = JSON.parse(read('source-manifest.json'));
  assert.ok(manifest.packages['expo-linking'].files['harmony/src/main/ets/ExpoLinkingLifecycle.ts']);
  const prefix = 'harmony/entry/src/main/';
  assert.match(read(prefix + 'cpp/PackageProvider.cpp'), /expo::linking::harmony::ExpoLinkingPackage/);
  assert.match(read(prefix + 'cpp/CMakeLists.txt'), /rnoh_expo_linking/);
  assert.match(read(prefix + 'ets/PackageProvider.ets'), /new ExpoLinkingPackage\(ctx, lifecycle\)/);
  assert.match(read(prefix + 'ets/entryability/EntryAbility.ets'), /super.onNewWant\(want, launchParam\)/);
  const native = JSON.parse(read(prefix + 'module.json5')).module;
  const scheme = JSON.parse(read('app.json')).expo.scheme;
  assert.ok(native.querySchemes.includes(scheme));
  assert.ok(native.abilities[0].skills.some(skill => skill.uris?.some(uri => uri.scheme === scheme)));
  assert.equal(native.abilities[0].launchType, 'singleton');
  assert.match(read('expo-entry.ts'), /registerRootComponent/);
  assert.match(read('LinkingApp.tsx'), /I0App/);
  assert.equal(JSON.parse(read('package.json')).dependencies['expo-router'], undefined);
  assert.equal(fs.existsSync(path.join(root, 'metro.config.js')), false);
});
