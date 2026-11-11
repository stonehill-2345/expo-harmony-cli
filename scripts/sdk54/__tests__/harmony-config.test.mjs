import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire, Module } from 'node:module';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = process.cwd();
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = path.join(root, 'packages/@expo/cli/src/harmony/config.ts');
function load() {
  const compiled = ts.transpileModule(fs.readFileSync(source, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const loaded = new Module(source);
  loaded.filename = source;
  loaded.paths = Module._nodeModulePaths(path.dirname(source));
  loaded.paths.unshift(path.join(root, 'packages'));
  loaded._compile(compiled, source);
  return loaded.exports;
}

test('defaults, overrides and arrays use a single immutable public snapshot', () => {
  const { resolveHarmonyConfig } = load();
  const input = {
    name: 'Universal',
    slug: 'test-app',
    version: '2.0.0',
    icon: './icon.png',
    scheme: 'demo',
    splash: { image: './splash.png', backgroundColor: '#ffffff' },
    mods: { harmony: { app() {} } },
    _internal: { projectRoot: '/private' },
    hooks: {},
    ios: { config: { secret: true }, bundleIdentifier: 'test.ios.app' },
    android: { config: { apiKey: 'secret' } },
    updates: {
      codeSigningCertificate: '/private/cert',
      codeSigningMetadata: { keyid: 'key' },
      requestHeaders: { token: 'secret' },
    },
    harmony: {
      name: 'Harmony',
      versionCode: 12,
      splash: { backgroundColor: '#112233' },
    },
  };
  const snapshot = resolveHarmonyConfig(input, {
    bundleName: 'com.example.override',
  });
  assert.deepEqual(snapshot.harmony, {
    name: 'Harmony',
    bundleName: 'com.example.override',
    version: '2.0.0',
    versionCode: 12,
    icon: './icon.png',
    splash: { image: './splash.png', backgroundColor: '#112233' },
    scheme: ['demo'],
    querySchemes: [],
    permissions: [],
    orientation: 'default',
    userInterfaceStyle: 'light',
    extensions: {},
  });
  assert.equal(snapshot.expoConfig.mods, undefined);
  assert.equal(snapshot.expoConfig._internal, undefined);
  assert.equal(snapshot.expoConfig.hooks, undefined);
  assert.equal(snapshot.expoConfig.ios.config, undefined);
  assert.deepEqual(snapshot.expoConfig.updates, {});
  assert.equal(input.ios.config.secret, true);
  snapshot.expoConfig.harmony.name = 'changed';
  assert.equal(input.harmony.name, 'Harmony');
  assert.equal(
    resolveHarmonyConfig({ name: 'App', slug: 'test-app' }).harmony.bundleName,
    'dev.expo.testapp'
  );
  assert.equal(resolveHarmonyConfig({ name: 'App', slug: 'test-app' }).harmony.version, '1.0.0');
});

test('schema rejects invalid public fields and runtime rejects semantic and JSON errors', () => {
  const { resolveHarmonyConfig } = load();
  const schema = require(path.join(root, 'packages/expo/harmony-config.schema.json'));
  const { validate } = createRequire(source)('@expo/schema-utils');
  for (const harmony of [
    null,
    { unknown: true },
    { bundleName: '' },
    { bundleName: 'bad' },
    { versionCode: 0 },
    { orientation: 'up' },
    { userInterfaceStyle: 'sepia' },
    { scheme: '1invalid' },
    { querySchemes: ['bad:'] },
    { permissions: [{ name: '' }] },
    {
      permissions: [{ name: 'ohos.permission.CAMERA', usedScene: { when: 'never' } }],
    },
    { splash: { secret: true } },
    { extensions: { unknown: {} } },
  ]) {
    assert.throws(() => validate(schema, harmony));
    assert.throws(() => resolveHarmonyConfig({ name: 'App', slug: 'app', harmony }));
  }
  for (const harmony of [
    { scheme: ['demo', 'demo'] },
    { permissions: [{ name: 'p' }, { name: 'p', reason: 'other' }] },
    { extensions: { app: { fn() {} } } },
    { extensions: { app: { value: NaN } } },
  ]) {
    assert.throws(() => resolveHarmonyConfig({ name: 'App', slug: 'app', harmony }));
  }
  const valid = {
    bundleName: 'com.example.app',
    foregroundImage: './fg.png',
    scheme: ['demo'],
    querySchemes: ['https'],
    permissions: [
      {
        name: 'ohos.permission.CAMERA',
        reason: '$string:camera',
        usedScene: { abilities: ['EntryAbility'], when: 'inuse' },
      },
    ],
    extensions: { app: { custom: [true, null, 1] }, module: { custom: {} } },
  };
  assert.doesNotThrow(() => validate(schema, valid));
  assert.doesNotThrow(() => resolveHarmonyConfig({ name: 'App', slug: 'app', harmony: valid }));
  const reused = { name: 'App', slug: 'app', harmony: { versionCode: 1 } };
  resolveHarmonyConfig(reused);
  reused.harmony.versionCode = 0;
  assert.throws(() => resolveHarmonyConfig(reused));
  assert.throws(() => resolveHarmonyConfig({ name: 'App', slug: 'app' }, { bundleName: '' }));
});

test('Harmony helpers use real upstream withMod and explicit platform metadata', async () => {
  const { withHarmonyApp, withHarmonyModule, defineHarmonyPlugin } = load();
  let config = withHarmonyApp({ name: 'App', slug: 'app' }, async (mod) => {
    mod.modResults.vendor = true;
    return mod;
  });
  config = withHarmonyModule(config, (mod) => {
    mod.modResults.vendor = 'module';
    return mod;
  });
  assert.equal(typeof config.mods.harmony.app, 'function');
  assert.equal(typeof config.mods.harmony.module, 'function');
  const result = await config.mods.harmony.app({
    ...config,
    modResults: {},
    modRequest: { platform: 'harmony', modName: 'app', projectRoot: root },
  });
  assert.equal(result.modResults.vendor, true);
  const plugin = defineHarmonyPlugin((c) => c);
  assert.deepEqual(plugin.harmony, { platforms: ['harmony'] });
  assert.deepEqual(defineHarmonyPlugin((c) => c, { platforms: ['ios', 'android'] }).harmony, {
    platforms: ['ios', 'android'],
  });
  assert.throws(() => defineHarmonyPlugin((c) => c, { platforms: ['web'] }));
  assert.throws(() => defineHarmonyPlugin((c) => c, { platforms: [] }));
});

test('each declared Harmony plugin must register its own mod and cannot return a Promise', () => {
  const { defineHarmonyPlugin, withHarmonyApp, withHarmonyModule } = load();
  const empty = defineHarmonyPlugin((config) => config);
  const app = defineHarmonyPlugin((config) => withHarmonyApp(config, (mod) => mod));
  const module = defineHarmonyPlugin((config) => withHarmonyModule(config, (mod) => mod));
  assert.throws(() => empty({ name: 'App', slug: 'app' }), /empty Harmony implementation/);
  let config = app({ name: 'App', slug: 'app' });
  assert.throws(() => empty(config), /empty Harmony implementation/);
  assert.doesNotThrow(() => {
    config = module(config);
  });
  assert.doesNotThrow(() => {
    config = app(config);
  });
  const platformOnly = defineHarmonyPlugin((c) => c, { platforms: ['android'] });
  assert.equal(platformOnly(config), config);
  assert.throws(() => defineHarmonyPlugin(async (c) => c)(config), /must be synchronous/);
  assert.throws(
    () => defineHarmonyPlugin(() => Promise.reject(new Error('async failure')))(config),
    /must be synchronous/
  );
});

test('native SDK constraints reject invalid versions, bundle identities, schemes and permission reasons', () => {
  const { resolveHarmonyConfig } = load();
  const schema = require(path.join(root, 'packages/expo/harmony-config.schema.json'));
  const { validate } = createRequire(source)('@expo/schema-utils');
  for (const harmony of [
    { version: 'release' },
    { version: '1'.repeat(128) },
    { bundleName: 'com.app' },
    { bundleName: 'com.example.app_' },
    { querySchemes: Array.from({ length: 201 }, (_, index) => `scheme${index}`) },
    { querySchemes: ['x'.repeat(129)] },
    { permissions: [{ name: 'p', reason: 'plain text' }] },
  ]) {
    assert.throws(() => validate(schema, harmony));
    assert.throws(() => resolveHarmonyConfig({ name: 'App', slug: 'app', harmony }));
  }
  assert.doesNotThrow(() =>
    resolveHarmonyConfig({
      name: 'App',
      slug: 'app',
      harmony: {
        version: '1.2.3',
        bundleName: 'com.example.1app',
        querySchemes: ['x'.repeat(128)],
        permissions: [{ name: 'p', reason: '$string:camera' }],
      },
    })
  );
});

test('wrapper diagnostics identify the module that defined the plugin', () => {
  const { defineHarmonyPlugin } = load();
  const location = path.join(os.tmpdir(), 'independent-m1-error-plugin.cjs');
  const independent = new Module(location);
  independent.filename = location;
  independent._compile(
    'module.exports = define => [define(config => config), define(async config => config)];',
    location
  );
  const [empty, asynchronous] = independent.exports(defineHarmonyPlugin);
  assert.throws(
    () => empty({ name: 'App', slug: 'app' }),
    (error) => error.message.includes(location)
  );
  assert.throws(
    () => asynchronous({ name: 'App', slug: 'app' }),
    (error) => error.message.includes(location)
  );
});

test('public declarations accept Harmony authors and reject invalid literal contracts', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-harmony-contract-'));
  const publicModule = path.join(root, 'packages/expo/harmony-config');
  const fixture = path.join(directory, 'contract.ts');
  fs.writeFileSync(
    fixture,
    `import { HarmonyExpoConfig, HarmonyResourceContribution, resolveHarmonyConfig, withHarmonyApp, withHarmonyResources, defineHarmonyPlugin } from ${JSON.stringify(
      publicModule
    )};
const exp: HarmonyExpoConfig = { name: 'App', slug: 'app', harmony: { scheme: ['demo'], permissions: [{ name: 'p', usedScene: { when: 'inuse' } }], extensions: { module: { nested: [true, null] } } } };
const plugin = defineHarmonyPlugin((c: HarmonyExpoConfig) => withHarmonyApp(c, async mod => { mod.modResults.custom = true; return mod; }));
const name: string = resolveHarmonyConfig(exp).harmony.bundleName;
const identity = { owner: 'example', packageName: 'example', packageVersion: '1.0.0', target: 'data.json', sha256: 'hash' };
withHarmonyResources(exp, async mod => {
  mod.modResults.push({ ...identity, source: 'data.json' }, { ...identity, contents: '{}' });
  return mod.modRequest.nextMod ? await mod.modRequest.nextMod(mod) : mod;
});
// @ts-expect-error must supply bytes by one mechanism
const missingBytes: HarmonyResourceContribution = identity;
// @ts-expect-error source and inline content are mutually exclusive
const ambiguousBytes: HarmonyResourceContribution = { ...identity, source: 'data.json', contents: '{}' };
// @ts-expect-error resources mod requires an array
withHarmonyResources(exp, mod => ({ ...mod, modResults: {} }));
// @ts-expect-error invalid orientation
const badOrientation: HarmonyExpoConfig = { name: 'App', slug: 'app', harmony: { orientation: 'up' } };
// @ts-expect-error unknown Harmony key
const badField: HarmonyExpoConfig = { name: 'App', slug: 'app', harmony: { typo: true } };
// @ts-expect-error non JSON extension
const badJson: HarmonyExpoConfig = { name: 'App', slug: 'app', harmony: { extensions: { app: { fn() {} } } } };
// @ts-expect-error invalid declared platform
defineHarmonyPlugin(plugin, { platforms: ['web'] });
// @ts-expect-error async config registration is unsupported
defineHarmonyPlugin(async (c: HarmonyExpoConfig) => c);
`
  );
  try {
    const result = spawnSync(
      process.execPath,
      [
        require.resolve('typescript/bin/tsc'),
        '--noEmit',
        '--strict',
        '--skipLibCheck',
        '--moduleResolution',
        'node',
        '--target',
        'ES2022',
        fixture,
      ],
      { encoding: 'utf8' }
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Expo publishes all three public entry files and the CJS bridge targets built CLI', () => {
  const pkg = require(path.join(root, 'packages/expo/package.json'));
  for (const entry of ['harmony-config.js', 'harmony-config.d.ts', 'harmony-config.schema.json'])
    assert.ok(pkg.files.includes(entry));
  assert.match(
    fs.readFileSync(path.join(root, 'packages/expo/harmony-config.js'), 'utf8'),
    /require\('@expo\/cli\/build\/src\/harmony\/config'\)/
  );
});
