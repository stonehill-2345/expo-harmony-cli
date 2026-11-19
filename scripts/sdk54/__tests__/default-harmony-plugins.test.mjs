import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { loadM1Source } from '../m1-test-support.mjs';

const require = createRequire(path.resolve('packages/@expo/cli/package.json'));
const helpers = loadM1Source('packages/@expo/cli/src/harmony/config.ts');
const native = loadM1Source('packages/expo-modules-autolinking/src/platforms/harmony/nativeProject.ts');
const compiler = loadM1Source('packages/@expo/cli/src/prebuild/harmony/configPlugins.ts');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-default-plugins-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync('templates/expo-template-default/assets', path.join(root, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(root, 'node_modules'));
  for (const name of ['expo', 'expo-modules-autolinking']) {
    fs.symlinkSync(path.resolve('packages', name), path.join(root, 'node_modules', name));
  }
  for (const name of ['expo-router', 'expo-splash-screen']) {
    const source = path.resolve('packages', name);
    const target = path.join(root, 'node_modules', name);
    fs.mkdirSync(target);
    for (const file of ['package.json', 'app.plugin.js', 'plugin']) {
      fs.cpSync(path.join(source, file), path.join(target, file), { recursive: true });
    }
    fs.symlinkSync(path.join(source, 'node_modules'), path.join(target, 'node_modules'));
  }
  // Exercise the public plugin entry points against current CLI source, not stale build output.
  const entry = path.resolve('packages/expo/harmony-config.js');
  const previous = require.cache[entry];
  require.cache[entry] = { exports: helpers };
  t.after(() => { if (previous) require.cache[entry] = previous; else delete require.cache[entry]; });
  const config = JSON.parse(fs.readFileSync('templates/expo-template-default/app.json')).expo;
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"default-plugin-consumer","version":"1.0.0"}');
  return { root, config };
}

async function configure(root, config) {
  fs.writeFileSync(path.join(root, 'app.json'), JSON.stringify({ expo: config }));
  const { exp } = require('@expo/config').getConfig(root, { isModdedConfig: true, skipSDKVersionRequirement: true });
  const registrations = compiler.validateHarmonyPlugins(root, exp);
  const snapshot = helpers.resolveHarmonyConfig(exp);
  const plan = await compiler.compileHarmonyConfigAsync(root, exp, snapshot);
  await native.copyHarmonyTemplateMediaAsync(root, path.join(root, 'harmony'), snapshot.expoConfig);
  return { exp, registrations, snapshot, plan };
}

test('unchanged default plugin list compiles with real plugins and generates light/dark splash resources', async t => {
  const { root, config } = fixture(t);
  const { exp, registrations, plan, snapshot } = await configure(root, config);
  assert.equal(registrations.length, 2);
  assert.deepEqual(registrations[0].platforms, ['ios', 'android']);
  assert.ok(registrations[1].platforms.includes('harmony'));
  assert.ok(exp.mods.ios && exp.mods.android, 'upstream platform mods remain registered');
  assert.ok(exp.extra.router, 'Router JS configuration remains present');
  assert.equal(snapshot.harmony.splash.imageWidth, 200);
  const entry = plan.nativeConfig.module.abilities.find(ability => ability.name === 'EntryAbility');
  assert.equal(entry.startWindowIcon, '$media:startIcon');
  assert.ok(entry.skills.some(skill => skill.uris?.some(uri => uri.scheme === config.scheme)));
  const resource = file => path.join(root, 'harmony/entry/src/main/resources', file);
  assert.deepEqual(fs.readFileSync(resource('base/media/startIcon.png')), fs.readFileSync(path.join(root, 'assets/images/splash-icon.png')));
  assert.equal(JSON.parse(fs.readFileSync(resource('dark/element/color.json'))).color[0].value, '#000000');
  assert.equal(JSON.parse(fs.readFileSync(resource('base/element/float.json'))).float[0].value, '200vp');
  assert.equal(JSON.parse(fs.readFileSync(resource('base/element/string.json'))).string[0].value, 'contain');
});

test('Harmony splash overrides win and dark assets are checked before generation', async t => {
  const { root, config } = fixture(t);
  config.harmony = { splash: { imageWidth: 120, dark: { image: './assets/images/icon.png', backgroundColor: '#112233' } } };
  const { snapshot } = await configure(root, config);
  assert.equal(snapshot.harmony.splash.imageWidth, 120);
  assert.deepEqual(fs.readFileSync(path.join(root, 'harmony/entry/src/main/resources/dark/media/startIcon.png')), fs.readFileSync(path.join(root, 'assets/images/icon.png')));
  config.harmony.splash.dark.image = './missing.png';
  await assert.rejects(configure(root, config), /asset is missing/);
  config.harmony.splash.imageWidth = -1;
  await assert.rejects(configure(root, config), /imageWidth/);
});
