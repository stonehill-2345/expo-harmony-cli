import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { verifyArchiveIntegrity, assertArchiveEntry, findMetroAlias, indexMetroTypes, validateMetroTypes } from '../metro-type-source.mjs';

function fixture() {
  return new Map([
    ['package.json', JSON.stringify({ name: '@expo/metro', version: '54.2.0', exports: { './metro-config': './metro-config/index.js' } })],
    ['metro-config/index.d.ts', `import * as _namespace from './index.flow'; export = _namespace;`],
    ['metro-config/index.flow.d.ts', `export type * from './types';`],
    ['metro-config/types.d.ts', `import type { Foreign } from 'foreign'; export interface Base { root: string; } export interface ConfigT extends Readonly<Base> { nested: { enabled: boolean }; cache: Foreign; callback?: (name: string) => void; } export interface InputConfigT { inputOnly?: boolean } export type MetroConfig = InputConfigT;`],
  ]);
}
const upstream = `import type { ConfigT as MetroConfig, InputConfigT } from '@expo/metro/metro-config'; export { MetroConfig };`;

test('archive bytes must match both fixed SHA512 and resolved SHA1', () => {
  const bytes = Buffer.from('fixture'); const integrity = 'sha512-' + createHash('sha512').update(bytes).digest('base64');
  const resolved = 'https://registry.example/a.tgz#' + createHash('sha1').update(bytes).digest('hex');
  assert.equal(verifyArchiveIntegrity(bytes, { integrity, resolved }).valid, true);
  assert.throws(() => verifyArchiveIntegrity(Buffer.from('changed'), { integrity, resolved }), /integrity|SHA/i);
  assert.throws(() => verifyArchiveIntegrity(bytes, { integrity: 'sha512-YQ==', resolved }), /integrity|SHA/i);
});
test('tar paths, links, duplicate normalized entries and excessive sizes fail closed', () => {
  for (const entry of [{ path: '../escape', type: 'File' }, { path: 'package/../escape', type: 'File' }, { path: '/abs', type: 'File' }, { path: 'package/a', type: 'SymbolicLink' }, { path: 'package/a', type: 'Link' }, { path: 'package/a', type: 'File', size: 100000000 }]) assert.throws(() => assertArchiveEntry(entry, new Set()), /Unsafe|limit|link/i);
  const seen = new Set(); assertArchiveEntry({ path: 'package/a.d.ts', type: 'File', size: 10 }, seen);
  assert.throws(() => assertArchiveEntry({ path: 'package/a.d.ts', type: 'File', size: 10 }, seen), /Duplicate/);
});
test('upstream exported MetroConfig alias is ConfigT, not the external same-name alias', () => {
  const alias = findMetroAlias(upstream); assert.equal(alias.importedName, 'ConfigT'); assert.equal(alias.localName, 'MetroConfig');
  const result = indexMetroTypes({ files: fixture(), upstreamText: upstream });
  assert.equal(result.root.name, 'ConfigT');
  for (const name of ['root', 'nested', 'enabled', 'cache', 'callback', 'name']) assert.ok(result.members.some(m => m.name === name), name);
  assert.ok(!result.declarations.some(d => d.name === 'InputConfigT'));
});
test('published namespace/relative-star chain and unexpanded references remain explicit', () => {
  const result = indexMetroTypes({ files: fixture(), upstreamText: upstream });
  assert.deepEqual(result.entryChain.map(e => e.path), ['metro-config/index.d.ts', 'metro-config/index.flow.d.ts']);
  assert.ok(result.references.some(r => r.name === 'Foreign' && r.resolution === 'external-or-unresolved'));
  assert.ok(result.references.some(r => r.name === 'Readonly' && r.resolution === 'utility-not-expanded'));
  assert.equal(result.fullTypeSurfaceComplete, false); assert.equal(result.stageClosable, false);
  assert.ok(result.members.every(m => m.source.line > 0));
});
test('package identity, missing declarations and wrong upstream export cannot be accepted', () => {
  const files = fixture(); files.set('package.json', '{"name":"foreign","version":"54.2.0"}');
  assert.throws(() => indexMetroTypes({ files, upstreamText: upstream }), /identity/);
  const missing = fixture(); missing.delete('metro-config/types.d.ts');
  assert.throws(() => indexMetroTypes({ files: missing, upstreamText: upstream }), /Missing|ConfigT|resolve/);
  assert.throws(() => findMetroAlias(`import type { ConfigT as MetroConfig } from '@expo/metro/metro-config';`), /export/);
});
test('reconstruction rejects missing member/origin/reference, changed alias and fake type completeness', () => {
  const expected = indexMetroTypes({ files: fixture(), upstreamText: upstream }); assert.deepEqual(indexMetroTypes({ files: fixture(), upstreamText: upstream }), expected);
  for (const mutate of [a => a.members.pop(), a => a.declarations.pop(), a => a.references.pop(), a => a.root.name = 'MetroConfig', a => a.fullTypeSurfaceComplete = true]) {
    const actual = structuredClone(expected); mutate(actual); assert.equal(validateMetroTypes(actual, expected).valid, false);
  }
});

test('reachable class and named-tuple members are indexed while private members are excluded', () => {
  const files = fixture(); files.set('metro-config/types.d.ts', `export class Cache { readonly value: string; get(key: string): number; constructor(size: number); private secret: string; } export interface ConfigT { cache: Cache; pair: [left: string, right?: number]; }`);
  const result = indexMetroTypes({ files, upstreamText: upstream });
  for (const name of ['value', 'get', 'key', 'size', 'left', 'right']) assert.ok(result.members.some(m => m.name === name), name);
  assert.ok(!result.members.some(m => m.name === 'secret'));
  assert.equal(result.members.find(m => m.name === 'value').readonlySyntax, true);
});
