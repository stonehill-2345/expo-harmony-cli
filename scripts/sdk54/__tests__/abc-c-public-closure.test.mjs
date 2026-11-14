import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { create } from 'tar';
import { auditScope, verifyCandidatePublicSurface } from '../abc/c-public-closure.mjs';
import { RELEASE_ID, RELEASE_PACKAGES } from '../release-catalog.mjs';

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

const publicEntry = (packageName, pointer, name = packageName) => ({
  id: `PUBLIC-ENTRY:PKG%3A${packageName}:export:${encodeURIComponent(pointer)}:${encodeURIComponent(name)}:`,
  kind: 'public-entry',
  packageId: `PKG:${packageName}`,
  name,
  scope: 'M4_REQUIRED',
  acceptance: 'NOT_RUN',
  acceptanceId: 'M4-A07',
});

async function candidateFixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-abc-c-candidate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const packageName = 'expo-test', publishName = '@test/expo-test';
  const packageRoot = path.join(root, 'package');
  fs.mkdirSync(path.join(packageRoot, 'build'), { recursive: true });
  const entries = options.extensionlessEntries
    ? { main: './build/index', types: './build' }
    : { main: './build/index.js', types: './build/index.d.ts' };
  const baselineManifest = {
    name: packageName,
    version: '1.0.0',
    ...entries,
    exports: {
      '.': { types: './build/index.d.ts', default: './build/index.js' },
    },
  };
  const manifest = structuredClone(baselineManifest);
  manifest.name = publishName;
  if (options.extraExport) manifest.exports['./extra'] = './build/extra.js';
  if (options.invalidExportsLeaf) manifest.exports['.'].default = 42;
  fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify(manifest));
  if (!options.missingDeclaredEntry) fs.writeFileSync(path.join(packageRoot, 'build/index.js'), options.defaultExport
    ? 'export default function Widget() {}'
    : options.dynamicCommonJs ? 'module.exports = getExports();'
    : options.externalStar ? "export * from 'dependency';"
    : options.publishExports ? 'publish(exports);'
    : options.nestedPublishExports ? 'publish({ callback: () => exports.value = 1 });'
    : options.localPublishExports ? 'function publish() { exports.value = 1; }\nconst alias = publish;\nalias();'
    : options.exportObjectAlias ? 'const out = exports;\nout.extra = 1;'
    : options.assignedExportAlias ? 'let out;\nout = exports;\nout.extra = 1;'
    : options.missingNamedReexport ? "export { missing } from './dep.js';"
    : `export const value = 1;${options.extraSymbol ? '\nexport const extra = 2;' : ''}`);
  fs.writeFileSync(path.join(packageRoot, 'build/index.d.ts'), options.defaultExport
    ? 'export default function Widget(): void;'
    : `export declare const value: number;${options.extraSymbol ? '\nexport declare const extra: number;' : ''}`);
  if (options.extraExport) fs.writeFileSync(path.join(packageRoot, 'build/extra.js'), 'export const extra = 1;');
  if (options.missingNamedReexport) fs.writeFileSync(path.join(packageRoot, 'build/dep.js'), 'export const other = 1;');
  const archive = path.join(root, 'expo-test-1.0.0.tgz');
  const archiveEntries = fs.readdirSync(packageRoot);
  if (options.duplicateManifestMember) archiveEntries.push('package.json');
  await create({ cwd: packageRoot, file: archive, gzip: true, prefix: 'package/' }, archiveEntries);
  const bytes = fs.readFileSync(archive);
  const members = ['package/package.json', 'package/build/index.d.ts'];
  if (options.duplicateManifestMember) members.push('package/package.json');
  if (!options.missingDeclaredEntry) members.push('package/build/index.js');
  if (options.extraExport) members.push('package/build/extra.js');
  if (options.missingNamedReexport) members.push('package/build/dep.js');
  members.sort();
  const packageRecord = {
    name: publishName,
    version: '1.0.0',
    file: path.basename(archive),
    bytes: bytes.length,
    sha256: sha256(bytes),
  };
  const candidateFile = path.join(root, 'candidate.json');
  fs.writeFileSync(candidateFile, JSON.stringify({ schemaVersion: 1, release: 'test', packages: [packageRecord], failures: [] }));
  const bCandidateFile = path.join(root, 'b-candidate.json');
  fs.writeFileSync(bCandidateFile, JSON.stringify({
    schemaVersion: 1,
    source: { revision: options.bRevision ?? 'source-revision', dirty: false, changes: [] },
    runtimePackages: [{ ...packageRecord, installName: options.installName ?? packageName, members }],
    failures: [],
  }));
  const scopeRows = [
    publicEntry(packageName, '/exports/./default'),
    publicEntry(packageName, '/exports/./types'),
    { id: 'API:main', kind: 'api', packageId: `PKG:${packageName}`, entryId: `ENTRY:${packageName}#%2Fmain:base` },
    { id: 'API:types', kind: 'api', packageId: `PKG:${packageName}`, entryId: `ENTRY:${packageName}#%2Ftypes:base` },
  ];
  if (options.missingScopeMember) scopeRows.push(publicEntry(packageName, '/app-plugin', `${packageName}/app.plugin.js`));
  if (options.missingPackage) scopeRows.push(publicEntry('expo-absent', '/main'));
  if (options.untrackedScope) scopeRows.length = 0;
  if (options.invalidScopePointer) scopeRows[0].id = 'PUBLIC-ENTRY:PKG%3Aexpo-test:export:%ZZ:expo-test:';
  const sourceRoot = path.join(root, 'source');
  const sourceManifest = path.join(sourceRoot, 'packages/expo-test/package.json');
  fs.mkdirSync(path.dirname(sourceManifest), { recursive: true });
  fs.writeFileSync(sourceManifest, JSON.stringify(baselineManifest));
  fs.mkdirSync(path.join(sourceRoot, 'packages/expo-test/build'), { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, 'packages/expo-test/build/index.js'), 'export const value = 1;');
  fs.writeFileSync(path.join(sourceRoot, 'packages/expo-test/build/index.d.ts'), 'export declare const value: number;');
  const sourceFiles = new Map([
    ['packages/expo-test/package.json', fs.readFileSync(sourceManifest)],
    ['packages/expo-test/build/index.js', fs.readFileSync(path.join(sourceRoot, 'packages/expo-test/build/index.js'))],
    ['packages/expo-test/build/index.d.ts', fs.readFileSync(path.join(sourceRoot, 'packages/expo-test/build/index.d.ts'))],
  ]);
  return {
    root,
    candidateFile,
    bCandidateFile,
    scope: { rows: scopeRows },
    sourceRoot,
    releaseId: 'test',
    packageCatalog: [{ installName: packageName, publishName, publishVersion: '1.0.0', relativePath: 'packages/expo-test' }],
    readFrozenSource: relative => sourceFiles.get(relative) ?? null,
  };
}

