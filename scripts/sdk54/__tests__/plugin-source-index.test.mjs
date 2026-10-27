import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

import { indexPluginSources, validatePluginSourceIndex } from '../plugin-source-index.mjs';

const packageRecord = (name) => ({ id: `PKG:${name}`, name, version: '1.0.0', sourcePath: `packages/${name}/package.json`, entryPoints: {} });
function fixture(extra = []) {
  const files = new Map([
    ['packages/demo/app.plugin.js', `module.exports = require('./plugin/build/withDemo');`],
    ['packages/demo/plugin/src/withDemo.ts', `import type { ConfigPlugin } from '@expo/config-plugins';
      import { other } from './other'; export * from './other';
      export const withDemo: ConfigPlugin<{ dark?: boolean }> = config => other(config);
      export default withDemo;`],
    ['packages/demo/plugin/src/other.ts', `export const other = c => c;`],
    ['packages/demo/plugin/__tests__/fixture/app.plugin.js', `throw new Error('must not execute');`],
    ['packages/empty/src/index.ts', 'export {};'],
    ['packages/@expo/prebuild-config/src/plugins/withDefaultPlugins.ts', `import { withPlugins } from '@expo/config-plugins';
      const versionedExpoSDKPackages = ['demo', 'expo-updates'];
      export const withDefault: ConfigPlugin = c => withPlugins(c, [first, [second, { foo: 1 }], c => third(c), ...remaining]);`],
    ['packages/@expo/prebuild-config/src/plugins/sdk52/compat.ts', `export const compat: ConfigPlugin = c => c;`],
    ['packages/@expo/prebuild-config/src/plugins/unversioned/demo.ts', `export default function withLegacy(c) { return c; }`],
    ['packages/@expo/config-plugins/src/plugins/withAndroidBaseMods.ts', `const defaultProviders = {
      manifest: provider({ getFilePath: () => 'AndroidManifest.xml', read() {}, write() {} }),
      ...custom,
    }; export function getAndroidModFileProviders() { return defaultProviders; }`],
    ...extra,
  ]);
  const entries = [...files].map(([path, content]) => ({ path, type: 'blob', mode: '100644',
    oid: createHash('sha1').update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest('hex') }));
  const packageInventory = { packages: ['demo', 'empty', '@expo/prebuild-config', '@expo/config-plugins'].map(packageRecord) };
  const loadFiles = (requested) => new Map(requested.map((entry) => [entry.path, Buffer.from(files.get(entry.path))]));
  return { entries, packageInventory, loadFiles, files };
}
const run = (input = fixture()) => indexPluginSources(input);

test('IDX-01: audits every workspace and excludes fixture entrypoints', () => {
  const result = run();
  assert.equal(result.packages.length, 4);
  assert.deepEqual(result.packages.find((p) => p.packageId === 'PKG:demo').appPluginPaths, ['packages/demo/app.plugin.js']);
  assert.deepEqual(result.packages.find((p) => p.packageId === 'PKG:empty').appPluginPaths, []);
  assert.ok(!result.modules.some((m) => m.source.path.includes('__tests__')));
  assert.equal(result.stageClosable, false);
  assert.equal(result.fullPluginOptionsComplete, false);
  assert.deepEqual(run(), result);
});

test('IDX-02: records static and dynamic references and source projection without executing modules', () => {
  const result = run(fixture([['packages/demo/plugin/src/dynamic.ts', `import Alias = require('./other');
    const a = require(variable); const b = import('./other'); const c = import(variable);
    type Other = import('./other').Other; module.exports = () => { throw new Error('not executable'); };`]]));
  const entry = result.modules.find((m) => m.source.path.endsWith('demo/app.plugin.js'));
  assert.equal(entry.references[0].resolution.path, 'packages/demo/plugin/src/withDemo.ts');
  assert.equal(entry.references[0].resolution.method, 'build-to-source');
  assert.equal(entry.exports[0].name, 'module.exports');
  const dynamic = result.modules.find((m) => m.source.path.endsWith('/dynamic.ts'));
  assert.equal(dynamic.references.filter((r) => r.resolution.kind === 'dynamic').length, 2);
  assert.ok(dynamic.references.some((r) => r.kind === 'import-equals'));
  assert.ok(dynamic.references.some((r) => r.kind === 'import-type'));
  assert.ok(dynamic.references.every((r) => r.source.line > 0));
  assert.ok(result.modules.flatMap((m) => m.references).some((r) => r.resolution.kind === 'bare' && r.request === '@expo/config-plugins'));
  const withDemo = result.modules.find((m) => m.source.path.endsWith('/withDemo.ts'));
  assert.equal(withDemo.configPlugins[0].typeArgument, '{ dark?: boolean }');
  assert.ok(withDemo.exports.some((e) => e.name === '*'));
});

