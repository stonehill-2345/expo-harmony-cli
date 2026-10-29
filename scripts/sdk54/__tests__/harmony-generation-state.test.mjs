import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadM1Source } from '../m1-test-support.mjs';

const source = 'packages/expo-modules-autolinking/src/platforms/harmony/generationState.ts';
const write = (root, file, content) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), typeof content === 'string' ? content : JSON.stringify(content));
};
const tree = root => Object.fromEntries(fs.readdirSync(root, { recursive: true }).sort()
  .filter(file => fs.lstatSync(path.join(root, file)).isFile())
  .map(file => [file, fs.readFileSync(path.join(root, file), 'utf8')]));
const fixture = t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-m2-state-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const stage = path.join(root, 'stage');
  const current = path.join(root, 'current');
  fs.mkdirSync(stage); fs.mkdirSync(current);
  return { root, stage, current };
};
const api = () => loadM1Source(source);

test('regeneration preserves private and executable user files and managed file permissions', async t => {
  const { stage, current } = fixture(t);
  write(stage, 'module.json5', { version: 1 });
  await api().mergeHarmonyGenerationStateAsync({ stageRoot: stage });
  fs.cpSync(stage, current, { recursive: true });
  write(current, 'user-build.sh', '#!/bin/sh\necho build\n');
  write(current, 'private.txt', 'private');
  fs.chmodSync(path.join(current, 'user-build.sh'), 0o755);
  fs.chmodSync(path.join(current, 'private.txt'), 0o600);
  fs.chmodSync(path.join(current, 'module.json5'), 0o640);
  write(stage, 'module.json5', { version: 2 });
  await api().mergeHarmonyGenerationStateAsync({ stageRoot: stage, currentRoot: current });
  for (const [file, mode] of [['user-build.sh', 0o755], ['private.txt', 0o600], ['module.json5', 0o640]]) {
    assert.equal(fs.statSync(path.join(stage, file)).mode & 0o777, mode, file);
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(stage, 'module.json5'))).version, 2);
});

test('state deterministically tracks only relative generated paths and no user files', async t => {
  const { stage, current } = fixture(t);
  write(stage, 'module.json5', "// template comment\n{module:{name:'entry', querySchemes:['first'],},}");
  write(stage, 'generated/A.ets', 'generated');
  await api().mergeHarmonyGenerationStateAsync({ stageRoot: stage });
  const initial = tree(stage);
  const state = JSON.parse(initial['.expo-harmony-state.json']);
  assert.equal(state.schemaVersion, 1);
  assert.match(state.files['module.json5'].sha256, /^[a-f0-9]{64}$/);
  assert.equal(state.files['generated/A.ets'].owner, 'expo-harmony');
  assert.ok(!initial['.expo-harmony-state.json'].includes(stage));
  fs.cpSync(stage, current, { recursive: true });
  fs.rmSync(stage, { recursive: true }); fs.mkdirSync(stage);
  write(stage, 'module.json5', "// template comment\n{module:{name:'entry', querySchemes:['first'],},}");
  write(stage, 'generated/A.ets', 'generated');
  await api().mergeHarmonyGenerationStateAsync({ stageRoot: stage, currentRoot: current });
  assert.deepEqual(tree(stage), initial);
});

