import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import { loadM1Source } from '../m1-test-support.mjs';

const root = path.resolve('packages/expo-modules-core/harmony/m3-fixture');
test('fixture installs its native module before resolving the native view', () => {
  let installed = false;
  const source = fs.readFileSync(path.join(root, 'FixtureProbe.js'), 'utf8');
  const require = name => {
    if (name === 'react') return {};
    if (name === 'react-native') return { TurboModuleRegistry: { getEnforcing: () => ({ installModule: () => { installed = true; } }) } };
    if (name === 'expo-modules-core') return {
      requireNativeModule: () => ({}),
      requireNativeViewManager: () => { assert.equal(installed, true); return () => {}; },
    };
    throw new Error(name);
  };
  vm.runInNewContext(source, { require, module: { exports: {} }, console, Date, setTimeout });
});
test('ArkTS factory supplies the matching instance required by the native fixture TurboModule', () => {
  const ets = fs.readFileSync(path.join(root, 'harmony/src/main/ets/AuthorFixturePackage.ets'), 'utf8');
  assert.match(ets, /\['ExpoM3AuthorFixture',\s*\(ctx:\s*UITurboModuleContext\)/);
});
test('independent author package packs every declared native entry', () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'm3-author-pack-'));
  try {
    const [result] = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--cache', path.join(output, 'cache'), '--pack-destination', output], { cwd: root, encoding: 'utf8' }));
    const files = new Set(result.files.map(x => x.path));
    for (const file of ['index.js', 'FixtureProbe.js', 'check-device.cjs', 'app.plugin.js', 'expo-module.config.json', 'harmony/index.ets', 'harmony/src/main/ets/AuthorFixturePackage.ets', 'harmony/cpp/CMakeLists.txt', 'harmony/cpp/AuthorFixturePackage.h', 'harmony/cpp/AuthorFixtureModule.cpp', 'harmony/cpp/AuthorFixtureView.cpp', 'harmony/tests/native/CMakeLists.txt', 'harmony/tests/native/PackageCompileTest.cpp']) assert.ok(files.has(file), file);
    assert.ok(result.size > 0);
  } finally { fs.rmSync(output, { recursive: true, force: true }); }
});

test('author metadata is parsed by the real Harmony resolver', async () => {
  const { resolveModuleAsync } = loadM1Source('packages/expo-modules-autolinking/src/platforms/harmony/harmony.ts');
  const result = await resolveModuleAsync('@expo-harmony/m3-author-fixture', { path: root, version: '0.0.1', config: { harmonyConfig: () => JSON.parse(fs.readFileSync(path.join(root, 'expo-module.config.json'))).harmony } });
  assert.equal(result.packageName, '@expo-harmony/m3-author-fixture');
  assert.equal(result.cpp.packageClass, 'expo::harmony::m3::AuthorFixturePackage');
});

test('author ETS entrypoint resolves every relative import after real native staging', async t => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'm3-author-stage-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  fs.mkdirSync(path.join(output, 'entry'));
  fs.writeFileSync(path.join(output, 'entry/oh-package.json5'), '{}');
  fs.writeFileSync(path.join(output, 'build-profile.json5'), '{}');
  const { resolveModuleAsync } = loadM1Source('packages/expo-modules-autolinking/src/platforms/harmony/harmony.ts');
  const descriptor = await resolveModuleAsync('@expo-harmony/m3-author-fixture', {
    path: root, version: '0.0.1',
    config: { harmonyConfig: () => JSON.parse(fs.readFileSync(path.join(root, 'expo-module.config.json'))).harmony },
  });
  const { stageHarmonyEtsPackagesAsync } = loadM1Source('packages/expo-modules-autolinking/src/platforms/harmony/nativeProject.ts');
  await stageHarmonyEtsPackagesAsync([descriptor], output);
  const stagedEntrypoints = fs.readdirSync(path.join(output, 'expo-modules'), { recursive: true })
    .filter(file => file.endsWith('harmony/index.ets'));
  assert.equal(stagedEntrypoints.length, 1);
  const stagedEntrypoint = path.join(output, 'expo-modules', stagedEntrypoints[0]);
  const imports = [...fs.readFileSync(stagedEntrypoint, 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)];
  assert.ok(imports.length > 0);
  for (const [, specifier] of imports) {
    if (specifier.startsWith('.')) {
      assert.ok(fs.existsSync(path.resolve(path.dirname(stagedEntrypoint), specifier + '.ets')),
        `Missing staged ETS import: ${specifier}`);
    }
  }
});