const rows = () => [
  { id: 'A', kind: 'api', scope: 'M4_REQUIRED', acceptance: 'NOT_RUN', acceptanceId: 'M4-A01', source: { path: 'a.ts', line: 1 } },
  { id: 'B', kind: 'member', scope: 'M7_TRANSFER', acceptance: 'NOT_RUN', batch: 'M7.1', target: 'verify', source: { path: 'b.ts', line: 2 } },
  { id: 'C', kind: 'public-export', scope: 'SOURCE_CONTEXT', acceptance: 'NOT_RUN', source: { path: 'c.ts', sha256: 'a'.repeat(64) } },
];

test('keeps public relation closure separate from Harmony runtime acceptance', () => {
  const result = auditScope({ schemaVersion: 1, complete: true, rows: rows() });
  assert.equal(result.valid, true);
  assert.equal(result.relationClosed, true);
  assert.equal(result.harmonySupportAccepted, false);
  assert.equal(result.stageClosable, false);
});

test('rejects duplicate IDs, missing M4 assertion, incomplete M7 transfer and unknown scope', () => {
  const mutations = [
    value => value.push(structuredClone(value[0])),
    value => delete value[0].acceptanceId,
    value => delete value[1].target,
    value => value[2].scope = 'OPTIONAL',
  ];
  for (const mutate of mutations) {
    const value = rows(); mutate(value);
    assert.equal(auditScope({ schemaVersion: 1, complete: true, rows: value }).valid, false);
  }
});