test('JSON5 three-way merge removes managed named and content-keyed items while preserving user fields', async t => {
  const { stage, current } = fixture(t);
  const manifest = { module: { name: 'entry', pluginFlag: true,
    requestPermissions: [{ name: 'CAMERA', reason: 'shared' }, { name: 'MICROPHONE' }],
    abilities: [{ name: 'EntryAbility', skills: [{ actions: ['home'] }, { uris: [{ scheme: 'old' }] }] }],
    querySchemes: ['old'],
  } };
  write(stage, 'module.json5', manifest);
  write(stage, 'expo-modules/module/a.ets', 'managed');
  await api().mergeHarmonyGenerationStateAsync({ stageRoot: stage });
  fs.cpSync(stage, current, { recursive: true });
  write(current, 'expo-modules/module/user.ets', 'user');
  manifest.module.userExtension = { enabled: true };
  manifest.module.requestPermissions.push({ name: 'USER' });
  manifest.module.abilities[0].skills.push({ actions: ['user'] });
  write(current, 'module.json5', '// user comment\n' + JSON.stringify(manifest));
  fs.rmSync(stage, { recursive: true }); fs.mkdirSync(stage);
  write(stage, 'module.json5', { module: { name: 'entry', requestPermissions: [{ name: 'CAMERA', reason: 'shared' }],
    abilities: [{ name: 'EntryAbility', skills: [{ actions: ['home'] }] }], querySchemes: [] } });
  await api().mergeHarmonyGenerationStateAsync({ stageRoot: stage, currentRoot: current });
  const actual = JSON.parse(fs.readFileSync(path.join(stage, 'module.json5'), 'utf8')).module;
  assert.deepEqual(actual.requestPermissions.map(p => p.name), ['CAMERA', 'USER']);
  assert.deepEqual(actual.abilities[0].skills, [{ actions: ['home'] }, { actions: ['user'] }]);
  assert.deepEqual(actual.querySchemes, []);
  assert.equal(actual.pluginFlag, undefined);
  assert.deepEqual(actual.userExtension, { enabled: true });
  assert.equal(fs.existsSync(path.join(stage, 'expo-modules/module/a.ets')), false);
  assert.equal(fs.readFileSync(path.join(stage, 'expo-modules/module/user.ets'), 'utf8'), 'user');
  assert.equal(JSON.parse(fs.readFileSync(path.join(stage, '.expo-harmony-state.json'), 'utf8')).files['expo-modules/module/user.ets'], undefined);
});

test('managed file and JSON conflicts fail before replacing user content', async t => {
  const { stage, current } = fixture(t);
  write(stage, 'managed.ets', 'before');
  write(stage, 'module.json5', { module: { version: 1 } });
  await api().mergeHarmonyGenerationStateAsync({ stageRoot: stage });
  fs.cpSync(stage, current, { recursive: true });
  write(current, 'managed.ets', 'user edit');
  write(stage, 'managed.ets', 'after');
  await assert.rejects(api().mergeHarmonyGenerationStateAsync({ stageRoot: stage, currentRoot: current }), /conflict.*managed\.ets/i);
  write(stage, 'managed.ets', 'before');
  write(current, 'module.json5', '{module:{version:7,},}');
  write(stage, 'module.json5', { module: { version: 2 } });
  await assert.rejects(api().mergeHarmonyGenerationStateAsync({ stageRoot: stage, currentRoot: current }), /conflict.*module\.json5.*version/i);
  assert.equal(fs.readFileSync(path.join(current, 'managed.ets'), 'utf8'), 'user edit');
});

test('legacy migration preserves uncertain existing contents and clean builds only desired files', async t => {
  const { stage, current } = fixture(t);
  write(current, 'module.json5', '{module:{name:"user-name", user:true}}');
  write(current, 'manual.ets', 'user');
  write(current, 'entry.ets', 'user entry');
  write(stage, 'module.json5', { module: { name: 'entry', generated: true } });
  write(stage, 'entry.ets', 'template entry');
  await api().mergeHarmonyGenerationStateAsync({ stageRoot: stage, currentRoot: current });
  const actual = JSON.parse(fs.readFileSync(path.join(stage, 'module.json5'), 'utf8')).module;
  assert.equal(actual.name, 'user-name');
  assert.equal(actual.generated, true);
  assert.equal(actual.user, true);
  assert.equal(fs.readFileSync(path.join(stage, 'entry.ets'), 'utf8'), 'user entry');
  fs.rmSync(stage, { recursive: true }); fs.mkdirSync(stage);
  write(stage, 'entry.ets', 'clean');
  await api().mergeHarmonyGenerationStateAsync({ stageRoot: stage, currentRoot: current, clean: true });
  assert.equal(fs.existsSync(path.join(stage, 'manual.ets')), false);
});

