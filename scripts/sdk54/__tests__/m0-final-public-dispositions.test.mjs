import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';

const implementation = await import('../m0-final-public-dispositions.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND' && error.message.includes('m0-final-public-dispositions.mjs')) return {};
  throw error;
});
const hash = text => createHash('sha256').update(text).digest('hex');
function fixture(manifest, sourceFiles) {
  const files = new Map([['packages/example/package.json', JSON.stringify({ name: 'example', ...manifest })], ...Object.entries(sourceFiles).map(([file, text]) => ['packages/example/' + file, text])]);
  const modules = [...files].filter(([file]) => /\.[jt]s$/.test(file)).map(([file, text]) => ({ id: 'MODULE:' + file, source: { path: file, sha256: hash(text) }, boundaries: [], diagnostics: [] }));
  const candidates = modules.map(module => ({ id: 'PUBLIC-CANDIDATE:' + encodeURIComponent(module.id), moduleId: module.id, packageId: 'PKG:example', source: module.source, disposition: 'TEST_OR_TOOLING_CANDIDATE', entryIds: [] }));
  const exports = modules.map(module => ({ id: 'SEMANTIC-EXPORT:' + module.source.path + '#value', name: 'value', moduleId: module.id, declarationIds: [], entryIds: [], entryLinks: [], boundaries: [], typeId: null }));
  return { files, treeEntries: [...files.keys()].map(path => ({ path, type: 'blob', mode: '100644' })), surface: { entries: [], modules, candidateDispositions: candidates, exports, packages: [{ id: 'PKG:example', name: 'example', sourcePath: 'packages/example/package.json' }], consumerTypeContexts: { contexts: [] }, declarations: [] }, projectContext: { configs: [] } };
}

test('actual packlist permits deep imports despite private flags and test-like directory names', async () => {
  assert.equal(typeof implementation.buildFinalPublicDispositions, 'function');
  const data = fixture({ private: true, files: ['tests'] }, { 'tests/value.ts': 'export const value = 1;', 'src/ignored.ts': 'export const value = 2;' });
  const result = await implementation.buildFinalPublicDispositions(data);
  const published = result.modules.find(row => row.source.path.endsWith('tests/value.ts'));
  assert.equal(published.disposition, 'PUBLIC_PUBLISHED_DEEP_IMPORT_SOURCE');
  assert.equal(published.publication.privateManifest, true);
  assert.equal(result.modules.find(row => row.source.path.endsWith('src/ignored.ts')).disposition, 'UNPUBLISHED_IMPLEMENTATION_CONTEXT');
  assert.equal(result.exports.find(row => row.moduleId === published.id).disposition, 'PUBLIC_MODULE_EXPORT');
});

test('exports exact null restriction overrides a wildcard while retaining implementation dependencies', async () => {
  const data = fixture({ files: ['build'], exports: { './*': './build/*.js', './secret': null } }, {
    'build/public.js': "export { value } from './secret.js';", 'build/secret.js': 'export const value = 1;',
  });
  const result = await implementation.buildFinalPublicDispositions(data);
  const secret = result.modules.find(row => row.source.path.endsWith('/secret.js'));
  assert.equal(secret.disposition, 'EXPORTS_ENCAPSULATED_IMPLEMENTATION_CONTEXT');
  assert.equal(secret.publication.allowedPublishedPaths.length, 0);
  assert(result.dependencies.some(row => row.fromModuleId.endsWith('/public.js') && row.toModuleId === secret.id));
  assert(secret.publicConsumerModuleIds.some(id => id.endsWith('/public.js')));
  assert.equal(result.exports.find(row => row.moduleId === secret.id).disposition, 'IMPLEMENTATION_MODULE_EXPORT');
});

