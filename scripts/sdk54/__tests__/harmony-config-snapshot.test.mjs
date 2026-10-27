import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
function loadSource(filename) {
  const localRequire = createRequire(filename);
  const require = (id) => id.startsWith('.')
    ? loadSource(path.resolve(path.dirname(filename), `${id}.ts`))
    : localRequire(id);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports,__filename,__dirname){${output}\n})`, { filename })
    (require, module, module.exports, filename, path.dirname(filename));
  return module.exports;
}
const native = loadSource(path.join(repository, 'packages/expo-modules-autolinking/src/platforms/harmony/nativeProject.ts'));
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-snapshot-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'assets'));
  for (const name of ['icon', 'foreground', 'splash', 'next']) fs.writeFileSync(path.join(root, `assets/${name}.png`), name);
  return root;
}
const config = {
  name: 'Dynamic snapshot', slug: 'dynamic', icon: './assets/icon.png',
  android: { adaptiveIcon: { foregroundImage: './assets/foreground.png' } },
  splash: { image: './assets/splash.png' }, extra: { evaluated: 'once' },
};
const read = (root, relative) => fs.readFileSync(path.join(root, 'harmony', relative), 'utf8');

test('media consumes the evaluated snapshot without app.json', async (t) => {
  const root = fixture(t);
  await native.copyHarmonyTemplateMediaAsync(root, path.join(root, 'harmony'), config);
  assert.equal(read(root, 'entry/src/main/resources/base/media/background.png'), 'icon');
  assert.equal(read(root, 'entry/src/main/resources/base/media/foreground.png'), 'foreground');
  assert.equal(read(root, 'entry/src/main/resources/base/media/startIcon.png'), 'splash');
});

test('Harmony media overrides generic assets and rejects symlink escape', async (t) => {
  const root = fixture(t);
  const harmony = { icon: './assets/next.png', foregroundImage: './assets/splash.png', splash: { image: './assets/foreground.png' } };
  await native.copyHarmonyTemplateMediaAsync(root, path.join(root, 'harmony'), { ...config, harmony });
  assert.equal(read(root, 'AppScope/resources/base/media/app_icon.png'), 'next');
  assert.equal(read(root, 'entry/src/main/resources/base/media/foreground.png'), 'splash');
  assert.equal(read(root, 'entry/src/main/resources/base/media/startIcon.png'), 'foreground');
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, 'secret.png'), 'outside');
  fs.symlinkSync(path.join(outside, 'secret.png'), path.join(root, 'assets/escape.png'));
  await assert.rejects(native.copyHarmonyTemplateMediaAsync(root, path.join(root, 'harmony'), { icon: './assets/escape.png' }), /inside the project/);
  await assert.rejects(native.copyHarmonyTemplateMediaAsync(root, path.join(root, 'harmony'), { icon: '../outside.png' }), /inside the project/);
});

test('Constants writes identical snapshot bytes and never invokes the config generator', async (t) => {
  const root = fixture(t);
  const script = path.join(root, 'node_modules/expo-constants/scripts/getAppConfig.js');
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.writeFileSync(script, 'throw new Error("must never evaluate twice");');
  const output = await native.generateHarmonyAppConfigAsync({
    projectRoot: root, harmonyRoot: path.join(root, 'harmony'), appConfig: config,
    runAppConfigGenerator: async () => { throw new Error('legacy callback called'); },
  });
  assert.equal(fs.readFileSync(output, 'utf8'), JSON.stringify(config));
});

test('Constants rejects absent, nonobject and circular snapshots', async (t) => {
  const root = fixture(t);
  for (const appConfig of [undefined, null, [], 'bad']) {
    await assert.rejects(native.generateHarmonyAppConfigAsync({ projectRoot: root, harmonyRoot: path.join(root, 'harmony'), appConfig }), /snapshot|object/);
  }
  const circular = {}; circular.self = circular;
  await assert.rejects(native.generateHarmonyAppConfigAsync({ projectRoot: root, harmonyRoot: path.join(root, 'harmony'), appConfig: circular }), /circular/i);
});

test('media and Constants reject native resource symlinks escaping the Harmony root', async (t) => {
  const root = fixture(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-resource-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  const resources = path.join(root, 'harmony/entry/src/main/resources');
  fs.mkdirSync(resources, { recursive: true });
  fs.symlinkSync(outside, path.join(resources, 'base'), 'dir');
  await assert.rejects(native.copyHarmonyTemplateMediaAsync(root, path.join(root, 'harmony'), config), /inside the Harmony project/);
  fs.symlinkSync(outside, path.join(resources, 'rawfile'), 'dir');
  await assert.rejects(native.generateHarmonyAppConfigAsync({ projectRoot: root, harmonyRoot: path.join(root, 'harmony'), appConfig: config }), /inside the Harmony project/);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('Constants rejects dangling resource symlinks before writing outside the project', async (t) => {
  const root = fixture(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-dangling-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  const rawfile = path.join(root, 'harmony/entry/src/main/resources/rawfile');
  fs.mkdirSync(rawfile, { recursive: true });
  const outsideTarget = path.join(outside, 'app.config');
  fs.symlinkSync(outsideTarget, path.join(rawfile, 'app.config'));
  await assert.rejects(native.generateHarmonyAppConfigAsync({ projectRoot: root, harmonyRoot: path.join(root, 'harmony'), appConfig: config }), /inside the Harmony project|symbolic link/);
  assert.equal(fs.existsSync(outsideTarget), false);
});

test('asset preflight validates snapshot and colors without writing a native project', async (t) => {
  const root = fixture(t);
  assert.equal(typeof native.validateHarmonyAppAssetsAsync, 'function');
  await native.validateHarmonyAppAssetsAsync(root, config);
  assert.equal(fs.existsSync(path.join(root, 'harmony')), false);
  await assert.rejects(native.validateHarmonyAppAssetsAsync(root, { ...config, icon: './assets/missing.png' }), /missing/);
  await assert.rejects(native.validateHarmonyAppAssetsAsync(root, { ...config, harmony: { splash: { backgroundColor: 'invalid' } } }), /backgroundColor/);
  const circular = { ...config }; circular.extra = circular;
  await assert.rejects(native.validateHarmonyAppAssetsAsync(root, circular), /circular/i);
  assert.equal(fs.existsSync(path.join(root, 'harmony')), false);
});

test('generated theme configuration calls the actual application context API for every mode', () => {
  for (const [style, expected] of [['light', 1], ['dark', 0], ['automatic', -1]]) {
    assert.equal(typeof native.renderExpoAppConfiguration, 'function');
    const source = native.renderExpoAppConfiguration(style);
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    const module = { exports: {} };
    const actual = [];
    const require = (id) => {
      assert.equal(id, '@kit.AbilityKit');
      return { ConfigurationConstant: { ColorMode: { COLOR_MODE_LIGHT: 1, COLOR_MODE_DARK: 0, COLOR_MODE_NOT_SET: -1 } } };
    };
    vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`)(require, module, module.exports);
    module.exports.applyExpoAppConfiguration({ getApplicationContext: () => ({ setColorMode: (mode) => actual.push(mode) }) });
    assert.deepEqual(actual, [expected]);
  }
});