test('preserves unowned symlinks without following them and rejects managed symlinks and state traversal', async t => {
  const { root, stage, current } = fixture(t);
  write(root, 'outside', 'outside');
  fs.symlinkSync(path.join(root, 'outside'), path.join(current, 'alias'));
  await api().mergeHarmonyGenerationStateAsync({ stageRoot: stage, currentRoot: current });
  assert.equal(fs.readlinkSync(path.join(stage, 'alias')), path.join(root, 'outside'));
  fs.unlinkSync(path.join(stage, 'alias'));
  write(stage, 'alias', 'managed');
  await assert.rejects(api().mergeHarmonyGenerationStateAsync({ stageRoot: stage, currentRoot: current }), /symbolic link/i);
  fs.unlinkSync(path.join(stage, 'alias'));
  fs.unlinkSync(path.join(current, 'alias'));
  write(current, '.expo-harmony-state.json', { schemaVersion: 1, files: { '../outside': { sha256: 'x', owner: 'expo-harmony' } } });
  await assert.rejects(api().mergeHarmonyGenerationStateAsync({ stageRoot: stage, currentRoot: current }), /relative|path/i);
  assert.equal(fs.readFileSync(path.join(root, 'outside'), 'utf8'), 'outside');
});

test('native generation uses a fresh transaction stage, relative CMake paths, and removes final module references', async t => {
  const { root } = fixture(t);
  write(root, 'icon.png', 'initial icon');
  const packageRoot = path.join(root, 'node_modules/example-module');
  write(packageRoot, 'harmony/index.ets', 'export class ExamplePackage {}');
  write(packageRoot, 'harmony/src/main/ets/Example.ets', 'export class Example {}');
  write(packageRoot, 'harmony/cpp/Example.h', '// fixture header');
  write(packageRoot, 'harmony/cpp/CMakeLists.txt', 'add_library(example SHARED Example.cpp)');
  const module = { packageName: 'example-module', packageRoot, kind: 'turbo-module', lifecycleDependencies: [],
    cpp: { packageClass: 'ExamplePackage', header: 'Example.h', cmakeTarget: 'example', cmakePath: path.join(packageRoot, 'harmony/cpp') },
    ets: { packageClass: 'ExamplePackage', importPath: '@example/module', entrypoint: path.join(packageRoot, 'harmony/index.ets') } };
  const native = loadM1Source('packages/expo-modules-autolinking/src/platforms/harmony/nativeProject.ts', {
    './releasedCompatibility': {
      copyReleasedRnohCompatibilityHarAsync: async ({ outputHarPath }) => {
        write(path.dirname(outputHarPath), path.basename(outputHarPath), 'released HAR');
        return outputHarPath;
      },
    },
  });
  const options = { projectRoot: root, appName: 'Example', bundleName: 'dev.example.app', appConfig: { icon: './icon.png' },
    modules: [module], inputHarPath: 'verified boundary', corePackageRoot: 'verified boundary',
    nativeConfig: { module: { querySchemes: ['old'], requestPermissions: [{ name: 'CAMERA' }], pluginFlag: true } } };
  const first = await native.prepareHarmonyNativeProjectAsync(options);
  assert.equal(first.harmonyRoot, path.join(root, 'harmony'));
  assert.ok(!JSON.stringify(first).includes('.expo-harmony-generation'));
  const original = tree(first.harmonyRoot);
  assert.ok(!original['entry/src/main/cpp/generated/expo-modules.cmake'].includes(root));
  await native.syncHarmonyNativeProjectAsync(options);
  assert.deepEqual(tree(first.harmonyRoot), original);
  write(first.harmonyRoot, 'expo-modules/example__module/user.ets', 'user');
  const manifestPath = 'entry/src/main/module.json5';
  const manifest = JSON.parse(original[manifestPath]);
  manifest.module.userFlag = true;
  write(first.harmonyRoot, manifestPath, '// user JSON5\n' + JSON.stringify(manifest));
  write(root, 'icon.png', 'updated icon');
  let finalized = false;
  await native.syncHarmonyNativeProjectAsync({ ...options, modules: [], nativeConfig: { module: { querySchemes: [], requestPermissions: [] } },
    finalize: async stageRoot => { finalized = true; assert.notEqual(stageRoot, first.harmonyRoot); write(stageRoot, 'debug.finalized', 'stage'); } });
  assert.equal(finalized, true);
  const updated = tree(first.harmonyRoot);
  assert.equal(updated['expo-modules/example__module/harmony/index.ets'], undefined);
  assert.equal(updated['expo-modules/example__module/user.ets'], 'user');
  assert.ok(!updated['entry/oh-package.json5'].includes('@example/module'));
  const actual = JSON.parse(updated[manifestPath]).module;
  assert.deepEqual(actual.querySchemes, []);
  assert.deepEqual(actual.requestPermissions, []);
  assert.equal(actual.pluginFlag, undefined);
  assert.equal(actual.userFlag, true);
  assert.equal(updated['AppScope/resources/base/media/app_icon.png'], 'updated icon');
  assert.equal(updated['debug.finalized'], 'stage');
});

