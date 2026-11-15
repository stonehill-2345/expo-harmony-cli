const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const tooling = process.env.EXPO_HARMONY_TOOLING_ROOT;
assert.ok(tooling, 'EXPO_HARMONY_TOOLING_ROOT must provide TypeScript');
const ts = createRequire(path.join(tooling, 'package.json'))('typescript');
function loadModule(options = {}) {
  let registerCalls = 0;
  const platformFonts = options.platformFonts ?? new Map();
  class UITurboModule { constructor(ctx) { this.ctx = ctx; } __onDestroy__() {} }
  const imports = {
    '@ohos.graphics.text': { FontCollection: { getGlobalInstance: () => ({
      loadFontSync(family, uri) {
        if (options.platformLoadError) throw options.platformLoadError;
        platformFonts.set(family, uri);
        options.onPlatformLoad?.(family, uri);
      },
      unloadFontSync(family) { platformFonts.delete(family); },
    }) } },
    '@ohos.graphics.drawing': { Typeface: { makeFromFile: file => {
      if (options.decodeError) throw options.decodeError;
      return options.decodeResult === undefined ? {} : options.decodeResult;
    } } },
    '@rnoh/react-native-openharmony': { UITurboModule },
    '@ohos.util': { TextDecoder: { create: () => new TextDecoder('utf-8', { fatal: true }) } },
    '@ohos.security.cryptoFramework': { createMd: algorithm => {
      const digest = crypto.createHash(algorithm.toLowerCase());
      return { updateSync: ({ data }) => digest.update(data), digestSync: () => ({ data: digest.digest() }) };
    } },
    '@ohos.file.fs': {
      OpenMode: { READ_ONLY: 0, CREATE: 1, WRITE_ONLY: 2, TRUNC: 4 },
      writeSync(fd, buffer) { options.onWrite?.(new Uint8Array(buffer)); return options.shortWrite ? 0 : buffer.byteLength; }, accessSync: file => options.exists !== false,
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
  const ctx = { uiAbilityContext: { cacheDir: '/data/cache', resourceManager: {
    getRawFileContentSync(name) {
      if (name === 'expo-font/fonts.json') {
        if (options.manifestError) throw options.manifestError;
        if (options.manifest === undefined) throw Object.assign(new Error('rawfile absent'), { code: 9001005 });
        return Buffer.from(JSON.stringify(options.manifest));
      }
      if (options.missingEmbeddedFont) throw Object.assign(new Error('embedded font absent'), { code: 9001005 });
      return options.fontBytes;
    },
  } }, rnInstance: { registerFont: (family, file) => {
    registerCalls++;
    if (options.registerError) throw options.registerError;
    options.onRegister?.(family, file);
  } } };
  const Module = load('ExpoFontLoaderTurboModule.ets').ExpoFontLoaderTurboModule;
  return { module: new Module(ctx), platformFonts, registerCalls: () => registerCalls };
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

test('cached font is ready for platform text before loadAsync reports it loaded', async () => {
  const ready = new Set();
  const f = loadModule({
    onPlatformLoad(family, uri) {
      assert.equal(uri, 'file:///data/cache/material.ttf');
      assert.deepEqual(Array.from(f.module.getLoadedFonts()), [], 'Do not advertise loaded before platform readiness');
      ready.add(family);
    },
  });
  await f.module.loadAsync('material', 'file:///data/cache/material.ttf');
  assert.equal(ready.has('material'), true, 'Global text must be ready before loadAsync resolves');
  assert.deepEqual(Array.from(f.module.getLoadedFonts()), ['material']);
});

test('platform font loading failure rejects without advertising the family as loaded', async () => {
  const f = loadModule({ platformLoadError: new Error('platform font load failed') });
  await assert.rejects(f.module.loadAsync('material', 'file:///data/cache/material.ttf'), /platform font load failed/);
  assert.deepEqual(Array.from(f.module.getLoadedFonts()), []);
  assert.equal(f.registerCalls(), 1);
});

test('failed native registration leaves no new global alias and allows the same family to retry', async () => {
  const options = { registerError: new Error('native registration failed') };
  const f = loadModule(options);
  await assert.rejects(f.module.loadAsync('RetryFont', 'file:///data/cache/retry.ttf'), /native registration failed/);
  assert.equal(f.platformFonts.has('RetryFont'), false, 'Rejected registration must not leave a new global alias');
  assert.deepEqual(Array.from(f.module.getLoadedFonts()), []);
  options.registerError = undefined;
  await f.module.loadAsync('RetryFont', 'file:///data/cache/retry.ttf');
  assert.equal(f.platformFonts.get('RetryFont'), 'file:///data/cache/retry.ttf');
  assert.deepEqual(Array.from(f.module.getLoadedFonts()), ['RetryFont']);
});

test('failed registration cannot unload an alias already used by another module instance', async () => {
  const first = loadModule();
  await first.module.loadAsync('SharedFont', 'file:///data/cache/shared.ttf');
  const second = loadModule({ platformFonts: first.platformFonts, registerError: new Error('second instance failed') });
  await assert.rejects(second.module.loadAsync('SharedFont', 'file:///data/cache/shared.ttf'), /second instance failed/);
  assert.equal(first.platformFonts.get('SharedFont'), 'file:///data/cache/shared.ttf');
  assert.equal(first.module.getFontPath('SharedFont'), '/data/cache/shared.ttf');
  assert.deepEqual(Array.from(second.module.getLoadedFonts()), []);
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

test('renderer resolves registered font files without exposing extra public aliases', async () => {
  const f = loadModule();
  assert.equal(f.module.getFontPath('serif'), undefined);
  await f.module.loadAsync('Material "Icons"', 'file:///data/cache/material.ttf');
  assert.equal(f.module.getFontPath('Material "Icons"'), '/data/cache/material.ttf');
  assert.equal(f.registerCalls(), 1);
  assert.deepEqual(Array.from(f.module.getLoadedFonts()), ['Material "Icons"']);
  f.module.__onDestroy__();
  assert.throws(() => f.module.getFontPath('Material "Icons"'), /destroyed/);
});

test('a bounded sfnt that the native decoder rejects is not registered or marked loaded', async () => {
  for (const options of [{ decodeResult: null }, { decodeError: new Error('native decode failed') }]) {
    const f = loadModule(options);
    await assert.rejects(f.module.loadAsync('Malformed', 'file:///data/cache/malformed.ttf'), /decode/);
    assert.equal(f.registerCalls(), 0);
    assert.deepEqual(Array.from(f.module.getLoadedFonts()), []);
    assert.equal(f.module.getFontPath('Malformed'), undefined);
  }
});

function embeddedFixture() {
  const fontBytes = new Uint8Array(32); fontBytes.set([0,1,0,0,0,1]);
  fontBytes.set([0x68,0x65,0x61,0x64],12); fontBytes.set([0,0,0,28,0,0,0,4],20);
  const sha256 = crypto.createHash('sha256').update(fontBytes).digest('hex');
  return { fontBytes, manifest: [{ family: 'Embedded', resource: 'expo-font/fonts/Embedded.ttf', sha256 }] };
}

test('embedded fonts are registered synchronously without a JS load or network and reloaded per instance', () => {
  const options = embeddedFixture();let writes = 0;
  for (let i=0;i<2;i++) {
    const f = loadModule({ ...options, onWrite: bytes => { writes++;assert.deepEqual(Buffer.from(bytes),Buffer.from(options.fontBytes)); } });
    assert.deepEqual(Array.from(f.module.getLoadedFonts()), ['Embedded']);assert.equal(f.registerCalls(),1);
    assert.match(f.module.getFontPath('Embedded'), /ExpoEmbeddedFont-[a-f0-9]{64}\.ttf$/);
    f.module.__onDestroy__();assert.deepEqual(Array.from(f.module.getLoadedFonts()), []);
  }
  assert.equal(writes,2);
  assert.deepEqual(Array.from(loadModule({ manifest: [] }).module.getLoadedFonts()), []);
  assert.deepEqual(Array.from(loadModule().module.getLoadedFonts()), []);
});

test('corrupt manifests, changed or missing bytes and short writes cannot report embedded fonts loaded', () => {
  const options = embeddedFixture();
  for (const invalid of [
    { ...options, manifest: {} },
    { ...options, manifest: [{ ...options.manifest[0], resource: '../font.ttf' }] },
    { ...options, manifest: [{ ...options.manifest[0], sha256: '0'.repeat(64) }] },
    { ...options, missingEmbeddedFont: true }, { ...options, shortWrite: true },
  ]) assert.throws(() => loadModule(invalid), /embedded|Embedded|Incomplete|Invalid/);
});

test('plugin removal accepts the device string missing-resource code but propagates other failures', () => {
  const absent = loadModule({ manifestError: { code: '9001005', message: 'Invalid relative path' } });
  assert.deepEqual(Array.from(absent.module.getLoadedFonts()), []);
  assert.throws(() => loadModule({ manifestError: { code: '401', message: 'Invalid parameter' } }), /Cannot read embedded/);
});
