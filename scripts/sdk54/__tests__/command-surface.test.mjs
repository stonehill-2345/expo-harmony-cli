import assert from 'node:assert/strict';
import test from 'node:test';
import { indexCommandSurface, compareCommandSurfaces, validateCommandSurface, serializeCommandSurface } from '../command-surface-model.mjs';
import { selectCommandSources } from '../command-surface.mjs';

const bin = 'packages/@expo/cli/bin/cli.ts';
const entry = 'packages/@expo/cli/src/start/index.ts';
const prefix = `const defaultCmd = 'start'; const migrationMap = { old: 'new cli' }; const deprecated = ['removed'];`;
const fixtures = (body = 'export const expoStart = async argv => { const args = assertArgs({ "--help": Boolean, "--port": Number, "--tag": [String], "-h": "--help" }, argv); };') => new Map([
  [bin, `${prefix} const commands = { start: () => import('../src/start/index.js').then(i => i.expoStart), add: () => import('../src/start/index.js').then(i => i.expoStart) };`],
  [entry, body],
]);

test('commands: dispatch, alias entry, default and migrations preserve locations', () => {
  const result = indexCommandSurface(fixtures());
  assert.equal(result.commands.length, 2);
  assert.equal(result.commands[0].handlerId, result.commands[1].handlerId);
  assert.equal(result.defaultCommand, 'start');
  assert.equal(result.migrations[0].replacement, 'new cli');
  assert.equal(result.deprecated[0].name, 'removed');
  assert.ok(result.commands.every(c => c.line > 0 && c.column > 0 && c.target === entry));
  assert.equal(result.options.find(o => o.name === '--tag').declaredType, 'String[]');
  assert.equal(result.options.find(o => o.name === '-h').aliasState, 'RESOLVED');
});

test('commands: const specs, custom parsing and variadic lists remain distinct', () => {
  const source = `export const expoStart = async argv => {
    const raw = { '--port': Number, '-p': '--port' };
    assertWithOptionsArgs(raw, { argv, permissive: true });
    resolveStringOrBooleanArgsAsync(argv, raw, { '--device': Boolean, '-d': '--device' });
    resolveCustomBooleanArgsAsync(argv, raw, { '--dev': Boolean });
    const known = ['--check', '--config'];
    parseVariadicArguments(argv, ['--config']);
    assertUnexpectedVariadicFlags(known, {});
  };`;
  const result = indexCommandSurface(fixtures(source));
  assert.ok(result.options.some(o => o.name === '--device' && o.effectiveType === 'StringOrBoolean'));
  assert.ok(result.options.some(o => o.name === '--dev' && o.effectiveType === 'CustomBoolean'));
  assert.ok(result.options.some(o => o.name === '--config' && o.effectiveType === 'VARIADIC_NON_BOOLEAN'));
  assert.ok(result.options.some(o => o.name === '--check' && o.effectiveType === 'VARIADIC_ALLOWED'));
  assert.ok(result.parsers.some(p => p.permissive === true));
});

test('commands: dangling aliases and cycles are source anomalies, not silently dropped', () => {
  const result = indexCommandSurface(fixtures(`export const expoStart = argv => assertArgs({ '--help': Boolean, '-t': '--type', '-a': '-b', '-b': '-a' }, argv);`));
  assert.equal(result.options.find(o => o.name === '-t').aliasState, 'MISSING_TARGET');
  assert.equal(result.options.find(o => o.name === '-a').aliasState, 'CYCLE');
  assert.ok(result.anomalies.every(a => a.followUp && a.source && a.line > 0));
});

test('commands: malformed dispatch, missing export/default and syntax errors fail', () => {
  for (const mutate of [
    f => f.delete(entry),
    f => f.set(entry, 'export const other = () => {};'),
    f => f.set(bin, f.get(bin).replace("defaultCmd = 'start'", "defaultCmd = 'missing'")),
    f => f.set(bin, f.get(bin).replace("'../src/start/index.js'", 'dynamicTarget')),
    f => f.set(entry, 'export const expoStart = ('),
  ]) { const f = fixtures(); mutate(f); assert.throws(() => indexCommandSurface(f), /packages\/@expo\/cli/); }
});

