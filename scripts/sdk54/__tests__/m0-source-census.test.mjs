import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const moduleUrl = new URL('../m0-source-census.mjs', import.meta.url);
const api = async () => {
  assert.ok(fs.existsSync(moduleUrl), 'source census implementation must exist');
  return import('../m0-source-census.mjs');
};
const sha = text => createHash('sha256').update(text).digest('hex');
const oid = text => createHash('sha1').update(text).digest('hex');

function fixture() {
  const source = { revision: 'fixed-revision', tree: 'fixed-tree' };
  const manifests = [
    ['package.json', { name: 'root', workspaces: ['packages/*', 'packages/a/nested/*', '!packages/excluded'] }],
    ['packages/a/package.json', { name: 'a' }],
    ['packages/a/nested/b/package.json', { name: 'b' }],
    ['packages/excluded/package.json', { name: 'excluded' }],
    ['templates/blank/package.json', { name: 'template-blank', private: true }],
  ].map(([path, value]) => ({ path, blob: oid(path), sha256: sha(JSON.stringify(value)), value }));
  const paths = ['README.md', 'packages/a/src/index.ts', 'packages/a/src/index.d.ts', 'packages/a/__tests__/demo.test.tsx', 'packages/a/android/build.gradle', 'packages/a/assets/icon.png', 'packages/a/nested/b/index.js', 'packages/a/link', 'packages/a/submodule', 'packages/excluded/index.ts', 'templates/blank/app.json', 'tools/no-owner.cjs'];
  const treeEntries = [...manifests.map(row => ({ path: row.path, oid: row.blob, mode: '100644', type: 'blob' })), ...paths.map(path => ({ path, oid: oid(path), mode: path.endsWith('/link') ? '120000' : path.endsWith('/submodule') ? '160000' : '100644', type: path.endsWith('/submodule') ? 'commit' : 'blob' }))];
  const coveredInputs = [{ id: 'INPUT:original-a', path: 'packages/a/src/index.ts', blob: oid('packages/a/src/index.ts'), sha256: sha('a-source'), source: { ...source } }, { id: 'INPUT:absent', path: 'packages/a/absent.ts', blob: oid('absent'), sha256: sha('absent'), source: { ...source } }];
  const publicPackages = manifests.filter(row => !['package.json', 'packages/excluded/package.json'].includes(row.path)).map(row => ({ id: `PKG:${row.value.name}`, name: row.value.name, sourcePath: row.path, manifestBlob: row.blob, manifestSha256: row.sha256 }));
  const capabilities = [{ id: 'CAP:a', ownerPackageId: 'PKG:a' }, { id: 'CAP:b', ownerPackageId: 'PKG:b' }];
  return { source, treeEntries, manifests, coveredInputs, publicPackages, capabilities };
}

test('discovers owners from root globs and template tree rather than supplied public package rows', async () => {
  const { buildSourceCensus } = await api(), result = buildSourceCensus(fixture());
  assert.deepEqual(result.owners.map(row => [row.root, row.name, row.kind]), [['packages/a', 'a', 'WORKSPACE'], ['packages/a/nested/b', 'b', 'WORKSPACE'], ['templates/blank', 'template-blank', 'TEMPLATE']]);
  assert.equal(result.files.length, 17);
  assert.equal(result.files.find(row => row.path === 'packages/a/nested/b/index.js').ownerId, 'SOURCE-OWNER:packages%2Fa%2Fnested%2Fb');
  assert.equal(result.files.find(row => row.path === 'packages/excluded/index.ts').ownerId, null);
  assert.equal(result.files.find(row => row.path === 'tools/no-owner.cjs').ownershipStatus, 'OUTSIDE_DISCOVERED_OWNERS_REQUIRES_REVIEW');
});

test('content-read proof, tree-only identity and original input IDs remain distinct', async () => {
  const { buildSourceCensus } = await api(), input = fixture(), result = buildSourceCensus(input);
  const file = result.files.find(row => row.path === 'packages/a/src/index.ts');
  assert.equal(file.contentStatus, 'READ_AND_HASH_VERIFIED');
  assert.equal(file.sha256, sha('a-source'));
  assert.deepEqual(file.inputRefs, input.coveredInputs.slice(0, 1));
  assert.equal(result.files.find(row => row.path === 'packages/a/package.json').contentStatus, 'READ_AND_HASH_VERIFIED');
  for (const path of ['packages/a/src/index.d.ts', 'packages/a/link', 'packages/a/submodule']) {
    const row = result.files.find(row => row.path === path);
    assert.equal(row.contentStatus, 'GIT_TREE_OID_ONLY');
    assert.equal(row.sha256, null);
  }
  assert.equal(result.unmatchedInputs[0].inputId, 'INPUT:absent');
  assert.equal(result.unmatchedInputs[0].reason, 'PATH_NOT_IN_FIXED_TREE');
  assert.equal(result.metadata.readAndHashVerified, 6);
  assert.equal(result.metadata.gitTreeOidOnly, 11);
});

