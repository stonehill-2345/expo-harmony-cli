import assert from 'node:assert/strict';
import test from 'node:test';
import { createFixedPluginRuntime, collectRouterConsumers, expandPluginIndex, validatePluginContracts,
  PLUGIN_CONTRACT_CASES, loadFixedAsyncConsumer } from '../m0-plugin-contracts.mjs';
import * as contracts from '../m0-plugin-contracts.mjs';

test('fixed workspace export restrictions are applied to batch plugin types', () => {
  const sourcePath = 'packages/plugin/src/index.ts';
  const text = `import type { Props } from 'dep/private'; const withTest: ConfigPlugin<Props> = c => c;`;
  const index = { modules: [{ packageId: 'PACKAGE:plugin', category: 'test', configPlugins: [{
    id: `CONFIG-PLUGIN:${sourcePath}:${text.indexOf('withTest')}`, name: 'withTest',
    source: { path: sourcePath }, typeArgument: 'Props' }] }] };
  const input = { files: new Map([[sourcePath, text],
    ['packages/plugin/package.json', JSON.stringify({ name: 'plugin', dependencies: { dep: '1.0.0' } })],
    ['packages/dep/package.json', JSON.stringify({ name: 'dep', version: '1.0.0', exports: { '.': './src/index.ts' } })],
    ['packages/dep/src/index.ts', 'export type Public = string;'],
    ['packages/dep/private.ts', 'export type Props = { secret: string };']]),
    packages: [{ name: 'plugin', sourcePath: 'packages/plugin/package.json', id: 'PACKAGE:plugin' },
      { name: 'dep', sourcePath: 'packages/dep/package.json', id: 'PACKAGE:dep' }] };
  const blocked = expandPluginIndex(index, input);
  assert.equal(blocked.plugins[0].status, 'BLOCKED_OPTION_TYPE');
  assert.ok(blocked.resolutions.some(r => r.request === 'dep/private' && r.resolution.status === 'not-exported'));
  input.files.set('packages/dep/package.json', JSON.stringify({ name: 'dep', exports: { './private': './private.ts' } }));
  const expanded = expandPluginIndex(index, input);
  assert.equal(expanded.plugins[0].status, 'EXPANDED');
  assert.equal(expanded.plugins[0].typescript.options[0].path, 'secret');
});

test('fixed execution loader rejects host imports and unlisted source paths', () => {
  const sourcePath = 'packages/expo-router/plugin/src/index.ts';
  const files = new Map([[sourcePath, `const fs = require('node:fs'); export default fs;`], ['outside.ts', 'export {};']]);
  assert.throws(() => createFixedPluginRuntime(files).load(sourcePath), /Unapproved fixed execution import/);
  assert.throws(() => createFixedPluginRuntime(files).load('outside.ts'), /outside fixed allowlist/);
  assert.throws(() => createFixedPluginRuntime(new Map()).load(sourcePath), /Missing fixed execution source/);
});

test('fixed execution loader evaluates relative TypeScript dependencies without host resolution', () => {
  const root = 'packages/@expo/schema-utils/src/';
  const runtime = createFixedPluginRuntime(new Map([[root + 'index.ts', `import { value } from './deref'; export const result = value + 1;`],
    [root + 'deref.ts', 'export const value: number = 2;']]));
  assert.equal(runtime.load(root + 'index.ts').result, 3);
  assert.equal(runtime.load(root + 'index.ts').result, 3);
  assert.equal(runtime.executed.size, 2);
});

test('router AST access inventory keeps static, destructured and dynamic boundaries distinct', () => {
  const file = 'packages/@expo/cli/src/test.ts';
  const facts = collectRouterConsumers(new Map([[file, `
    const literal = 'config.extra.router.fake';
    const a = config.extra?.router?.origin;
    const b = config.extra.router['headOrigin'];
    const c = config.extra.router[key];
    const { root: local, ...rest } = config.extra.router ?? {};
    const alias = config.extra.router;
    config.extra.router.sitemap = true;
  `], ['unrelated.ts', 'config.extra.router.unrelated;']]));
  assert.ok(facts.some(f => f.field === 'origin' && f.kind === 'STATIC_ACCESS'));
  assert.ok(facts.some(f => f.field === 'headOrigin'));
  assert.ok(facts.some(f => f.field === 'root' && f.kind === 'DESTRUCTURED_ACCESS'));
  assert.ok(facts.some(f => f.field === '[dynamic]' && f.kind === 'ALIAS_OR_DYNAMIC_BOUNDARY'));
  assert.ok(!facts.some(f => ['fake', 'unrelated'].includes(f.field)));
  assert.equal(new Set(facts.map(f => f.id)).size, facts.length);
});

test('contract validator rejects loss, extra records, changed evidence and false completion', () => {
  const expected = { inputs: [{ path: 'a', sha256: 'hash' }], batch: { plugins: [{ id: 'a' }] },
    router: { differences: [{ path: 'origin' }] }, execution: { failed: 0, results: [{ id: 'case', status: 'PASS' }] }, stageClosable: false };
  assert.equal(validatePluginContracts(expected, expected).valid, true);
  for (const mutate of [v => v.inputs.pop(), v => v.inputs[0].sha256 = 'bad', v => v.batch.plugins.push(v.batch.plugins[0]),
    v => v.router.differences.pop(), v => v.execution.results[0].status = 'FAIL', v => v.stageClosable = true]) {
    const altered = structuredClone(expected); mutate(altered);
    assert.equal(validatePluginContracts(altered, expected).valid, false);
  }
  assert.equal(validatePluginContracts({ execution: { failed: 1 } }, { execution: { failed: 1 } }).valid, false);
});

