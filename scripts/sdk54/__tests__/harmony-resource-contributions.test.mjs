import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createRequire } from 'node:module';
import { loadM1Source } from '../m1-test-support.mjs';

const upstream = createRequire(path.resolve('packages/@expo/cli/package.json'))('@expo/config-plugins');
const prefix = 'entry/src/main/resources/rawfile/';
const sha = value => createHash('sha256').update(value).digest('hex');
const api = () => loadM1Source('packages/expo-modules-autolinking/src/platforms/harmony/resourceContributions.ts');
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-resources-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'assets')); fs.writeFileSync(path.join(root, 'assets/data.json'), '{ "value": 1 }\n');
  const resource = { owner: 'expo-asset', packageName: 'expo-asset', packageVersion: '12.0.13', source: 'assets/data.json', target: 'data.json', sha256: sha('{ "value": 1 }\n') };
  const generate = async (resources, fault) => {
    const { runHarmonyGenerationTransactionAsync } = loadM1Source('packages/expo-modules-autolinking/src/platforms/harmony/generationTransaction.ts');
    const { mergeHarmonyGenerationStateAsync } = loadM1Source('packages/expo-modules-autolinking/src/platforms/harmony/generationState.ts');
    return runHarmonyGenerationTransactionAsync({ projectRoot: root, fault,
      generate: async (stageRoot, hash) => {
        const owners = await api().stageHarmonyResourcesAsync({ projectRoot: root, stageRoot, currentRoot: path.join(root, 'harmony'), resources });
        const merged = await mergeHarmonyGenerationStateAsync({ stageRoot, currentRoot: path.join(root, 'harmony'), owners, detectUnchanged: true });
        if (merged.unchanged) hash.reuseCurrentTree();
        else if (merged.managedPatch) hash.applyManagedPatch(merged.managedPatch);
        return {};
      }, validate: async () => {},
    });
  };
  return { root, resource, generate, output: path.join(root, 'harmony', prefix, 'expo-asset/data.json') };
}

test('resource add, no-op, content replacement, rename and plugin removal preserve users and other owners', async t => {
  const f = fixture(t); const font = { owner: 'expo-font', packageName: 'expo-font', packageVersion: '14.0.12', target: 'fonts.json', contents: '[]\n', sha256: sha('[]\n') };
  await f.generate([f.resource, font]);
  assert.equal(fs.readFileSync(f.output, 'utf8'), '{ "value": 1 }\n', 'raw JSON bytes must not be canonicalized');
  const stateFile = path.join(f.root, 'harmony/.expo-harmony-state.json');
  assert.equal(JSON.parse(fs.readFileSync(stateFile)).files[prefix+'expo-asset/data.json'].owner, 'expo-asset');
  fs.writeFileSync(path.join(f.root, 'harmony/user.txt'), 'preserve');
  const time = fs.statSync(f.output).mtimeMs; const state = fs.readFileSync(stateFile, 'utf8');
  await f.generate([font, f.resource]);
  assert.equal(fs.statSync(f.output).mtimeMs, time); assert.equal(fs.readFileSync(stateFile, 'utf8'), state);
  fs.writeFileSync(path.join(f.root, f.resource.source), '{"value":2}');
  await f.generate([{ ...f.resource, sha256: sha('{"value":2}') }, font]);
  assert.equal(fs.readFileSync(f.output, 'utf8'), '{"value":2}');
  await f.generate([{ ...f.resource, target: 'renamed.json', sha256: sha('{"value":2}') }, font]);
  assert.equal(fs.existsSync(f.output), false);
  await f.generate([font]);
  assert.equal(fs.existsSync(path.join(path.dirname(f.output), 'renamed.json')), false);
  assert.equal(fs.readFileSync(path.join(f.root, 'harmony', prefix, 'expo-font/fonts.json'), 'utf8'), '[]\n');
  assert.equal(fs.readFileSync(path.join(f.root, 'harmony/user.txt'), 'utf8'), 'preserve');
});

test('missing, escaping, symlinked, duplicate, stale and mixed-content resources fail without changing the live tree', async t => {
  const f = fixture(t); await f.generate([f.resource]);
  fs.symlinkSync(path.join(f.root, 'assets/data.json'), path.join(f.root, 'assets/link.json'));
  for (const resources of [
    [{ ...f.resource, source: 'assets/missing.json' }], [{ ...f.resource, source: '../outside' }],
    [{ ...f.resource, source: 'assets/link.json' }], [{ ...f.resource, target: '../user.txt' }],
    [{ ...f.resource, owner: '../other' }], [f.resource, f.resource],
    [{ ...f.resource, sha256: '0'.repeat(64) }], [{ ...f.resource, contents: 'ambiguous' }],
  ]) {
    await assert.rejects(f.generate(resources));
    assert.equal(fs.readFileSync(f.output, 'utf8'), '{ "value": 1 }\n');
  }
});