test('staging rejects ETS source links that escape the declaring package', async t => {
  const { root, stage } = fixture(t);
  write(stage, 'entry/oh-package.json5', {});
  write(stage, 'build-profile.json5', { modules: [] });
  write(root, 'outside.ets', 'export class Escape {}');
  const packageRoot = path.join(root, 'package');
  fs.mkdirSync(packageRoot);
  fs.symlinkSync(path.join(root, 'outside.ets'), path.join(packageRoot, 'index.ets'));
  const native = loadM1Source('packages/expo-modules-autolinking/src/platforms/harmony/nativeProject.ts');
  await assert.rejects(native.stageHarmonyEtsPackagesAsync([{ packageName: 'escape', packageRoot, kind: 'turbo-module',
    ets: { packageClass: 'Escape', importPath: '@test/escape', entrypoint: path.join(packageRoot, 'index.ets') }, lifecycleDependencies: [] }], stage), /outside its package root|symbolic link/i);
});

test('removing an edited named managed item rejects the conflicting update', async t => {
  const { stage, current } = fixture(t);
  write(stage, 'module.json5', { module: { requestPermissions: [{ name: 'CAMERA', reason: 'generated' }] } });
  await api().mergeHarmonyGenerationStateAsync({ stageRoot: stage });
  fs.cpSync(stage, current, { recursive: true });
  write(current, 'module.json5', { module: { requestPermissions: [{ name: 'CAMERA', reason: 'user edit' }] } });
  write(stage, 'module.json5', { module: { requestPermissions: [] } });
  await assert.rejects(api().mergeHarmonyGenerationStateAsync({ stageRoot: stage, currentRoot: current }), /conflict.*CAMERA/i);
});

test('JSON field names are data including __proto__', async t => {
  const { stage, current } = fixture(t);
  write(stage, 'module.json5', '{module:{name:"entry"}}');
  await api().mergeHarmonyGenerationStateAsync({ stageRoot: stage });
  fs.cpSync(stage, current, { recursive: true });
  write(current, 'module.json5', '{module:{name:"entry",__proto__:{user:true}}}');
  await api().mergeHarmonyGenerationStateAsync({ stageRoot: stage, currentRoot: current });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(stage, 'module.json5'), 'utf8')).module.__proto__, { user: true });
  assert.equal({}.user, undefined);
});