test('path roles can overlap but never close owner semantic categories or claim file capability evidence', async () => {
  const { buildSourceCensus } = await api(), result = buildSourceCensus(fixture());
  assert.deepEqual(result.files.find(row => row.path.endsWith('demo.test.tsx')).roles, ['JAVASCRIPT_TYPESCRIPT', 'TEST_DOCUMENTATION']);
  assert.deepEqual(result.files.find(row => row.path.endsWith('index.d.ts')).roles, ['DECLARATION', 'JAVASCRIPT_TYPESCRIPT']);
  assert.deepEqual(result.files.find(row => row.path.endsWith('build.gradle')).roles, ['BUILD_INSTALL', 'NATIVE', 'PLATFORM_CONFIGURATION']);
  assert.deepEqual(result.files.find(row => row.path.endsWith('icon.png')).roles, ['RESOURCE']);
  assert.deepEqual(result.files.find(row => row.path === 'packages/a/src/index.ts').capabilityIds, ['CAP:a']);
  assert.equal(result.files.find(row => row.path === 'packages/a/src/index.ts').capabilityRelation, 'OWNER_ASSOCIATION_ONLY');
  assert.equal(result.categoryGaps.length, result.owners.length * 18);
  assert.ok(result.categoryGaps.every(row => row.status === 'SEMANTIC_REVIEW_REQUIRED' && row.semanticCoverageProven === false));
  assert.equal(result.metadata.publicSemanticCoverageProven, false);
});

test('workspace object declaration, brace, extglob and exclusions use standard POSIX glob matching', async () => {
  const { buildSourceCensus } = await api(), input = fixture();
  input.manifests[0].value.workspaces = { packages: ['{packages,modules}/@(a|excluded)', 'packages/a/nested/*', '!packages/excluded'] };
  const result = buildSourceCensus(input);
  assert.equal(result.owners.length, 3);
  assert.equal(result.owners.find(row => row.name === 'a').root, 'packages/a');
});

test('missing candidate manifests cannot silently erase independently discoverable owners', async () => {
  const { buildSourceCensus } = await api();
  for (const path of ['package.json', 'packages/a/package.json', 'packages/a/nested/b/package.json', 'templates/blank/package.json']) {
    const input = fixture(); input.manifests = input.manifests.filter(row => row.path !== path);
    assert.throws(() => buildSourceCensus(input), /manifest/i, path);
  }
});

test('public package identity set is checked in both directions and rejects wrong roots or hashes', async () => {
  const { buildSourceCensus } = await api();
  for (const mutate of [r => r.publicPackages.pop(), r => r.publicPackages.push({ id: 'PKG:extra', name: 'extra', sourcePath: 'ghost/package.json' }), r => { r.publicPackages[0].name = 'forged'; }, r => { r.publicPackages[0].sourcePath = 'packages/excluded/package.json'; }, r => { r.publicPackages[0].manifestBlob = oid('wrong'); }, r => { r.publicPackages[0].manifestSha256 = sha('wrong'); }]) {
    const input = fixture(); mutate(input); assert.throws(() => buildSourceCensus(input), /public|package|manifest/i);
  }
});

test('conflicting blob, sha256, fixed source and forged symlink/gitlink reads are rejected by input path', async () => {
  const { buildSourceCensus } = await api();
  for (const mutate of [r => { r.coveredInputs[0].blob = oid('wrong'); }, r => { r.coveredInputs[0].sha256 = 'invalid'; }, r => { r.coveredInputs[0].source.tree = 'wrong'; }, r => { r.coveredInputs[0].source.revision = 'wrong'; }, r => { delete r.coveredInputs[0].blob; }, r => { delete r.coveredInputs[0].sha256; }, r => { r.coveredInputs[0].path = 'packages/a/link'; r.coveredInputs[0].blob = oid('packages/a/link'); }, r => { r.coveredInputs[0].path = 'packages/a/submodule'; r.coveredInputs[0].blob = oid('packages/a/submodule'); }, r => { r.coveredInputs.push({ ...r.coveredInputs[0], id: 'INPUT:conflict', sha256: sha('different') }); }, r => { r.coveredInputs.push({ id: 'INPUT:manifest-conflict', path: r.manifests[1].path, blob: r.manifests[1].blob, sha256: sha('different') }); }]) {
    const input = fixture(); mutate(input); assert.throws(() => buildSourceCensus(input), /input|source|blob|sha256|read/i);
  }
});

test('unmatched input paths still reject conflicting blob identities with the same sha256', async () => {
  const { buildSourceCensus } = await api(), input = fixture();
  input.coveredInputs.push({ ...input.coveredInputs[1], id: 'INPUT:conflicting-missing-blob', blob: oid('different-absent') });
  assert.throws(() => buildSourceCensus(input), /input.*blob.*packages\/a\/absent.ts/i);
});