test('a wildcard with a constant target retains its source module and finite mapping rule', async () => {
  const data = fixture({ files: ['build'], exports: { './runtime/*': './build/runtime.js' } }, { 'build/runtime.js': 'export const value = 1;' });
  const result = await implementation.buildFinalPublicDispositions(data);
  assert.equal(result.modules[0].disposition, 'PUBLIC_EXPLICIT_ENTRY_SOURCE');
  assert(result.modules[0].publication.allowedPublishedPaths.includes('packages/example/build/runtime.js'));
});

test('an explicit denied entry is recorded as a denial rule with no source defect', async () => {
  const data = fixture({ files: ['build'], exports: { '.': null } }, { 'build/value.js': 'export const value = 1;' });
  const initial = await implementation.buildFinalPublicDispositions(data);
  data.surface.entries = initial.additionalEntries;
  const result = await implementation.buildFinalPublicDispositions(data);
  assert.equal(result.entries[0].disposition, 'EXPLICIT_EXPORT_DENIAL_RULE');
  assert.equal(result.entries[0].followup, null);
});

test('a published source map alone is not an importable build projection', async () => {
  const data = fixture({ files: ['dist'] }, {
    'tsconfig.json': JSON.stringify({ compilerOptions: { rootDir: 'lib', outDir: 'dist', sourceMap: true }, include: ['lib'] }),
    'lib/value.ts': 'export const value = 1;', 'dist/value.js.map': '{}',
  });
  const result = await implementation.buildFinalPublicDispositions(data);
  assert.equal(result.modules[0].disposition, 'UNPUBLISHED_IMPLEMENTATION_CONTEXT');
});

test('build source mapping uses parsed TypeScript config rather than src/build name guessing', async () => {
  const data = fixture({ files: ['dist'] }, {
    'tsconfig.json': JSON.stringify({ compilerOptions: { rootDir: 'lib', outDir: 'dist', declaration: true, module: 'commonjs' }, include: ['lib'] }),
    'lib/value.ts': 'export const value = 1;', 'src/unbuilt.ts': 'export const value = 2;',
    'dist/value.js': 'exports.value = 1;', 'dist/value.d.ts': 'export declare const value = 1;',
  });
  const result = await implementation.buildFinalPublicDispositions(data);
  const projected = result.modules.find(row => row.source.path.endsWith('lib/value.ts'));
  assert.equal(projected.disposition, 'PUBLIC_BUILD_SOURCE_PROJECTION');
  assert(projected.publication.buildProjections.some(row => row.outputPath.endsWith('dist/value.js') && row.configInputs.some(input => input.path.endsWith('tsconfig.json') && input.sha256)));
  assert.equal(result.modules.find(row => row.source.path.endsWith('src/unbuilt.ts')).disposition, 'UNPUBLISHED_IMPLEMENTATION_CONTEXT');
  assert.equal(result.summary.harmonySupportAccepted, false);
});

test('consumer config provenance must retain actual parsed inheritance inputs', async () => {
  const data = fixture({ files: ['lib'] }, { 'tsconfig.json': '{"compilerOptions":{"noEmit":true},"include":["lib"]}', 'lib/value.ts': 'export const value = 1;' });
  data.surface.consumerTypeContexts.contexts.push({ id: 'CONSUMER:example', config: { path: 'packages/example/tsconfig.json', inputs: [], options: {} } });
  await assert.rejects(implementation.buildFinalPublicDispositions(data), /consumer config provenance/i);
});