test('real dependency discovery keeps transitive HAR references until the final declaration is removed', async t => {
  const { root } = fixture(t);
  write(root, 'icon.png', 'icon');
  const packageRoot = path.join(root, 'node_modules/shared-native');
  write(packageRoot, 'package.json', { name: 'shared-native', version: '1.0.0' });
  write(packageRoot, 'shared.har', 'shared HAR');
  write(packageRoot, 'expo-module.config.json', { platforms: ['harmony'], harmony: { kind: 'har', har: { packageName: '@example/shared', packagePath: 'shared.har' } } });
  const wrapper = path.join(root, 'node_modules/wrapper');
  const projectPackage = { name: 'app', version: '1.0.0', dependencies: { wrapper: '1.0.0', 'shared-native': '1.0.0' } };
  write(root, 'package.json', projectPackage);
  write(wrapper, 'package.json', { name: 'wrapper', version: '1.0.0', dependencies: { 'shared-native': '1.0.0' } });
  const discover = async () => {
    // A CLI invocation loads a fresh resolver per process; avoid sharing its memoized reads here.
    const api = loadM1Source('packages/expo-modules-autolinking/src/exports.ts');
    return api.queryAutolinkingModulesFromProjectAsync(root, { platform: 'harmony' });
  };
  const native = loadM1Source('packages/expo-modules-autolinking/src/platforms/harmony/nativeProject.ts', {
    './releasedCompatibility': { copyReleasedRnohCompatibilityHarAsync: async ({ outputHarPath }) => {
      write(path.dirname(outputHarPath), path.basename(outputHarPath), 'released HAR'); return outputHarPath;
    } },
  });
  const options = { projectRoot: root, appName: 'App', bundleName: 'dev.example.app', appConfig: { icon: './icon.png' }, inputHarPath: 'verified boundary', corePackageRoot: 'verified boundary' };
  const initial = await discover();
  assert.deepEqual(initial.map(m => m.packageName), ['shared-native']);
  const result = await native.prepareHarmonyNativeProjectAsync({ ...options, modules: initial });
  const relativeHar = 'dependencies/expo-modules/example__shared/shared.har';
  write(result.harmonyRoot, 'dependencies/expo-modules/example__shared/user.txt', 'user resource');
  delete projectPackage.dependencies['shared-native'];
  write(root, 'package.json', projectPackage);
  const transitive = await discover();
  assert.deepEqual(transitive.map(m => m.packageName), ['shared-native']);
  await native.syncHarmonyNativeProjectAsync({ ...options, modules: transitive });
  assert.equal(tree(result.harmonyRoot)[relativeHar], 'shared HAR');
  write(wrapper, 'package.json', { name: 'wrapper', version: '1.0.0', dependencies: {} });
  const removed = await discover();
  assert.deepEqual(removed, []);
  await native.syncHarmonyNativeProjectAsync({ ...options, modules: removed });
  const final = tree(result.harmonyRoot);
  assert.equal(final[relativeHar], undefined);
  assert.equal(final['dependencies/expo-modules/example__shared/user.txt'], 'user resource');
  assert.ok(!final['entry/oh-package.json5'].includes('@example/shared'));
});

test('distinct OHPM package names cannot collide in ETS or HAR generated paths', async t => {
  const { root, stage } = fixture(t);
  write(stage, 'entry/oh-package.json5', {});
  write(stage, 'build-profile.json5', {});
  const native = loadM1Source('packages/expo-modules-autolinking/src/platforms/harmony/nativeProject.ts');
  for (const names of [['@a/b', 'a__b'], ['a-b', 'a_b']]) {
    const modules = names.map((name, index) => {
      const packageRoot = path.join(root, `package-${index}`);
      write(packageRoot, 'index.ets', `export class Package${index} {}`);
      return { packageName: `package-${index}`, packageRoot, kind: 'turbo-module', lifecycleDependencies: [],
        ets: { packageClass: `Package${index}`, importPath: name, entrypoint: path.join(packageRoot, 'index.ets') } };
    });
    await assert.rejects(native.stageHarmonyEtsPackagesAsync(modules, stage), /collision/i);
  }
  write(root, 'input.har', 'HAR');
  await assert.rejects(native.stageHarmonyEtsPackagesAsync(['@a/b', 'a__b'].map((name, index) => ({
    packageName: `har-${index}`, packageRoot: root, lifecycleDependencies: [], kind: 'har', hars: [{ packageName: name, packagePath: path.join(root, 'input.har') }],
  })), stage), /collision/i);
});

