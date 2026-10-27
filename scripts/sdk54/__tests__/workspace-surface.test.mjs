import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { indexWorkspaceSurface, validateWorkspaceSurface, selectWorkspaceSources } from '../workspace-surface.mjs';

const blob = (path, text) => ({ path, mode: '100644', type: 'blob', oid: createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0${text}`).digest('hex') });
function fixture() {
  const files = new Map([
    ['packages/a/package.json', JSON.stringify({ name: 'a', main: 'build/index.js', exports: { '.': './build/index.js', './extra/*': './build/extra/*.js' } })],
    ['packages/a/src/index.ts', `import { B } from 'b'; export { B }; export * from './types'; export interface Options { dark?: { image: string }; done(v: number): void; [key: string]: unknown; } export const settings = { nested: { on: true } };`],
    ['packages/a/src/types.ts', `export enum Mode { One, Two } export type Pair = [first: string, second?: number]; export class Thing { visible = 1; private secret = 2; method(x: string) { return x; } }`],
    ['packages/a/src/index.web.ts', `export const web = 1;`],
    ['packages/a/src/extra/x.ts', `export const extra = true;`],
    ['packages/a/app.plugin.js', `module.exports = require('./plugin/build/withA');`],
    ['packages/a/plugin/src/withA.ts', `export default function withA(config: unknown) { return config; }`],
    ['packages/a/__tests__/a.test.ts', 'not valid production code ???'],
    ['packages/a/ios/Module.swift', 'native source'],
    ['packages/b/package.json', JSON.stringify({ name: 'b', main: 'src/index.ts' })],
    ['packages/b/src/index.ts', 'export class B {}'],
    ['templates/demo/package.json', JSON.stringify({ name: 'demo', main: 'index.ts' })],
    ['templates/demo/index.ts', `export const template = 1;`],
  ]);
  const entries = [...files].map(([file, text]) => blob(file, text));
  const item = (name, sourcePath, kind = 'PKG') => ({ id: `${kind}:${name}`, name, sourcePath });
  const inventory = { packages: [item('a', 'packages/a/package.json'), item('b', 'packages/b/package.json')], templates: [item('demo', 'templates/demo/package.json', 'TEMPLATE')] };
  return { entries, inventory, files, source: { revision: 'a'.repeat(40), tree: 'b'.repeat(40) } };
}

test('all roots, platforms, plugin and templates included; excluded files still classified', () => {
  const input = fixture(), result = indexWorkspaceSurface(input);
  assert.equal(result.packages.length, 3);
  assert.equal(result.files.length, input.entries.length);
  assert.ok(result.modules.some(m => m.source.path.endsWith('index.web.ts')));
  assert.ok(result.modules.some(m => m.source.path.endsWith('withA.ts')));
  assert.equal(result.files.find(f => f.path.includes('__tests__')).role, 'test');
  assert.equal(result.files.find(f => f.path.endsWith('.swift')).role, 'native-or-resource');
});

test('nested properties, methods, index signatures, tuple and enum members retain identity and location', () => {
  const result = indexWorkspaceSurface(fixture());
  for (const name of ['image', 'done', 'v', 'One', 'Two', 'first', 'second', 'nested', 'on']) assert.ok(result.members.some(m => m.name === name), name);
  assert.ok(result.members.some(m => m.kind === 'IndexSignature'));
  assert.ok(!result.members.some(m => m.name === 'secret'));
  assert.ok(result.exports.some(e => e.name === 'Options'));
  for (const records of [result.declarations, result.members, result.exports]) for (const record of records) assert.ok(record.id && record.source.line > 0 && record.packageId && record.batch && record.scope);
});

test('conditional wildcard/build source entries and workspace dependencies are explicit', () => {
  const result = indexWorkspaceSurface(fixture());
  assert.ok(result.entries.some(e => e.request.includes('*') && e.targets.some(t => t.path.endsWith('/extra/x.ts'))));
  assert.ok(result.entries.some(e => e.targets.some(t => t.path.endsWith('/src/index.ts'))));
  assert.ok(result.references.some(r => r.request === 'b' && r.resolution.packageId === 'PKG:b'));
  assert.ok(result.references.some(r => r.request === './plugin/build/withA' && r.resolution.targets.some(t => t.path.endsWith('/plugin/src/withA.ts'))));
});

test('unsupported syntax, external stars, inferred and dynamic boundaries cannot yield full surface', () => {
  const input = fixture();
  input.files.set('packages/a/src/unknown.ts', `export * from 'foreign'; module.exports = load(); export const inferred = makeThing();`);
  input.entries.push(blob('packages/a/src/unknown.ts', input.files.get('packages/a/src/unknown.ts')));
  const result = indexWorkspaceSurface(input);
  for (const kind of ['external-star', 'dynamic-commonjs', 'inferred-type']) assert.ok(result.gaps.some(g => g.kind === kind), kind);
  assert.equal(result.publicSurfaceComplete, false);
  assert.equal(result.stageClosable, false);
});

test('fixed blob integrity, missing source and symlinks fail closed', () => {
  const input = fixture(); input.files.set('packages/a/src/types.ts', 'export const forged = 1;');
  assert.throws(() => indexWorkspaceSurface(input), /integrity/);
  const missing = fixture(); missing.files.delete('packages/a/src/types.ts');
  assert.throws(() => indexWorkspaceSurface(missing), /Missing source/);
  const link = fixture(); link.entries.find(e => e.path.endsWith('/types.ts')).mode = '120000';
  assert.throws(() => selectWorkspaceSources(link.entries, link.inventory), /symlink/);
});

test('source reconstruction detects omissions, duplicates, dangling dependencies and forged completeness', () => {
  const expected = indexWorkspaceSurface(fixture());
  for (const field of ['packages', 'files', 'modules', 'exports', 'declarations', 'members', 'references', 'entries', 'gaps']) {
    assert.ok(expected[field].length, field);
    const actual = structuredClone(expected); actual[field].pop();
    assert.equal(validateWorkspaceSurface(actual, expected).valid, false, field);
  }
  for (const mutate of [a => a.members.push(a.members[0]), a => a.publicSurfaceComplete = true, a => a.declarations[0].dependencies.push('MISSING'), a => a.exports.push({ id: 'FAKE' })]) {
    const actual = structuredClone(expected); mutate(actual); assert.equal(validateWorkspaceSurface(actual, expected).valid, false);
  }
  assert.deepEqual(indexWorkspaceSurface(fixture()), expected);
  assert.equal(validateWorkspaceSurface(expected, expected).valid, true);
});

test('CommonJS object exports and assigned functions retain their nested public members', () => {
  const input = fixture();
  const file = 'packages/a/common.cjs', text = `module.exports = { options: { enabled: true }, run(value) { return value; } }; exports.helper = function(options) { return options; };`;
  input.files.set(file, text); input.entries.push(blob(file, text));
  const result = indexWorkspaceSurface(input);
  for (const name of ['options', 'enabled', 'run', 'value']) assert.ok(result.members.some(m => m.source.path === file && m.name === name), name);
});

test('source resolution honors TypeScript precedence, platform fallbacks and missing workspace targets', () => {
  const input = fixture();
  for (const [file, text] of [['packages/a/src/shared.ts', 'export const one = 1;'], ['packages/a/src/shared.d.ts', 'export const one: number;'], ['packages/a/src/only.native.ts', 'export const two = 2;'], ['packages/a/edge.ts', `import './src/shared'; import './src/only'; export * from 'b/missing';`]]) {
    input.files.set(file, text); input.entries.push(blob(file, text));
  }
  const result = indexWorkspaceSurface(input);
  const shared = result.references.find(r => r.request === './src/shared');
  assert.equal(shared.resolution.status, 'source'); assert.equal(shared.resolution.targets[0].path, 'packages/a/src/shared.ts');
  const native = result.references.find(r => r.request === './src/only');
  assert.equal(native.resolution.status, 'platform-dependent');
  assert.ok(native.resolution.targets.some(t => t.path.endsWith('only.native.ts')));
  assert.ok(result.gaps.some(g => g.kind === 'workspace-star'));
});

test('CLI build/bin, build/src, declaration d suffix and bare workspace main map to fixed sources', () => {
  const input = fixture();
  for (const [file, text] of [['packages/a/bin/cli.ts', 'export const cli = true;'], ['packages/a/src/types.ts', `export type Options = { flag: boolean };`], ['packages/a/project.js', `require('./build/bin/cli'); require('./build/src/types'); require('./build/types.d');`]]) {
    input.files.set(file, text);
    const old = input.entries.findIndex(e => e.path === file);
    if (old >= 0) input.entries[old] = blob(file, text); else input.entries.push(blob(file, text));
  }
  const manifest = 'templates/demo/package.json', text = JSON.stringify({ name: 'demo', main: 'b/src/index' });
  input.files.set(manifest, text); input.entries[input.entries.findIndex(e => e.path === manifest)] = blob(manifest, text);
  const result = indexWorkspaceSurface(input);
  for (const request of ['./build/bin/cli', './build/src/types', './build/types.d']) assert.equal(result.references.find(r => r.request === request).resolution.status, 'source', request);
  assert.equal(result.entries.find(e => e.packageId === 'TEMPLATE:demo').targets[0]?.packageId, 'PKG:b');
});

test('default object exports, computed CommonJS and property definition exports cannot disappear', () => {
  const input = fixture();
  const file = 'packages/a/default.js', text = `export default { dark: { color: 'black' } }; module['exports'] = { publicValue: 1 }; Object.defineProperty(exports, 'named', { get: () => 1 }); Object.assign(exports, dynamic());`;
  input.files.set(file, text); input.entries.push(blob(file, text));
  const result = indexWorkspaceSurface(input);
  for (const name of ['dark', 'color', 'publicValue']) assert.ok(result.members.some(m => m.source.path === file && m.name === name), name);
  assert.ok(result.exports.some(e => e.source.path === file && e.name === 'named'));
  assert.ok(result.gaps.some(g => g.kind === 'dynamic-export-mutation' && g.source.path === file));
});

test('omitted input source reports its exact fixed path', () => {
  const expected = indexWorkspaceSurface(fixture()), actual = structuredClone(expected), removed = actual.inputs.pop();
  const checked = validateWorkspaceSurface(actual, expected);
  assert.equal(checked.valid, false);
  assert.ok(checked.failures.some(message => message.includes(removed.path)));
});

test('module templates preserve raw source positions while extracting a clearly marked syntax projection', () => {
  const input = fixture(), file = 'packages/a/template.ts';
  const text = `export interface <%- project.moduleName %>Options { enabled: boolean; nested: { color: string } } export default { module: '<%- project.name %>' };`;
  input.files.set(file, text); input.entries.push(blob(file, text));
  const result = indexWorkspaceSurface(input), module = result.modules.find(m => m.source.path === file);
  assert.equal(module.parseDiagnostics.length, 0);
  assert.equal(module.templateProjection.kind, 'syntax-only-fixed-width');
  assert.ok(result.gaps.some(g => g.kind === 'uninstantiated-template' && g.source.path === file));
  for (const name of ['enabled', 'nested', 'color']) {
    const member = result.members.find(m => m.source.path === file && m.name === name);
    assert.ok(member, name); assert.ok(text.slice(member.source.start, member.source.end).startsWith(name));
  }
  assert.ok(result.declarations.some(d => d.name === '<%- project.moduleName %>Options'));
  assert.ok(result.exports.some(d => d.name === '<%- project.moduleName %>Options'));
});