test('does not accept an explicitly incomplete scope document', () => {
  assert.equal(auditScope({ schemaVersion: 1, complete: false, rows: rows() }).relationClosed, false);
});

test('rejects a B candidate frozen from a different source revision', async (t) => {
  const fixture = await candidateFixture(t, { bRevision: 'stale-revision' });
  const result = await verifyCandidatePublicSurface({ ...fixture, sourceRevision: 'source-revision' });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /source revision mismatch/i);
});

test('accepts matching manifests and archive members without accepting runtime support', async (t) => {
  const fixture = await candidateFixture(t);
  const result = await verifyCandidatePublicSurface({ ...fixture, sourceRevision: 'source-revision' });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.packages.length, 1);
  assert.equal(result.harmonySupportAccepted, false);
});

test('rejects a scope package absent from the candidate', async (t) => {
  const fixture = await candidateFixture(t, { missingPackage: true });
  const result = await verifyCandidatePublicSurface({ ...fixture, sourceRevision: 'source-revision' });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /scope package absent/i);
});

test('rejects a scoped public entry whose archive member is absent', async (t) => {
  const fixture = await candidateFixture(t, { missingScopeMember: true });
  const result = await verifyCandidatePublicSurface({ ...fixture, sourceRevision: 'source-revision' });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /scope public entry member absent/i);
});

test('rejects a package manifest entry whose archive target is absent', async (t) => {
  const fixture = await candidateFixture(t, { missingDeclaredEntry: true });
  const result = await verifyCandidatePublicSurface({ ...fixture, sourceRevision: 'source-revision' });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /manifest entry member absent/i);
});

test('rejects candidate public symbols and declarations that differ from the frozen source revision', async (t) => {
  const fixture = await candidateFixture(t, { extraSymbol: true });
  const result = await verifyCandidatePublicSurface({ ...fixture, sourceRevision: 'source-revision' });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /public entry (?:bytes|exports).*mismatch/i);
});

