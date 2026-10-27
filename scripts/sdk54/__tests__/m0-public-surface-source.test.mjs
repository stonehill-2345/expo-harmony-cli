import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { create as createTar } from 'tar';
import ts from 'typescript';
import { SDK54_EXPO_COMMIT } from '../catalog.mjs';
import { parseFixedYarnLock } from '../external-sources.mjs';
import { writeSemanticArtifact } from '../m0-semantic-artifact.mjs';
import { readPublicSurface, writePublicSurface } from '../m0-public-surface.mjs';
import * as source from '../m0-public-surface-source.mjs';
const hash = text => createHash('sha256').update(text).digest('hex');
const tree = 'b'.repeat(40);

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-surface-source-test-'));
  const texts = new Map([
    ['packages/a/package.json', JSON.stringify({ name: 'a', version: '1.0.0', main: './src/index.ts', bin: './bin/cli.js' })],
    ['packages/a/src/index.ts', 'export const value = 1;'],
    ['packages/a/bin/cli.js', 'require("../src/index");'],
    ['packages/a/app.plugin.js', 'module.exports = require("./plugin");'],
    ['packages/a/.npmignore', 'ignored.js\n'],
    ['packages/a/nested/.gitignore', 'excluded.js\n'],
    ['packages/a/tsconfig.build.json', '{"compilerOptions":{"outDir":"build"}}'],
    ['shared/base.json', '{"compilerOptions":{"strict":true}}'],
    ['yarn.lock', '# fixed lock\n'],
  ]);
  const entries = [...texts].map(([file, text]) => ({ path: file, type: 'blob', mode: '100644', oid: createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0${text}`).digest('hex') }));
  const packages = [{ id: 'PKG:a', name: 'a', version: '1.0.0', sourcePath: 'packages/a/package.json' }];
  const libraries = new Map([['lib.custom.d.ts', 'interface Library { value: string; }']]);
  const graph = { schemaVersion: 1, source: { revision: SDK54_EXPO_COMMIT, tree }, compilerVersion: ts.version,
    compilerLibraries: { package: 'typescript', version: ts.version, files: [...libraries].map(([path, text]) => ({ path, sha256: hash(text) })) },
    inputs: ['packages/a/src/index.ts'].map(path => ({ path, sha256: hash(texts.get(path)), blob: entries.find(entry => entry.path === path).oid })),
    externalContext: { files: [], archives: [], fixedInputs: [{ path: 'yarn.lock', sha256: hash(texts.get('yarn.lock')) }] },
    projectContext: { configs: [{ path: 'packages/a/tsconfig.build.json', inputs: [{ path: 'shared/base.json', sha256: hash(texts.get('shared/base.json')) }], options: {}, fileNames: [] }] },
    packages, modules: [], exports: [], types: [], inferences: [], plugins: [] };
  const semanticFile = path.join(directory, 'semantic.json');
  const readers = {
    readSourceTree: () => ({ tree, entries }),
    buildSourceInventory: () => ({ source: { revision: SDK54_EXPO_COMMIT, tree }, packages, templates: [] }),
    readSourceBlobs: (_sourceDir, selected) => new Map(selected.map(entry => {
      if (!texts.has(entry.path)) throw new Error(`Missing source blob for ${entry.path}`);
      return [entry.path, Buffer.from(texts.get(entry.path))];
    })),
    loadCompilerLibraries: () => libraries,
  };
  const save = () => writeSemanticArtifact(semanticFile, graph, { sharded: true });
  save();
  return { directory, semanticFile, texts, entries, packages, libraries, graph, readers, save, options: { sourceDir: 'fixed-source', semanticFile }, cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) };
}

async function load(input) {
  assert.equal(typeof source.loadPublicSurfaceSources, 'function', 'source loader must be implemented');
  return source.loadPublicSurfaceSources(input.options, input.readers);
}

test('CLI template projection requires an explicit supported rule', () => {
  const args = ['--source', 'fixed', '--semantic', 'semantic.json', '--output', 'surface.json'];
  const options = source.parsePublicSurfaceArgs([...args, '--template-projection', 'project-v1']);
  assert.equal(options['--template-projection'], 'project-v1');
  assert.throws(() => source.parsePublicSurfaceArgs([...args, '--template-projection', 'guess']), /projection/i);
});

test('CLI Node self-reference resolution requires an explicit supported rule', () => {
  const args = ['--source', 'fixed', '--semantic', 'semantic.json', '--output', 'surface.json'];
  assert.equal(source.parsePublicSurfaceArgs([...args, '--reference-resolution', 'node-self'])['--reference-resolution'], 'node-self');
  assert.throws(() => source.parsePublicSurfaceArgs([...args, '--reference-resolution', 'guess']), /reference resolution/i);
});

test('CLI export pattern coverage accepts only the explicit fixed-v1 rule', () => {
  const args = ['--source', 'fixed', '--semantic', 'semantic.json', '--output', 'surface.json'];
  assert.equal(source.parsePublicSurfaceArgs(args)['--entry-patterns'], undefined);
  assert.equal(source.parsePublicSurfaceArgs([...args, '--entry-patterns', 'fixed-v1'])['--entry-patterns'], 'fixed-v1');
  assert.throws(() => source.parsePublicSurfaceArgs([...args, '--entry-patterns', 'guess']), /entry pattern/i);
});

test('source loader forwards explicit family coverage without changing default entries', async () => {
  const input = fixture();
  try {
    const manifest = JSON.parse(input.texts.get('packages/a/package.json'));
    manifest.exports = { './*': './src/*.ts' };
    input.texts.set('packages/a/package.json', JSON.stringify(manifest));
    const baseline = await source.loadPublicSurfaceSources(input.options, input.readers);
    assert.ok(baseline.entryLedger.entries.filter(row => row.patternFamily).every(row => !row.patternCoverage));
    const explicit = await source.loadPublicSurfaceSources({ ...input.options, entryPatterns: 'fixed-v1' }, input.readers);
    const family = explicit.entryLedger.entries.find(row => row.patternFamily);
    assert.equal(family.patternCoverage.policy, 'fixed-v1');
    assert.equal(family.target.status, 'BLOCKED');
    assert.ok(family.patternCoverage.childEntryIds.includes(explicit.entryLedger.entries.find(row => row.request === 'a/index').id));
    const result = await source.buildPublicSurfaceFromSource({ ...input.options, entryPatterns: 'fixed-v1' }, input.readers);
    assert.deepEqual(result.entries.find(row => row.id === family.id).patternCoverage, family.patternCoverage);
    assert.equal(result.sourceEvidence.semanticRebuilt, false);
    await assert.rejects(source.loadPublicSurfaceSources({ ...input.options, entryPatterns: 'guess' }, input.readers), /entry pattern/i);
  } finally { input.cleanup(); }
});

test('scope decisions require an explicit supported CLI and loader policy', async () => {
  const args = ['--source', 'fixed', '--semantic', 'semantic.json', '--output', 'surface.json'];
  assert.equal(source.parsePublicSurfaceArgs([...args, '--scope-decisions', 'fixed-v1'])['--scope-decisions'], 'fixed-v1');
  assert.throws(() => source.parsePublicSurfaceArgs([...args, '--scope-decisions', 'guess']), /scope decision/i);
  const input = fixture();
  try {
    await assert.rejects(source.loadPublicSurfaceSources({ ...input.options, scopeDecisions: 'guess' }, input.readers), /scope decision/i);
  } finally { input.cleanup(); }
});

test('scope loader loads extra fixed blobs, preserves entries, and validates decision metadata through CLI', async () => {
  const input = fixture();
  try {
    const extraPath = 'scope/evidence.txt', extraText = 'fixed scope evidence';
    input.texts.set(extraPath, extraText);
    input.entries.push({ path: extraPath, type: 'blob', mode: '100644', oid: hash(extraText).slice(0, 40) });
    let loads = 0, builds = 0;
    const inputs = { gitFiles: [extraPath], evidence: [{ kind: 'scope-local', path: 'fixed-facts.json', sha256: hash('facts') }] };
    const decisions = { schemaVersion: 1, policy: 'fixed-v1', summary: { scopeDecisionsComplete: 13, historicalSeedIdentitiesClosed: 0 }, seeds: [{ id: 'SEED:a' }] };
    input.readers.loadScopeDecisionInputs = ({ sourceDir }) => { loads++; assert.equal(sourceDir, 'fixed-source'); return inputs; };
    input.readers.buildScopeDecisions = parameters => {
      builds++;
      assert.equal(parameters.files.get(extraPath), extraText);
      assert.equal(parameters.inputs, inputs);
      assert.deepEqual(parameters.source, input.graph.source);
      assert.ok(parameters.treeEntries.some(row => row.path === extraPath));
      assert.ok(parameters.entryLedger.entries.length > 0);
      return decisions;
    };
    const baseline = await source.buildPublicSurfaceFromSource(input.options, input.readers);
    assert.equal(loads, 0); assert.equal(builds, 0);
    assert.equal(Object.hasOwn(baseline, 'scopeDecisions'), false);
    const explicitOptions = { ...input.options, entryPatterns: 'fixed-v1', scopeDecisions: 'fixed-v1' };
    const explicit = await source.buildPublicSurfaceFromSource(explicitOptions, input.readers);
    assert.deepEqual(explicit.scopeDecisions, decisions);
    assert.deepEqual(explicit.entries, baseline.entries);
    assert.deepEqual(explicit.sourceEvidence.scopeDecisionInputs, inputs.evidence);
    assert.equal(explicit.sourceEvidence.scopeDecisions, 'fixed-v1');
    assert.equal(explicit.sourceEvidence.files.find(row => row.path === extraPath)?.sha256, hash(extraText));
    assert.equal(explicit.sourceEvidence.semanticRebuilt, false);
    const output = path.join(input.directory, 'scope-surface.json');
    const args = ['--source', 'fixed-source', '--semantic', input.semanticFile, '--scope-decisions', 'fixed-v1', '--entry-patterns', 'fixed-v1'];
    await source.runPublicSurfaceCli([...args, '--output', output], input.readers);
    await source.runPublicSurfaceCli([...args, '--check', output], input.readers);
    const tampered = readPublicSurface(output);
    delete tampered.scopeDecisions.seeds[0];
    writePublicSurface(output, tampered);
    await assert.rejects(source.runPublicSurfaceCli([...args, '--check', output], input.readers), /metadata differs/);
    assert.equal(loads, 4); assert.equal(builds, 4);
  } finally { input.cleanup(); }
});

test('consumer type root isolation is explicit, preserves base tables and is checked by CLI', async () => {
  const input = fixture();
  try {
    let calls = 0;
    const audit = { policy: 'consumer-v1', contexts: [{ id: 'CONSUMER:fixture' }], summary: { contexts: 1 } };
    input.readers.buildTypeRootIsolation = ({ surface, files, projectContext }) => {
      calls++;
      assert.equal(surface.sourceEvidence.semanticRebuilt, false);
      assert.equal(files.get('packages/a/src/index.ts'), input.texts.get('packages/a/src/index.ts'));
      assert.deepEqual(projectContext, input.graph.projectContext);
      return structuredClone(audit);
    };
    const baseline = await source.buildPublicSurfaceFromSource(input.options, input.readers);
    assert.equal(calls, 0); assert.equal(Object.hasOwn(baseline, 'consumerTypeContexts'), false);
    const isolated = await source.buildPublicSurfaceFromSource({ ...input.options, typeRootIsolation: 'consumer-v1' }, input.readers);
    assert.deepEqual(isolated.consumerTypeContexts, audit);
    assert.deepEqual(isolated.types, baseline.types); assert.deepEqual(isolated.uses, baseline.uses);
    assert.equal(isolated.sourceEvidence.typeRootIsolation, 'consumer-v1');
    const output = path.join(input.directory, 'consumer-surface.json');
    const args = ['--source', 'fixed-source', '--semantic', input.semanticFile, '--type-root-isolation', 'consumer-v1'];
    await source.runPublicSurfaceCli([...args, '--output', output], input.readers);
    await source.runPublicSurfaceCli([...args, '--check', output], input.readers);
    const changed = readPublicSurface(output); changed.consumerTypeContexts.contexts.pop(); writePublicSurface(output, changed);
    await assert.rejects(source.runPublicSurfaceCli([...args, '--check', output], input.readers), /metadata differs/);
    assert.equal(calls, 4);
    assert.throws(() => source.parsePublicSurfaceArgs([...args, '--output', output, '--type-root-isolation', 'consumer-v1']), /duplicate argument/i);
    assert.throws(() => source.parsePublicSurfaceArgs(['--source', 's', '--semantic', 'g', '--output', 'o', '--type-root-isolation', 'guess']), /type root isolation/i);
    await assert.rejects(source.buildPublicSurfaceFromSource({ ...input.options, typeRootIsolation: 'guess' }, input.readers), /type root isolation/i);
  } finally { input.cleanup(); }
});

test('consumer-v2 reconstructs declaration sources from checked archives and the fixed lock', async () => {
  const input = fixture();
  try {
    const declaration = 'export interface Dependency { fixed: true }';
    const external = archive(input, '@types/dependency', '1.0.0', { 'index.d.ts': declaration });
    const manifestPath = 'packages/a/package.json';
    input.texts.set(manifestPath, JSON.stringify({ ...JSON.parse(input.texts.get(manifestPath)), devDependencies: { '@types/dependency': '1.0.0' } }));
    const lock = `# yarn lockfile v1\n\n"@types/dependency@1.0.0":\n  version "1.0.0"\n  resolved "${external.identity.resolved}"\n  integrity ${external.identity.integrity}\n`;
    input.texts.set('yarn.lock', lock);
    input.graph.externalContext.fixedInputs[0].sha256 = hash(lock);
    input.graph.externalContext.archives.push(external);
    input.save();
    let v2Calls = 0;
    input.readers.buildTypeRootIsolation = ({ policy, sourceContext, files }) => {
      if (policy !== 'consumer-v2') { assert.equal(sourceContext ?? null, null); return { policy: 'consumer-v1', contexts: [] }; }
      v2Calls++;
      const selected = sourceContext.resolveTypeReference('dependency', 'packages/a/src/index.ts');
      assert.equal(selected.status, 'source');
      assert.equal(selected.path, '__sdk54_external__/@types+dependency@1.0.0/index.d.ts');
      assert.equal(files.get(selected.path), declaration);
      assert.equal(sourceContext.snapshot().archives[0].archive.sha256, external.archive.sha256);
      return { policy, contexts: [{ id: 'CONSUMER:fixture', sourceResolutions: [{ request: 'dependency', result: selected }] }] };
    };
    const baseline = await source.buildPublicSurfaceFromSource(input.options, input.readers);
    await source.buildPublicSurfaceFromSource({ ...input.options, typeRootIsolation: 'consumer-v1' }, input.readers);
    assert.equal(v2Calls, 0);
    const options = { ...input.options, typeRootIsolation: 'consumer-v2' };
    const result = await source.buildPublicSurfaceFromSource(options, input.readers);
    assert.equal(v2Calls, 1);
    assert.equal(result.sourceEvidence.typeRootIsolation, 'consumer-v2');
    assert.deepEqual(result.uses, baseline.uses); assert.deepEqual(result.inputs, baseline.inputs);
    const output = path.join(input.directory, 'consumer-v2.json');
    const args = ['--source', 'fixed-source', '--semantic', input.semanticFile, '--type-root-isolation', 'consumer-v2'];
    await source.runPublicSurfaceCli([...args, '--output', output], input.readers);
    await source.runPublicSurfaceCli([...args, '--check', output], input.readers);
    const changed = readPublicSurface(output); changed.consumerTypeContexts.contexts[0].sourceResolutions.pop(); writePublicSurface(output, changed);
    await assert.rejects(source.runPublicSurfaceCli([...args, '--check', output], input.readers), /metadata differs/);
    assert.throws(() => source.parsePublicSurfaceArgs([...args, '--output', output, '--type-root-isolation', 'consumer-v2']), /duplicate/i);
    external.archive.sha256 = '0'.repeat(64); input.save();
    await assert.rejects(source.loadPublicSurfaceSources(options, input.readers), /archive.*hash/i);
  } finally { input.cleanup(); }
});

