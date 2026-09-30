const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const tooling = process.env.EXPO_HARMONY_TOOLING_ROOT;
assert.ok(tooling, 'EXPO_HARMONY_TOOLING_ROOT must provide TypeScript');
const ts = createRequire(path.join(tooling, 'package.json'))('typescript');
function loadModule(options = {}) {
  let registerCalls = 0;
  class UITurboModule { constructor(ctx) { this.ctx = ctx; } __onDestroy__() {} }
  const imports = {
    '@rnoh/react-native-openharmony': { UITurboModule },
    '@ohos.file.fs': {
      OpenMode: { READ_ONLY: 0 }, accessSync: file => options.exists !== false,
      statSync: file => ({ size: options.size ?? 32 }), openSync: file => ({ fd: 7 }), closeSync() {},
      readSync(fd, buffer) {
        const bytes = options.fontBytes ?? (() => {
          const value = new Uint8Array(32); value.set([0,1,0,0,0,1],0);
          value.set([0x68,0x65,0x61,0x64],12); value.set([0,0,0,28,0,0,0,4],20); return value;
        })();
        new Uint8Array(buffer).set(bytes); return bytes.length;
      },
    },
  };
  const cache = {};
  function load(name) {
    if (cache[name]) return cache[name];
    const source = fs.readFileSync(path.resolve(__dirname, '../src/main/ets', name), 'utf8');
    const result = ts.transpileModule(source, { fileName: name.replace(/\.ets$/, '.ts'), compilerOptions: {
      target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
    } });
    const exports = {};
    cache[name] = exports;
    vm.runInNewContext(result.outputText, { exports, Map, Set, Promise,
      require: key => {
        if (key === './FontFile') return load('FontFile.ts');
        assert.ok(imports[key], 'Unexpected dependency ' + key); return imports[key];
      } }, { filename: name });
    return exports;
  }
  const ctx = { rnInstance: { registerFont: (family, file) => {
    registerCalls++;
    if (options.registerError) throw options.registerError;
    options.onRegister?.(family, file);
  } } };
  const Module = load('ExpoFontLoaderTurboModule.ets').ExpoFontLoaderTurboModule;
  return { module: new Module(ctx), registerCalls: () => registerCalls };
}

test('registers a real file once and reports the alias loaded', async () => {
  let received;
  const f = loadModule({ onRegister: (family, file) => { received = { family, file }; } });
  assert.deepEqual(Array.from(f.module.getLoadedFonts()), []);
  await f.module.loadAsync('Material Icons', 'file:///data/cache/material.ttf');
  await f.module.loadAsync('Material Icons', 'file:///data/cache/material.ttf');
  assert.deepEqual(received, { family: 'Material Icons', file: '/data/cache/material.ttf' });
  assert.equal(f.registerCalls(), 1);
  assert.deepEqual(Array.from(f.module.getLoadedFonts()), ['Material Icons']);
});

test('missing, empty, registration and post-registration failures never mark loaded', async () => {
  for (const options of [
    { exists: false, pattern: /does not exist/ }, { size: 0, pattern: /empty/ },
    { registerError: new Error('invalid font data'), pattern: /invalid font data/ },
    { fontBytes: new Uint8Array(32), pattern: /valid TTF\/OTF/ },
  ]) {
    const f = loadModule(options);
    await assert.rejects(f.module.loadAsync('Broken', 'file:///data/cache/broken.ttf'), options.pattern);
    assert.deepEqual(Array.from(f.module.getLoadedFonts()), []);
  }
});

test('destroy clears instance state and rejects later work', async () => {
  const f = loadModule();
  await f.module.loadAsync('ReloadFont', 'file:///data/cache/font.ttf');
  f.module.__onDestroy__();
  assert.deepEqual(Array.from(f.module.getLoadedFonts()), []);
  await assert.rejects(f.module.loadAsync('Later', 'file:///data/cache/later.ttf'), /destroyed/);
});
