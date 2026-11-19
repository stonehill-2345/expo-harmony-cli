import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkspaceResolver, indexWorkspaceExports, reviewWorkspaceGaps, validateWorkspaceExports } from '../workspace-export-graph.mjs';

function fixture() {
  const files = new Map([
    ['packages/a/package.json', JSON.stringify({ name: 'a', main: 'build/index.js', dependencies: { b: '*' } })],
    ['packages/a/src/index.ts', `export * from 'b'; export * from './cycle'; export * as model from './model'; import { Base as Imported } from 'b'; export { Imported as Alias }; export type { Options } from './model'; export const collision = 2;`],
    ['packages/a/src/cycle.ts', `export * from './index'; export const Cycle = 3;`],
    ['packages/a/src/model.ts', `export interface Options { nested: { value: string } }`],
    ['packages/b/package.json', JSON.stringify({ name: 'b', main: 'build/index.js', exports: { '.': { types: './build/index.d.ts', default: './build/index.js' }, './types/*': { types: './build/types/*.d.ts', default: './build/types/*.js' }, './types/special/*': './build/special/*.js', './private': null } })],
    ['packages/b/src/index.ts', `export interface Base { enabled: boolean } export default 9; export const collision = 1;`],
    ['packages/b/src/types/example.ts', `export type Value = string;`],
    ['packages/b/src/types/special/example.ts', `export const wrong = true;`],
    ['packages/b/src/special/example.ts', `export const correct = true;`],
    ['packages/b/src/secret.ts', `export const secret = true;`],
  ]);
  const packages = ['a', 'b'].map(name => ({ id: `PKG:${name}`, name, sourcePath: `packages/${name}/package.json` }));
  return { files, packages };
}

test('fixed-only resolver handles package roots, wildcard specificity, types projection and exports encapsulation', () => {
  const input = fixture(), resolve = createWorkspaceResolver(input);
  assert.equal(resolve('b', 'packages/a/src/index.ts').path, 'packages/b/src/index.ts');
  assert.equal(resolve('b/types/example', 'packages/a/src/index.ts').path, 'packages/b/src/types/example.ts');
  assert.equal(resolve('b/types/special/example', 'packages/a/src/index.ts').path, 'packages/b/src/special/example.ts');
  assert.equal(resolve('b/src/secret', 'packages/a/src/index.ts').status, 'not-exported');
  assert.equal(resolve('b/private', 'packages/a/src/index.ts').status, 'not-exported');
  assert.equal(resolve('typescript', 'packages/a/src/index.ts').status, 'external');
  assert.equal(resolve('../../../../escape', 'packages/a/src/index.ts').status, 'outside-source');
});

test('workspace star, cycles, explicit shadow, alias and namespace resolve original declarations', () => {
  const graph = indexWorkspaceExports(fixture());
  const list = graph.exports.filter(e => e.moduleId === 'MODULE:packages/a/src/index.ts');
  for (const name of ['Base', 'Alias', 'Options', 'Cycle', 'model', 'collision']) assert.ok(list.some(e => e.name === name), name);
  assert.ok(!list.some(e => e.name === 'default'));
  assert.equal(list.find(e => e.name === 'Alias').symbolId, list.find(e => e.name === 'Base').symbolId);
  const base = graph.symbols.find(s => s.id === list.find(e => e.name === 'Base').symbolId);
  assert.ok(base.declarations.some(d => d.path === 'packages/b/src/index.ts'));
  assert.equal(list.find(e => e.name === 'Base').spaces.type, true);
  assert.equal(list.find(e => e.name === 'Base').spaces.value, false);
  assert.equal(list.find(e => e.name === 'model').namespaceTarget, 'MODULE:packages/a/src/model.ts');
  assert.equal(graph.publicSurfaceComplete, false);
});