test('rejects external candidate named exports that differ from the verified input archive', async (t) => {
  const fixture = await candidateFixture(t, { extraSymbol: true, untrackedScope: true });
  fixture.packageCatalog[0] = { ...fixture.packageCatalog[0], relativePath: undefined };
  const entries = [
    { pointer: '/main', target: './build/index.js' },
    { pointer: '/types', target: './build/index.d.ts' },
    { pointer: '/exports/.\/types', target: './build/index.d.ts' },
    { pointer: '/exports/.\/default', target: './build/index.js' },
  ];
  const entrySurfaces = Object.fromEntries(entries.map(({ pointer }) => [pointer, {
    names: ['value'],
    reexports: [],
    complete: true,
  }]));
  const result = await verifyCandidatePublicSurface({
    ...fixture,
    sourceRevision: 'source-revision',
    externalManifestBaselines: new Map([['expo-test', { entries, entrySurfaces }]]),
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /public entry exports mismatch/i);
});

test('treats named default declarations as the default public export', async (t) => {
  const fixture = await candidateFixture(t, { defaultExport: true, untrackedScope: true });
  fixture.packageCatalog[0] = { ...fixture.packageCatalog[0], relativePath: undefined };
  const entries = [
    { pointer: '/main', target: './build/index.js' },
    { pointer: '/types', target: './build/index.d.ts' },
    { pointer: '/exports/.\/types', target: './build/index.d.ts' },
    { pointer: '/exports/.\/default', target: './build/index.js' },
  ];
  const entrySurfaces = Object.fromEntries(entries.map(({ pointer }) => [pointer, {
    names: ['default'],
    reexports: [],
    complete: true,
  }]));
  const result = await verifyCandidatePublicSurface({
    ...fixture,
    sourceRevision: 'source-revision',
    externalManifestBaselines: new Map([['expo-test', { entries, entrySurfaces }]]),
  });
  assert.equal(result.valid, true, result.errors.join('\n'));
});

for (const [name, options] of [
  ['dynamic CommonJS export', { dynamicCommonJs: true }],
  ['external star export without fixed dependency bytes', { externalStar: true }],
  ['unknown call that receives exports', { publishExports: true }],
  ['unknown call whose nested callback mutates exports', { nestedPublishExports: true }],
  ['invoked local export-mutating function alias', { localPublishExports: true }],
  ['export object alias mutation', { exportObjectAlias: true }],
  ['export object alias assigned after declaration', { assignedExportAlias: true }],
  ['named reexport whose source symbol is missing', { missingNamedReexport: true }],
]) test(`rejects incomplete candidate analysis for ${name}`, async (t) => {
  const fixture = await candidateFixture(t, { ...options, untrackedScope: true });
  fixture.packageCatalog[0] = { ...fixture.packageCatalog[0], relativePath: undefined };
  const result = await verifyCandidatePublicSurface({
    ...fixture,
    sourceRevision: 'source-revision',
    externalManifestBaselines: new Map([['expo-test', {
      entries: [
        { pointer: '/main', target: './build/index.js' },
        { pointer: '/types', target: './build/index.d.ts' },
        { pointer: '/exports/.\/types', target: './build/index.d.ts' },
        { pointer: '/exports/.\/default', target: './build/index.js' },
      ],
      entrySurfaces: {},
    }]]),
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /export analysis incomplete|exports (?:mismatch|absent from baseline)/i);
});

test('reads internal manifest baselines from the frozen commit instead of a modified worktree', async (t) => {
  const fixture = await candidateFixture(t, { extraExport: true });
  const runGit = (...argv) => {
    const result = spawnSync('git', argv, { cwd: fixture.sourceRoot, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  runGit('init');
  runGit('add', '.');
  runGit('-c', 'user.name=SDK54 Test', '-c', 'user.email=sdk54@example.invalid', 'commit', '-m', 'fixture');
  const revision = runGit('rev-parse', 'HEAD');
  const sourceManifest = path.join(fixture.sourceRoot, 'packages/expo-test/package.json');
  const modified = JSON.parse(fs.readFileSync(sourceManifest));
  modified.exports['./extra'] = './build/extra.js';
  fs.writeFileSync(sourceManifest, JSON.stringify(modified));
  const handoff = JSON.parse(fs.readFileSync(fixture.bCandidateFile));
  handoff.source.revision = revision;
  fs.writeFileSync(fixture.bCandidateFile, JSON.stringify(handoff));
  const result = await verifyCandidatePublicSurface({ ...fixture, sourceRevision: revision, readFrozenSource: null });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /source baseline|frozen source/i);
});

test('rejects a candidate manifest public entry absent from the reviewed scope', async (t) => {
  const fixture = await candidateFixture(t, { extraExport: true });
  const result = await verifyCandidatePublicSurface({ ...fixture, sourceRevision: 'source-revision' });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /manifest public entry absent from scope/i);
});

test('rejects a B member list that differs from the actual archive', async (t) => {
  const fixture = await candidateFixture(t);
  const handoff = JSON.parse(fs.readFileSync(fixture.bCandidateFile, 'utf8'));
  handoff.runtimePackages[0].members.pop();
  fs.writeFileSync(fixture.bCandidateFile, JSON.stringify(handoff));
  const result = await verifyCandidatePublicSurface({ ...fixture, sourceRevision: 'source-revision' });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /member list mismatch/i);
});

test('rejects duplicate archive members even when the B member list repeats them', async (t) => {
  const fixture = await candidateFixture(t, { duplicateManifestMember: true });
  const result = await verifyCandidatePublicSurface({ ...fixture, sourceRevision: 'source-revision' });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /duplicate archive member/i);
});

test('rejects a candidate archive whose member count exceeds the configured limit', async (t) => {
  const fixture = await candidateFixture(t);
  const result = await verifyCandidatePublicSurface({
    ...fixture,
    sourceRevision: 'source-revision',
    archiveLimits: { maxMembers: 1, maxFileBytes: 1024 * 1024, maxTotalBytes: 1024 * 1024 },
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /archive member count limit/i);
});

test('rejects a candidate archive whose single file exceeds the configured limit', async (t) => {
  const fixture = await candidateFixture(t);
  const result = await verifyCandidatePublicSurface({
    ...fixture,
    sourceRevision: 'source-revision',
    archiveLimits: { maxMembers: 100, maxFileBytes: 1, maxTotalBytes: 1024 * 1024 },
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /archive file size limit/i);
});

test('rejects a candidate archive whose expanded bytes exceed the configured limit', async (t) => {
  const fixture = await candidateFixture(t);
  const result = await verifyCandidatePublicSurface({
    ...fixture,
    sourceRevision: 'source-revision',
    archiveLimits: { maxMembers: 100, maxFileBytes: 1024 * 1024, maxTotalBytes: 1 },
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /archive expanded bytes limit/i);
});

test('rejects a non-string exports leaf using the shared package entry rules', async (t) => {
  const fixture = await candidateFixture(t, { invalidExportsLeaf: true });
  const result = await verifyCandidatePublicSurface({ ...fixture, sourceRevision: 'source-revision' });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /invalid exports.*invalid type number/i);
});

test('reports malformed B runtime package rows without throwing', async (t) => {
  const fixture = await candidateFixture(t);
  const handoff = JSON.parse(fs.readFileSync(fixture.bCandidateFile, 'utf8'));
  handoff.runtimePackages[0] = null;
  fs.writeFileSync(fixture.bCandidateFile, JSON.stringify(handoff));
  const result = await verifyCandidatePublicSurface({ ...fixture, sourceRevision: 'source-revision' });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /B candidate handoff invalid/i);
});

test('reports a null B candidate handoff without throwing', async (t) => {
  const fixture = await candidateFixture(t);
  fs.writeFileSync(fixture.bCandidateFile, 'null');
  const result = await verifyCandidatePublicSurface({ ...fixture, sourceRevision: 'source-revision' });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /B candidate handoff invalid/i);
});

test('resolves extensionless and directory main/types entries to real archive members', async (t) => {
  const fixture = await candidateFixture(t, { extensionlessEntries: true });
  const result = await verifyCandidatePublicSurface({ ...fixture, sourceRevision: 'source-revision' });
  assert.equal(result.valid, true, result.errors.join('\n'));
});

test('rejects public entries from a candidate package with no reviewed or source baseline', async (t) => {
  const fixture = await candidateFixture(t, { untrackedScope: true });
  fixture.packageCatalog[0] = { ...fixture.packageCatalog[0], relativePath: undefined };
  const result = await verifyCandidatePublicSurface({ ...fixture, sourceRevision: 'source-revision' });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /public entry baseline missing/i);
});

