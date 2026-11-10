const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const tooling = process.env.EXPO_HARMONY_TOOLING_ROOT;
assert.ok(tooling, 'EXPO_HARMONY_TOOLING_ROOT must provide TypeScript');
const ts = createRequire(path.join(tooling, 'package.json'))('typescript');

function fixture({ stored, colorMode = 1, onFlush, storeError, windowError } = {}) {
  const applied = [];
  const values = new Map();
  if (stored !== undefined) values.set('backgroundColor', stored);
  let flushes = 0;
  const preferences = {
    getSync: (key, fallback) => values.has(key) ? values.get(key) : fallback,
    putSync: (key, value) => { if (storeError) throw storeError; values.set(key, value); },
    deleteSync: (key) => { if (storeError) throw storeError; values.delete(key); },
    flush: async () => { flushes++; await onFlush?.(); },
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
          setWindowBackgroundColor: (color) => {
            if (applied.length && windowError) throw windowError;
            applied.push(color);
          },
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

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('get reflects the applied window while persistence is pending', async () => {
  const gate = deferred(); const f = fixture({ onFlush: () => gate.promise });
  const pending = f.module.setBackgroundColorAsync(0xff112233);
  assert.equal(await f.module.getBackgroundColorAsync(), '#112233');
  gate.resolve(); await pending;
});

test('older flush completion cannot overwrite a later applied color', async () => {
  const first = deferred(), second = deferred(); const gates = [first, second];
  const f = fixture({ onFlush: () => gates.shift().promise });
  const a = f.module.setBackgroundColorAsync(0xff112233);
  const b = f.module.setBackgroundColorAsync(0xff445566);
  second.resolve(); await b; first.resolve(); await a;
  assert.equal(await f.module.getBackgroundColorAsync(), '#445566');
  assert.equal(f.applied.at(-1), '#445566');
  assert.equal(f.values.get('backgroundColor'), '#445566');
});

test('persistence errors reject the setter but get still describes the applied window', async () => {
  for (const options of [{ onFlush: async () => { throw new Error('flush failed'); } },
    { storeError: new Error('store failed') }]) {
    const f = fixture(options);
    await assert.rejects(f.module.setBackgroundColorAsync(0xff112233), /failed/);
    assert.equal(await f.module.getBackgroundColorAsync(), '#112233');
    assert.equal(f.applied.at(-1), '#112233');
  }
});

test('window failure preserves the previously applied value and never persists the new color', async () => {
  const f = fixture({ stored: '#abcdef', windowError: new Error('window failed') });
  await assert.rejects(f.module.setBackgroundColorAsync(0xff112233), /window failed/);
  assert.equal(await f.module.getBackgroundColorAsync(), '#abcdef');
  assert.equal(f.values.get('backgroundColor'), '#abcdef');
  assert.equal(f.flushes(), 0);
});

test('destroy during pending persistence rejects late completion without applying again', async () => {
  const gate = deferred(); const f = fixture({ onFlush: () => gate.promise });
  const pending = f.module.setBackgroundColorAsync(0xff112233);
  f.module.__onDestroy__(); gate.resolve();
  await assert.rejects(pending, /destroyed/);
  assert.deepEqual(f.applied, ['#ffffff', '#112233']);
  await assert.rejects(f.module.getBackgroundColorAsync(), /destroyed/);
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