test('consumer-v2 requires the fixed lock input even when no declaration archive is loaded', async () => {
  const input = fixture();
  try {
    input.graph.externalContext.fixedInputs = []; input.save();
    await assert.rejects(source.loadPublicSurfaceSources({ ...input.options, typeRootIsolation: 'consumer-v2' }, input.readers), /fixed.*lock|lock.*provenance/i);
  } finally { input.cleanup(); }
});

test('consumer-v2 reconstructs config archives without reusing their materialized workspace paths', async () => {
  const input = fixture();
  try {
    const text = '{"compilerOptions":{"strict":true}}';
    const config = archive(input, '@tsconfig/base', '1.0.0', { 'base.json': text });
    const file = '__sdk54_config__/@tsconfig+base@1.0.0/base.json';
    const lock = `# yarn lockfile v1\n\n"${config.identity.selector}":\n  version "1.0.0"\n  resolved "${config.identity.resolved}"\n  integrity ${config.identity.integrity}\n`;
    config.identity = parseFixedYarnLock(lock)[0];
    input.graph.projectContext.configs[0].inputs.push({ path: file, sha256: hash(text), ...config });
    input.texts.set('yarn.lock', lock);
    input.graph.externalContext.fixedInputs[0].sha256 = hash(lock);
    input.save();
    const baseline = await load(input);
    const explicit = await source.loadPublicSurfaceSources({ ...input.options, typeRootIsolation: 'consumer-v2' }, input.readers);
    assert.equal(explicit.files.get(file), text);
    assert.deepEqual(explicit.sourceEvidence.files, baseline.sourceEvidence.files);
    assert.equal(typeof explicit.consumerSourceContext.resolveTypeReference, 'function');
    assert.equal(explicit.sourceEvidence.archives.filter(row => row.kind === 'config-archive').length, 1);
  } finally { input.cleanup(); }
});

