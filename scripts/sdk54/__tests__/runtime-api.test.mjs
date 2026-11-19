import assert from 'node:assert/strict';
import test from 'node:test';
import { indexRuntimeApi, serializeRuntimeApi, validateRuntimeApi } from '../runtime-api-model.mjs';
import { selectRuntimeSources } from '../runtime-api.mjs';

function fixture(extra = []) {
  return new Map([
    ['packages/demo/package.json', JSON.stringify({ name: 'demo', version: '1.0.0', main: 'build/index.js', types: 'build/index.d.ts', exports: { '.': { 'react-server': './build/index.server.js', default: './build/index.js' }, './app.plugin': './app.plugin.js' } })],
    ['packages/demo/src/index.ts', `export { Thing as PublicThing, type Options } from './types'; export * from './cycle'; export * as nested from './types'; export { default } from './value';`],
    ['packages/demo/src/index.server.ts', `export const server = true;`],
    ['packages/demo/src/index.web.ts', `export const web = true;`],
    ['packages/demo/src/cycle.ts', `export * from './index'; export function run(value: string): void { throw Error(value); }`],
    ['packages/demo/src/types.ts', `import type { Foreign } from 'external'; export interface Options { dark?: { color: string; onDone?: (value: number) => void }; external?: Foreign; }
      export class Thing { public value: string = ''; private secret = 1; protected hidden() {} method(value: Options): void {} }
      export enum Mode { A = 'a', B = 'b' }`],
    ['packages/demo/src/value.ts', `import type { Options } from './types'; const value = {}; export default value as Options;`],
    ['packages/demo/src/__tests__/ignored.ts', 'invalid typescript !'],
    ...extra,
  ]);
}
const run = (files = fixture()) => indexRuntimeApi({ files, packageNames: ['demo'] });

test('API-01/02: roots, conditions, platform variants, outside-scope entries and input hashes', () => {
  const result = run();
  assert.equal(result.packages.length, 1);
  assert.ok(result.entries.some(e => e.pointer === '/exports/./react-server' && e.source.path.endsWith('index.server.ts')));
  assert.ok(result.entries.some(e => e.platformVariant === 'web' && e.source.path.endsWith('index.web.ts')));
  assert.ok(result.packages[0].outsideScopeEntries.some(e => e.request === './app.plugin.js'));
  assert.ok(result.inputs.every(e => e.sha256.length === 64 && !e.path.includes('__tests__')));
  assert.equal(result.fullPublicSurfaceComplete, false);
  assert.equal(result.stageClosable, false);
});

test('API-03: alias/star cycles/namespace/default exports point to source declarations', () => {
  const result = run();
  const root = result.entries.find(e => e.pointer === '/main');
  const apis = result.apis.filter(e => e.entryId === root.id);
  assert.ok(apis.some(e => e.name === 'PublicThing' && e.declarationIds.length));
  assert.ok(apis.some(e => e.name === 'run'));
  assert.ok(apis.some(e => e.name === 'nested.Options'));
  assert.ok(apis.some(e => e.name === 'default'));
  assert.ok(apis.every(e => e.source.line > 0));
});

test('API-04/05: nested members/callback parameters/private visibility and type dependencies', () => {
  const result = run();
  assert.ok(result.members.some(e => e.memberPath === 'Options.dark.color'));
  assert.ok(result.members.some(e => e.memberPath.includes('onDone') && e.kind === 'Parameter'));
  assert.ok(!result.members.some(e => /secret|hidden/.test(e.memberPath)));
  const assignment = result.declarations.find(e => e.kind === 'ExportAssignment');
  assert.ok(assignment.typeReferences.some(e => e.name === 'Options' && e.resolution === 'source'));
  assert.ok(result.declarations.flatMap(e => e.typeReferences).some(e => e.name === 'Foreign' && e.resolution === 'unresolved-or-external'));
  assert.ok(result.members.some(e => e.memberPath === 'Mode.A'));
});

test('API-01/03: reject malformed source, missing relative target, conflicting star and ambiguous projections', () => {
  for (const [extra, pattern] of [
    [[['packages/demo/src/broken.ts', 'export const x = ;']], /syntax/i],
    [[['packages/demo/src/broken.ts', "export * from './missing';"]], /relative/i],
    [[['packages/demo/src/index.ts', "export * from './a'; export * from './b';"], ['packages/demo/src/a.ts', 'export const clash = 1;'], ['packages/demo/src/b.ts', 'export const clash = 2;']], /export.*conflict|2308/i],
    [[['packages/demo/src/index.tsx', 'export const other = 1;']], /ambiguous/i],
  ]) assert.throws(() => run(fixture(extra)), pattern);
});