test('user edits and unowned files cannot be deleted, adopted or overwritten by resource plugins', async t => {
  const f = fixture(t); await f.generate([f.resource]);
  fs.writeFileSync(f.output, 'user edit');
  await assert.rejects(f.generate([]), /conflict/i);
  assert.equal(fs.readFileSync(f.output, 'utf8'), 'user edit');
  const userFile = path.join(path.dirname(f.output), 'user.json');fs.writeFileSync(userFile, '{ "value": 1 }\n');
  await assert.rejects(f.generate([{ ...f.resource, target: 'user.json' }]), /unowned|owner|conflict/i);
  assert.equal(fs.readFileSync(userFile, 'utf8'), '{ "value": 1 }\n');
});

test('resource transaction rollback retains old content and ownership and permits retry', async t => {
  const f = fixture(t);await f.generate([f.resource]);
  const stateFile = path.join(f.root, 'harmony/.expo-harmony-state.json');const before = fs.readFileSync(stateFile,'utf8');
  fs.writeFileSync(path.join(f.root, f.resource.source), 'replacement');
  const updated = { ...f.resource, sha256: sha('replacement') };
  await assert.rejects(f.generate([updated], async point => { if (point === 'after-install') throw new Error('resource injected failure'); }), /resource injected failure/);
  assert.equal(fs.readFileSync(f.output,'utf8'), '{ "value": 1 }\n');assert.equal(fs.readFileSync(stateFile,'utf8'), before);
  await f.generate([updated]);assert.equal(fs.readFileSync(f.output,'utf8'), 'replacement');
});

test('public Harmony resource mods count as a real plugin implementation', () => {
  const config = loadM1Source('packages/@expo/cli/src/harmony/config.ts');
  const plugin = config.defineHarmonyPlugin(c => config.withHarmonyResources(c, mod => mod));
  assert.equal(typeof plugin({ name:'App',slug:'app' }).mods.harmony.resources, 'function');
});

test('real Font and Asset plugins compile resource-only mods through CLI prebuild and native generation', async t => {
  const f = fixture(t);
  const fontBytes = Buffer.alloc(32);fontBytes.set([0,1,0,0,0,1]);fontBytes.set([0x68,0x65,0x61,0x64],12);fontBytes.set([0,0,0,28,0,0,0,4],20);
  fs.writeFileSync(path.join(f.root,'assets/Embedded.ttf'),fontBytes);
  fs.mkdirSync(path.join(f.root,'node_modules'));
  fs.symlinkSync(path.resolve('packages/expo-modules-autolinking'),path.join(f.root,'node_modules/expo-modules-autolinking'),'dir');
  for (const name of ['font','asset']) fs.writeFileSync(path.join(f.root,`${name}.js`),"module.exports=Object.assign(c=>c,{harmony:{platforms:['harmony','ios','android']}})");
  const harmony = loadM1Source('packages/@expo/cli/src/harmony/config.ts');
  const overrides = { 'expo/harmony-config': harmony, 'expo/config-plugins': upstream,
    'expo-font/package.json': JSON.parse(fs.readFileSync('packages/expo-font/package.json')),
    'expo-asset/package.json': JSON.parse(fs.readFileSync('packages/expo-asset/package.json')) };
  const font = loadM1Source('packages/expo-font/plugin/src/withFonts.ts',overrides).default;
  const asset = loadM1Source('packages/expo-asset/plugin/src/withAssets.ts',overrides).default;
  let exp = { name:'Resources',slug:'resources',icon:'./assets/data.json',plugins:['./font.js','./asset.js'] };
  exp = font(exp,{ fonts:['./assets/Embedded.ttf'] });exp = asset(exp,{ assets:['./assets/data.json'] });
  const { compileHarmonyConfigAsync } = loadM1Source('packages/@expo/cli/src/prebuild/harmony/configPlugins.ts');
  const plan = await compileHarmonyConfigAsync(f.root,exp,harmony.resolveHarmonyConfig(exp));
  assert.equal(plan.resources.length,3);assert.ok(plan.resources.every(r=>r.packageName&&r.packageVersion&&r.sha256));
  assert.equal(plan.resources.find(r=>r.owner==='expo-asset').target,'data.json');
  const registry = JSON.parse(plan.resources.find(r=>r.target==='fonts.json').contents);
  assert.deepEqual(registry,[{family:'Embedded',resource:'expo-font/fonts/Embedded.ttf',sha256:sha(fontBytes)}]);
  const native = loadM1Source('packages/expo-modules-autolinking/src/platforms/harmony/nativeProject.ts', {
    './releasedCompatibility': { copyReleasedRnohCompatibilityHarAsync: async ({outputHarPath}) => {
      fs.mkdirSync(path.dirname(outputHarPath),{recursive:true});fs.writeFileSync(outputHarPath,'boundary HAR');return outputHarPath;
    } },
  });
  const options = {projectRoot:f.root,appName:'Resources',bundleName:'dev.expo.resources',appConfig:{icon:'./assets/data.json'},modules:[],inputHarPath:'boundary',corePackageRoot:'boundary',resources:plan.resources};
  await native.prepareHarmonyNativeProjectAsync(options);
  assert.deepEqual(fs.readFileSync(path.join(f.root,'harmony',prefix,'expo-font/fonts/Embedded.ttf')),fontBytes);
  assert.equal(fs.readFileSync(f.output,'utf8'),'{ "value": 1 }\n');
  const {prebuildHarmonyAsync} = loadM1Source('packages/@expo/cli/src/prebuild/harmony/prebuildHarmonyAsync.ts');
  let captured;
  await prebuildHarmonyAsync(f.root,{install:false},{ getConfig:()=>({exp}),ensureDependencies:async()=>{},
    loadAutolinking:async()=>({ queryAutolinkingModulesFromProjectAsync:async()=>[{packageName:'expo-modules-core',packageRoot:'boundary'}],
      validateHarmonyAppAssetsAsync:async()=>{},syncHarmonyNativeProjectAsync:async input=>{captured=input;return{};} }),
    updateDebugBundlePath:async()=>{},compileConfig:async()=>plan,
  });
  assert.deepEqual(captured.resources,plan.resources);
  await native.syncHarmonyNativeProjectAsync({...options,resources:[]});
  assert.equal(fs.existsSync(f.output),false);
  assert.equal(fs.existsSync(path.join(f.root,'harmony',prefix,'expo-font/fonts/Embedded.ttf')),false);
  assert.equal(fs.existsSync(path.join(f.root,'harmony',prefix,'expo-font/fonts.json')),false);
});

