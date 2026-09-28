const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const sdk = path.resolve(__dirname, '../../../../..');

test('Font assembly archives the real module and keeps Router out of the fixture', () => {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'font-fixture-')), 'fixture');
  execFileSync(process.execPath, [path.resolve(__dirname, '../tools/prepare-fixture.cjs'),
    '--sdk-root', sdk, '--fixture-root', root, '--tooling-root', process.env.EXPO_HARMONY_TOOLING_ROOT,
    '--i0', '--linking', '--font', '--prepare-only'], { stdio: 'pipe' });
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const manifest = JSON.parse(read('source-manifest.json'));
  assert.ok(manifest.packages['expo-font'].files['harmony/src/main/ets/ExpoFontLoaderTurboModule.ets']);
  assert.equal(JSON.parse(read('package.json')).dependencies['@expo/vector-icons'], '15.1.1');
  const prefix = 'harmony/entry/src/main/';
  assert.match(read(prefix + 'cpp/PackageProvider.cpp'), /expo::font::harmony::ExpoFontLoaderPackage/);
  assert.match(read(prefix + 'cpp/CMakeLists.txt'), /rnoh_expo_font/);
  assert.match(read(prefix + 'ets/PackageProvider.ets'), /new ExpoFontLoaderPackage\(ctx\)/);
  assert.match(read('FontApp.tsx'), /@expo\/vector-icons\/MaterialIcons/);
  assert.match(read('FontApp.tsx'), /from '.\/LinkingApp'/);
  assert.doesNotMatch(read('FontApp.tsx'), /__BASE_APP__/);
  assert.match(read('expo-entry.ts'), /from '.\/FontApp'/);
  assert.equal(JSON.parse(read('package.json')).dependencies['expo-router'], undefined);
  assert.equal(fs.existsSync(path.join(root, 'metro.config.js')), false);
});