test('loads fixed declaration targets and build recipe scripts with raw hash evidence', async () => {
  const input = fixture();
  try {
    const manifest = JSON.parse(input.texts.get('packages/a/package.json'));
    manifest.types = 'build'; manifest.scripts = { build: 'taskr' };
    input.texts.set('packages/a/package.json', JSON.stringify(manifest));
    const extra = new Map([['packages/a/build/index.d.ts', 'export declare const emitted: true;'],
      ['packages/a/taskfile.js', 'export async function build(task) {}'],
      ['packages/a/taskfile-swc.js', 'export default function swc() {}']]);
    for (const [file, text] of extra) {
      input.texts.set(file, text);
      input.entries.push({ path: file, type: 'blob', mode: '100644', oid: createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0${text}`).digest('hex') });
    }
    const result = await load(input);
    for (const [file, text] of extra) {
      assert.equal(result.files.get(file), text, file);
      assert.equal(result.sourceEvidence.files.find(row => row.path === file)?.sha256, hash(text));
    }
  } finally { input.cleanup(); }
});

function archive(input, name, version, files) {
  const root = path.join(input.directory, `archive-${name.replaceAll('/', '-')}`);
  fs.mkdirSync(path.join(root, 'package'), { recursive: true });
  for (const [file, text] of Object.entries({ 'package.json': JSON.stringify({ name, version }), ...files })) {
    fs.mkdirSync(path.dirname(path.join(root, 'package', file)), { recursive: true });
    fs.writeFileSync(path.join(root, 'package', file), text);
  }
  const archiveFile = root + '.tgz';
  createTar({ file: archiveFile, cwd: root, gzip: true, sync: true }, ['package']);
  const bytes = fs.readFileSync(archiveFile);
  const identity = { name, version, selector: `${name}@${version}`, integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64'), resolved: 'https://registry.npmjs.org/source.tgz#' + createHash('sha1').update(bytes).digest('hex') };
  return { identity, archive: { path: archiveFile, sha256: hash(bytes) } };
}

test('rebuilds Node self probes only from verified Node archive bytes and keeps the default unchanged', async () => {
  const input = fixture();
  try {
    const text = "declare module 'buffer' { export interface Buffer { source: import('node:buffer').Buffer; } }\ndeclare module 'node:buffer' { export { Buffer } from 'buffer'; }\n";
    const external = archive(input, '@types/node', '22.14.0', { 'index.d.ts': text });
    const file = '__sdk54_external__/@types+node@22.14.0/index.d.ts';
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true), node = sf.statements[0];
    input.graph.externalContext.archives.push(external);
    input.graph.externalContext.files.push({ path: file, sha256: hash(text) });
    input.graph.plugins.push({ id: 'PLUGIN:node', source: { path: file, start: node.getStart(sf), end: node.end } });
    input.save();
    const baseline = await source.buildPublicSurfaceFromSource(input.options, input.readers);
    const result = await source.buildPublicSurfaceFromSource({ ...input.options, referenceResolution: 'node-self' }, input.readers);
    assert.equal(baseline.uses[0].resolutionStatus, 'NOT_OBSERVED');
    assert.equal(result.uses[0].resolutionStatus, 'node-global-context');
    assert.equal(result.resolutions[0].observations[0].observer, 'lexical-reference-source-probe');
    assert.equal(result.resolutions[0].observations[0].resolution.declarations[0].sha256, hash(text));
    assert.equal(result.sourceEvidence.archives[0].sha256, external.archive.sha256);
    external.archive.sha256 = '0'.repeat(64); input.save();
    await assert.rejects(source.buildPublicSurfaceFromSource({ ...input.options, referenceResolution: 'node-self' }, input.readers), /archive.*hash/i);
  } finally { input.cleanup(); }
});

test('loads exact fixed Git inputs plus package policies, bin, app plugin and config texts as strings', async () => {
  const input = fixture();
  try {
    const result = await load(input);
    assert.ok(result.files instanceof Map);
    for (const [file, text] of input.texts) assert.equal(result.files.get(file), text, file);
    assert.equal(result.files.get('lib.custom.d.ts'), input.libraries.get('lib.custom.d.ts'));
    assert.ok([...result.files.values()].every(text => typeof text === 'string'));
    assert.equal(result.publication[0].acceptance, 'SOURCE_TREE_PROJECTION_ONLY');
    assert.ok(result.entryLedger.entries.some(entry => entry.kind === 'bin'));
    assert.equal(result.sourceEvidence.semanticArtifact.sha256, hash(fs.readFileSync(input.semanticFile)));
    assert.equal(result.sourceEvidence.semanticRebuilt, false);
  } finally { input.cleanup(); }
});

test('rejects a changed revision, tree, omitted package, input hash or Git blob identity', async () => {
  for (const mutation of [
    graph => { graph.source.revision = 'a'.repeat(40); },
    graph => { graph.source.tree = 'c'.repeat(40); },
    graph => { graph.packages = []; },
    graph => { graph.inputs[0].sha256 = '0'.repeat(64); },
    graph => { graph.inputs[0].blob = '0'.repeat(40); },
    graph => { graph.projectContext.configs[0].inputs[0].sha256 = '0'.repeat(64); },
  ]) {
    const input = fixture();
    try { mutation(input.graph); input.save(); await assert.rejects(load(input), /revision|tree|package|hash|blob/i); }
    finally { input.cleanup(); }
  }
});

test('rejects missing blob text and unsafe source paths without fetching', async () => {
  const input = fixture();
  try {
    input.texts.delete('packages/a/.npmignore');
    await assert.rejects(load(input), /Missing source blob/);
    input.entries.push({ path: '../escape', type: 'blob', mode: '100644' });
    await assert.rejects(load(input), /Unsafe.*path/);
  } finally { input.cleanup(); }
});

test('verifies archive identity and sha256 and maps external declarations into their fixed prefix', async () => {
  const input = fixture();
  try {
    const external = archive(input, '@scope/types', '1.0.0', { 'index.d.ts': 'export type Value = string;' });
    const file = '__sdk54_external__/@scope+types@1.0.0/index.d.ts';
    input.graph.externalContext.archives.push(external);
    input.graph.externalContext.files.push({ path: file, sha256: hash('export type Value = string;') });
    input.save();
    assert.equal((await load(input)).files.get(file), 'export type Value = string;');
    external.archive.sha256 = '0'.repeat(64); input.save();
    await assert.rejects(load(input), /archive.*hash|archive.*sha256/i);
  } finally { input.cleanup(); }
});

test('loads archive-backed project config inputs separately from Git and external declarations', async () => {
  const input = fixture();
  try {
    const config = archive(input, '@tsconfig/base', '1.0.0', { 'base.json': '{"compilerOptions":{"strict":true}}' });
    const file = '__sdk54_config__/@tsconfig+base@1.0.0/base.json';
    input.graph.projectContext.configs[0].inputs.push({ path: file, sha256: hash('{"compilerOptions":{"strict":true}}'), ...config });
    input.save();
    assert.equal((await load(input)).files.get(file), '{"compilerOptions":{"strict":true}}');
  } finally { input.cleanup(); }
});

test('checks every compiler library hash and rejects tampered semantic shards', async () => {
  const input = fixture();
  try {
    input.libraries.set('lib.custom.d.ts', 'changed');
    await assert.rejects(load(input), /compiler|hash/i);
    input.libraries.set('lib.custom.d.ts', 'interface Library { value: string; }');
    input.graph.types.push({ id: 'TYPE:test' }); input.save();
    const index = JSON.parse(fs.readFileSync(input.semanticFile));
    fs.appendFileSync(path.join(input.semanticFile + '.parts', index.typeShards[0].path), 'tamper');
    await assert.rejects(load(input), /integrity/i);
  } finally { input.cleanup(); }
});

test('rejects duplicate compiler library paths that hide a missing real library', async () => {
  const input = fixture();
  try {
    input.libraries.set('lib.second.d.ts', 'interface SecondLibrary { value: number; }');
    input.graph.compilerLibraries.files.push({ ...input.graph.compilerLibraries.files[0] });
    input.save();
    await assert.rejects(load(input), /Duplicate.*compiler|library.*set|library.*input/i);
  } finally { input.cleanup(); }
});

test('rejects both missing and unexpected compiler library identities', async () => {
  for (const mutate of [
    input => input.graph.compilerLibraries.files.pop(),
    input => input.graph.compilerLibraries.files.push({ path: 'lib.unexpected.d.ts', sha256: hash('unexpected') }),
  ]) {
    const input = fixture();
    try {
      mutate(input); input.save();
      await assert.rejects(load(input), /library.*set|library.*input/i);
    } finally { input.cleanup(); }
  }
});

test('CLI writes a sharded artifact and summary and independently rebuilds when checking', async () => {
  const input = fixture();
  try {
    assert.equal(typeof source.runPublicSurfaceCli, 'function', 'source CLI must be implemented');
    const output = path.join(input.directory, 'surface.json');
    const summary = path.join(input.directory, 'summary.json');
    const common = ['--source', 'fixed-source', '--semantic', input.semanticFile];
    await source.runPublicSurfaceCli([...common, '--output', output, '--summary', summary], input.readers);
    const result = readPublicSurface(output);
    assert.equal(result.sourceEvidence.semanticRebuilt, false);
    assert.equal(JSON.parse(fs.readFileSync(summary)).stageClosable, false);
    await source.runPublicSurfaceCli([...common, '--check', output], input.readers);
    result.stageClosable = true; writePublicSurface(output, result);
    await assert.rejects(source.runPublicSurfaceCli([...common, '--check', output], input.readers), /validation|differs|metadata/i);
  } finally { input.cleanup(); }
});

test('CLI rejects duplicate, unknown, missing and mutually incompatible arguments', async () => {
  assert.equal(typeof source.parsePublicSurfaceArgs, 'function', 'source argument parser must be implemented');
  const common = ['--source', 'fixed', '--semantic', 'semantic.json'];
  for (const args of [common, [...common, '--output', 'a', '--check', 'b'], [...common, '--output', 'a', '--source', 'other'], [...common, '--output', 'a', '--unknown', 'x'], [...common, '--output']]) {
    assert.throws(() => source.parsePublicSurfaceArgs(args), /args|Usage|argument|Duplicate/);
  }
});

test('loads all supported independent app plugin script extensions', async () => {
  const input = fixture();
  try {
    for (const extension of ['cjs', 'mjs', 'ts', 'cts', 'mts']) {
      const file = `packages/a/nested-${extension}/app.plugin.${extension}`;
      input.texts.set(file, `export const plugin = '${extension}';`);
      input.entries.push({ path: file, type: 'blob', mode: '100644', oid: 'a'.repeat(40) });
    }
    const result = await load(input);
    for (const extension of ['cjs', 'mjs', 'ts', 'cts', 'mts']) assert.equal(result.files.get(`packages/a/nested-${extension}/app.plugin.${extension}`), `export const plugin = '${extension}';`);
  } finally { input.cleanup(); }
});

test('does not bypass archive identity checks when a second record reuses an already loaded file', async () => {
  const input = fixture();
  try {
    const external = archive(input, 'first-package', '1.0.0', { 'index.d.ts': 'export type Value = string;' });
    input.graph.externalContext.archives.push(external, { identity: { ...external.identity, name: 'second-package' }, archive: external.archive });
    input.save();
    await assert.rejects(load(input), /identity/i);
  } finally { input.cleanup(); }
});

test('records checked hashes for nonempty semantic shards without rebuilding their types', async () => {
  const input = fixture();
  try {
    input.graph.types.push({ id: 'TYPE:one', properties: [], arguments: [], constituents: [], calls: [], constructs: [], indexes: [] });
    input.save();
    const result = await load(input);
    assert.equal(result.sourceEvidence.semanticArtifact.typeShards.length, 1);
    const shard = result.sourceEvidence.semanticArtifact.typeShards[0];
    assert.equal(shard.sha256, hash(fs.readFileSync(shard.path)));
    assert.equal(result.graph.types[0].id, 'TYPE:one');
  } finally { input.cleanup(); }
});

test('executable CLI returns nonzero for invalid args and unavailable fixed source', () => {
  const executable = new URL('../m0-public-surface-source.mjs', import.meta.url).pathname;
  const invalid = spawnSync(process.execPath, [executable, '--output'], { encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /argument|Usage/);
  const input = fixture();
  try {
    const missing = spawnSync(process.execPath, [executable, '--source', path.join(input.directory, 'absent'), '--semantic', input.semanticFile, '--output', path.join(input.directory, 'output.json')], { encoding: 'utf8' });
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /revision|Git|source/i);
    assert.equal(fs.existsSync(path.join(input.directory, 'output.json')), false);
  } finally { input.cleanup(); }
});