test('stops archive inspection when candidate.json is structurally invalid', async (t) => {
  const fixture = await candidateFixture(t);
  const candidate = JSON.parse(fs.readFileSync(fixture.candidateFile, 'utf8'));
  candidate.packages[0] = null;
  fs.writeFileSync(fixture.candidateFile, JSON.stringify(candidate));
  const result = await verifyCandidatePublicSurface({ ...fixture, sourceRevision: 'source-revision' });
  assert.equal(result.valid, false);
  assert.equal(result.packages.length, 0);
  assert.match(result.errors.join('\n'), /candidate manifest invalid/i);
});

test('rejects a B installName that disagrees with the release catalog mapping', async (t) => {
  const fixture = await candidateFixture(t, { installName: 'expo-other', untrackedScope: true });
  const result = await verifyCandidatePublicSurface({ ...fixture, sourceRevision: 'source-revision' });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /catalog mapping mismatch/i);
});

test('reports malformed encoded scope pointers instead of throwing', async (t) => {
  const fixture = await candidateFixture(t, { invalidScopePointer: true });
  const result = await verifyCandidatePublicSurface({ ...fixture, sourceRevision: 'source-revision' });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /invalid scope manifest pointer/i);
});

test('accepts the complete release catalog with verified external manifest baselines', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-abc-c-full-candidate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, 'source'), packages = [], runtimePackages = [], sourceFiles = new Map();
  for (const descriptor of RELEASE_PACKAGES) {
    const packageRoot = path.join(root, `package-${packages.length}`);
    fs.mkdirSync(packageRoot);
    const manifest = { name: descriptor.publishName, version: descriptor.publishVersion, main: './index.js' };
    fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify(manifest));
    fs.writeFileSync(path.join(packageRoot, 'index.js'), 'module.exports = {};');
    if (descriptor.relativePath) {
      const sourceManifest = path.join(sourceRoot, descriptor.relativePath, 'package.json');
      fs.mkdirSync(path.dirname(sourceManifest), { recursive: true });
      fs.writeFileSync(sourceManifest, JSON.stringify({ ...manifest, name: descriptor.installName, version: descriptor.upstreamVersion }));
      sourceFiles.set(`${descriptor.relativePath}/package.json`, fs.readFileSync(sourceManifest));
      sourceFiles.set(`${descriptor.relativePath}/index.js`, Buffer.from('module.exports = {};'));
    }
    const file = `package-${packages.length}.tgz`, archive = path.join(root, file);
    await create({ cwd: packageRoot, file: archive, gzip: true, prefix: 'package/' }, ['package.json', 'index.js']);
    const bytes = fs.readFileSync(archive);
    const row = { name: descriptor.publishName, version: descriptor.publishVersion, file, bytes: bytes.length, sha256: sha256(bytes) };
    packages.push(row);
    runtimePackages.push({ ...row, installName: descriptor.installName, members: ['package/index.js', 'package/package.json'] });
  }
  const candidateFile = path.join(root, 'candidate.json');
  fs.writeFileSync(candidateFile, JSON.stringify({ schemaVersion: 1, release: RELEASE_ID, packages, failures: [] }));
  fs.writeFileSync(path.join(root, 'b-candidate.json'), JSON.stringify({
    schemaVersion: 1,
    source: { revision: 'source-revision', dirty: false, changes: [] },
    runtimePackages,
    failures: [],
  }));
  const external = RELEASE_PACKAGES.filter(descriptor => !descriptor.relativePath);
  const result = await verifyCandidatePublicSurface({
    candidateFile,
    scope: { rows: [] },
    sourceRevision: 'source-revision',
    sourceRoot,
    readFrozenSource: relative => sourceFiles.get(relative) ?? null,
    externalManifestBaselines: new Map(external.map(descriptor => [descriptor.installName, {
      entries: [{ pointer: '/main', target: './index.js' }],
      entrySurfaces: { '/main': { names: [], reexports: [], complete: true } },
    }])),
  });
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.packages.length, RELEASE_PACKAGES.length);
});

