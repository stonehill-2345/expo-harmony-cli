const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const requireTools = createRequire(path.join(process.env.EXPO_HARMONY_TOOLING_ROOT, 'package.json'));
const ts = requireTools('typescript');
const file = path.resolve(__dirname, '../../../src/NativeViewManagerAdapter.harmony.tsx');

// JS wrapper unit only. Real Fabric/ArkUI instance behavior is device-tested.
function createWrapper(hooks) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  const context = { exports, console, expo: { getViewConfig: () => ({ validAttributes: {}, directEventTypes: {} }) }, require: (name) => {
    if (name === 'react') return { PureComponent: class {}, createRef: () => ({ current: {} }) };
    if (name === 'react/jsx-runtime') return { jsx: () => null };
    if (name === 'react-native') return { findNodeHandle: () => 71 };
    if (name.includes('NativeComponentRegistry')) return { get: () => () => null };
    if (name === './requireNativeModule') return { requireNativeModule: () => ({ ViewPrototypes: { Probe: hooks } }) };
    throw new Error('Unexpected import ' + name);
  } };
  vm.runInNewContext(source, context, { filename: file });
  const Wrapper = exports.requireNativeViewManager('Probe');
  return new Wrapper();
}

test('mount hook sees the actual tag and unmount revokes native binding before clearing tag', () => {
  const seen = [];
  const wrapper = createWrapper({
    __expoMountView() { seen.push(['mount', this.nativeTag]); },
    __expoUnmountView() { seen.push(['unmount', this.nativeTag]); },
  });
  wrapper.componentDidMount();
  assert.equal(wrapper.nativeTag, 71);
  wrapper.componentWillUnmount();
  assert.deepEqual(seen, [['mount', 71], ['unmount', 71]]);
  assert.equal(wrapper.nativeTag, null);
});

test('tag is cleared even if a module unmount hook throws', () => {
  const wrapper = createWrapper({ __expoUnmountView() { throw new Error('native cleanup failure'); } });
  wrapper.componentDidMount();
  assert.throws(() => wrapper.componentWillUnmount(), /native cleanup failure/);
  assert.equal(wrapper.nativeTag, null);
});