test('CommonJS static source wrapper resolves named declarations through bare deep entry', () => {
  const input = fixture();
  input.files.set('packages/a/src/wrapper.ts', `export * from 'a/forward';`);
  input.files.set('packages/a/forward.js', `module.exports = require('./build/model');`);
  const graph = indexWorkspaceExports(input);
  assert.ok(graph.exports.some(e => e.moduleId === 'MODULE:packages/a/src/wrapper.ts' && e.name === 'Options'));
});

test('ambiguous star exports and missing named symbols are recorded instead of accepted', () => {
  const input = fixture();
  input.files.set('packages/a/src/conflict.ts', `export * from 'b'; export * from './index'; export { Missing } from './model';`);
  const graph = indexWorkspaceExports(input);
  assert.ok(graph.diagnostics.some(d => d.code === 2308 && d.source.path.endsWith('conflict.ts')));
  assert.ok(graph.diagnostics.some(d => d.code === 2305 && d.source.path.endsWith('conflict.ts')));
  assert.ok(graph.modules.find(m => m.source.path.endsWith('conflict.ts')).hasExportErrors);
});

test('external star, alias identity and platform-only paths remain explicit boundaries', () => {
  const input = fixture();
  input.files.set('packages/a/src/edge.ts', `export * from 'foreign'; export * from './platform';`);
  input.files.set('packages/a/src/platform.native.ts', 'export const nativeOnly = 1;');
  const manifest = JSON.parse(input.files.get('packages/a/package.json')); manifest.dependencies.b = 'npm:other@1.0.0';
  input.files.set('packages/a/package.json', JSON.stringify(manifest));
  const resolve = createWorkspaceResolver(input);
  assert.equal(resolve('b', 'packages/a/src/index.ts').status, 'alias-boundary');
  assert.equal(resolve('./platform', 'packages/a/src/edge.ts').status, 'platform-dependent');
  const graph = indexWorkspaceExports(input);
  assert.ok(graph.edges.some(e => e.request === 'foreign' && e.resolution.status === 'external'));
  assert.ok(graph.modules.find(m => m.source.path.endsWith('edge.ts')).unresolvedExportEdges.length > 0);
});

test('conditional alternatives are preserved and no host library or dependency is loaded', () => {
  const input = fixture();
  const manifest = JSON.parse(input.files.get('packages/b/package.json')); manifest.exports['.'].default = './src/server.ts';
  input.files.set('packages/b/package.json', JSON.stringify(manifest)); input.files.set('packages/b/src/server.ts', 'export const server = 1;');
  const r = createWorkspaceResolver(input)('b', 'packages/a/src/index.ts');
  assert.equal(r.path, 'packages/b/src/index.ts');
  assert.ok(r.alternatives.some(a => a.path === 'packages/b/src/server.ts'));
  const graph = indexWorkspaceExports(input);
  assert.deepEqual(graph.inputs.map(i => i.path).sort(), [...input.files.keys()].sort());
  assert.ok(graph.symbols.every(s => s.declarations.every(d => input.files.has(d.path))));
});

test('deterministic rebuild rejects omissions, duplicate symbols, changed origin and fake completeness', () => {
  const expected = indexWorkspaceExports(fixture());
  assert.deepEqual(indexWorkspaceExports(fixture()), expected);
  for (const key of ['inputs', 'modules', 'edges', 'exports', 'symbols']) {
    const actual = structuredClone(expected); const record = actual[key].pop();
    const result = validateWorkspaceExports(actual, expected);
    assert.equal(result.valid, false, key); assert.ok(result.failures.some(f => f.includes(record.id ?? record.path)), key);
  }
  for (const mutate of [a => a.symbols.push(a.symbols[0]), a => a.publicSurfaceComplete = true, a => a.symbols[0].declarations.pop()]) {
    const actual = structuredClone(expected); mutate(actual); assert.equal(validateWorkspaceExports(actual, expected).valid, false);
  }
});

