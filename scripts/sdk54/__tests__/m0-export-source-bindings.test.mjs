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
