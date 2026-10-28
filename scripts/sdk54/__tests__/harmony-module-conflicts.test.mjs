import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadM1Source } from '../m1-test-support.mjs';

const source = 'packages/expo-modules-autolinking/src/platforms/harmony/nativeProject.ts';
const write = (root, file, contents) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), contents);
};
const tree = root => Object.fromEntries(fs.readdirSync(root, { recursive: true }).sort()
  .filter(file => fs.lstatSync(path.join(root, file)).isFile())
  .map(file => [file, fs.readFileSync(path.join(root, file)).toString('base64')]));
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-m3-graph-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, 'icon.png', 'icon');
  const module = name => {
    const packageRoot = path.join(root, 'node_modules', name);
    write(packageRoot, 'harmony/index.ets', `export { ${name}Package };`);
    write(packageRoot, `harmony/cpp/${name}.h`, '// header');
    write(packageRoot, 'harmony/cpp/CMakeLists.txt', `add_library(${name} SHARED module.cpp)`);
    return { packageName: name, packageRoot, kind: 'turbo-module', lifecycleDependencies: [],
      cpp: { packageClass: `${name}Package`, header: `${name}.h`, cmakeTarget: name, cmakePath: path.join(packageRoot, 'harmony/cpp') },
      ets: { packageClass: `${name}Package`, importPath: `@fixture/${name}`, entrypoint: path.join(packageRoot, 'harmony/index.ets') } };
  };
  const native = loadM1Source(source, { './releasedCompatibility': {
    copyReleasedRnohCompatibilityHarAsync: async ({ outputHarPath }) => {
      write(path.dirname(outputHarPath), path.basename(outputHarPath), 'released HAR'); return outputHarPath;
    },
  } });
  return { root, module, native, options: { projectRoot: root, appName: 'Graph', bundleName: 'dev.graph',
    appConfig: { icon: './icon.png' }, modules: [], inputHarPath: 'boundary', corePackageRoot: 'boundary' } };
}
const lifecycle = (name = 'controller', className = 'Controller', importPath = '@fixture/controller') => ({
  localName: name, className, importPath, appStorageKey: `${name}Key`,
  arkUIOverlay: { className: `${className}Overlay`, importPath, controllerProperty: 'controller' },
});

test('actual project queries reject cross-package HAR identities', async t => {
  const { root } = fixture(t);
  write(root, 'package.json', JSON.stringify({ name: 'app', dependencies: { first: '1.0.0', second: '1.0.0' } }));
  for (const name of ['first', 'second']) {
    const packageRoot = path.join(root, 'node_modules', name);
    write(packageRoot, 'package.json', JSON.stringify({ name, version: '1.0.0' }));
    write(packageRoot, 'expo-module.config.json', JSON.stringify({ platforms: ['harmony'], harmony: {
      kind: 'har', har: { packageName: '@fixture/shared', packagePath: 'harmony/main.har' },
    } }));
    write(packageRoot, 'harmony/main.har', 'HAR');
  }
  const { queryAutolinkingModulesFromProjectAsync } = loadM1Source('packages/expo-modules-autolinking/src/exports.ts');
  await assert.rejects(queryAutolinkingModulesFromProjectAsync(root, { platform: 'harmony' }), /conflict.*har.packageName/);
});

test('private generated fields cannot duplicate lifecycle methods or overlay build', t => {
  const { module, native } = fixture(t);
  for (const name of ['constructor', 'onCreate', 'onNewWant', 'onDestroy', 'build']) {
    const value = module('first'); value.lifecycleDependencies = [lifecycle(name)];
    assert.throws(() => native.renderExpoModulesLifecycle([value]), new RegExp(name));
  }
  const value = module('first'); value.lifecycleDependencies = [{ ...lifecycle('build'), arkUIOverlay: undefined }];
  assert.match(native.renderExpoModulesLifecycle([value]), /private readonly build/);
});

test('ETS reserved words cannot become generated identifiers', t => {
  const { module } = fixture(t);
  const { validateHarmonyModuleGraph } = loadM1Source('packages/expo-modules-autolinking/src/platforms/harmony/moduleValidation.ts');
  for (const name of ['class', 'struct', 'interface', 'namespace', 'private', 'readonly', 'await', 'yield', 'implements', 'undefined', 'null', 'true', 'type', 'let', 'any', 'number']) {
    for (const mutate of [m => m.ets.packageClass = name,
      m => m.lifecycleDependencies = [lifecycle(name)],
      m => m.lifecycleDependencies = [lifecycle('controller', name)],
      m => { m.lifecycleDependencies = [lifecycle()]; m.lifecycleDependencies[0].arkUIOverlay.className = name; },
      m => { m.lifecycleDependencies = [lifecycle()]; m.lifecycleDependencies[0].arkUIOverlay.controllerProperty = name; }]) {
      const value = module('first'); mutate(value);
      assert.throws(() => validateHarmonyModuleGraph([value]), new RegExp(name));
    }
  }
});

