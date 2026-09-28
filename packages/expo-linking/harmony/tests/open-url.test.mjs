import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

// Isolated JS contract tests. RN/Core stubs here are not native acceptance.
async function load(openURL) {
  const context = vm.createContext({});
  const stub = (exports) => new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  }, { context });
  const dependencies = {
    'expo-modules-core': stub({ UnavailabilityError: Error }),
    react: stub({ useEffect() {}, useState() {} }),
    'react-native': stub({ Platform: { OS: 'harmony' } }),
    './ExpoLinking': stub({ default: {} }),
    './RNLinking': stub({ default: { openURL } }),
    './createURL': stub({ parse() {}, createURL() {} }),
    './Linking.types': stub({}),
    './Schemes': stub({}),
  };
  const validation = new vm.SourceTextModule(await fs.readFile(new URL('../../build/validateURL.js', import.meta.url), 'utf8'), { context });
  await validation.link(() => stub({ default(condition, message) { assert.ok(condition, message); } }));
  dependencies['./validateURL'] = validation;
  const module = new vm.SourceTextModule(await fs.readFile(new URL('../../build/Linking.js', import.meta.url), 'utf8'), { context });
  await module.link((name) => {
    assert.ok(dependencies[name], `Unexpected import ${name}`);
    return dependencies[name];
  });
  await module.evaluate();
  return module.namespace.openURL;
}

for (const value of [null, undefined, true]) {
  test(`successful native open with ${value} fulfills Expo's true contract`, async () => {
    let received;
    const openURL = await load(async (url) => { received = url; return value; });
    assert.equal(await openURL('laneblinking://fixture/%E8%B5%84?x=1'), true);
    assert.equal(received, 'laneblinking://fixture/%E8%B5%84?x=1');
  });
}

test('openURL waits for native completion and preserves native rejection', async () => {
  let reject;
  const native = new Promise((_, fail) => { reject = fail; });
  const openURL = await load(() => native);
  let settled = false;
  const pending = openURL('lanebmissing://fixture/absent');
  pending.then(() => { settled = true; }, () => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  const failure = { code: 'NATIVE_OPEN_FAILED', message: 'No handler' };
  reject(failure);
  await assert.rejects(pending, (error) => error === failure);
});

test('invalid input rejects before native invocation', async () => {
  let called = false;
  const openURL = await load(() => { called = true; });
  await assert.rejects(openURL(''), /cannot be empty/);
  await assert.rejects(openURL(null), /should be a string/);
  assert.equal(called, false);
});
