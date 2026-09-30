const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync, spawnSync } = require('node:child_process');
const tool = path.resolve(__dirname, '../tools/prepare-fixture.cjs');
const sdk = path.resolve(__dirname, '../../../../..');

test('preparation builds source artifacts and a fresh host without app shims', () => {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'core-fixture-test-')), 'fixture');
  execFileSync(process.execPath, [tool, '--sdk-root', sdk, '--fixture-root', root,
    '--tooling-root', process.env.EXPO_HARMONY_TOOLING_ROOT, '--prepare-only']);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'source-manifest.json')));
  assert.equal(manifest.baseCommit.length, 40);
  assert.ok(manifest.packages['expo-modules-core'].files['src/requireNativeModule.ts']);
  assert.ok(manifest.packages['@expo/metro-config'].files['src/withHarmony.ts']);
  assert.match(fs.readFileSync(path.join(root, '.source-build/expo-modules-core/package/build/Platform.d.ts'), 'utf8'), /PlatformOSType \| 'harmony'/);
  assert.ok(fs.existsSync(path.join(root, 'platform-types.ts')));
  for (const forbidden of ['metro.config.js', 'index.harmony.js', 'node_modules', 'harmony/entry/.cxx']) {
    assert.equal(fs.existsSync(path.join(root, forbidden)), false, forbidden);
  }
  assert.equal(fs.readFileSync(path.join(root, 'index.ts'), 'utf8'),
    fs.readFileSync(path.join(__dirname, '../index.ts'), 'utf8'));
  assert.throws(() => execFileSync(process.execPath, [tool, '--sdk-root', sdk, '--fixture-root', root,
    '--tooling-root', process.env.EXPO_HARMONY_TOOLING_ROOT, '--prepare-only'], { stdio: 'pipe' }),
    /already exists/);
});

// The upstream template ignored this file because it may contain local signing.
// Our checked-in fixture profile has no signing material and is required to build.
test('unsigned host build profile is not hidden from source delivery', () => {
  const profile = path.resolve(__dirname, '../host/harmony/build-profile.json5');
  assert.equal(spawnSync('git', ['check-ignore', '-q', profile], { cwd: sdk }).status, 1);
  const config = JSON.parse(fs.readFileSync(profile, 'utf8'));
  assert.deepEqual(config.app.signingConfigs, []);
});