test('generated parameter names and C++ keywords cannot become class names', t => {
  const { module } = fixture(t);
  const { validateHarmonyModuleGraph } = loadM1Source('packages/expo-modules-autolinking/src/platforms/harmony/moduleValidation.ts');
  const value = module('first'); value.ets.packageClass = 'ctx';
  assert.throws(() => validateHarmonyModuleGraph([value]), /ctx/);
  for (const name of ['class', 'namespace', 'demo::delete', 'demo::co_await', 'template']) {
    const value = module('first'); value.cpp.packageClass = name;
    assert.throws(() => validateHarmonyModuleGraph([value]), /cpp.packageClass/);
  }
});

test('ETS import paths reject escapes and malformed OHPM package specifiers', t => {
  const { module } = fixture(t);
  const { validateHarmonyModuleGraph } = loadM1Source('packages/expo-modules-autolinking/src/platforms/harmony/moduleValidation.ts');
  for (const importPath of ['@fixture/bad\\', '@fixture/bad\\n', '@fixture', '../outside', '@fixture/pkg/../outside', '@fixture/pkg//index', '@fixture/pkg;injected', '@fixture/pkg${injected}']) {
    for (const mutate of [m => m.ets.importPath = importPath,
      m => m.lifecycleDependencies = [{ ...lifecycle(), importPath }],
      m => { m.lifecycleDependencies = [lifecycle()]; m.lifecycleDependencies[0].arkUIOverlay.importPath = importPath; }]) {
      const value = module('first'); mutate(value);
      assert.throws(() => validateHarmonyModuleGraph([value]), /importPath/);
    }
  }
});

test('HAR OHPM names reject CMake interpolation and malformed package names', t => {
  const { root } = fixture(t);
  const { validateHarmonyModuleGraph } = loadM1Source('packages/expo-modules-autolinking/src/platforms/harmony/moduleValidation.ts');
  const module = packageName => ({ packageName: 'first', packageRoot: root, kind: 'har',
    lifecycleDependencies: [], hars: [{ packageName, version: '1.0.0', packagePath: 'unused', primary: true }] });
  for (const name of ['@fixture/${injected}', '@fixture/bad\\', '@fixture', '@fixture/pkg/subpath', 'bad;name', '../outside']) {
    assert.throws(() => validateHarmonyModuleGraph([module(name)]), /har.packageName/);
  }
  for (const name of ['@fixture/package-name', 'package_name', '@rnoh/scope--rnoh-demo']) {
    assert.doesNotThrow(() => validateHarmonyModuleGraph([module(name)]));
  }
});

test('factory lifecycle locals cannot shadow parameters, globals or any imported binding', async t => {
  const { root, module } = fixture(t);
  const { generatePackageListAsync } = loadM1Source('packages/expo-modules-autolinking/src/platforms/harmony/harmony.ts');
  for (const name of ['ctx', 'AppStorage', 'Error', 'RNPackage', 'RNPackageContext', 'getExpoModulesPackages', 'firstPackage', 'Controller', 'secondPackage', 'OtherController']) {
    const first = module('first'); const second = module('second');
    first.lifecycleDependencies = [lifecycle(name)];
    second.lifecycleDependencies = [lifecycle('other', 'OtherController', '@fixture/other')];
    for (const modules of [[first, second], [second, first]]) {
      const target = path.join(root, `factory-${name}`);
      await assert.rejects(generatePackageListAsync(modules, target, 'fixture'), new RegExp(`localName.*${name}`));
      assert.equal(fs.existsSync(target), false);
    }
  }
});

test('class fields may share lexical symbols when they never become factory locals', t => {
  const { root, module, native } = fixture(t);
  for (const name of ['ctx', 'AppStorage', 'Error', 'Controller', 'firstPackage']) {
    const reuse = { packageName: 'reuse', packageRoot: root, kind: 'rnoh-reuse', reason: 'external registration',
      lifecycleDependencies: [lifecycle(name)] };
    assert.doesNotThrow(() => native.renderExpoModulesLifecycle([module('first'), reuse]));
  }
});

for (const [field, mutate] of [
  ['cpp.packageClass', (a, b) => b.cpp.packageClass = a.cpp.packageClass],
  ['cpp.header', (a, b) => b.cpp.header = a.cpp.header],
  ['cpp.cmakeTarget', (a, b) => b.cpp.cmakeTarget = a.cpp.cmakeTarget],
  ['ets.packageClass', (a, b) => b.ets.packageClass = a.ets.packageClass],
  ['lifecycleDependencies.localName', (a, b) => { a.lifecycleDependencies = [lifecycle()]; b.lifecycleDependencies = [lifecycle('controller', 'OtherController', '@fixture/other')]; }],
  ['lifecycleDependencies.appStorageKey', (a, b) => { a.lifecycleDependencies = [lifecycle()]; b.lifecycleDependencies = [{ ...lifecycle('other', 'OtherController', '@fixture/other'), appStorageKey: 'controllerKey' }]; }],
  ['arkUIOverlay.className', (a, b) => { a.lifecycleDependencies = [lifecycle()]; b.lifecycleDependencies = [lifecycle('other', 'OtherController', '@fixture/other')]; b.lifecycleDependencies[0].arkUIOverlay.className = 'ControllerOverlay'; }],
]) {
  test(`direct descriptors reject ${field} conflicts before writing and identify both roots`, async t => {
    const { root, module, native, options } = fixture(t);
    await native.prepareHarmonyNativeProjectAsync(options);
    const previous = tree(path.join(root, 'harmony'));
    const a = module('first'); const b = module('second'); mutate(a, b);
    await assert.rejects(native.syncHarmonyNativeProjectAsync({ ...options, modules: [a, b] }), error => {
      assert.ok(error.message.includes(field), error.message);
      for (const owner of [a, b]) {
        assert.ok(error.message.includes(owner.packageName), error.message);
        assert.ok(error.message.includes(owner.packageRoot), error.message);
      }
      return true;
    });
    assert.deepEqual(tree(path.join(root, 'harmony')), previous);
  });
}

