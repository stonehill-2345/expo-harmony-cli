import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { loadM1Source } from '../m1-test-support.mjs';

const cliSource = 'packages/@expo/cli/src/prebuild/harmony/prebuildHarmonyAsync.ts';
const require = createRequire(path.resolve(cliSource));
const upstream = require('@expo/config-plugins');
const getConfig = require('@expo/config').getConfig;
const load = () => loadM1Source(cliSource, { '../../harmony/dependencies': { ensureHarmonyDependenciesAsync: () => { throw new Error('Unexpected dependency install'); } } });
const fixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-m1-pipeline-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'dynamic-test', version: '1.0.0' }));
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  fs.symlinkSync(path.resolve('packages/expo-modules-autolinking'), path.join(root, 'node_modules/expo-modules-autolinking'), 'dir');
  return root;
};

test('upstream public compiler supports Harmony providers while excluding Android and iOS mods', async () => {
  const seen = [];
  let config = { name: 'Prototype', slug: 'prototype' };
  config = upstream.withMod(config, { platform: 'harmony', mod: 'app', action: c => { c.modResults.vendor = 'third-party'; seen.push('harmony'); return c; } });
  config = upstream.withMod(config, { platform: 'android', mod: 'manifest', action: () => { throw new Error('Android mod must not run'); } });
  config = upstream.withMod(config, { platform: 'ios', mod: 'infoPlist', action: () => { throw new Error('iOS mod must not run'); } });
  config = upstream.BaseMods.withGeneratedBaseMods(config, { platform: 'harmony', providers: { app: {
    getFilePath: () => '', read: () => ({ vendor: 'expo' }), write: (_file, result) => { assert.equal(result.modResults.vendor, 'third-party'); },
  } } });
  await upstream.compileModsAsync(config, { projectRoot: os.tmpdir(), platforms: ['harmony'] });
  assert.deepEqual(seen, ['harmony']);
});

