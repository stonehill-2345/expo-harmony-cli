import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadM1Source } from '../m1-test-support.mjs';

const dependencies = Object.fromEntries(['../../prebuild/harmony/prebuildHarmonyAsync','../startBundler',
  '../../harmony/bundle','../../harmony/build','../../harmony/device','../../harmony/paths'].map(id => [id, {}]));
const { runHarmonyAsync } = loadM1Source('packages/@expo/cli/src/run/harmony/runHarmonyAsync.ts', dependencies);
function fixture(t, ability = "{ host: '127.0.0.1', port: 8081 }") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-debug-port-'));
  const original = { NODE_ENV: process.env.NODE_ENV, EXPO_HARMONY_METRO: process.env.EXPO_HARMONY_METRO };
  t.after(() => { fs.rmSync(root, { recursive: true, force: true }); for (const [k,v] of Object.entries(original)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }});
  for (const [file, content] of Object.entries({
    'AppScope/app.json5': JSON.stringify({ app: { bundleName: 'dev.app' } }),
    'entry/src/main/ets/pages/Index.ets': 'http://127.0.0.1:8081/index.bundle',
    'entry/src/main/ets/entryability/EntryAbility.ets': ability,
  })) { const target = path.join(root, 'harmony', file); fs.mkdirSync(path.dirname(target), { recursive:true }); fs.writeFileSync(target, content); }
  const calls = [];
  const deps = { prebuildHarmonyAsync: async () => ({ harmonyRoot:path.join(root,'harmony') }),
    resolveHarmonyToolchain: () => ({ hdc:'/hdc' }), buildHarmonyAsync: async () => { calls.push('build'); return '/app.hap'; },
    resolveHarmonyDeviceAsync: async () => 'target', installHarmonyAppAsync: async () => {}, launchHarmonyAppAsync: async () => {},
    startBundlerAsync: async (_root, options) => calls.push(['metro', options.port]),
    reverseHarmonyPortAsync: async (_hdc,_target,port) => calls.push(['reverse',port]) };
  return { root, deps, calls, read: file => fs.readFileSync(path.join(root,'harmony/entry/src/main/ets',file),'utf8') };
}
test('default Debug port succeeds and repeated runs preserve the selected port',async t => {
  const f=fixture(t);
  for (const options of [{}, {}, {port:9090}, {port:9090}]) await runHarmonyAsync(f.root,options,f.deps);
  assert.deepEqual(f.calls.filter(c=>Array.isArray(c)&&c[0]==='reverse'),[['reverse',8081],['reverse',8081],['reverse',9090],['reverse',9090]]);
  assert.match(f.read('pages/Index.ets'),/:9090\//);
  assert.match(f.read('entryability/EntryAbility.ets'),/port: 9090/);
});
test('missing Debug packager configuration rejects before build and leaves Index unchanged',async t => {
  const f=fixture(t,'class EntryAbility {}');
  await assert.rejects(runHarmonyAsync(f.root,{port:9090},f.deps),/packager port was not found/);
  assert.deepEqual(f.calls,[]);
  assert.match(f.read('pages/Index.ets'),/:8081\//);
});