test('existing EntryAbility without a safe theme insertion anchor fails read-only validation', async (t) => {
  const root = fixture(t);
  const ability = path.join(root, 'harmony/entry/src/main/ets/entryability/EntryAbility.ets');
  fs.mkdirSync(path.dirname(ability), { recursive: true });
  fs.writeFileSync(ability, '// user-owned custom entry without lifecycle anchor');
  assert.equal(typeof native.validateHarmonyAppConfigurationAsync, 'function');
  await assert.rejects(native.validateHarmonyAppConfigurationAsync(path.join(root, 'harmony')), /EntryAbility.*anchor|anchor.*EntryAbility/);
  assert.equal(fs.readFileSync(ability, 'utf8'), '// user-owned custom entry without lifecycle anchor');
  await assert.rejects(native.syncHarmonyNativeProjectAsync({
    projectRoot: root, appName: config.name, bundleName: 'dev.expo.dynamic', appConfig: config,
    modules: [], inputHarPath: 'must not be accessed', corePackageRoot: 'must not be accessed',
  }), /EntryAbility.*anchor|anchor.*EntryAbility/);
  assert.equal(fs.readFileSync(ability, 'utf8'), '// user-owned custom entry without lifecycle anchor');
  assert.equal(fs.existsSync(path.join(root, 'harmony/entry/src/main/resources')), false);
});

