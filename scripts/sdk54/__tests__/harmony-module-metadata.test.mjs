import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadM1Source } from '../m1-test-support.mjs';

const { resolveExpoModule } = loadM1Source('packages/expo-modules-autolinking/src/autolinking/findModules.ts');
const { resolveModuleAsync } = loadM1Source('packages/expo-modules-autolinking/src/platforms/harmony/harmony.ts');
function fixture(t, json = {}, expo, files = ['harmony/main.har']) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm3-metadata-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: '@fixture/native', version: '1.0.0', ...json }));
  if (expo) fs.writeFileSync(path.join(root, 'expo-module.config.json'), JSON.stringify(expo));
  for (const file of files) { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), 'fixture'); }
  return { name: 'logical-alias', path: root, version: '1.0.0' };
}
const discover = (r, platform = 'harmony') => resolveExpoModule(r, platform, new Set());
const resolve = async r => resolveModuleAsync(r.name, await discover(r));
test('other-platform Expo falls back to explicit RNOH and retains actual identity', async t => {
  const r = fixture(t, { harmony: { autolinking: true } }, { platforms: ['android'] });
  const m = await resolve(r);
  assert.equal(m.packageName, 'logical-alias'); assert.equal(m.npmPackageName, '@fixture/native'); assert.equal(m.npmPackageVersion, '1.0.0');
  assert.equal(await discover(r, 'ios'), null);
});
test('explicit Expo wins and invalid Expo Harmony cannot silently fall back', async t => {
  const good = fixture(t, { harmony: { autolinking: 'invalid' } }, { platforms: ['harmony'], harmony: { kind: 'rnoh-reuse', reason: 'shared' } });
  assert.equal((await resolve(good)).kind, 'rnoh-reuse');
  const bad = fixture(t, { harmony: { autolinking: true } }, { platforms: ['harmony'] });
  await assert.rejects(() => discover(bad), /Harmony.*metadata|Harmony.*config/);
});
test('false disables; ordinary JS is ignored; malformed explicit RNOH and missing HAR fail', async t => {
  assert.equal(await discover(fixture(t, { harmony: { autolinking: false } })), null);
  assert.equal(await discover(fixture(t)), null);
  for (const autolinking of ['yes', 1, []]) await assert.rejects(() => discover(fixture(t, { harmony: { autolinking } })), /autolinking/);
  await assert.rejects(() => discover(fixture(t, { harmony: { autolinking: true } }, undefined, [])), /HAR/);
});

test('RNOH 0.82.30 explicit null metadata opts out without duplicate native registration', async t => {
  const root = fixture(t, { name: '@react-native-oh/react-native-harmony', version: '0.82.30', harmony: { autolinking: null } });
  assert.equal(await discover(root), null);
});
test('unknown fixed navigation version fails unless explicitly overridden', async t => {
  const r = fixture(t, { name: '@react-native-ohos/react-native-screens', version: '99.0.0' });
  await assert.rejects(() => discover(r), /99\.0\.0.*4\.9\.0|4\.9\.0.*99\.0\.0/);
  const explicit = fixture(t, { name: '@react-native-ohos/react-native-screens', version: '99.0.0', harmony: { autolinking: true } });
  assert.equal((await resolve(explicit)).kind, 'rnoh-package');
});
test('frozen screens alias uses its own exact release version', async t => {
  const accepted = fixture(t, { name: '@expo-oh/react-native-screens', version: '4.9.2' }, undefined, ['harmony/screens.har']);
  assert.ok(await discover(accepted));
  for (const version of ['4.9.0', '4.9.1']) {
    const unknown = fixture(t, { name: '@expo-oh/react-native-screens', version }, undefined, ['harmony/screens.har']);
    await assert.rejects(() => discover(unknown), /supported 4\.9\.2/);
  }
});
test('HAR basename ambiguity and dangling or repeated mappings fail', async t => {
  for (const [files, mappings] of [
    [['harmony/a/main.har', 'harmony/b/main.har'], undefined],
    [['harmony/main.har'], [{ harName: 'missing.har', packageName: '@native/missing' }]],
    [['harmony/main.har'], [{ harName: 'main.har', packageName: '@native/a' }, { harName: 'main.har', packageName: '@native/b' }]],
  ]) await assert.rejects(() => discover(fixture(t, { harmony: { autolinking: { ohPackageName: mappings } } }, undefined, files)), /HAR|mapping/);
});
test('partial HAR mappings preserve order and fill unmapped names', async t => {
  const r = fixture(t, { harmony: { autolinking: { ohPackageName: [{ harName: 'z.har', packageName: '@native/z' }] } } }, undefined, ['harmony/a.har', 'harmony/z.har']);
  const m = await resolve(r); assert.equal(m.hars[0].packageName, '@native/z'); assert.equal(m.hars[0].primary, true); assert.equal(m.hars.length, 2);
});
test('paths reject traversal and escaped symlinks but accept symlinked package roots', async t => {
  const outside = fixture(t, {}, undefined, ['outside.har']);
  const r = fixture(t, { harmony: { autolinking: { mainHarPath: outside.path } } });
  await assert.rejects(() => discover(r), /relative|escape|outside/);
  const expo = { platforms: ['harmony'], harmony: { kind: 'har', har: { packageName: '@native/a', packagePath: 'harmony/main.har' } } };
  const safe = fixture(t, {}, expo); const link = `${safe.path}-link`; fs.symlinkSync(safe.path, link); t.after(() => fs.rmSync(link));
  assert.equal((await resolve({ ...safe, path: link })).hars.length, 1);
  fs.rmSync(path.join(safe.path, 'harmony/main.har')); fs.symlinkSync(path.join(outside.path, 'outside.har'), path.join(safe.path, 'harmony/main.har'));
  await assert.rejects(() => resolve(safe), /escape|outside/);
});
test('native duplicate resolutions expose both versions and roots', async t => {
  const r = fixture(t, { harmony: { autolinking: true } });
  const duplicate = fixture(t, { version: '2.0.0', harmony: { autolinking: true } });
  r.duplicates = [{ ...duplicate, version: '2.0.0' }];
  await assert.rejects(() => discover(r), error => error.message.includes(r.path) && error.message.includes(duplicate.path) && error.message.includes('2.0.0'));
});
test('missing native files and unsafe generated symbols fail before generation', async t => {
  const missing = fixture(t, {}, { platforms: ['harmony'], harmony: { kind: 'har', har: { packageName: '@native/a', packagePath: 'missing.har' } } });
  await assert.rejects(() => resolve(missing), /missing\.har/);
  for (const cppPackageClassName of ['Bad;Class', 'Bad\nClass', 'Bad"Class']) {
    const r = fixture(t, { harmony: { autolinking: { cppPackageClassName } } });
    await assert.rejects(() => resolve(r), /cpp.packageClass/);
  }
  const duplicateNames = fixture(t, { harmony: { autolinking: { ohPackageName: [{ harName: 'a.har', packageName: '@native/same' }, { harName: 'b.har', packageName: '@native/same' }] } } }, undefined, ['harmony/a.har', 'harmony/b.har']);
  await assert.rejects(() => resolve(duplicateNames), /duplicate HAR packageName/);
});
