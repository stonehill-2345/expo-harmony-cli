// Local scheduling tests of the real ETS implementation. Only platform I/O and
// RNOH context are adapted to Node; these are NOT native/device acceptance.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const tooling = process.env.EXPO_HARMONY_TOOLING_ROOT;
assert.ok(tooling, 'EXPO_HARMONY_TOOLING_ROOT must provide TypeScript');
const ts = createRequire(path.join(tooling, 'package.json'))('typescript');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-lifecycle-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const httpStarted = deferred();
  const hashStarted = deferred();
  const openStarted = deferred();
  const response = deferred();
  let requests = 0, cancellations = 0;
  const descriptors = new Set();
  const platformFs = {
    OpenMode: { WRITE_ONLY: 1, CREATE: 2, TRUNC: 4 }, accessSync: fs.existsSync,
    open: async (file) => {
      openStarted.resolve();
      if (options.openGate) await options.openGate.promise;
      const fd = fs.openSync(file, 'w'); descriptors.add(fd); return { fd };
    },
    write: async (fd, data) => fs.writeSync(fd, Buffer.from(data)),
    fsync: async (fd) => fs.fsyncSync(fd),
    close: async (file) => { fs.closeSync(file.fd); descriptors.delete(file.fd); },
    rename: async (from, to) => fs.renameSync(from, to),
    unlink: async (file) => fs.unlinkSync(file), unlinkSync: fs.unlinkSync,
  };
  const imports = {
    '@rnoh/react-native-openharmony': { AnyThreadTurboModule: class {
      constructor(ctx) { this.ctx = ctx; } __onDestroy__() {}
    } },
    '@ohos.file.fs': platformFs,
    '@ohos.file.hash': { hash: async file => {
      hashStarted.resolve();
      if (options.hashGate) return options.hashGate.promise;
      return crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
    } },
    '@ohos.net.http': { RequestMethod: { GET: 'GET' } },
    '@ohos.security.cryptoFramework': { createMd: () => {
      const digest = crypto.createHash('md5');
      return { updateSync: ({ data }) => digest.update(data), digestSync: () => ({ data: digest.digest() }) };
    } },
    '@ohos.util': { generateRandomUUID: crypto.randomUUID,
      TextEncoder: { create: () => ({ encodeInto: value => new TextEncoder().encode(value) }) } },
  };
  function load(name) {
    const source = fs.readFileSync(path.resolve(__dirname, '../src/main/ets', name), 'utf8');
    const result = ts.transpileModule(source, { fileName: name.replace(/\.ets$/, '.ts'), compilerOptions: {
      target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
    } });
    const exports = {};
    vm.runInNewContext(result.outputText, { exports, Uint8Array, Map, Set, Promise,
      require: key => {
        if (key === './AssetCache') return load('AssetCache.ts');
        assert.ok(imports[key], 'Unexpected platform dependency: ' + key); return imports[key];
      } }, { filename: name });
    return exports;
  }
  const context = {
    uiAbilityContext: { cacheDir: root, resourceManager: {
      getRawFileContent: async () => new Uint8Array([1, 2, 3]),
    } },
    rnInstance: { getAssetsDest: () => 'assets/' },
    httpClient: { sendRequest: () => {
      requests++; httpStarted.resolve();
      // Matches inspected RNOH 0.82.30: cancel cleans up but does not itself
      // settle promise. Tests explicitly control later platform completion.
      return { promise: response.promise, cancel: () => { cancellations++; } };
    } },
  };
  const Module = load('ExpoAssetTurboModule.ets').ExpoAssetTurboModule;
  return { root, module: new Module(context), response, httpStarted, hashStarted, openStarted,
    descriptors, requests: () => requests, cancellations: () => cancellations };
}

test('destroy cancels transport without synthesizing a second JS-facing rejection', async t => {
  const f = fixture(t);
  let settled = false;
  const result = f.module.downloadAsync('http://fixture/slow', null, 'txt').then(
    () => { settled = true; return 'resolved'; }, error => { settled = true; return String(error); });
  await f.httpStarted.promise;
  f.module.__onDestroy__();
  await tick();
  assert.equal(f.cancellations(), 1);
  assert.equal(settled, false, 'destroy must not reject ahead of the owning RNOH request');
  f.response.reject(new Error('platform request canceled'));
  assert.match(await result, /platform request canceled/);
});

test('destroy during cache hash cannot start a new HTTP request', async t => {
  const hashGate = deferred();
  const f = fixture(t, { hashGate });
  const hash = '00000000000000000000000000000000';
  fs.writeFileSync(path.join(f.root, `ExponentAsset-${hash}.bin`), 'cached');
  const result = f.module.downloadAsync('http://fixture/asset', hash, 'bin').catch(String);
  await f.hashStarted.promise;
  f.module.__onDestroy__();
  hashGate.resolve('11111111111111111111111111111111');
  await tick();
  assert.equal(f.requests(), 0, 'hash completion must recheck lifecycle before native I/O');
  assert.match(await result, /destroyed/);
});

test('destroy during file open still closes and removes the late-created temporary file', async t => {
  const openGate = deferred();
  const f = fixture(t, { openGate });
  const result = f.module.downloadAsync('rawfile://fixture.bin', null, 'bin').catch(String);
  await f.openStarted.promise;
  f.module.__onDestroy__();
  openGate.resolve();
  assert.match(await result, /destroyed/);
  assert.equal(f.descriptors.size, 0, 'file descriptor leaked');
  assert.deepEqual(fs.readdirSync(f.root), [], 'temporary file leaked after destroy/open race');
});
