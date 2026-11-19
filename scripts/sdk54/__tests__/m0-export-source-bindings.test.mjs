import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExportSourceBindings, validateExportSourceBindings } from '../m0-export-source-bindings.mjs';

test('traces star reexports and imported ambient symbols without inventing a compiler declaration', () => {
  const input = { files: [{ path: 'index.ts', content: "export * from './types';" },
    { path: 'types.ts', content: "import { Project } from 'xcode'; export { Project };" },
    { path: 'ambient.d.ts', content: 'declare module "xcode" { export class Project { nested: { file: string }; } }' }],
  requested: [{ id: 'EXPORT:Project', path: 'index.ts', name: 'Project' }],
  ambientBindings: [{ request: 'xcode', name: 'Project', path: 'ambient.d.ts' }] };
  const result = buildExportSourceBindings(input);
  assert.deepEqual(result.blockers, []);
  const row = result.bindings[0];
  assert.deepEqual(row.steps.map(s => s.path), ['index.ts', 'types.ts', 'types.ts', 'ambient.d.ts']);
  assert.equal(row.steps.at(-1).expression.includes('nested: { file: string }'), true);
  assert.equal(row.compilerTypeReplaced, false);
});
test('connects EJS export identifiers to raw filename templates and native/web definitions', () => {
  const input = { files: [{ path: 'index.ts', content: "export { default as <%- project.viewName %> } from './src/<%- project.viewName %>';" },
    { path: 'src/{%- project.viewName %}.tsx', content: 'export default function View() { return null; }' },
    { path: 'src/{%- project.viewName %}.web.tsx', content: 'export default function View() { return null; }' }],
  requested: [{ id: 'EXPORT:view', path: 'index.ts', name: 'Template_viewName______' }] };
  const result = buildExportSourceBindings(input);
  assert.equal(result.blockers.length, 0);
  assert.equal(result.bindings[0].routes.length, 2);
  assert.ok(result.bindings[0].steps[0].expression.includes('<%- project.viewName %>'));
  assert.ok(result.bindings[0].routes.some(r => r.targetPath.endsWith('.web.tsx')));
});
test('retains CommonJS assignments and native property forwarding as finite consumer rules', () => {
  const input = { files: [{ path: 'c.js', content: 'var a = require("./a"); var d = exports.default = a.default;' },
    { path: 'a.js', content: 'module.exports = function A() {};' },
    { path: 'native.ts', content: "import { NativeModules } from 'react-native'; export default NativeModules.LoadingView;" }],
  requested: [{ id: 'C', path: 'c.js', name: 'default' }, { id: 'N', path: 'native.ts', name: 'default' }] };
  const result = buildExportSourceBindings(input);
  assert.deepEqual(result.blockers, []);
  assert.ok(result.bindings.find(r => r.id === 'C').steps.some(r => r.expression.includes('require("./a")')));
  const native = result.bindings.find(r => r.id === 'N');
  assert.equal(native.terminalRole, 'EXTERNAL_CONSUMER_RULE');
  assert.equal(native.externalRequests[0].request, 'react-native');
  assert.ok(native.steps[0].expression.includes('NativeModules.LoadingView'));
});
test('missing templates, dangling ambient bindings, deleted or changed rules remain failures', () => {
  const input = { files: [{ path: 'index.ts', content: "export { default } from './missing';" }], requested: [{ id: 'E', path: 'index.ts', name: 'default' }] };
  assert.ok(buildExportSourceBindings(input).blockers.some(r => r.reason.includes('MISSING_TARGET')));
  input.files[0].content = 'export default 42;';
  const expected = buildExportSourceBindings(input), changed = structuredClone(expected);
  changed.bindings[0].steps[0].expression = 'export default 43;';
  assert.equal(validateExportSourceBindings(changed, expected).valid, false);
  changed.bindings = [];
  assert.equal(validateExportSourceBindings(changed, expected).valid, false);
  assert.throws(() => buildExportSourceBindings({ ...input, ambientBindings: [{ request: 'x', name: 'Y', path: 'absent' }] }), /ambient/);
});
test('nested broken reexports and local initialization cycles cannot become finite declarations', () => {
  const files = [{ path: 'index.ts', content: "export * from './middle';" },
    { path: 'middle.ts', content: "import Value from './missing'; export { Value };" }];
  const result = buildExportSourceBindings({ files, requested: [{ id: 'E', path: 'index.ts', name: 'Value' }] });
  assert.equal(result.bindings.length, 0);
  assert.ok(result.blockers.some(row => row.reason === 'MISSING_TARGET'));
  for (const content of ['const a = b; const b = a; export default a;', 'export default missing;']) {
    const broken = buildExportSourceBindings({ files: [{ path: 'index.ts', content }], requested: [{ id: 'E', path: 'index.ts', name: 'default' }] });
    assert.equal(broken.bindings.length, 0);
    assert.equal(broken.blockers.length, 1);
  }
  const platform = buildExportSourceBindings({ files: [{ path: 'index.ts', content: "export { default } from './target';" },
    { path: 'target.native.ts', content: 'export default 1;' }, { path: 'target.web.ts', content: 'export const unrelated = 2;' }],
  requested: [{ id: 'E', path: 'index.ts', name: 'default' }] });
  assert.equal(platform.bindings.length, 0);
  assert.ok(platform.blockers.some(row => row.reason === 'MISSING_TARGET'));
});

