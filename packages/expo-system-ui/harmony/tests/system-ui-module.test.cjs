const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const tooling = process.env.EXPO_HARMONY_TOOLING_ROOT;
assert.ok(tooling, 'EXPO_HARMONY_TOOLING_ROOT must provide TypeScript');
const ts = createRequire(path.join(tooling, 'package.json'))('typescript');

function fixture({ stored, colorMode = 1 } = {}) {
  const applied = [];
  const values = new Map();
  if (stored !== undefined) values.set('backgroundColor', stored);
  let flushes = 0;
  const preferences = {
    getSync: (key, fallback) => values.has(key) ? values.get(key) : fallback,
    putSync: (key, value) => values.set(key, value),
    deleteSync: (key) => values.delete(key),
    flush: async () => { flushes++; },
  };
  const imports = {
    '@kit.ArkUI': {},
    '@kit.AbilityKit': { ConfigurationConstant: { ColorMode: { COLOR_MODE_DARK: 0 } } },
    '@kit.ArkData': { preferences: { getPreferencesSync: () => preferences } },
    '@rnoh/react-native-openharmony': {
      RNOHPackage: class { constructor(ctx) { this.ctx = ctx; } },
      UITurboModule: class {
        constructor(ctx) { this.ctx = ctx; }
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
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    });
    const exports = {};
    cache[name] = exports;
    vm.runInNewContext(result.outputText, {
      exports,
      Map,
      Number,
      Promise,
      require: (key) => {
        if (key === './SystemUIColor') return load('SystemUIColor.ts');
        if (key === './ExpoSystemUITurboModule') return load('ExpoSystemUITurboModule.ets');
        assert.ok(imports[key], `Unexpected dependency ${key}`);
        return imports[key];
      },
    }, { filename: name });
    return exports;
  }
  const ctx = {
    uiAbilityContext: {
      config: { colorMode },
      windowStage: {
        getMainWindowSync: () => ({
          setWindowBackgroundColor: (color) => applied.push(color),
        }),
      },
    },
  };
  const Module = load('ExpoSystemUITurboModule.ets').ExpoSystemUITurboModule;
  return {
    applied,
    ctx,
    flushes: () => flushes,
    load,
    module: new Module(ctx),
    values,
  };
}

test('module restores a persisted color into the real main window', async () => {
  const f = fixture({ stored: '#123456' });
  assert.deepEqual(f.applied, ['#123456']);
  assert.equal(await f.module.getBackgroundColorAsync(), '#123456');
});

test('set applies the window before persisting and get reports the applied value', async () => {
  const f = fixture();
  await f.module.setBackgroundColorAsync(-13408615);
  assert.deepEqual(f.applied, ['#ffffff', '#336699']);
  assert.equal(f.values.get('backgroundColor'), '#336699');
  assert.equal(f.flushes(), 1);
  assert.equal(await f.module.getBackgroundColorAsync(), '#336699');
});

test('null removes persistence and restores the configuration default', async () => {
  const f = fixture({ stored: '#abcdef', colorMode: 0 });
  await f.module.setBackgroundColorAsync(null);
  assert.deepEqual(f.applied, ['#abcdef', '#000000']);
  assert.equal(f.values.has('backgroundColor'), false);
  assert.equal(await f.module.getBackgroundColorAsync(), '#000000');
});

test('destroyed modules reject further work and package preserves the native name', async () => {
  const f = fixture();
  f.module.__onDestroy__();
  await assert.rejects(() => f.module.setBackgroundColorAsync(-1), /destroyed/);
  await assert.rejects(() => f.module.getBackgroundColorAsync(), /destroyed/);

  const Package = f.load('ExpoSystemUIPackage.ets').ExpoSystemUIPackage;
  const factory = new Package({}).getUITurboModuleFactoryByNameMap().get('ExpoSystemUI');
  assert.ok(factory);
  assert.equal(factory(f.ctx).constructor.NAME, 'ExpoSystemUI');
});
