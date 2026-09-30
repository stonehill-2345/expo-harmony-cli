const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const tooling = process.env.EXPO_HARMONY_TOOLING_ROOT;
assert.ok(tooling, 'EXPO_HARMONY_TOOLING_ROOT must provide TypeScript');
const ts = createRequire(path.join(tooling, 'package.json'))('typescript');

function fixture({ createModule = true } = {}) {
  const markerListeners = new Set();
  const reloadListeners = new Set();
  const imports = {
    '@rnoh/react-native-openharmony': {
      RNOHPackage: class {
        constructor(ctx) {
          this.ctx = ctx;
        }
      },
      RNOHMarker: {
        addListener: (listener) => markerListeners.add(listener),
        removeListener: (listener) => markerListeners.delete(listener),
      },
      RNOHMarkerId: { CONTENT_APPEARED: 18 },
      UITurboModule: class {
        constructor(ctx) {
          this.ctx = ctx;
        }
        __onDestroy__() {}
      },
    },
  };
  const cache = {};
  function load(name) {
    if (cache[name]) return cache[name];
    const source = fs.readFileSync(path.resolve(__dirname, '../src/main/ets', name), 'utf8');
    const result = ts.transpileModule(source, {
      fileName: name.replace(/\.ets$/, '.ts'),
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
      },
    });
    const exports = {};
    cache[name] = exports;
    vm.runInNewContext(
      result.outputText,
      {
        exports,
        Map,
        Number,
        Promise,
        Set,
        AppStorage: {
          get: () => {
            throw new Error('ExpoSplashScreenPackage must use the injected controller');
          },
        },
        require: (key) => {
          if (key === './ExpoSplashScreenController') return load('ExpoSplashScreenController.ts');
          if (key === './ExpoSplashScreenTurboModule')
            return load('ExpoSplashScreenTurboModule.ets');
          assert.ok(imports[key], `Unexpected dependency ${key}`);
          return imports[key];
        },
      },
      { filename: name }
    );
    return exports;
  }
  const Lifecycle = load('ExpoSplashScreenLifecycle.ets').ExpoSplashScreenLifecycle;
  const Module = load('ExpoSplashScreenTurboModule.ets').ExpoSplashScreenTurboModule;
  const controller = new Lifecycle();
  controller.onCreate({});
  const runtime = controller.beginRuntime();
  const ctx = {
    devToolsController: {
      eventEmitter: {
        subscribe: (name, listener) => {
          assert.equal(name, 'RELOAD');
          reloadListeners.add(listener);
          return () => reloadListeners.delete(listener);
        },
      },
    },
  };
  const module = createModule ? new Module(ctx, controller, runtime) : undefined;
  return { controller, ctx, load, markerListeners, module, reloadListeners };
}

test('Ability lifecycle auto-hides blank apps without creating the Splash TurboModule', () => {
  const f = fixture({ createModule: false });
  assert.equal(f.markerListeners.size, 1);

  Array.from(f.markerListeners)[0].logMarker(18, '', 1);
  assert.equal(f.controller.getState().visible, false);

  f.controller.onDestroy();
  assert.equal(f.markerListeners.size, 0);
});

test('real RNOH CONTENT_APPEARED marker drives automatic dismissal', () => {
  const f = fixture();
  assert.equal(f.markerListeners.size, 1);
  const markerListener = Array.from(f.markerListeners)[0];
  markerListener.logMarker(18, '', 1);
  assert.equal(f.controller.getState().visible, false);
});

test('Router and user prevention preserve their distinct behavior', async () => {
  const internal = fixture();
  await internal.module.internalPreventAutoHideAsync();
  Array.from(internal.markerListeners)[0].logMarker(18, '', 1);
  assert.equal(internal.controller.getState().visible, true);
  await internal.module.internalMaybeHideAsync();
  assert.equal(internal.controller.getState().visible, false);

  const user = fixture();
  assert.equal(await user.module.preventAutoHideAsync(), true);
  await user.module.internalMaybeHideAsync();
  assert.equal(user.controller.getState().visible, true);
  await user.module.hideAsync();
  assert.equal(user.controller.getState().visible, false);
});

test('reload starts a fresh visible lifecycle and destroy removes native listeners', () => {
  const f = fixture();
  f.module.hide();
  const oldRuntime = f.controller.getState().runtime;
  Array.from(f.reloadListeners)[0]();
  assert.equal(f.controller.getState().visible, true);
  assert.ok(f.controller.getState().runtime > oldRuntime);

  f.module.__onDestroy__();
  assert.equal(f.markerListeners.size, 1);
  assert.equal(f.reloadListeners.size, 0);
  assert.throws(() => f.module.hide(), /destroyed/);
  f.controller.onDestroy();
  assert.equal(f.markerListeners.size, 0);
});

test('a package recreated by RNOH reload binds its module to the new runtime', () => {
  const f = fixture();
  const Package = f.load('ExpoSplashScreenPackage.ets').ExpoSplashScreenPackage;

  f.module.hide();
  Array.from(f.reloadListeners)[0]();
  f.module.__onDestroy__();

  const reloadedPackage = new Package({}, f.controller);
  const factory = reloadedPackage.getUITurboModuleFactoryByNameMap().get('ExpoSplashScreen');
  assert.ok(factory);

  const reloadedModule = factory(f.ctx);
  assert.equal(f.controller.getState().visible, true);
  reloadedModule.hide();
  assert.equal(f.controller.getState().visible, false);
  reloadedModule.__onDestroy__();
});