test('device checker requires all assertions, runtime turnover, native completion and rejects stale callbacks', () => {
  const { checkLog, REQUIRED } = createRequire(import.meta.url)(path.join(root, 'check-device.cjs'));
  const rows = REQUIRED.map(name => ({ name, passed: true }));
  const valid = 'M3_NATIVE_BUILD=m3-review-20261028-v2\nM3_JS_BUILD=m3-review-20261028-v2\nM3_BOOT=1\nM3_RESULTS=' + JSON.stringify(rows) + '\nM3_RESOURCE_CREATE id=11\nM3_RESOURCE_HELD=11\nM3_RELOAD_PENDING=1\nM3_NATIVE_DELAY_FINISHED cancelled=1\nM3_NATIVE_VIEW_DELAY_FINISHED invalid=1 delay=1000\nM3_RESOURCE_DESTROY id=11\nM3_JS_BUILD=m3-review-20261028-v2\nM3_BOOT=2\nM3_RESULTS=' + JSON.stringify(rows) + '\nM3_RESOURCE_CREATE id=12\nM3_RESOURCE_NEW=12\nM3_RESOURCE_DESTROY id=12\nM3_RELOAD_OBSERVED=2\nM3_QUIET_WINDOW=2\n';
  assert.equal(checkLog(valid).passed, true);
  assert.equal(checkLog('').passed, false);
  assert.equal(checkLog(valid.replace('M3_NATIVE_DELAY_FINISHED', '')).passed, false);
  assert.equal(checkLog(valid.replace('M3_NATIVE_VIEW_DELAY_FINISHED invalid=1', 'M3_NATIVE_VIEW_DELAY_FINISHED invalid=0')).passed, false);
  assert.equal(checkLog(valid.replace('M3_QUIET_WINDOW=2', '')).passed, false);
  assert.equal(checkLog(valid + 'M3_STALE_CALLBACK=1').passed, false);
  assert.equal(checkLog(valid.replace('"passed":true', '"passed":false')).passed, false);
  assert.equal(checkLog(valid.replace(JSON.stringify(rows), JSON.stringify(rows.slice(1)))).passed, false);
  assert.equal(checkLog(valid.replace('M3_BOOT=2', 'M3_BOOT=1')).passed, false);
  const resultLine = 'M3_RESULTS=' + JSON.stringify(rows) + '\n';
  const noSecondRuntimeResults = valid.replace('M3_BOOT=2\n' + resultLine, 'M3_BOOT=2\n')
    .replace('M3_RELOAD_PENDING=1', resultLine + 'M3_RELOAD_PENDING=1');
  assert.equal(checkLog(noSecondRuntimeResults).passed, false);
  assert.equal(checkLog(valid.replace('M3_RELOAD_PENDING=1\n', '').replace('M3_BOOT=1\n', 'M3_BOOT=1\nM3_RELOAD_PENDING=1\n')).passed, false);
  assert.equal(checkLog(valid.replace('M3_RELOAD_OBSERVED=2\n', '').replace('M3_BOOT=2\n', 'M3_BOOT=2\nM3_RELOAD_OBSERVED=2\n')).passed, false);
  assert.equal(checkLog(valid.replace('M3_QUIET_WINDOW=2\n', '').replace('M3_RELOAD_OBSERVED=2\n', 'M3_QUIET_WINDOW=2\nM3_RELOAD_OBSERVED=2\n')).passed, false);
  for (const completion of ['M3_NATIVE_DELAY_FINISHED cancelled=1\n', 'M3_NATIVE_VIEW_DELAY_FINISHED invalid=1 delay=1000\n']) {
    assert.equal(checkLog(completion + valid.replace(completion, '')).passed, false);
    assert.equal(checkLog(valid.replace(completion, '') + completion).passed, false);
  }
  assert.equal(checkLog(valid.replace(resultLine, resultLine + resultLine)).passed, false);
});