test('IDX-02: keeps emitted artifacts distinct from the TypeScript source projection', () => {
  const result = run(fixture([
    ['packages/demo/plugin/build/withDemo.js', `module.exports = () => {};`],
    ['packages/demo/plugin/build/withDemo.d.ts', `declare const plugin: unknown; export default plugin;`],
  ]));
  const ref = result.modules.find((m) => m.source.path.endsWith('demo/app.plugin.js')).references[0];
  assert.equal(ref.resolution.path, 'packages/demo/plugin/src/withDemo.ts');
  assert.equal(ref.resolution.method, 'build-to-source');
  assert.deepEqual(ref.resolution.artifactPaths, ['packages/demo/plugin/build/withDemo.js']);
});

test('IDX-02: require.resolve and nonliteral compositions preserve unresolved syntax', () => {
  const result = run(fixture([['packages/demo/plugin/src/resolver.ts', `const a = require.resolve('./other');
    const b = require.resolve(dynamic); withPlugins(config, list);`]]));
  const module = result.modules.find((m) => m.source.path.endsWith('/resolver.ts'));
  assert.equal(module.references.length, 2);
  assert.ok(module.references.every((ref) => ref.kind === 'require-resolve'));
  assert.equal(module.references[1].resolution.kind, 'dynamic');
  assert.equal(module.compositions[0].staticArray, false);
  assert.equal(module.compositions[0].listExpression, 'list');
});

test('IDX-03: preserves composition order, tuples, inline functions, spreads and package lists', () => {
  const module = run().modules.find((m) => m.source.path.endsWith('/withDefaultPlugins.ts'));
  assert.deepEqual(module.compositions[0].items.map((item) => item.kind), ['reference', 'tuple', 'function', 'spread']);
  assert.deepEqual(module.compositions[0].items.map((item) => item.index), [0, 1, 2, 3]);
  assert.equal(module.compositions[0].items[1].expression, '[second, { foo: 1 }]');
  assert.deepEqual(module.stringLists[0].values, ['demo', 'expo-updates']);
  assert.ok(module.compositions[0].items.every((item) => item.source.line > 0));
});

test('IDX-04: distinguishes sdk52, unversioned and mod providers with source methods', () => {
  const result = run();
  assert.equal(result.modules.find((m) => m.source.path.endsWith('/sdk52/compat.ts')).category, 'prebuild-sdk52');
  assert.equal(result.modules.find((m) => m.source.path.endsWith('/unversioned/demo.ts')).category, 'prebuild-unversioned');
  const provider = result.modules.find((m) => m.source.path.endsWith('/withAndroidBaseMods.ts')).providers[0];
  assert.equal(provider.name, 'manifest');
  assert.deepEqual(provider.members.map((m) => m.name), ['getFilePath', 'read', 'write']);
  assert.deepEqual(provider.members.map((m) => m.kind), ['property', 'method', 'method']);
  assert.equal(provider.platform, 'android');
  assert.equal(provider.source.line, 2);
  assert.equal(result.modules.find((m) => m.source.path.endsWith('/withAndroidBaseMods.ts')).providers[1].kind, 'spread');
});

test('IDX-02: static relative import cycles terminate and preserve both source edges', () => {
  const result = run(fixture([
    ['packages/demo/plugin/src/a.ts', `export * from './b';`],
    ['packages/demo/plugin/src/b.ts', `export * from './a';`],
  ]));
  for (const name of ['a', 'b']) {
    const module = result.modules.find((entry) => entry.source.path.endsWith(`/${name}.ts`));
    assert.equal(module.references.length, 1);
    assert.ok(result.modules.some((entry) => entry.id === module.references[0].resolution.targetId));
  }
});

