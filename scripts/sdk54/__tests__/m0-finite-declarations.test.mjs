import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFiniteDeclarations, validateFiniteDeclarations } from '../m0-finite-declarations.mjs';

const files = [
  { path: 'router.ts', content: 'export type ResultState = PartialState<NavigationState> & { state?: ResultState }; export namespace ExpoRouter { export interface __routes {} }' },
  { path: 'ambient.d.ts', content: 'declare module "xcode" { export class XcodeProject { constructor(p: string); writeSync(): string; config: { options?: { enabled: boolean } } } } export interface RefObject<T> { current: T }' },
];
const bindings = [{ id: 'EXPORT:ResultState', path: 'router.ts', name: 'ResultState' }, { id: 'TYPE:XcodeProject', path: 'ambient.d.ts', name: 'XcodeProject' }, { id: 'MEMBER:image-ref', path: 'ambient.d.ts', name: 'RefObject', arguments: ['View | null'] }];
test('finite source declarations retain recursive fields, generic/heritage rules, namespace augmentation and nested members', () => {
  const value = buildFiniteDeclarations({ files, bindings });
  const state = value.declarations.find(row => row.name === 'ResultState');
  assert.ok(state.members.some(row => row.name === 'state' && row.optional));
  assert.ok(state.rules.some(row => row.expression === 'PartialState<NavigationState>'));
  assert.ok(state.rules.some(row => row.expression === 'ResultState'));
  assert.ok(value.declarations.some(row => row.qualifiedName === 'ExpoRouter.__routes'));
  const xcode = value.declarations.find(row => row.name === 'XcodeProject');
  for (const name of ['<constructor>', 'writeSync', 'config', 'options', 'enabled']) assert.ok(xcode.members.some(row => row.name === name), name);
  const ref = value.declarations.find(row => row.name === 'RefObject');
  assert.deepEqual(ref.typeParameters, ['T']); assert.ok(ref.members.some(row => row.name === 'current'));
  assert.deepEqual(value.bindings.find(row => row.id === 'MEMBER:image-ref').arguments, ['View | null']);
});
test('checks deep deletions, changed source rules, dropped bindings and duplicate identities', () => {
  const expected = buildFiniteDeclarations({ files, bindings });
  assert.equal(validateFiniteDeclarations(expected, expected).valid, true);
  for (const mutate of [
    x => { x.declarations.find(d => d.name === 'XcodeProject').members = x.declarations.find(d => d.name === 'XcodeProject').members.filter(m => m.name !== 'enabled'); },
    x => { x.declarations.find(d => d.name === 'ResultState').rules.pop(); },
    x => x.bindings.pop(),
    x => x.declarations.push(x.declarations[0]),
  ]) {
    const actual = structuredClone(expected); mutate(actual);
    assert.equal(validateFiniteDeclarations(actual, expected).valid, false);
  }
});
test('rejects invalid source syntax, false source hashes and unresolved consumer bindings', () => {
  assert.throws(() => buildFiniteDeclarations({ files: [{ path: 'bad.ts', content: 'export interface {' }], bindings: [] }), /parse/);
  assert.throws(() => buildFiniteDeclarations({ files: [{ ...files[0], sha256: 'a'.repeat(64) }], bindings: [] }), /hash/);
  assert.throws(() => buildFiniteDeclarations({ files, bindings: [{ id: 'no-source', path: 'router.ts', name: 'Missing' }] }), /binding.*no-source/);
});
test('links a compiler graph source range to its containing finite declaration', () => {
  const start = files[1].content.indexOf('enabled');
  const value = buildFiniteDeclarations({ files, bindings: [{ id: 'TYPE:family', path: 'ambient.d.ts', start, end: start + 'enabled: boolean'.length }] });
  assert.equal(value.bindings.length, 1);
  assert.ok(value.bindings[0].declarationIds.some(id => value.declarations.find(d => d.id === id).name === 'XcodeProject'));
});
test('accessors and open call/index/construct members are explicit deletable finite members', () => {
  const value = buildFiniteDeclarations({ files: [{ path: 'access.d.ts', content: 'export declare class BufferAttribute { set needsUpdate(value: boolean); get version(): number; } export interface Dict { [key: string]: string; (): string; new (): Date; }' }] });
  const members = value.declarations.flatMap(row => row.members);
  for (const kind of ['SetAccessor', 'GetAccessor', 'IndexSignature', 'CallSignature', 'ConstructSignature']) assert.ok(members.some(row => row.nodeType === kind), kind);
  const actual = structuredClone(value); actual.declarations[0].members = actual.declarations[0].members.filter(row => row.name !== 'needsUpdate');
  assert.equal(validateFiniteDeclarations(actual, value).valid, false);
});