test('device checker requires distinct resources and one old-runtime destruction', () => {
  const { checkLog, REQUIRED } = createRequire(import.meta.url)(path.join(root, 'check-device.cjs'));
  const rows = JSON.stringify(REQUIRED.map(name => ({ name, passed: true })));
  const log = `M3_NATIVE_BUILD=m3-review-20261028-v2\nM3_JS_BUILD=m3-review-20261028-v2\nM3_BOOT=1\nM3_RESULTS=${rows}\nM3_RESOURCE_CREATE id=11\nM3_RESOURCE_HELD=11\nM3_RELOAD_PENDING=1\nM3_NATIVE_DELAY_FINISHED cancelled=1\nM3_NATIVE_VIEW_DELAY_FINISHED invalid=1 delay=1000\nM3_RESOURCE_DESTROY id=11\nM3_JS_BUILD=m3-review-20261028-v2\nM3_BOOT=2\nM3_RESOURCE_CREATE id=12\nM3_RESOURCE_NEW=12\nM3_RESOURCE_DESTROY id=12\nM3_RESULTS=${rows}\nM3_RELOAD_OBSERVED=2\nM3_QUIET_WINDOW=2\n`;
  assert.equal(checkLog(log).passed, true);
  assert.equal(checkLog(log.replace('M3_RESOURCE_DESTROY id=11\n', '')).passed, false);
  assert.equal(checkLog(log.replace('M3_RESOURCE_NEW=12', 'M3_RESOURCE_NEW=11')).passed, false);
  assert.equal(checkLog(log.replace('M3_RESOURCE_DESTROY id=11\n', 'M3_RESOURCE_DESTROY id=11\nM3_RESOURCE_DESTROY id=11\n')).passed, false);
  assert.equal(checkLog(log.replace('M3_RESOURCE_DESTROY id=12\n', '')).passed, false);
});

test('device checker rejects logs without matching native and JS build identity', () => {
  const { checkLog, REQUIRED } = createRequire(import.meta.url)(path.join(root, 'check-device.cjs'));
  const rows = JSON.stringify(REQUIRED.map(name => ({ name, passed: true })));
  const log = `M3_NATIVE_BUILD=m3-review-20261028-v2\nM3_JS_BUILD=m3-review-20261028-v2\nM3_BOOT=1\nM3_RESULTS=${rows}\nM3_RESOURCE_CREATE id=11\nM3_RESOURCE_HELD=11\nM3_RELOAD_PENDING=1\nM3_NATIVE_DELAY_FINISHED cancelled=1\nM3_NATIVE_VIEW_DELAY_FINISHED invalid=1 delay=1000\nM3_RESOURCE_DESTROY id=11\nM3_JS_BUILD=m3-review-20261028-v2\nM3_BOOT=2\nM3_RESOURCE_CREATE id=12\nM3_RESOURCE_NEW=12\nM3_RESOURCE_DESTROY id=12\nM3_RESULTS=${rows}\nM3_RELOAD_OBSERVED=2\nM3_QUIET_WINDOW=2\n`;
  assert.equal(checkLog(log).passed, true);
  assert.equal(checkLog(log.replace('M3_NATIVE_BUILD=m3-review-20261028-v2', '')).passed, false);
  assert.equal(checkLog(log.replaceAll('M3_JS_BUILD=m3-review-20261028-v2', 'M3_JS_BUILD=other')).passed, false);
});