test('standalone lifecycle and overlay renderers reject different origins sharing ETS names', t => {
  const { module, native } = fixture(t);
  const a = module('first'); const b = module('second');
  a.lifecycleDependencies = [lifecycle()];
  b.lifecycleDependencies = [lifecycle('other', 'Controller', '@fixture/other')];
  for (const render of [native.renderExpoModulesLifecycle, native.renderExpoModulesAppOverlays]) {
    assert.throws(() => render([a, b]), /className.*first.*second/);
  }
});

test('shared ETS symbols from the same import remain reusable', t => {
  const { module, native } = fixture(t);
  const a = module('first'); const b = module('second');
  a.lifecycleDependencies = [lifecycle()]; b.lifecycleDependencies = [lifecycle('other')];
  const output = native.renderExpoModulesLifecycle([a, b]);
  assert.equal(output.match(/import \{ Controller \}/g)?.length, 1);
  assert.match(output, /private readonly controller/);
  assert.match(output, /private readonly other/);
});

test('invalid identifiers and missing source files reject before touching the old project', async t => {
  const { root, module, native, options } = fixture(t);
  await native.prepareHarmonyNativeProjectAsync(options);
  const previous = tree(path.join(root, 'harmony'));
  for (const mutate of [m => m.ets.packageClass = 'Broken; class Injected',
    m => m.cpp.cmakePath += '\ninclude(evil)',
    m => m.lifecycleDependencies = [lifecycle('bad-name')],
    m => fs.unlinkSync(m.ets.entrypoint),
    m => fs.unlinkSync(path.join(m.cpp.cmakePath, m.cpp.header)),
    m => fs.unlinkSync(path.join(m.cpp.cmakePath, 'CMakeLists.txt'))]) {
    const value = module('first'); mutate(value);
    await assert.rejects(native.syncHarmonyNativeProjectAsync({ ...options, modules: [value] }));
    assert.deepEqual(tree(path.join(root, 'harmony')), previous);
  }
});

test('logical aliases cannot install multiple versions of one native identity', t => {
  const { module } = fixture(t);
  const { validateHarmonyModuleGraph } = loadM1Source('packages/expo-modules-autolinking/src/platforms/harmony/moduleValidation.ts');
  const a = { ...module('first'), npmPackageName: 'actual-native', npmPackageVersion: '1.0.0' };
  const b = { ...module('second'), npmPackageName: 'actual-native', npmPackageVersion: '2.0.0' };
  assert.throws(() => validateHarmonyModuleGraph([a, b]), error => {
    for (const fragment of ['npmPackageName', a.packageRoot, b.packageRoot, '1.0.0', '2.0.0']) assert.ok(error.message.includes(fragment), error.message);
    return true;
  });
});

test('CMake build directory aliases reject distinct registrations', t => {
  const { module } = fixture(t);
  const { validateHarmonyModuleGraph } = loadM1Source('packages/expo-modules-autolinking/src/platforms/harmony/moduleValidation.ts');
  const a = module('first'); const b = module('second');
  a.packageName = '@fixture/alias'; b.packageName = 'fixture-alias';
  assert.throws(() => validateHarmonyModuleGraph([a, b]), /cpp.cmakeBuildDirectory/);
});

test('standalone staging rejects repeated HAR declarations before writing ETS files', async t => {
  const { root, module, native } = fixture(t);
  const stage = path.join(root, 'stage');
  write(stage, 'entry/oh-package.json5', '{}');
  write(stage, 'build-profile.json5', '{"modules":[]}');
  write(root, 'shared.har', 'HAR');
  const har = { packageName: '@fixture/shared', packagePath: path.join(root, 'shared.har') };
  const modules = [module('first'), ...['one', 'two'].map(packageName => ({
    packageName, packageRoot: root, kind: 'har', lifecycleDependencies: [], hars: [har],
  }))];
  const previous = tree(stage);
  await assert.rejects(native.stageHarmonyEtsPackagesAsync(modules, stage), /one.*two/);
  assert.deepEqual(tree(stage), previous);
});