test('supplemental fixed reads establish content proof without inventing existing analysis input refs', async () => {
  const { buildSourceCensus } = await api(), input = fixture();
  const read = { path: 'packages/a/src/index.d.ts', blob: oid('packages/a/src/index.d.ts'), sha256: sha('supplemental-types'), source: { ...input.source } };
  input.supplementalReads = [read];
  const result = buildSourceCensus(input), row = result.files.find(row => row.path === read.path);
  assert.equal(row.contentStatus, 'READ_AND_HASH_VERIFIED');
  assert.equal(row.sha256, read.sha256);
  assert.deepEqual(row.inputRefs, []);
  assert.deepEqual(row.supplementalRefs, [read]);
  assert.equal(result.metadata.readAndHashVerified, 7);
  assert.equal(result.metadata.matchedInputCount, 1);
  assert.equal(result.metadata.supplementalReadCount, 1);
  assert.equal(result.metadata.gitTreeOidOnly, 10);
  for (const mutate of [r => { r.supplementalReads[0].blob = oid('wrong'); }, r => { r.supplementalReads[0].sha256 = 'wrong'; }, r => { r.supplementalReads[0].source.tree = 'wrong'; }, r => { r.supplementalReads[0].path = 'missing.ts'; }, r => r.supplementalReads.push(r.supplementalReads[0]), r => { r.supplementalReads[0] = { ...r.coveredInputs[0], sha256: sha('conflicting') }; }]) {
    const bad = structuredClone(input); mutate(bad); assert.throws(() => buildSourceCensus(bad), /supplemental|blob|sha256|source|input/i);
  }
});

test('tree, manifest, package and capability identities must be unique and valid', async () => {
  const { buildSourceCensus } = await api();
  for (const mutate of [r => r.treeEntries.push(r.treeEntries[0]), r => r.manifests.push(r.manifests[0]), r => { r.manifests[2].value.name = 'a'; }, r => r.coveredInputs.push(r.coveredInputs[0]), r => r.publicPackages.push(r.publicPackages[0]), r => r.capabilities.push(r.capabilities[0]), r => { r.capabilities[0].ownerPackageId = 'PKG:missing'; }, r => { r.manifests[1].blob = oid('wrong'); }, r => { r.treeEntries[0].path = '../escape'; }, r => { r.treeEntries[0].mode = '100600'; }, r => { r.treeEntries[0].type = 'tree'; }, r => { r.manifests[0].value.workspaces = ['../*']; }, r => { r.manifests[0].value.workspaces = ['!packages/*']; }, r => { delete r.source.tree; }]) {
    const input = fixture(); mutate(input); assert.throws(() => buildSourceCensus(input));
  }
});

test('deterministic IDs and serialized bytes survive reordered inputs without mutating them', async () => {
  const { buildSourceCensus, serializeSourceCensus } = await api(), input = fixture(), original = structuredClone(input);
  const first = buildSourceCensus(input);
  assert.deepEqual(input, original);
  for (const key of ['treeEntries', 'manifests', 'coveredInputs', 'publicPackages', 'capabilities']) input[key].reverse();
  assert.equal(serializeSourceCensus(buildSourceCensus(input)), serializeSourceCensus(first));
  assert.equal(first.files.find(row => row.path === 'packages/a/src/index.ts').id, 'SOURCE-FILE:packages%2Fa%2Fsrc%2Findex.ts');
  assert.equal(serializeSourceCensus(first).endsWith('\n'), true);
});

test('validator reports removed files, fake read coverage, missing owners, metadata and unknown fields with path', async () => {
  const { buildSourceCensus, validateSourceCensus } = await api(), expected = buildSourceCensus(fixture());
  assert.deepEqual(validateSourceCensus(expected, expected), { valid: true, failures: [] });
  for (const mutate of [r => { r.files = r.files.filter(row => row.path !== 'packages/a/src/index.ts'); }, r => { r.files.find(row => row.path === 'packages/a/src/index.ts').sha256 = sha('fake'); }, r => { r.owners = r.owners.filter(row => row.root !== 'packages/a'); }, r => { r.files.find(row => row.path === 'packages/a/src/index.ts').extra = true; }]) {
    const actual = structuredClone(expected); mutate(actual);
    const check = validateSourceCensus(actual, expected);
    assert.equal(check.valid, false);
    assert.match(check.failures.join('\n'), /packages\/a/);
  }
  for (const mutate of [r => { r.metadata.readAndHashVerified++; }, r => { r.metadata.extra = true; }, r => { r.source.tree = 'forged'; }, r => { r.extra = true; }, r => { r.categoryGaps.pop(); }, r => { r.unmatchedInputs.pop(); }, r => { r.files.push(r.files[0]); }]) {
    const actual = structuredClone(expected); mutate(actual); assert.equal(validateSourceCensus(actual, expected).valid, false);
  }
  expected.metadata.inputEvidence = [{ path: 'sealed.json', sha256: sha('sealed') }];
  const actual = structuredClone(expected); actual.metadata.inputEvidence[0].sha256 = sha('fake');
  assert.match(validateSourceCensus(actual, expected).failures.join('\n'), /metadata/);
});