test('user deletion conflicts with a new generated file version', async t => {
  const { stage, current } = fixture(t);
  write(stage, 'managed.ets', 'before');
  await api().mergeHarmonyGenerationStateAsync({ stageRoot: stage });
  fs.cpSync(stage, current, { recursive: true });
  fs.unlinkSync(path.join(current, 'managed.ets'));
  write(stage, 'managed.ets', 'after');
  await assert.rejects(api().mergeHarmonyGenerationStateAsync({ stageRoot: stage, currentRoot: current }), /conflict.*managed\.ets/i);
});

test('prebuild never follows template symlinks during placeholder replacement', async t => {
  const { root } = fixture(t);
  write(root, 'icon.png', 'icon');
  write(root, 'outside.ets', '__EXPO_APP_NAME__ outside');
  const template = path.join(root, 'template');
  fs.cpSync(path.resolve('packages/expo-modules-autolinking/templates/harmony'), template, { recursive: true });
  fs.symlinkSync(path.join(root, 'outside.ets'), path.join(template, 'external.ets'));
  const native = loadM1Source('packages/expo-modules-autolinking/src/platforms/harmony/nativeProject.ts');
  await assert.rejects(native.prepareHarmonyNativeProjectAsync({ projectRoot: root, appName: 'Replaced', bundleName: 'dev.example.app',
    appConfig: { icon: './icon.png' }, modules: [], templateRoot: template, inputHarPath: 'not accessed', corePackageRoot: 'not accessed' }), /symbolic link/i);
  assert.equal(fs.readFileSync(path.join(root, 'outside.ets'), 'utf8'), '__EXPO_APP_NAME__ outside');
});

test('repeated native generation preserves OHPM and hvigor cache symlinks', async t => {
  const { root } = fixture(t);
  write(root, 'icon.png', 'icon');
  const native = loadM1Source('packages/expo-modules-autolinking/src/platforms/harmony/nativeProject.ts', {
    './releasedCompatibility': { copyReleasedRnohCompatibilityHarAsync: async ({ outputHarPath }) => {
      write(path.dirname(outputHarPath), path.basename(outputHarPath), 'released HAR'); return outputHarPath;
    } },
  });
  const options = { projectRoot: root, appName: 'App', bundleName: 'dev.example.app', appConfig: { icon: './icon.png' }, modules: [], inputHarPath: 'verified boundary', corePackageRoot: 'verified boundary' };
  const result = await native.prepareHarmonyNativeProjectAsync(options);
  const link = path.join(result.harmonyRoot, 'entry/oh_modules/@rnoh/react-native-openharmony');
  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync('../../../oh_modules/.ohpm/rnoh', link);
  const cache = path.join(result.harmonyRoot, '.hvigor/cache-link');
  fs.mkdirSync(path.dirname(cache));
  fs.symlinkSync('/nonexistent/shared/hvigor-cache', cache);
  await native.syncHarmonyNativeProjectAsync(options);
  assert.equal(fs.readlinkSync(link), '../../../oh_modules/.ohpm/rnoh');
  assert.equal(fs.readlinkSync(cache), '/nonexistent/shared/hvigor-cache');
});

