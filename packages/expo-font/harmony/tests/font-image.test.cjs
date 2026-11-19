// Executes the real ETS module with platform adapters; native rendering is verified separately.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = createRequire(path.join(process.env.EXPO_HARMONY_TOOLING_ROOT, 'package.json'))('typescript');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'font-image-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const calls = { draws: [], contexts: [], pixelsReleased: 0, packersReleased: 0, open: 0 };
  const packingStarted = deferred();
  const fonts = { loadFontSync: (name, file) => { calls.fontLoaded = { name, file }; },
    unloadFontSync: name => { calls.fontUnloaded = name; } };
  class ParagraphBuilder {
    constructor(style, collection) { assert.equal(collection, fonts); calls.contexts.push(this); }
    pushStyle(style) { this.style = style; }
    addText(text) { this.text = text; }
    build() { return { layoutSync() {}, getLongestLine: () => options.nativeBounds ? 168 : 30.2, getHeight: () => options.nativeBounds ? 168 : 26,
      getTextLines: () => [{ getImageBounds: () => (options.nativeBounds ? { left: 14, top: -27, right: 154, bottom: 93 } : { left: -2, top: -19, right: 32.3, bottom: 5 }) }],
      getLineMetrics: () => [options.nativeBounds ? { left: 0, baseline: 168, ascent: 168, descent: 0 } : { left: 0, baseline: 20, ascent: 20, descent: 6 }],
      paint: (canvas, x, y) => { if (options.paintFailure) throw new Error('paint failed');
        calls.draws.push({ text: this.text, x, y, ...this.style }); },
    }; }
  }
  const imports = {
    '@rnoh/react-native-openharmony': { UITurboModule: class { constructor(ctx) { this.ctx = ctx; } __onDestroy__() {} } },
    '@ohos.file.fs': {
      OpenMode: { WRITE_ONLY: 1, CREATE: 2, TRUNC: 4 }, accessSync: fs.existsSync, unlinkSync: fs.unlinkSync,
      openSync: file => { calls.open++; return { fd: fs.openSync(file, 'w') }; },
      writeSync: (fd, bytes) => {
        if (options.writeFailure) throw new Error('disk full');
        if (options.zeroWrite) return 0;
        return fs.writeSync(fd, Buffer.from(bytes).subarray(0, options.partialWrites ? 2 : undefined));
      },
      fsyncSync: fs.fsyncSync, closeSync: file => { fs.closeSync(file.fd); calls.open--; },
    },
    '@ohos.multimedia.image': { PixelMapFormat: { RGBA_8888: 3 }, AlphaType: { PREMUL: 2 },
      createPixelMapSync: options => { calls.pixelOptions = options; return { release: async () => { calls.pixelsReleased++; } }; },
      createImagePacker: () => ({
      packing: async () => { packingStarted.resolve(); if (options.packingGate) await options.packingGate.promise;
        if (options.packFailure) throw new Error('encode failed'); return Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]).buffer; },
      release: async () => { calls.packersReleased++; if (options.releaseGate) await options.releaseGate.promise; },
    }) },
    '@ohos.util': { generateRandomUUID: () => 'test-image' },
    '@ohos.graphics.text': { FontCollection: { getGlobalInstance: () => fonts }, ParagraphBuilder },
    '@ohos.graphics.drawing': { Canvas: class { clear(color) { assert.equal(color.alpha, 0); } } },
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../src/main/ets/ExpoFontUtilsTurboModule.ets'), 'utf8');
  const result = ts.transpileModule(source, { fileName: 'ExpoFontUtilsTurboModule.ts', compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
  } });
  const exports = {};
  vm.runInNewContext(result.outputText, { exports, Uint8Array, ArrayBuffer,
    require: key => { assert.ok(imports[key], key); return imports[key]; },
  });
  const module = new exports.ExpoFontUtilsTurboModule({ uiAbilityContext: { cacheDir: root },
    rnInstance: { getUIContext: () => ({ vp2px: value => value * 2 }),
      getTurboModule: name => { assert.equal(name, 'ExpoFontLoader'); return {
        getFontPath: family => { assert.equal(family, 'My Font'); return '/data/cache/font.ttf'; },
      }; } } });
  return { root, calls, module, packingStarted };
}