test('API-06: deterministic rebuild rejects missing records, dangling declarations, hashes and completeness claims', () => {
  const expected = run();
  assert.deepEqual(run(), expected);
  const mutations = [
    v => v.packages.pop(), v => v.apis.pop(), v => v.members.pop(), v => v.entries.pop(),
    v => v.apis.push(v.apis[0]), v => { v.apis[0].declarationIds = ['DECL:missing']; },
    v => { v.apis[0].source = null; }, v => { v.inputs[0].sha256 = '0'.repeat(64); },
    v => { v.fullPublicSurfaceComplete = true; },
  ];
  for (const mutate of mutations) {
    const actual = structuredClone(expected); mutate(actual);
    const result = validateRuntimeApi(actual, expected);
    assert.equal(result.valid, false);
    assert.ok(result.failures.length);
  }
});

test('API-03 edge: existing relative module cannot silently lose a named import/export', () => {
  for (const source of ["export { Missing } from './types';", "import { Missing } from './types'; export { Missing };"])
    assert.throws(() => run(fixture([['packages/demo/src/index.ts', source]])), /relative.*(?:symbol|export)|2305/i);
});

test('API-03/04 edge: external stars stay open; overloads, generic and private fields are distinct', () => {
  const result = run(fixture([
    ['packages/demo/src/extra.ts', `export * from 'outside'; export { Unknown } from 'outside';
      export function overloaded(value: string): string;
      export function overloaded(value: number): number;
      export function overloaded(value: string | number) { return value; }
      export interface Box<T> { value: T; }
      export class Child { #secret = 1; constructor(public shown: string, private hidden: number) {} }`],
  ]));
  assert.ok(result.modules.find(m => m.source.path.endsWith('/extra.ts')).unresolvedExportStars.length);
  assert.equal(result.declarations.filter(d => d.name === 'overloaded').length, 3);
  assert.ok(result.declarations.flatMap(d => d.typeReferences).some(r => r.resolution === 'type-parameter'));
  assert.ok(!result.members.some(m => m.memberPath.includes('#secret') || m.memberPath.endsWith('.hidden')));
});

test('API-03 edge: string export names cannot collide with namespace member IDs', () => {
  const result = run(fixture([['packages/demo/src/index.ts', `export { Options as "nested.Options" } from './types'; export * as nested from './types';`]]));
  assert.equal(new Set(result.apis.map(api => api.id)).size, result.apis.length);
});

test('API-02 edge: build projection matches a complete directory segment', () => {
  assert.doesNotThrow(() => run(fixture([
    ['packages/demo/src/index.ts', "export { builder } from './builder';"],
    ['packages/demo/src/builder.ts', 'export const builder = 1;'],
  ])));
});

test('API-01 edge: JSON source excerpts preserve URI text without raw configuration URI matches', () => {
  const value = { sourceExcerpt: '/** Accepts file:// URLs. */', source: 'packages/demo/src/index.ts' };
  const text = serializeRuntimeApi(value);
  assert.deepEqual(JSON.parse(text), value);
  assert.doesNotMatch(text, /\bfile:\//);
});

test('API-01: fixed-tree selection rejects source symlinks and excludes tests/other packages/artifacts', () => {
  const entry = path => ({ path, type: 'blob', mode: '100644' });
  const tree = ['packages/demo/src/index.ts', 'packages/demo/package.json', 'packages/demo/src/__tests__/ignored.ts',
    'packages/demo/build/index.js', 'packages/other/src/index.ts'].map(entry);
  assert.deepEqual(selectRuntimeSources(tree, ['demo']).map(e => e.path), ['packages/demo/package.json', 'packages/demo/src/index.ts']);
  for (const invalid of [{ ...entry('packages/demo/src/link.ts'), mode: '120000' }, { path: 'packages/demo/src/gitlink', type: 'commit', mode: '160000' }])
    assert.throws(() => selectRuntimeSources([...tree, invalid], ['demo']), /Unsupported runtime source\/symlink/);
});