test('ownership dictionaries treat constructor and toString filenames as ordinary data', async t => {
  const { stage, current } = fixture(t);
  write(stage, 'constructor', 'generated constructor');
  await api().mergeHarmonyGenerationStateAsync({ stageRoot: stage });
  fs.cpSync(stage, current, { recursive: true });
  write(current, 'toString', 'user file');
  await api().mergeHarmonyGenerationStateAsync({ stageRoot: stage, currentRoot: current });
  const state = JSON.parse(fs.readFileSync(path.join(stage, '.expo-harmony-state.json'), 'utf8'));
  assert.equal(state.files.constructor.owner, 'expo-harmony');
  assert.equal(fs.readFileSync(path.join(stage, 'toString'), 'utf8'), 'user file');
  assert.equal(Object.hasOwn(state.files, 'toString'), false);
});

test('large unowned files are copied without whole-file buffering and remain independent', async t => {
  const { stage, current } = fixture(t);
  const file = path.join(current, 'entry/build/large-user.bin');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fd = fs.openSync(file, 'w');
  fs.writeSync(fd, Buffer.alloc(1024 * 1024, 0x51)); fs.ftruncateSync(fd, 64 * 1024 * 1024); fs.closeSync(fd);
  fs.chmodSync(file, 0o600);
  const oldTime = new Date('2020-01-01T00:00:00Z'); fs.utimesSync(file, oldTime, oldTime);
  write(current, 'unowned.json', 'not JSON; user content must remain opaque');
  const guardedFs = { ...fs, promises: { ...fs.promises, readFile: async (target, ...args) => {
    assert.notEqual(path.resolve(target), file, 'large passthrough files must not be materialized as one Buffer');
    return fs.promises.readFile(target, ...args);
  } } };
  await loadM1Source(source, { fs: guardedFs }).mergeHarmonyGenerationStateAsync({ stageRoot: stage, currentRoot: current });
  const target = path.join(stage, 'entry/build/large-user.bin');
  assert.equal(fs.statSync(target).size, fs.statSync(file).size);
  assert.equal(fs.statSync(target).mode & 0o777, 0o600);
  assert.equal(fs.statSync(target).mtimeMs, oldTime.getTime());
  assert.notEqual(fs.statSync(target).ino, fs.statSync(file).ino);
  const digest = async file => {
    const hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    return hash.digest('hex');
  };
  assert.equal(await digest(target), await digest(file));
  const handle = fs.openSync(target, 'r+'); fs.writeSync(handle, Buffer.from('changed'), 0, 7, 0); fs.closeSync(handle);
  const original = Buffer.alloc(7); const originalHandle = fs.openSync(file, 'r');
  fs.readSync(originalHandle, original, 0, 7, 0); fs.closeSync(originalHandle);
  assert.deepEqual(original, Buffer.alloc(7, 0x51));
  assert.equal(fs.readFileSync(path.join(stage, 'unowned.json'), 'utf8'), 'not JSON; user content must remain opaque');
});

test('unchanged generated content keeps current timestamps and private mode', async t => {
  const { stage, current } = fixture(t);
  write(stage, 'generated.ets', 'unchanged');
  await api().mergeHarmonyGenerationStateAsync({ stageRoot: stage });
  fs.cpSync(stage, current, { recursive: true });
  const oldTime = new Date('2020-01-01T00:00:00Z');
  fs.chmodSync(path.join(current, 'generated.ets'), 0o600);
  fs.utimesSync(path.join(current, 'generated.ets'), oldTime, oldTime);
  await api().mergeHarmonyGenerationStateAsync({ stageRoot: stage, currentRoot: current });
  assert.equal(fs.statSync(path.join(stage, 'generated.ets')).mtimeMs, oldTime.getTime());
  assert.equal(fs.statSync(path.join(stage, 'generated.ets')).mode & 0o777, 0o600);
});

test('copy failure does not modify the original user file', async t => {
  const { stage, current } = fixture(t);
  write(current, 'user.bin', 'original');
  const error = Object.assign(new Error('disk full'), { code: 'ENOSPC' });
  const failingFs = { ...fs, promises: { ...fs.promises, copyFile: async () => { throw error; } } };
  await assert.rejects(loadM1Source(source, { fs: failingFs }).mergeHarmonyGenerationStateAsync({ stageRoot: stage, currentRoot: current }), { code: 'ENOSPC' });
  assert.equal(fs.readFileSync(path.join(current, 'user.bin'), 'utf8'), 'original');
});

