const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const test = require('node:test');
const vm = require('node:vm');

const tooling = process.env.EXPO_HARMONY_TOOLING_ROOT;
assert.ok(tooling, 'EXPO_HARMONY_TOOLING_ROOT must provide TypeScript');
const ts = createRequire(path.join(tooling, 'package.json'))('typescript');

function fixture(platform = 'harmony', built = false) {
  const cache = new Map();
  const reloadListeners = new Set();
  const ctx = { devToolsController: { eventEmitter: {
    subscribe(name, listener) {
      assert.equal(name, 'RELOAD');
      reloadListeners.add(listener);
      return () => reloadListeners.delete(listener);
    },
  } } };
  let nativeModule;
  const mocks = {
    '@ohos.url': { default: { URL } },
    '@rnoh/react-native-openharmony': {
      RNOHPackage: class {},
      UITurboModule: class {
        constructor(context) { this.ctx = context; }
        __onDestroy__() {}
      },
    },
    'expo-modules-core': {
      requireNativeModule: () => nativeModule,
      UnavailabilityError: class extends Error {
        constructor(module, method) {
          super(`${module}.${method} is unavailable`);
          this.code = 'ERR_UNAVAILABLE';
        }
      },
    },
    'react-native': { Platform: { OS: platform }, AppState: { currentState: 'active' },
      processColor: (value) => value },
  };
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const source = fs.readFileSync(file, 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    } });
    vm.runInNewContext(compiled.outputText, {
      exports, Promise, Error, Set, Map, URL, setTimeout, clearTimeout,
      require(name) {
        if (mocks[name]) return mocks[name];
        assert.ok(name.startsWith('.'), `Unexpected import: ${name}`);
        const base = path.resolve(path.dirname(file), name);
        return load(['.ts', '.ets', '.js'].map(ext => `${base}${ext}`).find(fs.existsSync));
      },
    }, { filename: file });
    return exports;
  }
  const root = path.resolve(__dirname, '../src/main/ets');
  const { ExpoWebBrowserController } = load(path.join(root, 'ExpoWebBrowserController.ts'));
  const controller = new ExpoWebBrowserController();
  const runtime = controller.beginRuntime();
  const detach = controller.attachHost(() => {});
  const { ExpoWebBrowserTurboModule } = load(path.join(root, 'ExpoWebBrowserTurboModule.ets'));
  nativeModule = new ExpoWebBrowserTurboModule(ctx, controller, runtime);
  const api = load(path.resolve(__dirname, built ? '../../build/WebBrowser.js' : '../../src/WebBrowser.ts'));
  return { controller, runtime, detach, nativeModule, api, reloadListeners };
}

test('public open waits for actual user close and returns cancel', async () => {
  const f = fixture();
  const pending = f.api.openBrowserAsync('https://example.com');
  let finished = false;
  pending.then(() => { finished = true; });
  await Promise.resolve();
  assert.equal(finished, false);
  const session = f.controller.getSession();
  assert.equal(session.url, 'https://example.com');
  f.controller.cancel(session.id);
  assert.equal((await pending).type, 'cancel');
  assert.equal(f.controller.getSession(), undefined);
});

test('dismiss settles open and dismiss calls; dismiss without an open browser rejects', async () => {
  const f = fixture();
  const pending = f.api.openBrowserAsync('https://example.com');
  assert.equal((await f.api.dismissBrowser()).type, 'dismiss');
  assert.equal((await pending).type, 'dismiss');
  await assert.rejects(f.api.dismissBrowser(), { code: 'ERR_WEB_BROWSER_NOT_OPEN' });
});

test('concurrent browser returns locked without replacing the first session', async () => {
  const f = fixture();
  const first = f.api.openBrowserAsync('https://example.com');
  const id = f.controller.getSession().id;
  assert.equal((await f.api.openBrowserAsync('https://other.example')).type, 'locked');
  assert.equal(f.controller.getSession().id, id);
  await f.api.dismissBrowser();
  await first;
});

test('invalid URLs and unsupported ephemeral authentication fail before presentation', async () => {
  const f = fixture();
  for (const url of ['javascript:alert(1)', 'file:///data/test', 'not a url', 'https://']) {
    await assert.rejects(f.api.openBrowserAsync(url), { code: 'ERR_WEB_BROWSER_INVALID_URL' });
    assert.equal(f.controller.getSession(), undefined);
  }
  await assert.rejects(f.api.openAuthSessionAsync('https://example.com', 'demo://callback', {
    preferEphemeralSession: true,
  }), { code: 'ERR_WEB_BROWSER_UNSUPPORTED_OPTION' });
});

test('public auth handles real top-level redirect and refuses prefix lookalikes or subframes', async () => {
  const f = fixture();
  const pending = f.api.openAuthSessionAsync('https://login.example.com', 'demo://callback');
  const id = f.controller.getSession().id;
  assert.equal(f.controller.onNavigation(id, 'demo://callback?code=child', false), true);
  assert.ok(f.controller.getSession());
  assert.equal(f.controller.onNavigation(id, 'https://login.example.com/step2', true), false);
  assert.equal(f.controller.onNavigation(id, 'demo://callback?code=123', true), true);
  const result = await pending;
  assert.equal(result.type, 'success');
  assert.equal(result.url, 'demo://callback?code=123');

  const second = f.api.openAuthSessionAsync('https://login.example.com', 'https://return.example/callback');
  const secondId = f.controller.getSession().id;
  assert.equal(f.controller.onNavigation(secondId, 'https://return.example/callback-evil?code=123', true), false);
  assert.ok(f.controller.getSession());
  f.controller.cancel(secondId);
  assert.equal((await second).type, 'cancel');
});