test('binds exported const, let and destructured variable declarations to their exact source statement', () => {
  const result = buildExportSourceBindings({
    files: [{ path: 'values.ts', content: 'export const DIRECT = 1; export let mutable = 2; export const { nested } = { nested: 3 };' }],
    requested: [
      { id: 'DIRECT', path: 'values.ts', name: 'DIRECT' },
      { id: 'mutable', path: 'values.ts', name: 'mutable' },
      { id: 'nested', path: 'values.ts', name: 'nested' },
    ],
  });
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(result.bindings.map(({ id }) => id), ['DIRECT', 'mutable', 'nested']);
  assert.match(result.bindings[0].steps[0].expression, /^export const DIRECT/);
  assert.match(result.bindings[2].steps[0].expression, /^export const \{ nested \}/);
});
test('retains external star and type-star reexports as explicit consumer boundaries', () => {
  const result=buildExportSourceBindings({
    files:[
      {path:'runtime.ts',content:"export * from 'runtime-package';"},
      {path:'types.ts',content:"export type * from 'types-package';"},
    ],
    requested:[
      {id:'runtime',path:'runtime.ts',name:'RuntimeValue'},
      {id:'types',path:'types.ts',name:'ExternalType'},
    ],
  });
  assert.deepEqual(result.blockers,[]);
  for(const binding of result.bindings) {
    assert.equal(binding.terminalRole,'EXTERNAL_CONSUMER_RULE');
    assert.equal(binding.externalRequests.length,1);
    assert.match(binding.steps[0].expression,/export/);
  }
  assert.deepEqual(result.bindings.map(binding=>binding.externalRequests[0].request),['runtime-package','types-package']);
});

test('resolves a named relative reexport to an existing TypeScript source', () => {
  const result = buildExportSourceBindings({
    files: [
      { path: 'src/index.ts', content: "export * from './unrelated'; export { CodedError } from './errors/CodedError';" },
      { path: 'src/unrelated.ts', content: 'export const unrelated = true;' },
      { path: 'src/errors/CodedError.ts', content: 'export class CodedError extends Error {}' },
    ],
    requested: [{ id: 'CodedError', path: 'src/index.ts', name: 'CodedError' }],
  });
  assert.deepEqual(result.blockers, []);
  assert.equal(result.bindings[0].routes[0].targetPath, 'src/errors/CodedError.ts');
});

test('resolves directory reexports through an index declaration file', () => {
  const result = buildExportSourceBindings({
    files: [
      { path: 'ui.d.ts', content: "export { TabsProps } from './build/ui';" },
      { path: 'build/ui/index.d.ts', content: 'export interface TabsProps { active: boolean }' },
    ],
    requested: [{ id: 'TabsProps', path: 'ui.d.ts', name: 'TabsProps' }],
  });
  assert.deepEqual(result.blockers, []);
  assert.equal(result.bindings[0].routes[0].targetPath, 'build/ui/index.d.ts');
});

test('binds a type from declarations when the parallel runtime file has no type symbol', () => {
  const result = buildExportSourceBindings({
    files: [
      { path: 'ui.d.ts', content: "export { TabsProps } from './build/ui';" },
      { path: 'build/ui/index.d.ts', content: 'export interface TabsProps { active: boolean }' },
      { path: 'build/ui/index.js', content: 'exports.Tabs = function Tabs() {};' },
    ],
    requested: [{ id: 'TabsProps', path: 'ui.d.ts', name: 'TabsProps' }],
  });
  assert.deepEqual(result.blockers, []);
  assert.equal(result.bindings[0].terminalRole, 'FINITE_SOURCE_DECLARATION');
  assert.equal(result.bindings[0].platformSupportAccepted, undefined);
});

test('binds namespace exports, CommonJS objects and generated module markers to source rules', () => {
  const result = buildExportSourceBindings({
    files: [
      { path: 'namespace.ts', content: "export * as SplashScreen from './splash';" },
      { path: 'splash.ts', content: 'export function hideAsync() {}' },
      { path: 'commonjs.js', content: "function getManifest() {} module.exports = { getManifest }; Object.defineProperty(module.exports, '__esModule', { value: true });" },
    ],
    requested: [
      { id: 'namespace', path: 'namespace.ts', name: 'SplashScreen' },
      { id: 'commonjs', path: 'commonjs.js', name: 'getManifest' },
      { id: 'marker', path: 'commonjs.js', name: '__esModule' },
    ],
  });
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(result.bindings.map(row => row.id), ['namespace', 'commonjs', 'marker']);
});

test('retains ambient declarations, runtime globals and verified relative assets as consumer boundaries', () => {
  const result = buildExportSourceBindings({
    files: [
      { path: 'ambient.d.ts', content: "import type { ErrorType } from 'errors'; declare let global: { ErrorType: typeof ErrorType };" },
      { path: 'fetch.web.ts', content: 'export const fetch = globalThis.fetch;' },
      { path: 'styles.ts', content: "import styles from './styles.css'; export default styles;" },
    ],
    relativeAssetTargets: [{ from: 'styles.ts', request: './styles.css', path: 'styles.css', sha256: 'a'.repeat(64) }],
    requested: [
      { id: 'ambient', path: 'ambient.d.ts', name: 'global' },
      { id: 'global', path: 'fetch.web.ts', name: 'fetch' },
      { id: 'asset', path: 'styles.ts', name: 'default' },
    ],
  });
  assert.deepEqual(result.blockers, []);
  assert.equal(result.bindings.find(row => row.id === 'global').externalRequests[0].request, 'globalThis');
  assert.equal(result.bindings.find(row => row.id === 'asset').routes[0].role, 'RELATIVE_ASSET_CONSUMER');
});