test('recomputes identical normalized candidate coverage from another absolute directory', async (t) => {
  const fixture = await candidateFixture(t);
  const copiedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-abc-c-candidate-copy-'));
  t.after(() => fs.rmSync(copiedRoot, { recursive: true, force: true }));
  fs.cpSync(fixture.root, copiedRoot, { recursive: true });
  const first = await verifyCandidatePublicSurface({ ...fixture, sourceRevision: 'source-revision' });
  const second = await verifyCandidatePublicSurface({
    ...fixture,
    candidateFile: path.join(copiedRoot, path.basename(fixture.candidateFile)),
    bCandidateFile: path.join(copiedRoot, path.basename(fixture.bCandidateFile)),
    sourceRoot: path.join(copiedRoot, 'source'),
    sourceRevision: 'source-revision',
  });
  const normalize = value => ({ ...value, candidate: value.candidate ? { ...value.candidate, path: '<candidate>' } : null });
  assert.deepEqual(normalize(second), normalize(first));
});

test('external Image baseline rejects bytes that differ from its catalog pin', async t => {
  const { loadExternalManifestBaselines } = await import('../abc/c-public-closure.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-image-baseline-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'inputs'));
  fs.writeFileSync(path.join(root,'inputs/expo-image-3.0.11.tgz'),'not the pinned archive');
  const result = await loadExternalManifestBaselines({sourceRoot:process.cwd(),scopeFile:path.join(root,'public-scope/scope-reviewed.json')});
  assert.equal(result.baselines.has('expo-image'),false);
  assert.ok(result.errors.some(error=>/expo-image\/fixed input bytes differ/.test(error)),result.errors.join('\n'));
});
