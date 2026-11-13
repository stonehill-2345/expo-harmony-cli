import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

const overlay = path.resolve(
  'scripts/sdk54/external-overlays/react-native-screens-4.9.0'
);

test('Screens uses native booleans for Harmony optional boolean props', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'screens-harmony-boolean-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const moduleRoot = path.join(root, 'node_modules/react-native');
  fs.mkdirSync(moduleRoot, { recursive: true });
  fs.writeFileSync(
    path.join(moduleRoot, 'index.js'),
    "exports.Platform = { OS: 'harmony' }; exports.BackHandler = { exitApp() {} };\n"
  );
  fs.copyFileSync(
    path.join(overlay, 'lib/commonjs/utils.js'),
    path.join(root, 'utils.cjs')
  );

  const require = createRequire(path.join(root, 'entry.cjs'));
  const reactNative = require('react-native');
  const { parseBooleanToOptionalBooleanNativeProp: parse } = require(path.join(root, 'utils.cjs'));

  assert.equal(parse(undefined), undefined);
  assert.equal(parse(true), true);
  assert.equal(parse(false), false);

  reactNative.Platform.OS = 'ios';
  assert.equal(parse(undefined), 'undefined');
  assert.equal(parse(true), 'true');
  assert.equal(parse(false), 'false');

  for (const relative of ['src/utils.ts', 'lib/module/utils.js']) {
    const source = fs.readFileSync(path.join(overlay, relative), 'utf8');
    assert.match(source, /Platform\.OS === 'harmony'/);
    assert.match(source, /return prop/);
  }
});


test('Harmony form-sheet children receive a layout container for backgrounds and touch hit testing', () => {
  const React = { createElement: (type, props, ...children) => ({ type, props, children }), Fragment: 'Fragment',
    useRef: value => ({current: value}), useContext: () => null, useImperativeHandle() {}, useEffect() {}, useCallback: fn => fn, forwardRef: fn => fn };
  const reactNative = { Platform: { OS: 'harmony' }, View: 'View', StyleSheet: {create: value => value, flatten: value => value} };
  const exported = {};
  vm.runInNewContext(fs.readFileSync(path.join(overlay, 'lib/commonjs/components/ScreenStackItem.js'), 'utf8'), {
    exports: exported,
    require: name => name === 'react' ? React : name === 'react-native' ? reactNative : name === 'warn-once' ? () => {} : {},
  });
  const view = (props = {}) => exported.default({stackPresentation: 'formSheet', ...props, children: 'content', headerConfig: {hidden: true}}, null).children[0].children[0];
  assert.equal(view().props.style[0], null);
  assert.equal(view().children[0].props.style[0], null);
  assert.equal(view({sheetAllowedDetents: 'fitToContents'}).props.style[0], null);
  assert.equal(view({sheetAllowedDetents: 'fitToContents'}).children[0].props.style[0], null);
  assert.equal(view({stackPresentation: 'push'}).props.style[0].flex, 1);
  for (const detents of [[], [0], [NaN], [-1], [0.7, 0.2], [0.1, 0.2, 0.3, 0.4]]) {
    assert.throws(() => view({sheetAllowedDetents: detents}), /Harmony sheet/);
  }
  assert.throws(() => view({sheetElevation: -1}), /Harmony sheet/);
  reactNative.Platform.OS = 'android';
  assert.doesNotThrow(() => view({sheetAllowedDetents: [0]}));
  assert.equal(view().props.style[0], null);
  reactNative.Platform.OS = 'ios';
  assert.equal(view().props.style[0].position, 'absolute');
});

test('Harmony form-sheet cleanup emits closing lifecycle once when native callbacks are absent', () => {
  const cleanups = [];
  const React = { createElement: (type, props, ...children) => ({ type, props, children }), Fragment: 'Fragment',
    useRef: value => ({current: value}), useContext: () => null, useImperativeHandle() {},
    useEffect: fn => { const cleanup = fn(); if (cleanup) cleanups.push(cleanup); }, useCallback: fn => fn, forwardRef: fn => fn };
  const reactNative = { Platform: { OS: 'harmony' }, View: 'View', StyleSheet: {create: value => value, flatten: value => value} };
  const exported = {};
  vm.runInNewContext(fs.readFileSync(path.join(overlay, 'lib/commonjs/components/ScreenStackItem.js'), 'utf8'), {
    exports: exported,
    require: name => name === 'react' ? React : name === 'react-native' ? reactNative : name === 'warn-once' ? () => {} : {},
  });
  const calls = [];
  exported.default({stackPresentation:'formSheet',children:'content',headerConfig:{hidden:true},
    onWillDisappear:()=>calls.push('will'),onDisappear:()=>calls.push('end')},null);
  assert.equal(cleanups.length,1);
  cleanups[0]();cleanups[0]();
  assert.deepEqual(calls,['will','end']);
});