test('prebuild evaluates dynamic TS once and passes its exact public snapshot to native generation', async () => {
  const root = fixture();
  const previous = process.env.SDK54_M1_NAME;
  process.env.SDK54_M1_NAME = 'Environment Name';
  try {
    fs.writeFileSync(path.join(root, 'app.config.ts'), `import fs from 'fs'; export default () => { fs.appendFileSync(${JSON.stringify(path.join(root, 'evaluations'))}, 'x'); return { name: process.env.SDK54_M1_NAME, slug: 'dynamic-ts', icon: './icon.png', version: '2.3.4' }; };`);
    let options;
    let captured;
    const order = [];
    const { prebuildHarmonyAsync } = load();
    await prebuildHarmonyAsync(root, { install: false }, {
      getConfig: (project, opts) => { options = opts; order.push('evaluate'); return getConfig(project, opts); },
      ensureDependencies: async () => {},
      loadAutolinking: async () => ({
        queryAutolinkingModulesFromProjectAsync: async () => { order.push('discover'); return [{ packageName: 'expo-modules-core', packageRoot: '/core' }]; },
        syncHarmonyNativeProjectAsync: async input => { order.push('commit'); captured = input; return { harmonyRoot: path.join(root, 'harmony') }; },
        validateHarmonyAppAssetsAsync: async () => {},
      }),
      compileConfig: async (_project, _exp, snapshot) => { order.push('plan'); return { snapshot, nativeConfig: { app: {}, module: {} } }; },
      removeHarmonyProject: async () => { throw new Error('Unexpected clean'); },
      updateDebugBundlePath: async () => {},
    });
    assert.equal(options.skipPlugins, undefined, 'Harmony cannot skip explicitly configured plugins');
    assert.equal(options.isModdedConfig, true);
    assert.equal(fs.readFileSync(path.join(root, 'evaluations'), 'utf8'), 'x');
    assert.equal(captured.appConfig.name, 'Environment Name');
    assert.equal(captured.appConfig.version, '2.3.4');
    assert.deepEqual(order, ['evaluate', 'discover', 'plan', 'commit']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    if (previous === undefined) delete process.env.SDK54_M1_NAME; else process.env.SDK54_M1_NAME = previous;
  }
});

for (const kind of ['json', 'js']) test(`prebuild consumes app.config ${kind} once with the same normalized identity`, async () => {
  const root = fixture();
  try {
    const config = { name: 'Universal', slug: 'configured', icon: './icon.png', harmony: { name: 'Harmony override', bundleName: 'com.example.configured', version: '3.2.1' } };
    fs.writeFileSync(path.join(root, 'icon.png'), 'image bytes');
    if (kind === 'json') fs.writeFileSync(path.join(root, 'app.json'), JSON.stringify({ expo: config }));
    else fs.writeFileSync(path.join(root, 'app.config.js'), `module.exports = () => { require('fs').appendFileSync(${JSON.stringify(path.join(root, 'evaluations'))}, 'x'); return ${JSON.stringify(config)}; };`);
    let reads = 0;
    let captured;
    const native = loadM1Source('packages/expo-modules-autolinking/src/platforms/harmony/nativeProject.ts');
    await load().prebuildHarmonyAsync(root, { install: false }, {
      getConfig: (...args) => { reads++; return getConfig(...args); },
      ensureDependencies: async () => {},
      loadAutolinking: async () => ({
        queryAutolinkingModulesFromProjectAsync: async () => [{ packageName: 'expo-modules-core', packageRoot: '/core' }],
        validateHarmonyAppAssetsAsync: native.validateHarmonyAppAssetsAsync,
        syncHarmonyNativeProjectAsync: async input => { captured = input; return { harmonyRoot: path.join(root, 'harmony') }; },
      }),
      removeHarmonyProject: async () => { throw new Error('Unexpected clean'); },
      updateDebugBundlePath: async () => {},
    });
    assert.equal(reads, 1);
    if (kind === 'js') assert.equal(fs.readFileSync(path.join(root, 'evaluations'), 'utf8'), 'x');
    assert.equal(captured.appName, 'Harmony override');
    assert.equal(captured.appConfig.name, 'Universal');
    assert.equal(captured.nativeConfig.app.bundleName, captured.bundleName);
    assert.equal(captured.nativeConfig.app.versionName, captured.appConfig.harmony.version);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('invalid dynamic configuration leaves a pre-existing project intact even with clean', async () => {
  const events = [];
  const { prebuildHarmonyAsync } = load();
  await assert.rejects(prebuildHarmonyAsync('/invalid-project', { install: false, clean: true }, {
    getConfig: () => { events.push('evaluate'); throw new Error('Invalid configuration source'); },
    ensureDependencies: async () => {},
    loadAutolinking: async () => { throw new Error('Discovery must not start'); },
    removeHarmonyProject: async () => { events.push('delete-old-project'); },
    updateDebugBundlePath: async () => {},
  }), /Invalid configuration source/);
  assert.deepEqual(events, ['evaluate']);
});

test('missing snapshot assets are rejected before clean deletes the previous project', async () => {
  const root = fixture();
  try {
    fs.writeFileSync(path.join(root, 'app.json'), JSON.stringify({ expo: { name: 'Missing asset', slug: 'missing', icon: './missing.png' } }));
    const harmonyRoot = path.join(root, 'harmony');
    fs.mkdirSync(harmonyRoot);
    fs.writeFileSync(path.join(harmonyRoot, 'user-file'), 'must survive');
    const native = loadM1Source('packages/expo-modules-autolinking/src/platforms/harmony/nativeProject.ts');
    await assert.rejects(load().prebuildHarmonyAsync(root, { install: false, clean: true }, {
      getConfig, ensureDependencies: async () => {},
      loadAutolinking: async () => ({
        queryAutolinkingModulesFromProjectAsync: async () => [{ packageName: 'expo-modules-core', packageRoot: '/core' }],
        validateHarmonyAppAssetsAsync: native.validateHarmonyAppAssetsAsync,
        syncHarmonyNativeProjectAsync: async () => { throw new Error('Must not synchronize invalid assets'); },
      }),
      removeHarmonyProject: async () => fs.rmSync(harmonyRoot, { recursive: true }),
      updateDebugBundlePath: async () => {},
    }), /asset is missing/);
    assert.equal(fs.readFileSync(path.join(harmonyRoot, 'user-file'), 'utf8'), 'must survive');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the real Autolinking public entry exposes the preflight API used by the CLI', () => {
  const api = loadM1Source('packages/expo-modules-autolinking/src/exports.ts');
  assert.equal(typeof api.validateHarmonyAppAssetsAsync, 'function');
  assert.equal(typeof api.validateHarmonyAppConfigurationAsync, 'function');
});

test('registration rejects missing, undeclared, duplicate real files and empty Harmony implementations', async () => {
  const root = fixture();
  try {
    const { validateHarmonyPlugins, compileHarmonyConfigAsync } = loadM1Source('packages/@expo/cli/src/prebuild/harmony/configPlugins.ts');
    assert.throws(() => validateHarmonyPlugins(root, { plugins: ['missing-m1-plugin'] }), /missing-m1-plugin/);
    fs.writeFileSync(path.join(root, 'plain.js'), 'module.exports = c => c;');
    assert.throws(() => validateHarmonyPlugins(root, { plugins: ['./plain.js'] }), /plain.js.*Harmony/i);
    fs.writeFileSync(path.join(root, 'supported.js'), "module.exports = Object.assign(c => c, { harmony: { platforms: ['harmony'] } });");
    fs.symlinkSync(path.join(root, 'supported.js'), path.join(root, 'alias.js'));
    assert.throws(() => validateHarmonyPlugins(root, { plugins: ['./supported.js', './alias.js'] }), /duplicate.*alias.js/i);
    await assert.rejects(compileHarmonyConfigAsync(root, { plugins: ['./supported.js'] }, { expoConfig: { name: 'App' }, harmony: { name: 'App', bundleName: 'dev.expo.app', version: '1.0.0', versionCode: 1, orientation: 'default', userInterfaceStyle: 'light', scheme: [], querySchemes: [], permissions: [], extensions: {} } }), /supported.js.*implementation/i);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('compiler runs a declared third-party mod in memory and diagnoses plugin failures', async () => {
  const root = fixture();
  try {
    fs.writeFileSync(path.join(root, 'plugin.js'), "module.exports = Object.assign(c => c, { harmony: { platforms: ['harmony'] } });");
    const { compileHarmonyConfigAsync } = loadM1Source('packages/@expo/cli/src/prebuild/harmony/configPlugins.ts');
    const { resolveHarmonyConfig } = loadM1Source('packages/@expo/cli/src/harmony/config.ts');
    let exp = { name: 'App', slug: 'app', plugins: ['./plugin.js'], harmony: { scheme: 'myapp', permissions: [{ name: 'ohos.permission.CAMERA' }] } };
    const snapshot = resolveHarmonyConfig(exp);
    exp = upstream.withMod(exp, { platform: 'harmony', mod: 'app', action: c => { assert.equal(c.modResults.vendor, 'expo'); assert.equal(c.modResults.icon, '$media:app_icon'); c.modResults.vendor = 'independent'; return c; } });
    exp = upstream.withMod(exp, { platform: 'android', mod: 'manifest', action: () => { throw new Error('Android mod must not run'); } });
    const compiled = await compileHarmonyConfigAsync(root, exp, snapshot);
    assert.equal(compiled.nativeConfig.app.vendor, 'independent');
    assert.equal(compiled.nativeConfig.app.bundleName, 'dev.expo.app');
    assert.equal(compiled.nativeConfig.module.abilities[0].skills.length, 2, 'home skill must survive scheme addition');
    assert.ok(compiled.nativeConfig.module.requestPermissions.some(p => p.name === 'ohos.permission.CAMERA'));
    const broken = upstream.withMod({ name: 'App', slug: 'app', plugins: ['./plugin.js'] }, { platform: 'harmony', mod: 'app', action: () => { throw new Error('provider fixture failure'); } });
    await assert.rejects(compileHarmonyConfigAsync(root, broken, snapshot), /plugin.js.*provider fixture failure/s);
    const invalid = upstream.withMod({ name: 'App', slug: 'app', plugins: ['./plugin.js'] }, { platform: 'harmony', mod: 'module', action: c => { c.modResults.querySchemes = 'not-an-array'; return c; } });
    await assert.rejects(compileHarmonyConfigAsync(root, invalid, snapshot), /querySchemes/);
    let extended = upstream.withMod({ name: 'App', slug: 'app', plugins: ['./plugin.js'] }, { platform: 'harmony', mod: 'module', action: c => { c.modResults.abilities[0].orientation = 'auto_rotation'; return c; } });
    extended = upstream.withMod(extended, { platform: 'harmony', mod: 'app', action: c => { delete c.modResults.vendor; return c; } });
    const extensionPlan = await compileHarmonyConfigAsync(root, extended, snapshot);
    assert.equal(extensionPlan.nativeConfig.module.abilities[0].orientation, 'auto_rotation');
    assert.equal(extensionPlan.nativeConfig.app.vendor, undefined);
    assert.equal(fs.existsSync(path.join(root, 'harmony')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
