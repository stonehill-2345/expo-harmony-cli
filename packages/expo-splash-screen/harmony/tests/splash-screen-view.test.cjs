const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const tooling = process.env.EXPO_HARMONY_TOOLING_ROOT;
assert.ok(tooling, 'EXPO_HARMONY_TOOLING_ROOT must provide TypeScript');
const ts = createRequire(path.join(tooling, 'package.json'))('typescript');

function fixture() {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/main/ets/ExpoSplashScreenView.ets'), 'utf8');
  // Run the actual lifecycle methods; ArkUI builder rendering is checked on device.
  const body = source.slice(source.indexOf('  public aboutToAppear()'), source.indexOf('  build()'));
  const fields = source.slice(source.indexOf('  @Require'), source.indexOf('  @Builder\n'))
    .replace(/@(Require|BuilderParam|State)\s+/g, '')
    .replace('= this.defaultSplashContent', '= () => {}');
  const compiled = ts.transpileModule(`export class View { ${fields} ${body} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {}; const animations = []; const listeners = new Set();
  let state = { runtime: 1, visible: true, options: { fade: true, duration: 400 } };
  vm.runInNewContext(compiled, { exports, Curve: { EaseIn: 1 }, animateTo: (options, update) => {
    animations.push(options.onFinish); update();
  } });
  const view = new exports.View();
  view.controller = { getState: () => state, subscribe: (listener) => {
    listeners.add(listener); return () => listeners.delete(listener);
  } };
  view.aboutToAppear();
  const change = (value) => { state = { ...state, ...value }; listeners.forEach(listener => listener(state)); };
  return { view, animations, listeners, change };
}

test('a mounted fade removes the overlay only when the animation completes', () => {
  const f = fixture(); f.change({ visible: false });
  assert.equal(f.view.rendered, true);
  f.animations[0](); assert.equal(f.view.rendered, false);
});

test('an animation completing after unmount cannot mutate the detached view', () => {
  const f = fixture(); f.change({ visible: false });
  f.view.aboutToDisappear(); assert.equal(f.listeners.size, 0);
  const before = f.view.rendered;
  f.animations[0](); assert.equal(f.view.rendered, before);
});

test('an older fade cannot remove a new runtime overlay', () => {
  const f = fixture(); f.change({ visible: false });
  f.change({ runtime: 2, visible: true }); f.animations[0]();
  assert.equal(f.view.rendered, true); assert.equal(f.view.splashOpacity, 1);
});

test('a remounted view subscribes once and permits its new fade to complete', () => {
  const f = fixture(); f.change({ visible: false }); f.view.aboutToDisappear();
  f.change({ runtime: 2, visible: true }); f.view.aboutToAppear();
  assert.equal(f.listeners.size, 1); f.animations[0](); assert.equal(f.view.rendered, true);
  f.change({ visible: false }); f.animations[1](); assert.equal(f.view.rendered, false);
});