for (const code of ['ENOSPC', 'EACCES', 'EIO']) {
  test(`partial copy ${code} rolls back the transaction without changing source`, async t => {
    const { root } = fixture(t);
    write(root, 'harmony/user.bin', 'user data');
    write(root, 'harmony/.expo-harmony-state.json', { schemaVersion: 1, files: {} });
    const failingFs = { ...fs, promises: { ...fs.promises, copyFile: async (_source, target) => {
      fs.writeFileSync(target, 'partial');
      throw Object.assign(new Error('injected copy failure'), { code });
    } } };
    const merge = loadM1Source(source, { fs: failingFs }).mergeHarmonyGenerationStateAsync;
    const transaction = loadM1Source('packages/expo-modules-autolinking/src/platforms/harmony/generationTransaction.ts');
    await assert.rejects(transaction.runHarmonyGenerationTransactionAsync({ projectRoot: root,
      generate: stageRoot => merge({ stageRoot, currentRoot: path.join(root, 'harmony') }),
    }), { code });
    assert.equal(fs.readFileSync(path.join(root, 'harmony/user.bin'), 'utf8'), 'user data');
    assert.equal(fs.existsSync(path.join(root, '.expo-harmony-generation/lock.json')), false);
  });
}

test('independent copy fallback preserves bytes when filesystem cloning is unavailable', async t => {
  const { stage, current } = fixture(t);
  write(current, 'user.bin', 'opaque data');
  let copies = 0;
  const fallbackFs = { ...fs, promises: { ...fs.promises, copyFile: async (from, to, flags) => {
    assert.equal(flags, fs.constants.COPYFILE_FICLONE);
    copies++;
    // Model Node's documented non-FORCE fallback on a filesystem without reflinks.
    await fs.promises.copyFile(from, to);
  } } };
  await loadM1Source(source, { fs: fallbackFs }).mergeHarmonyGenerationStateAsync({ stageRoot: stage, currentRoot: current });
  assert.equal(copies, 1);
  assert.equal(fs.readFileSync(path.join(stage, 'user.bin'), 'utf8'), 'opaque data');
  assert.notEqual(fs.statSync(path.join(stage, 'user.bin')).ino, fs.statSync(path.join(current, 'user.bin')).ino);
});

test('config regeneration preserves the unchanged ability timestamp', async t => {
  const { root } = fixture(t);
  write(root, 'icon.png', 'icon');
  const native = loadM1Source('packages/expo-modules-autolinking/src/platforms/harmony/nativeProject.ts', {
    './releasedCompatibility': { copyReleasedRnohCompatibilityHarAsync: async ({ outputHarPath }) => {
      write(path.dirname(outputHarPath), path.basename(outputHarPath), 'released HAR'); return outputHarPath;
    } },
  });
  const options = { projectRoot: root, appName: 'App', bundleName: 'dev.example.app', appConfig: { icon: './icon.png' }, modules: [], inputHarPath: 'verified boundary', corePackageRoot: 'verified boundary' };
  const result = await native.prepareHarmonyNativeProjectAsync(options);
  const ability = path.join(result.harmonyRoot, 'entry/src/main/ets/entryability/EntryAbility.ets');
  const before = fs.readFileSync(ability);
  const oldTime = new Date('2020-01-01T00:00:00Z'); fs.utimesSync(ability, oldTime, oldTime);
  await native.syncHarmonyNativeProjectAsync({ ...options, nativeConfig: { app: { versionName: '1.0.1' } } });
  assert.deepEqual(fs.readFileSync(ability), before);
  assert.equal(fs.statSync(ability).mtimeMs, oldTime.getTime());
});