test('auth dismissal and concurrent auth do not consume another session', async () => {
  const f = fixture();
  const first = f.api.openAuthSessionAsync('https://example.com', 'demo://callback');
  await assert.rejects(f.api.openAuthSessionAsync('https://example.com', 'demo://callback'), {
    code: 'ERR_WEB_BROWSER_ALREADY_OPEN',
  });
  f.api.dismissAuthSession();
  assert.equal((await first).type, 'dismiss');
  f.api.dismissAuthSession();
  const browser = f.api.openBrowserAsync('https://example.com');
  f.api.dismissAuthSession();
  assert.ok(f.controller.getSession());
  await f.api.dismissBrowser();
  await browser;
});

test('load failure rejects with a code; stale callbacks cannot close the next browser', async () => {
  const f = fixture();
  const first = f.api.openBrowserAsync('https://example.com');
  const firstId = f.controller.getSession().id;
  const rejection = assert.rejects(first, { code: 'ERR_WEB_BROWSER_LOAD_FAILED' });
  f.controller.fail(firstId, 'ERR_WEB_BROWSER_LOAD_FAILED', 'Network failed');
  await rejection;
  const second = f.api.openBrowserAsync('https://example.com/next');
  f.controller.cancel(firstId);
  f.controller.fail(firstId, 'ERR_WEB_BROWSER_LOAD_FAILED', 'Late callback');
  assert.ok(f.controller.getSession());
  await f.api.dismissBrowser();
  await second;
});

for (const action of ['reload', 'module destroy', 'Ability destroy', 'host detach']) {
  test(`${action} rejects pending work and removes the browser`, async () => {
    const f = fixture();
    const pending = f.api.openBrowserAsync('https://example.com');
    const rejection = assert.rejects(pending, /no longer available/);
    if (action === 'reload') [...f.reloadListeners][0]();
    if (action === 'module destroy') f.nativeModule.__onDestroy__();
    if (action === 'Ability destroy') f.controller.destroy();
    if (action === 'host detach') f.detach();
    await rejection;
    assert.equal(f.controller.getSession(), undefined);
    await assert.rejects(f.api.openBrowserAsync('https://example.com'));
    f.nativeModule.__onDestroy__();
    assert.equal(f.reloadListeners.size, 0);
  });
}

test('old runtime disposal does not close a newer runtime browser', async () => {
  const f = fixture();
  const runtime = f.controller.beginRuntime();
  const pending = f.controller.open(runtime, 'https://example.com', {}, false);
  f.nativeModule.__onDestroy__();
  assert.ok(f.controller.getSession());
  f.controller.cancel(f.controller.getSession().id);
  assert.equal((await pending).type, 'cancel');
});

test('published JS entry forwards Harmony auth options and redirect results', async () => {
  const f = fixture('harmony', true);
  await assert.rejects(f.api.openAuthSessionAsync('https://example.com', 'demo://callback', {
    preferEphemeralSession: true,
  }), { code: 'ERR_WEB_BROWSER_UNSUPPORTED_OPTION' });
  const pending = f.api.openAuthSessionAsync('https://example.com', 'demo://callback');
  f.controller.onNavigation(f.controller.getSession().id, 'demo://callback?code=123', true);
  assert.equal((await pending).type, 'success');
});

test('Android-only services remain unavailable and web completion reports unsupported', async () => {
  const f = fixture();
  for (const method of ['warmUpAsync', 'coolDownAsync', 'mayInitWithUrlAsync', 'getCustomTabsSupportingBrowsersAsync']) {
    await assert.rejects(f.api[method](), { code: 'ERR_UNAVAILABLE' });
  }
  assert.equal(f.api.maybeCompleteAuthSession().type, 'failed');
});

test('an unsupported top-level scheme rejects instead of launching another app', async () => {
  const f = fixture();
  const pending = f.api.openBrowserAsync('https://example.com');
  const rejection = assert.rejects(pending, { code: 'ERR_WEB_BROWSER_UNSUPPORTED_SCHEME' });
  assert.equal(f.controller.onNavigation(f.controller.getSession().id, 'intent://external', true), true);
  await rejection;
});


test('ArkUI host updates are deferred and stale tasks are discarded', async () => {
  const f = fixture();
  const updates = [];
  const detach = f.controller.attachHost((session) => updates.push(session), true);

  assert.deepEqual(updates, []);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(updates, [undefined]);

  const pending = f.api.openBrowserAsync('https://example.com');
  assert.equal(updates.length, 1);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(updates[1].url, 'https://example.com');

  await f.api.dismissBrowser();
  assert.equal(updates.length, 2);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(updates, [undefined, updates[1], undefined]);

  const viewSource = fs.readFileSync(
    path.resolve(__dirname, '../src/main/ets/ExpoWebBrowserView.ets'),
    'utf8'
  );
  assert.match(viewSource, /attachHost\(\(session\) => \{[\s\S]*?\}, true\);/);

  detach();
  await pending;
});

test('BrowserContent teardown does not cancel a live session during ArkUI rebuilds', () => {
  const viewSource = fs.readFileSync(
    path.resolve(__dirname, '../src/main/ets/ExpoWebBrowserView.ets'),
    'utf8'
  );
  const browserContent = viewSource.slice(0, viewSource.indexOf('export struct ExpoWebBrowserView'));

  assert.doesNotMatch(browserContent, /aboutToDisappear\(\)[\s\S]*?controller\.cancel/);
  assert.match(browserContent, /Button\('Close'\)[\s\S]*?controller\.cancel/);
  assert.match(viewSource, /onWillDismiss:[\s\S]*?controller\.cancel/);
});
