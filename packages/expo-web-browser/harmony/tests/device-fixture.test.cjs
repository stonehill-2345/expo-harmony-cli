const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

test('device fixture wires the Ability-owned controller and ArkWeb overlay', (t) => {
  assert.ok(process.env.EXPO_HARMONY_TOOLING_ROOT, 'EXPO_HARMONY_TOOLING_ROOT is required');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'web-browser-device-fixture-'));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const root = path.join(scratch, 'fixture');
  const result = spawnSync(process.execPath, [
    path.resolve(__dirname, '../../../expo-modules-core/harmony/example/tools/prepare-fixture.cjs'),
    '--sdk-root', path.resolve(__dirname, '../../../..'),
    '--fixture-root', root,
    '--tooling-root', process.env.EXPO_HARMONY_TOOLING_ROOT,
    '--i0', '--web-browser', '--prepare-only',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
  assert.equal(JSON.parse(read('package.json')).dependencies['expo-web-browser'].startsWith('file:artifacts/'), true);
  assert.match(read('expo-entry.ts'), /from '.\/WebBrowserApp'/);
  assert.match(read('harmony/AppScope/app.json5'), /dev\.expo\.harmony\.browser/);
  assert.match(read('harmony/entry/src/main/ets/entryability/EntryAbility.ets'), /ExpoWebBrowserLifecycle/);
  assert.match(read('harmony/entry/src/main/ets/PackageProvider.ets'), /new ExpoWebBrowserPackage\(ctx, browser\)/);
  const page = read('harmony/entry/src/main/ets/pages/Index.ets');
  assert.match(page, /build\(\) \{\s+Stack\(\) \{/);
  assert.ok(page.indexOf('ExpoWebBrowserView({') > page.indexOf('RNApp({'));
  assert.match(read('harmony/entry/src/main/cpp/PackageProvider.cpp'), /ExpoWebBrowserPackage/);
  assert.match(read('harmony/entry/src/main/cpp/CMakeLists.txt'), /rnoh_expo_web_browser/);
});