test('contract matrix IDs remain unique and include required negative boundaries', () => {
  assert.equal(new Set(PLUGIN_CONTRACT_CASES.map(c => c.id)).size, PLUGIN_CONTRACT_CASES.length);
  assert.ok(PLUGIN_CONTRACT_CASES.filter(c => c.expect.accepted === false).length >= 10);
  for (const id of ['ROUTER-typed-name-rejected', 'ROUTER-no-default-injection', 'SPLASH-nested-dark-precedence',
    'GETTER-android-dark-light-mode']) assert.ok(PLUGIN_CONTRACT_CASES.some(c => c.id === id));
});

test('async consumer execution selects the exact top-level source function and records its slice', () => {
  const file = 'packages/@expo/cli/src/start/server/middleware/metroOptions.ts';
  const text = `import unavailable from 'host-package';
    export function getAsyncRoutesFromExpoConfig(config: any, mode: string, platform: string) { return config.extra.router[platform] === mode; }
    throw new Error('must not evaluate full module');`;
  const consumer = loadFixedAsyncConsumer(new Map([[file, text]]));
  assert.equal(consumer.run({ extra: { router: { web: 'development' } } }, 'development', 'web'), true);
  assert.equal(consumer.executionMode, 'EXACT_TOP_LEVEL_FUNCTION_SLICE');
  assert.equal(consumer.fullModuleAcceptance, 'NOT_RUN');
  assert.match(consumer.source.sliceSha256, /^[a-f0-9]{64}$/);
  assert.equal(text.slice(consumer.source.start, consumer.source.end).startsWith('export function'), true);
  assert.throws(() => loadFixedAsyncConsumer(new Map([[file, 'function wrapper() { function getAsyncRoutesFromExpoConfig() {} }']])), /Expected one/);
});

test('plugin type contracts retain callbacks, cyclic references and every original candidate', () => {
  assert.equal(typeof contracts.indexPluginTypeContracts, 'function');
  const file = 'packages/a/index.ts', text = `
    type ConfigPlugin<P> = (config: object, props: P) => object;
    interface Node { next: Node; label: string }
    type Callback = { (input: Node): Node; (input: string): string; enabled?: boolean };
    const withTest: ConfigPlugin<{ callback: Callback }> = c => c;
    const withMissing: ConfigPlugin<{ value: Missing }> = c => c;`;
  const candidates = ['withTest', 'withMissing'].map(name => ({ id: name, name, source: { path: file, start: text.indexOf(name + ':') } }));
  const input = { files: new Map([[file, text], ['packages/a/package.json', '{"name":"a"}']]),
    packages: [{ id: 'a', name: 'a', sourcePath: 'packages/a/package.json' }], candidates };
  const result = contracts.indexPluginTypeContracts(input), byId = new Map(result.graph.types.map(t => [t.id, t]));
  assert.equal(result.coverage.length, 2);
  const good = result.coverage.find(p => p.id === 'withTest');
  assert.equal(good.status, 'MAPPED');
  const callback = result.graph.types.find(t => t.calls.length === 2);
  assert.ok(callback);assert.ok(good.reachableTypeIds.includes(callback.id));
  const node = byId.get(callback.calls[0].parameters[0].typeId);
  assert.equal(node.properties.find(p => p.name === 'next').typeId, node.id);
  const missing = result.coverage.find(p => p.id === 'withMissing');
  assert.equal(missing.status, 'MAPPED_WITH_BOUNDARIES');
  assert.ok(missing.boundaries.some(b => b.reasons.includes('compiler-error-type')));
  assert.equal(result.stageClosable, false);
  assert.throws(() => contracts.indexPluginTypeContracts({ ...input, candidates: [...candidates, candidates[0]] }), /Duplicate/);
});

test('plugin type contracts retain distinct concrete generic instances beyond a declaration family threshold', () => {
  const file = 'packages/a/index.ts';
  let text = 'type ConfigPlugin<P> = (config: object, props: P) => object; interface Box<T> { value: T }\n';
  for (let i = 0; i < 40; i++) text += `const with${i}: ConfigPlugin<Box<{ label: 'value${i}' }>> = c => c;\n`;
  const candidates = Array.from({ length: 40 }, (_, i) => ({ id: 'p' + i, name: 'with' + i,
    source: { path: file, start: text.indexOf('with' + i + ':') } }));
  const result = contracts.indexPluginTypeContracts({ files: new Map([[file, text], ['packages/a/package.json', '{"name":"a"}']]),
    packages: [{ id: 'a', name: 'a', sourcePath: 'packages/a/package.json' }], candidates });
  const types = new Map(result.graph.types.map(t => [t.id, t]));
  const last = result.coverage.find(p => p.id === 'p39');
  const box = types.get(last.optionsTypeIds[0]);
  const value = types.get(box.properties.find(p => p.name === 'value')?.typeId);
  assert.ok(value?.properties.some(p => p.name === 'label'));
  assert.equal(last.status, 'MAPPED');
  assert.ok(!result.graph.types.some(t => t.boundaries.includes('declaration-instantiation-detail-budget')));
});
