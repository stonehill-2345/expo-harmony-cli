import assert from 'node:assert/strict';
import test from 'node:test';
import { parseConfigTypes, parseConfigSchema, compareConfigFields, validateConfigContract, serializeConfigContract } from '../config-contract-model.mjs';
import { configSources, selectConfigSources } from '../config-contract.mjs';

const types = (source) => parseConfigTypes(source, 'fixture.ts');
const schema = (value) => parseConfigSchema(value, 'fixture.json');

test('config: interfaces, nested references, unions, tuples and open index preserve locations', () => {
  const result = types('export interface ExpoConfig { name: string; child?: Child; plugins?: (string | [string, any])[] } export interface Child { mode: "a" | "b"; [k: string]: any }');
  assert.equal(result.interfaces.length, 2);
  assert.ok(result.fields.some(f => f.path === '/p/child/p/mode' && f.literals.join(',') === 'a,b'));
  assert.ok(result.fields.some(f => f.path === '/p/plugins/items/tuple/1' && f.types.includes('any')));
  assert.ok(result.fields.some(f => f.path === '/p/child/additional' && f.types.includes('any')));
  assert.ok(result.nodes.every(n => n.line > 0 && n.column > 0));
  assert.equal(result.fields.find(f => f.path === '/p/name').required, 'REQUIRED');
});

test('config: unsupported syntax, unresolved references, duplicate members and cycles fail', () => {
  for (const source of [
    'export interface ExpoConfig { x: Missing }',
    'export interface ExpoConfig { x: ExpoConfig }',
    'export interface ExpoConfig { x: string; x: number }',
    'export interface ExpoConfig { x: keyof Other }',
    'export interface ExpoConfig { x: string',
    'export interface ExpoConfig extends Other {}',
  ]) assert.throws(() => types(source), /fixture.ts/);
});

test('config: schema branches, tuple constraints and metadata are lossless', () => {
  const input = { name: { type: 'string', meta: { fallback: 'hello' }, tsType: 'Custom' }, plugins: { type: 'array', items: { anyOf: [{ type: 'string' }, { type: 'array', items: [{ type: ['string'] }, {}], additionalItems: false }] } } };
  const result = schema(input);
  assert.equal(result.rootRequired, 'UNKNOWN');
  assert.equal(result.fields.find(f => f.path === '/p/name').required, 'UNKNOWN');
  assert.equal(result.nodes.find(n => n.pointer === '/name').attributes.meta.fallback, 'hello');
  assert.equal(result.nodes.find(n => n.pointer === '/name').attributes.tsType, 'Custom');
  assert.ok(result.fields.some(f => f.path === '/p/plugins/items/tuple/1' && f.types.includes('any')));
  assert.deepEqual(result.raw, input);
});

test('config: nested required and additionalProperties distinguish open and closed objects', () => {
  const result = schema({ x: { type: 'object', properties: { y: { enum: ['yes', 'no'], type: 'string' } }, required: ['y'], additionalProperties: { type: 'number' } } });
  assert.equal(result.fields.find(f => f.path === '/p/x/p/y').required, 'REQUIRED');
  assert.ok(result.fields.some(f => f.path === '/p/x/additional' && f.types.includes('number')));
  assert.throws(() => schema({ x: { strangeKeyword: true } }), /fixture.json.*strangeKeyword/);
  assert.throws(() => schema({ x: { type: 'object', properties: {}, required: ['missing'] } }), /required/);
});

test('config: structural IDs escape punctuation without collisions', () => {
  const result = types('export interface ExpoConfig { "a/b"?: string; a?: { b?: string }; "~"?: boolean }');
  assert.ok(result.fields.some(f => f.path === '/p/a~1b'));
  assert.ok(result.fields.some(f => f.path === '/p/a/p/b'));
  assert.equal(new Set(result.nodes.map(n => n.id)).size, result.nodes.length);
});

test('config: bidirectional differences include types, literals, required and missing fields', () => {
  const left = types('export interface ExpoConfig { x: "a"; onlyType?: number }');
  const right = schema({ x: { type: 'number', enum: [1] }, onlySchema: { type: 'boolean' } });
  const differences = compareConfigFields(left.fields, right.fields, 'types-vs-sdk54');
  for (const kind of ['TYPES', 'LITERALS', 'REQUIRED', 'ONLY_LEFT', 'ONLY_RIGHT']) assert.ok(differences.some(d => d.kind === kind), kind);
  assert.ok(differences.every(d => d.followUp === 'M1/config-snapshot' && d.conclusion && (d.leftSources.length || d.rightSources.length)));
  assert.deepEqual(compareConfigFields(right.fields, right.fields, 'same'), []);
});

test('config: branch aggregation preserves mixed required and unique source IDs', () => {
  const result = schema({ x: { oneOf: [{ type: 'object', properties: { y: { type: 'string' } }, required: ['y'] }, { type: 'object', properties: { y: { type: 'number' } } }] } });
  const y = result.fields.find(f => f.path === '/p/x/p/y');
  assert.equal(y.required, 'MIXED');
  assert.deepEqual(y.types, ['number', 'string']);
  assert.equal(y.sources.length, 2);
});

test('config: full reconstructed comparison detects every mutation and reports path', () => {
  const expected = { source: { revision: 'fixed' }, types: types('export interface ExpoConfig { name: string }'), stageClosable: false };
  assert.equal(validateConfigContract(expected, expected).valid, true);
  for (const mutate of [v => v.types.fields.pop(), v => v.types.nodes[0].line++, v => v.source.revision = 'wrong', v => v.stageClosable = true]) {
    const candidate = structuredClone(expected); mutate(candidate);
    const result = validateConfigContract(candidate, expected);
    assert.equal(result.valid, false);
    assert.ok(result.errors.every(e => e.path.startsWith('/')));
  }
});

test('config: canonical JSON safely roundtrips source URI and metadata', () => {
  const value = { z: 'file:///source', a: { fallback: 'a/b' } };
  assert.deepEqual(JSON.parse(serializeConfigContract(value)), value);
  assert.equal(serializeConfigContract(value), serializeConfigContract({ a: value.a, z: value.z }));
  assert.ok(!serializeConfigContract(value).includes('file:///'));
});

test('config: source selector rejects missing paths, symlinks and gitlinks', () => {
  const entries = configSources.map(path => ({ path, type: 'blob', mode: '100644', oid: 'fixed' }));
  assert.equal(selectConfigSources([...entries, { path: 'unrelated' }]).length, 7);
  for (const mutate of [v => v.pop(), v => v[0].mode = '120000', v => v[0].type = 'commit']) {
    const candidate = structuredClone(entries); mutate(candidate);
    assert.throws(() => selectConfigSources(candidate), /config source/);
  }
});

test('config: multitype structural siblings cannot silently lose nested fields', () => {
  assert.throws(() => schema({ x: { type: ['object', 'null'], properties: { y: { type: 'string' } } } }), /fixture.json.*structural/);
});