test('empty Font and Asset configurations still register Harmony work for later plugin removal', () => {
  const harmony = loadM1Source('packages/@expo/cli/src/harmony/config.ts');
  for (const [pkg,name] of [['expo-font','Fonts'],['expo-asset','Assets']]) {
    const plugin = loadM1Source(`packages/${pkg}/plugin/src/with${name}.ts`,{ 'expo/harmony-config':harmony, 'expo/config-plugins': upstream,
      [`${pkg}/package.json`]:JSON.parse(fs.readFileSync(`packages/${pkg}/package.json`)) }).default;
    const exp=plugin({name:'Empty',slug:'empty'},undefined);
    assert.equal(typeof exp.mods.harmony.resources,'function');assert.ok(plugin.harmony.platforms.includes('harmony'));
  }
});


test('Font and Asset plugins reject malformed options, missing inputs, bad formats and duplicate families', async t => {
  const f = fixture(t);
  const harmony = loadM1Source('packages/@expo/cli/src/harmony/config.ts');
  const overrides = { 'expo/harmony-config': harmony, 'expo/config-plugins': upstream,
    'expo-font/package.json': JSON.parse(fs.readFileSync('packages/expo-font/package.json')),
    'expo-asset/package.json': JSON.parse(fs.readFileSync('packages/expo-asset/package.json')) };
  const font = loadM1Source('packages/expo-font/plugin/src/withFontsHarmony.ts', overrides).withFontsHarmony;
  const asset = loadM1Source('packages/expo-asset/plugin/src/withAssetsHarmony.ts', overrides).withAssetsHarmony;
  const compile = async (plugin, inputs) => {
    const exp = plugin({ name: 'Invalid', slug: 'invalid' }, inputs);
    return exp.mods.harmony.resources({ ...exp, modResults: [],
      modRequest: { projectRoot: f.root, platform: 'harmony', modName: 'resources' } });
  };
  fs.writeFileSync(path.join(f.root, 'assets/corrupt.ttf'), 'not a font');
  fs.writeFileSync(path.join(f.root, 'assets/font.woff'), 'wOFF');
  for (const plugin of [font, asset]) {
    for (const inputs of [null, 'assets/data.json', [42], [''], ['assets/missing.ttf']])
      await assert.rejects(compile(plugin, inputs));
  }
  await assert.rejects(compile(font, ['assets/corrupt.ttf']), /Invalid Harmony/);
  await assert.rejects(compile(font, ['assets/font.woff']), /TTF\/OTF/);
  await assert.rejects(compile(font, ['assets/data.json']), /TTF\/OTF/);
  await assert.rejects(compile(asset, ['assets/corrupt.ttf']), /use expo-font/);
  await assert.rejects(compile(asset, ['assets/font.woff']), /Unsupported/);
  fs.mkdirSync(path.join(f.root, 'other'));
  for (const name of ['assets/Same.ttf', 'other/Same.otf'])
    fs.writeFileSync(path.join(f.root, name), Buffer.from([0, 1, 0, 0]));
  await assert.rejects(compile(font, ['assets/Same.ttf', 'other/Same.otf']), /Duplicate/);
});