test('commands: unknown specs, duplicate keys and spread are rejected', () => {
  for (const spec of ['dynamicSpec', '{ "--help": Mystery }', '{ "--help": Boolean, "--help": String }', '{ ...dynamicSpec }']) {
    assert.throws(() => indexCommandSurface(fixtures(`export const expoStart = argv => assertArgs(${spec}, argv);`)), /spec|type|Duplicate|spread/);
  }
});

test('commands: same const names in distinct lexical scopes resolve independently', () => {
  const f = fixtures(`export const expoStart = argv => { const raw = { '--first': String }; assertArgs(raw, argv); };
    export const other = argv => { const raw = { '--second': Boolean }; assertArgs(raw, argv); };`);
  const result = indexCommandSurface(f);
  assert.ok(result.options.some(o => o.name === '--first' && o.owner === 'expoStart'));
  assert.ok(result.options.some(o => o.name === '--second' && o.owner === 'other'));
});

test('commands: bidirectional adaptation changes include command and option additions and removals', () => {
  const left = indexCommandSurface(fixtures());
  const f = fixtures(); f.set(bin, f.get(bin).replace('add:', 'extra:'));
  f.set(entry, f.get(entry).replace('"--port": Number', '"--port": String').replace('"--tag": [String]', '"--new": Boolean'));
  const differences = compareCommandSurfaces(left, indexCommandSurface(f));
  for (const kind of ['ONLY_SOURCE', 'ONLY_ADAPTATION', 'CHANGED']) assert.ok(differences.some(d => d.kind === kind));
  assert.ok(differences.every(d => d.followUp && d.conclusion && d.sourceIds.length));
  assert.deepEqual(compareCommandSurfaces(left, left), []);
});

test('commands: helper forwarding is retained without invented public flags', () => {
  const f = fixtures(); f.set('packages/@expo/cli/src/utils/args.ts', 'export function assertArgs(schema, argv) { return assertWithOptionsArgs(schema, { argv }); }');
  const result = indexCommandSurface(f);
  assert.ok(result.boundaries.some(b => b.kind === 'PARAMETERIZED_HELPER'));
  assert.equal(result.options.filter(o => o.source.includes('/utils/')).length, 0);
});

test('commands: source selector rejects tests, unrelated files and symlinks', () => {
  const entries = [bin,entry,'packages/@expo/cli/package.json','packages/@expo/cli/src/utils/variadic.ts','packages/@expo/cli/src/start/__tests__/index.ts','packages/other/index.ts'].map(path => ({ path, type: 'blob', mode: '100644' }));
  assert.equal(selectCommandSources(entries).length, 4);
  assert.throws(() => selectCommandSources(entries.map(e => e.path === entry ? { ...e, mode: '120000' } : e)), /symlink|source/);
});

test('commands: reconstruction catches deleted records and changed metadata', () => {
  const expected = { source: indexCommandSurface(fixtures()), fullCommandRuntimeComplete: false };
  for (const mutate of [v => v.source.commands.pop(), v => v.source.options.pop(), v => v.fullCommandRuntimeComplete = true]) {
    const actual = structuredClone(expected); mutate(actual);
    const result = validateCommandSurface(actual, expected);
    assert.equal(result.valid, false);
    assert.ok(result.errors.every(e => e.path.startsWith('/')));
  }
  assert.deepEqual(JSON.parse(serializeCommandSurface(expected)), expected);
});

test('commands: platform switch cases and permissive parser changes are compared', () => {
  const source = fixtures(`export const expoStart = argv => {
    assertWithOptionsArgs({ '--help': Boolean }, { argv, permissive: false });
    switch (argv[0]) { case 'android': break; default: break; }
  };`);
  const local = new Map(source);
  local.set(entry, local.get(entry).replace('permissive: false', 'permissive: true').replace("case 'android':", "case 'ios':"));
  const differences = compareCommandSurfaces(indexCommandSurface(source), indexCommandSurface(local));
  assert.ok(differences.some(d => d.category === 'parsers' && d.kind === 'CHANGED'));
  assert.ok(differences.some(d => d.category === 'branches' && d.kind === 'CHANGED'));
});