test('invalid or traversing export targets and self-forwarding wrappers fail closed', () => {
  const input = fixture(), manifest = JSON.parse(input.files.get('packages/b/package.json'));
  manifest.exports['./escape'] = '../a/src/model.ts';
  input.files.set('packages/b/package.json', JSON.stringify(manifest));
  input.files.set('packages/a/loop.js', `module.exports = require('./loop');`);
  const resolve = createWorkspaceResolver(input);
  assert.equal(resolve('b/escape', 'packages/a/src/index.ts').status, 'invalid-export-target');
  assert.equal(resolve('b/types/../../a/src/model', 'packages/a/src/index.ts').status, 'invalid-subpath');
  assert.equal(resolve('a/loop', 'packages/a/src/index.ts').status, 'wrapper-cycle');
});

test('import compatibility diagnostics remain analysis boundaries, and JSX is enabled', () => {
  const input = fixture();
  input.files.set('packages/a/src/external.d.ts', `declare module 'external-cjs' { export const one: number; }`);
  input.files.set('packages/a/src/consumer.tsx', `import value from 'external-cjs'; export const Node = <div />;`);
  const graph = indexWorkspaceExports(input);
  assert.ok(graph.diagnostics.some(d => d.source.path.endsWith('consumer.tsx') && d.scope === 'import-boundary'));
  assert.equal(graph.diagnosticCounts[17004], undefined);
  assert.equal(graph.compilerOptions.jsx, 'preserve');
});

test('dynamic CommonJS and non-module targets cannot be reviewed as complete empty exports', () => {
  const input = fixture();
  input.files.set('packages/a/src/dynamic.js', `module.exports = loadSomething();`);
  input.files.set('packages/a/src/plain.ts', `const localOnly = 1;`);
  input.files.set('packages/a/src/public.ts', `export * from './plain';`);
  input.files.set('packages/a/src/dynamic-public.ts', `export * from './dynamic';`);
  const graph = indexWorkspaceExports(input);
  assert.ok(graph.modules.find(m => m.source.path.endsWith('dynamic.js')).unresolvedExportEdges.length);
  const previous = { nonInferredGaps: ['public.ts', 'dynamic-public.ts'].map(name => ({ id: `OLD:${name}`, kind: 'workspace-star', source: { path: `packages/a/src/${name}`, start: 0 } })) };
  const reviews = reviewWorkspaceGaps(graph, previous);
  assert.ok(reviews.every(r => r.status === 'PARTIAL_SOURCE'));
});

test('nontrivial CommonJS wrappers are not rewritten as pure source forwarding', () => {
  const input = fixture();
  input.files.set('packages/a/forward.js', `module.exports = require('./build/model'); module.exports.extra = 1;`);
  const resolved = createWorkspaceResolver(input)('a/forward', 'packages/a/src/index.ts');
  assert.equal(resolved.path, 'packages/a/forward.js');
  assert.equal(resolved.sourceWrappers, undefined);
});

test('type-only star syntax remains on the graph edge independently from origin symbol spaces', () => {
  const input = fixture(); input.files.set('packages/a/src/only-types.ts', `export type * from 'b';`);
  const graph = indexWorkspaceExports(input), edge = graph.edges.find(e => e.source.path.endsWith('only-types.ts'));
  assert.equal(edge.typeOnlySyntax, true);
  assert.ok(graph.exports.filter(e => e.moduleId === 'MODULE:packages/a/src/only-types.ts').every(e => e.spacesMeaning.includes('origin-symbol')));
});

test('computed CommonJS export assignments are retained as semantic boundaries', () => {
  const input = fixture(); input.files.set('packages/a/src/computed.js', `module['exports'] = makeExports(); Object.assign(module['exports'], extra());`);
  const graph = indexWorkspaceExports(input), module = graph.modules.find(m => m.source.path.endsWith('computed.js'));
  assert.equal(module.commonjsMutations.length, 2);
  assert.ok(module.unresolvedExportEdges.some(id => id.endsWith(':commonjs-semantics')));
});