test('invalid manifest theme plans fail before creating or changing native files', async (t) => {
  const root = fixture(t);
  await assert.rejects(native.prepareHarmonyNativeProjectAsync({
    projectRoot: root, appName: config.name, bundleName: 'dev.expo.dynamic', appConfig: config,
    nativeConfig: { app: { colorMode: 'dark' } },
    modules: [], inputHarPath: 'must not be accessed', corePackageRoot: 'must not be accessed',
  }), /app.colorMode.*userInterfaceStyle/);
  assert.equal(fs.existsSync(path.join(root, 'harmony')), false);
});

test('prepare and sync apply the same snapshot while retaining template and user content', {
  skip: !process.env.RNOH_INPUT_HAR || !process.env.RNOH_OUTPUT_HAR,
}, async (t) => {
  const root = fixture(t);
  const corePackageRoot = path.join(root, 'node_modules/expo-modules-core');
  fs.mkdirSync(path.join(corePackageRoot, 'harmony/rnoh-compat'), { recursive: true });
  fs.writeFileSync(path.join(corePackageRoot, 'harmony/rnoh-compat/prepare_har.py'), '# injected real locked output');
  const options = {
    projectRoot: root, appName: 'App "Quoted" \'Single\'\\Slash\nNext', bundleName: 'dev.expo.dynamic', modules: [],
    inputHarPath: process.env.RNOH_INPUT_HAR, corePackageRoot,
    appConfig: { ...config, harmony: { splash: { backgroundColor: '#112233' } } },
    userInterfaceStyle: 'dark',
    nativeConfig: {
      app: { versionName: '2.3.4', versionCode: 23 },
      module: { querySchemes: ['first'], abilities: [{ name: 'EntryAbility', orientation: 'portrait' }] },
    },
    runAppConfigGenerator: async () => { throw new Error('must not evaluate again'); },
    runCompatibilityTool: async ({ outputHarPath }) => {
      fs.copyFileSync(process.env.RNOH_OUTPUT_HAR, outputHarPath);
      fs.copyFileSync(`${process.env.RNOH_OUTPUT_HAR}.manifest.json`, `${outputHarPath}.manifest.json`);
    },
  };
  await native.prepareHarmonyNativeProjectAsync(options);
  assert.equal(fs.existsSync(path.join(root, 'app.json')), false);
  const app = JSON.parse(read(root, 'AppScope/app.json5')).app;
  assert.equal(JSON.parse(read(root, 'AppScope/resources/base/element/string.json')).string.find(({ name }) => name === 'app_name').value, options.appName);
  assert.ok(read(root, 'entry/src/main/ets/pages/Index.ets').includes("name: 'App \"Quoted\" \\'Single\\'\\\\Slash\\nNext'"));
  assert.equal(app.versionCode, 23);
  assert.equal(app.versionName, '2.3.4');
  assert.equal(Object.hasOwn(app, 'colorMode'), false);
  assert.ok(read(root, 'entry/src/main/ets/generated/ExpoAppConfiguration.ets').includes('ConfigurationConstant.ColorMode.COLOR_MODE_DARK'));
  const abilityPath = path.join(root, 'harmony/entry/src/main/ets/entryability/EntryAbility.ets');
  let ability = fs.readFileSync(abilityPath, 'utf8');
  assert.ok(ability.includes('applyExpoAppConfiguration(this.context);'));
  ability = ability.replace(/^import \{ applyExpoAppConfiguration \}[^\n]*\n/m, '').replace(/^\s*applyExpoAppConfiguration\(this.context\);\n/m, '');
  fs.writeFileSync(abilityPath, `${ability}\n// USER_ABILITY_CONTENT\n`);
  assert.equal(JSON.parse(read(root, 'entry/src/main/resources/base/element/color.json')).color.find(({ name }) => name === 'start_window_background').value, '#112233');
  const modulePath = path.join(root, 'harmony/entry/src/main/module.json5');
  const manifest = JSON.parse(fs.readFileSync(modulePath, 'utf8'));
  manifest.module.customUserField = 'keep';
  fs.writeFileSync(modulePath, JSON.stringify(manifest));
  assert.equal(manifest.module.abilities[0].srcEntry, './ets/entryability/EntryAbility.ets');
  assert.equal(manifest.module.abilities[0].orientation, 'portrait');
  assert.equal(manifest.module.abilities[0].skills[0].actions[0], 'action.system.home');
  const stringPath = path.join(root, 'harmony/AppScope/resources/base/element/string.json');
  const strings = JSON.parse(fs.readFileSync(stringPath, 'utf8'));
  strings.string.push({ name: 'user_label', value: 'keep me' });
  fs.writeFileSync(stringPath, JSON.stringify(strings));
  const updated = { ...config, name: 'Synced', icon: './assets/next.png', splash: { ...config.splash, backgroundColor: '#445566' } };
  await native.syncHarmonyNativeProjectAsync({ ...options, appName: 'Synced', appConfig: updated,
    userInterfaceStyle: 'automatic',
    nativeConfig: { app: { versionName: '3.0.0', versionCode: 30 }, module: { querySchemes: ['second'], abilities: [{ name: 'EntryAbility', orientation: 'landscape' }] } },
    runCompatibilityTool: async () => { throw new Error('existing HAR must be reused'); },
  });
  assert.equal(read(root, 'entry/src/main/resources/rawfile/app.config'), JSON.stringify(updated));
  assert.ok(read(root, 'entry/src/main/ets/generated/ExpoAppConfiguration.ets').includes('ConfigurationConstant.ColorMode.COLOR_MODE_NOT_SET'));
  const syncedAbility = fs.readFileSync(abilityPath, 'utf8');
  assert.equal(syncedAbility.match(/applyExpoAppConfiguration\(this.context\);/g)?.length, 1);
  assert.equal(syncedAbility.match(/import \{ applyExpoAppConfiguration \}/g)?.length, 1);
  assert.ok(syncedAbility.includes('// USER_ABILITY_CONTENT'));
  assert.equal(read(root, 'AppScope/resources/base/media/app_icon.png'), 'next');
  assert.equal(JSON.parse(read(root, 'entry/src/main/resources/base/element/color.json')).color.find(({ name }) => name === 'start_window_background').value, '#445566');
  const synced = JSON.parse(read(root, 'entry/src/main/module.json5')).module;
  assert.deepEqual(synced.querySchemes, ['second']);
  assert.equal(synced.customUserField, 'keep');
  assert.equal(synced.abilities[0].orientation, 'landscape');
  assert.equal(synced.abilities[0].srcEntry, './ets/entryability/EntryAbility.ets');
  assert.equal(JSON.parse(read(root, 'AppScope/app.json5')).app.versionCode, 30);
  assert.equal(JSON.parse(fs.readFileSync(stringPath, 'utf8')).string.find(({ name }) => name === 'user_label').value, 'keep me');
  await native.syncHarmonyNativeProjectAsync({ ...options, userInterfaceStyle: 'light' });
  assert.ok(read(root, 'entry/src/main/ets/generated/ExpoAppConfiguration.ets').includes('ConfigurationConstant.ColorMode.COLOR_MODE_LIGHT'));
  assert.equal(fs.readFileSync(abilityPath, 'utf8'), syncedAbility);
  for (const [appConfig, expected] of [
    [{ ...config, userInterfaceStyle: 'dark' }, 'COLOR_MODE_DARK'],
    [{ ...config, userInterfaceStyle: 'dark', harmony: { userInterfaceStyle: 'automatic' } }, 'COLOR_MODE_NOT_SET'],
    [config, 'COLOR_MODE_LIGHT'],
  ]) {
    await native.syncHarmonyNativeProjectAsync({ ...options, userInterfaceStyle: undefined, appConfig });
    assert.ok(read(root, 'entry/src/main/ets/generated/ExpoAppConfiguration.ets').includes(`ConfigurationConstant.ColorMode.${expected}`));
    assert.equal(fs.readFileSync(abilityPath, 'utf8'), syncedAbility);
  }
});