test('legacy build-to-source guesses require a real TypeScript output witness before creating consumption edges', async () => {
  const data = fixture({ main: 'build/index.js', files: ['src'] }, {
    'src/index.ts': 'export const value = 1;',
    'src/consumer.ts': "import { value as imported } from 'example'; export const value = imported;",
  });
  const result = await implementation.buildFinalPublicDispositions(data);
  const dependency = result.dependencies.find(row => row.request === 'example');
  assert.equal(dependency.toModuleId, null, 'directory replacement alone does not prove the module target');
  assert.equal(dependency.resolution.status, 'UNVERIFIED_BUILD_TO_SOURCE_GUESS');
  const configPath = 'packages/example/tsconfig.json';
  data.files.set(configPath, JSON.stringify({ compilerOptions: { rootDir: 'src', outDir: 'build' }, include: ['src'] }));
  data.treeEntries.push({ path: configPath, type: 'blob', mode: '100644' });
  const proved = (await implementation.buildFinalPublicDispositions(data)).dependencies.find(row => row.request === 'example');
  assert.equal(proved.toModuleId, 'MODULE:packages/example/src/index.ts');
  assert(proved.fixedSourceTargetWitnesses.some(row => row.buildProjectionWitnesses.some(witness => witness.outputPath === 'packages/example/build/index.js')));
});

test('conditional source alternatives retain all modules without claiming a runtime condition was selected', async () => {
  const data = fixture({ files: ['lib'], exports: { '.': { import: './lib/import.js', require: './lib/require.js' } } }, {
    'lib/import.js': 'export const value = 1;', 'lib/require.js': 'export const value = 2;',
    'lib/consumer.js': "import { value as imported } from 'example'; export const value = imported;",
  });
  const result = await implementation.buildFinalPublicDispositions(data);
  const dependency = result.dependencies.find(row => row.request === 'example');
  assert.deepEqual(dependency.targetModuleIds, ['MODULE:packages/example/lib/import.js', 'MODULE:packages/example/lib/require.js']);
  assert.equal(dependency.runtimeSelectionAccepted, false);
});

test('relative build imports use real output witnesses and actual one-source maps support non-TS build tools', async () => {
  const source = 'export const value = 1;';
  const data = fixture({ files: ['built'] }, {
    'implementation/value.ts': source,
    'built/value.js': 'exports.value = 1;',
    'built/value.js.map': JSON.stringify({ version: 3, sources: ['../implementation/value.ts'], sourcesContent: [source], names: [], mappings: '' }),
    'wrapper.js': "export { value } from './built/value.js';",
  });
  const result = await implementation.buildFinalPublicDispositions(data);
  const projected = result.modules.find(row => row.source.path.endsWith('implementation/value.ts'));
  assert.equal(projected.disposition, 'PUBLIC_BUILD_SOURCE_PROJECTION');
  assert(projected.publication.buildProjections.some(row => row.method === 'ACTUAL_FIXED_ONE_SOURCE_MAP' && row.mapSha256));
  const relative = fixture({ files: ['lib'] }, {
    'tsconfig.json': JSON.stringify({ compilerOptions: { rootDir: 'src', outDir: 'build' }, include: ['src'] }),
    'src/value.ts': source,
    'lib/wrapper.js': "export { value } from '../build/value';",
  });
  const dependency = (await implementation.buildFinalPublicDispositions(relative)).dependencies.find(row => row.request === '../build/value');
  assert.equal(dependency.toModuleId, 'MODULE:packages/example/src/value.ts');
  assert(dependency.fixedSourceTargetWitnesses.some(row => row.buildProjectionWitnesses.length));
});

test('source rebuild rejects removed public IDs, false internal classifications and falsified source receipts', async () => {
  const data = fixture({ files: ['lib'] }, { 'lib/value.ts': 'export const value = 1;' });
  const result = await implementation.buildFinalPublicDispositions(data);
  for (const mutate of [
    value => value.exports.pop(), value => value.modules.pop(), value => value.candidateDispositions.pop(),
    value => value.modules[0].disposition = 'UNPUBLISHED_IMPLEMENTATION_CONTEXT',
    value => value.modules[0].source.sha256 = '0'.repeat(64),
  ]) {
    const altered = structuredClone(result); mutate(altered);
    assert.equal((await implementation.validateFinalPublicDispositions(altered, data)).valid, false);
  }
  assert.equal((await implementation.validateFinalPublicDispositions(result, data)).valid, true);
});