test('IDX-05: modified source content cannot reuse a fixed Git blob ID', () => {
  const input = fixture();
  const load = input.loadFiles;
  input.loadFiles = (requested) => {
    const contents = load(requested);
    const first = contents.keys().next().value;
    contents.set(first, Buffer.from('export {};'));
    return contents;
  };
  assert.throws(() => run(input), /integrity mismatch/i);
});

test('IDX-05: fails missing, symlink, syntax and ambiguous projection instead of hiding sources', () => {
  for (const [extra, pattern] of [
    [[['packages/demo/plugin/src/missing.ts', `export * from './absent';`]], /missing relative/i],
    [[['packages/demo/plugin/src/withDemo.tsx', 'export {};']], /ambiguous/i],
    [[['packages/demo/plugin/src/broken.ts', 'const value = ;']], /syntax/i],
  ]) assert.throws(() => run(fixture(extra)), pattern);
  const input = fixture();
  input.entries.find((entry) => entry.path.endsWith('demo/app.plugin.js')).mode = '120000';
  assert.throws(() => run(input), /symlink/i);
  const missingBlob = fixture();
  missingBlob.loadFiles = () => new Map();
  assert.throws(() => run(missingBlob), /missing source/i);
});

test('IDX-05: TypeScript config accepts JSONC while ordinary JSON remains strict', () => {
  assert.doesNotThrow(() => run(fixture([['packages/demo/plugin/tsconfig.json', `{
    // Upstream config files use comments and trailing commas.
    "compilerOptions": { "strict": true, },
  }`]])));
  assert.throws(() => run(fixture([['packages/demo/plugin/options.json', '{ "type": "object", }']])), /invalid JSON/i);
  assert.throws(() => run(fixture([['packages/demo/plugin/tsconfig.json', '{ "compilerOptions": ; }']])), /invalid.*config/i);
});

test('IDX-01: discovers manifest plugin subpath exports and root build entry sources', () => {
  const input = fixture([
    ['packages/empty/src/custom.ts', `export default c => c;`],
    ['packages/empty/app.plugin.cjs', `module.exports = require('./build/custom');`],
  ]);
  input.packageInventory.packages.find((p) => p.name === 'empty').entryPoints.exports = {
    './plugin': { require: './build/custom.js', default: './build/custom.js' },
  };
  const result = run(input);
  const pkg = result.packages.find((p) => p.packageId === 'PKG:empty');
  assert.deepEqual(pkg.appPluginPaths, ['packages/empty/app.plugin.cjs']);
  assert.equal(pkg.manifestPluginExports.length, 2);
  assert.ok(pkg.manifestPluginExports.every((entry) => entry.resolution.path.endsWith('/src/custom.ts')));
});

test('IDX-06: rejects deletion, duplicate IDs, changed facts and forged completion', () => {
  const expected = run();
  assert.equal(validatePluginSourceIndex(expected, expected).valid, true);
  for (const mutate of [
    (value) => value.packages.pop(),
    (value) => value.modules.pop(),
    (value) => value.modules.find((m) => m.compositions.length).compositions[0].items.pop(),
    (value) => value.modules.push(value.modules[0]),
    (value) => { value.modules[0].source.sha256 = 'forged'; },
    (value) => { value.stageClosable = true; value.fullPluginOptionsComplete = true; },
  ]) {
    const changed = structuredClone(expected);
    mutate(changed);
    assert.equal(validatePluginSourceIndex(changed, expected).valid, false);
  }
  assert.equal(validatePluginSourceIndex(null, expected).valid, false);
  for (const args of [[], ['--source'], ['--unknown'], ['--source', '/tmp', '--check', 'x', '--output', 'y']]) {
    assert.equal(spawnSync(process.execPath, ['scripts/sdk54/plugin-source-index.mjs', ...args], { encoding: 'utf8' }).status, 1);
  }
});
