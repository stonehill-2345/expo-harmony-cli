const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loadHelper(platformOS = 'harmony') {
  const filename = path.join(
    __dirname,
    '../../src/global-state/harmony-native-dismiss.ts'
  );
  const source = readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const emitted = [];
  const module = { exports: {} };
  const requireForTest = (specifier) => {
    if (specifier === 'react-native') {
      return {
        DeviceEventEmitter: {
          emit: (...args) => emitted.push(args),
        },
        Platform: { OS: platformOS },
      };
    }
    throw new Error(`Unexpected import: ${specifier}`);
  };
  new Function('require', 'module', 'exports', output)(
    requireForTest,
    module,
    module.exports
  );
  return { ...module.exports, emitted };
}

const action = {
  type: 'POP_TO',
  target: 'stack-key',
  payload: { name: 'home', params: {} },
};

const oneScreenState = {
  index: 1,
  key: 'stack-key',
  routes: [{ key: 'home-key', name: 'home' }, { key: 'modal-key', name: 'modal' }],
};

test('Harmony one-screen POP_TO uses the native-first Screens transition', () => {
  const { emitHarmonyNativeDismissTo, emitted } = loadHelper();

  assert.equal(emitHarmonyNativeDismissTo(action, oneScreenState), true);
  assert.deepEqual(emitted, [
    [
      'screensJSRouterBack',
      {
        target: 'stack-key',
        data: { action },
      },
    ],
  ]);
});

test('multi-screen POP_TO keeps the normal Router path', () => {
  const { emitHarmonyNativeDismissTo, emitted } = loadHelper();
  const state = {
    index: 2,
    key: 'stack-key',
    routes: [
      { key: 'home-key', name: 'home' },
      { key: 'details-key', name: 'details' },
      { key: 'modal-key', name: 'modal' },
    ],
  };

  assert.equal(emitHarmonyNativeDismissTo(action, state), false);
  assert.deepEqual(emitted, []);
});

test('non-Harmony POP_TO keeps the normal Router path', () => {
  const { emitHarmonyNativeDismissTo, emitted } = loadHelper('ios');

  assert.equal(emitHarmonyNativeDismissTo(action, oneScreenState), false);
  assert.deepEqual(emitted, []);
});

test('Router dispatch checks the Harmony native-first path before queuing POP_TO', () => {
  const source = readFileSync(
    path.join(__dirname, '../../src/global-state/routing.ts'),
    'utf8'
  );
  const nativeCheck = source.indexOf('emitHarmonyNativeDismissTo(action, navigationState)');
  const queuedAction = source.indexOf('routingQueue.add(action);');

  assert.ok(nativeCheck >= 0, 'routing.ts must call the Harmony native dismiss helper');
  assert.ok(queuedAction > nativeCheck, 'native-first dispatch must run before the JS routing queue');
});