test('renders with physical pixels, font bounds, ARGB alpha and dp metadata', async t => {
  const f = fixture(t, { partialWrites: true });
  const result = await f.module.renderToImageAsync('ÅÇ', { size: 24, fontFamily: 'My Font', color: 0x800057b8 });
  assert.equal(result.width * result.scale, 35); assert.equal(result.height * result.scale, 26);
  assert.equal(result.scale, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls.draws)), [{ text: 'ÅÇ', x: 2, y: 0, fontSize: 48, fontFamilies: ['ExpoFontImage-test-image'], color: { red: 0, green: 87, blue: 184, alpha: 128 } }]);
  assert.deepEqual(f.calls.fontLoaded, { name: 'ExpoFontImage-test-image', file: 'file:///data/cache/font.ttf' });
  assert.equal(f.calls.fontUnloaded, 'ExpoFontImage-test-image');
  assert.equal(fs.readFileSync(new URL(result.uri)).length, 8);
  assert.equal(f.calls.pixelsReleased, 1); assert.equal(f.calls.packersReleased, 1); assert.equal(f.calls.open, 0);
});

test('uses default size/family/black and preserves fully transparent color', async t => {
  const f = fixture(t);
  await f.module.renderToImageAsync('hello', {});
  assert.equal(f.calls.draws[0].fontSize, 48);
  assert.equal(f.calls.draws[0].fontFamilies[0], 'sans-serif');
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls.draws[0].color)), { red: 0, green: 0, blue: 0, alpha: 255 });
  await f.module.renderToImageAsync('hello', { color: 0 });
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls.draws[1].color)), { red: 0, green: 0, blue: 0, alpha: 0 });
});

test('rejects invalid text/options before allocating images or files', async t => {
  const f = fixture(t);
  for (const [text, options] of [['', {}], [null, {}], ['x', { size: 0 }], ['x', { size: -1 }],
    ['x', { size: NaN }], ['x', { size: Infinity }], ['x', { fontFamily: 4 }], ['x', { color: {} }]]) {
    await assert.rejects(f.module.renderToImageAsync(text, options));
  }
  assert.equal(f.calls.contexts.length, 0); assert.deepEqual(fs.readdirSync(f.root), []);
});

test('encoding and disk failures release resources and leave no partial PNG', async t => {
  for (const options of [{ packFailure: true }, { writeFailure: true }, { zeroWrite: true }]) {
    const f = fixture(t, options);
    await assert.rejects(f.module.renderToImageAsync('x', {}), /encode failed|disk full|no progress/);
    assert.equal(f.calls.pixelsReleased, 1); assert.equal(f.calls.packersReleased, 1);
    assert.equal(f.calls.open, 0); assert.deepEqual(fs.readdirSync(f.root), []);
  }
});

test('destroy during PNG encoding rejects late work without creating a file', async t => {
  const packingGate = deferred(); const f = fixture(t, { packingGate });
  const result = f.module.renderToImageAsync('x', {});
  await f.packingStarted.promise; f.module.__onDestroy__(); packingGate.resolve();
  await assert.rejects(result, /destroyed/);
  assert.equal(f.calls.pixelsReleased, 1); assert.equal(f.calls.packersReleased, 1);
  assert.deepEqual(fs.readdirSync(f.root), []);
  await assert.rejects(f.module.renderToImageAsync('x', {}), /destroyed/);
});

test('destroy during asynchronous resource release removes an unreturned image', async t => {
  const releaseGate = deferred(); const f = fixture(t, { releaseGate });
  const result = f.module.renderToImageAsync('x', {});
  while (!f.calls.packersReleased) await new Promise(resolve => setImmediate(resolve));
  f.module.__onDestroy__(); releaseGate.resolve();
  await assert.rejects(result, /destroyed/);
  assert.deepEqual(fs.readdirSync(f.root), []); assert.equal(f.calls.open, 0);
});

test('native paint failure releases pixels and private font without creating a file', async t => {
  const f = fixture(t, { paintFailure: true });
  await assert.rejects(f.module.renderToImageAsync('x', { fontFamily: 'My Font' }), /paint failed/);
  assert.equal(f.calls.pixelsReleased, 1); assert.equal(f.calls.packersReleased, 0);
  assert.equal(f.calls.fontUnloaded, f.calls.fontLoaded.name);
  assert.deepEqual(fs.readdirSync(f.root), []);
});

test('native line metrics determine image height without adding unrelated image-bound coordinates', async t => {
  // Values captured from the real nova API 22 MaterialIcons paragraph at 168 px.
  const f = fixture(t, { nativeBounds: true });
  const result = await f.module.renderToImageAsync('\ue88a', { size: 84 });
  assert.equal(result.width * result.scale, 168);
  assert.equal(result.height * result.scale, 168);
});
