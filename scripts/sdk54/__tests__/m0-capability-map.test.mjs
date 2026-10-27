import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const moduleUrl = new URL('../m0-capability-map.mjs', import.meta.url);
const api = async () => {
  assert.ok(fs.existsSync(moduleUrl), 'capability map implementation must exist');
  return import('../m0-capability-map.mjs');
};
const source = { revision: 'fixed', tree: 'tree' };
function fixture() {
  const pkg = name => ({ id: `PKG:${name}`, name, sourcePath: `${name}/package.json`, manifestSha256: 'a'.repeat(64), dependencies: {} });
  const packages = ['a', 'b', 'expo-updates', 'expo-dev-client', 'expo-auth-session', 'expo-dev-menu'].map(pkg);
  packages[0].dependencies = { dependencies: { b: { spec: '*', targetId: 'PKG:b' }, external: { spec: '^1', targetId: null } }, devDependencies: { b: { spec: 'workspace:*', targetId: 'PKG:b' } } };
  const entries = packages.map(row => ({ id: `ENTRY:${row.name}`, packageId: row.id, source: { path: row.sourcePath }, target: { moduleId: `MODULE:${row.name}` } }));
  const surface = { source, packages, entries, exports: [
    { id: 'EX:a', moduleId: 'MODULE:a', entryIds: ['ENTRY:a'], typeId: 'T:root' },
    { id: 'EX:b', moduleId: 'MODULE:b', entryIds: ['ENTRY:b'], typeId: 'T:root' },
    { id: 'EX:pending', moduleId: 'MODULE:a', entryIds: [], typeId: 'T:pending', disposition: 'CONSERVATIVE_MODULE_CANDIDATE' },
  ], types: ['root', 'nested', 'param', 'pending', 'option'].map(name => ({ id: `T:${name}`, declarationIds: ['DECL:x'], boundaries: name === 'param' ? ['unconstrained-any'] : [] })),
    members: [{ id: 'M:root', ownerTypeId: 'T:root', typeId: 'T:nested' }, { id: 'M:deep', ownerTypeId: 'T:nested', parameterIds: ['M:param'] }, { id: 'M:param', ownerTypeId: 'T:nested', typeId: 'T:param' }],
    typeEdges: [{ id: 'EDGE:1', fromTypeId: 'T:root', toTypeId: 'T:nested' }, { id: 'EDGE:2', fromTypeId: 'T:nested', toTypeId: 'T:param' }, { id: 'EDGE:3', fromTypeId: 'T:param', toTypeId: 'T:root' }],
    plugins: [{ id: 'PLUGIN:a', packageId: 'PKG:a', optionsTypeId: 'T:option', status: 'NOT_EVALUATED' }],
    candidateDispositions: [{ id: 'CAND:a', moduleId: 'MODULE:a', packageId: 'PKG:a', disposition: 'CONSERVATIVE_MODULE_CANDIDATE' }],
    modules: packages.map(row => ({ id: `MODULE:${row.name}`, packageId: row.id })), declarations: [{ id: 'DECL:x', path: 'external/x.d.ts', sha256: 'b'.repeat(64), sourceStatus: 'HASH_VERIFIED' }], boundaries: [{ id: 'BOUND:a', packageId: 'PKG:a', kind: 'source-not-proven', source: { path: 'a/index.ts' } }] };
  const seedFacts = { source, records: packages.map(row => ({ id: `SEED:${row.name}`, name: row.name, sourceId: row.id, category: 'SOURCE_ONLY_ADDITION', sourcePath: row.sourcePath, existingPreassignment: { batch: 'M7.6' } })), templatesOutside183RowSeedDiff: [{ id: 'TEMPLATE:x', name: 'x', sourcePath: 'templates/x/package.json' }], deferredAssociationEvidence: [{ name: 'expo-dev-menu', scopeId: 'DEFER-DEV-CLIENT' }], remaining: { unresolvedIdentityOrFixedRange: [] } };
  return { surface, seedFacts };
}

test('six tables cover deep cyclic members, owners, options and preserve independent states', async () => {
  const { buildCapabilityMap } = await api(), input = fixture(), result = buildCapabilityMap(input);
  for (const table of ['capabilities', 'memberships', 'dependencies', 'seedDecisions', 'analysisImpacts', 'sharedUseReviews']) assert.ok(Array.isArray(result[table]));
  assert.equal(result.memberships.length, ['packages', 'entries', 'exports', 'types', 'members', 'plugins', 'candidateDispositions'].reduce((n, key) => n + input.surface[key].length, 0));
  const member = result.memberships.find(row => row.recordId === 'M:deep');
  assert.equal(member.classification, 'PUBLIC_REACHABLE');
  assert.deepEqual(member.ownerPackageIds, ['PKG:a', 'PKG:b']);
  assert.equal(member.capabilityIds.length, 2);
  assert.equal(result.memberships.find(row => row.recordId === 'T:option').classification, 'PUBLIC_REVIEW_PENDING');
  assert.equal(result.memberships.find(row => row.recordId === 'EX:pending').classification, 'PUBLIC_REVIEW_PENDING');
  for (const [name, state, scopeId] of [['expo-updates', 'DEFERRED', 'DEFER-UPDATES'], ['expo-dev-client', 'DEFERRED', 'DEFER-DEV-CLIENT'], ['expo-auth-session', 'REQUIRED', null], ['expo-dev-menu', 'REQUIRES_REVIEW', null]]) {
    const cap = result.capabilities.find(row => row.ownerPackageId === `PKG:${name}`);
    assert.deepEqual(cap.scope, { state, scopeId });
    assert.equal(cap.implementationStatus, 'NOT_ASSESSED');
    assert.notEqual(cap.applicability, 'NOT_APPLICABLE');
  }
  assert.equal(result.dependencies.length, 3);
  assert.equal(result.dependencies.find(row => row.name === 'external').identityStatus, 'UNRESOLVED_EXTERNAL_IDENTITY');
  assert.equal(result.seedDecisions.length, 7);
  assert.ok(result.analysisImpacts.some(row => row.recordId === 'T:param' && row.capabilityIds.length === 2));
  assert.ok(result.remaining.length > 0);
});

test('shared entry review validates ownership, evidence and scope whitelist', async () => {
  const { buildCapabilityMap } = await api(), input = fixture();
  input.sharedReview = { schemaVersion: 1, source, packages: [{ id: 'REVIEW:menu', packageId: 'PKG:expo-dev-menu', name: 'expo-dev-menu', sourceRefs: [{ path: 'expo-dev-menu/index.ts' }], entryDecisions: [{ entryId: 'ENTRY:expo-dev-menu', scope: { state: 'REQUIRED', scopeId: null }, reason: 'ordinary debug', sourceRefs: [{ path: 'expo-dev-menu/index.ts' }] }], unresolvedUses: [], conclusion: 'entry reviewed' }], inputs: [] };
  assert.equal(buildCapabilityMap(input).capabilities.find(row => row.ownerPackageId === 'PKG:expo-dev-menu').scope.state, 'REQUIRED');
  for (const mutate of [row => { row.entryId = 'ENTRY:a'; }, row => { row.sourceRefs = []; }, row => { row.scope = { state: 'DEFERRED', scopeId: 'DEFER-AUTH' }; }]) {
    const bad = structuredClone(input); mutate(bad.sharedReview.packages[0].entryDecisions[0]); assert.throws(() => buildCapabilityMap(bad), /review|scope|evidence|entry/i);
  }
});

test('seed IDs and original facts, plugin contract IDs and hashes survive', async () => {
  const { buildCapabilityMap } = await api(), input = fixture();
  input.pluginContracts = { source, pluginTypeContracts: { coverage: [{ id: 'PLUGIN:a', optionsTypeIds: ['OTHER-GRAPH-TYPE'], status: 'MAPPED', source: { path: 'a/plugin.ts' } }] }, router: { consumers: [{ id: 'ROUTER:x', source: { path: 'a/router.ts' } }] } };
  const result = buildCapabilityMap(input), seed = result.seedDecisions.find(row => row.recordId === 'SEED:a');
  assert.deepEqual(seed.originalRecord, input.seedFacts.records[0]);
  assert.equal(seed.recordSha256.length, 64);
  assert.ok(result.analysisImpacts.some(row => row.recordId === 'PLUGIN:a' && row.kind === 'PLUGIN_SPECIALIST_CONTRACT' && row.recordSha256.length === 64));
  assert.ok(result.analysisImpacts.some(row => row.recordId === 'ROUTER:x'));
});

test('prior scope decisions retain the original identity and unresolved historical acceptance', async () => {
  const { buildCapabilityMap } = await api(), input = fixture();
  const prior = { id: 'SEED:a', scopeDecision: { status: 'DECIDED' }, historicalIdentity: { status: 'NOT_VERIFIED', closed: false } };
  input.surface.scopeDecisions = { seeds: [prior] };
  const row = buildCapabilityMap(input).seedDecisions.find(record => record.recordId === 'SEED:a');
  assert.deepEqual(row.originalScopeDecision.originalRecord, prior); assert.equal(row.originalScopeDecision.recordSha256.length, 64);
  assert.notEqual(row.historicalIdentity, 'VERIFIED');
});

test('validator rejects removed member, scope, source, seed, dependency and metadata with record location', async () => {
  const { buildCapabilityMap, validateCapabilityMap } = await api(), expected = buildCapabilityMap(fixture());
  assert.deepEqual(validateCapabilityMap(expected, expected), { valid: true, failures: [] });
  for (const mutate of [r => r.memberships.splice(r.memberships.findIndex(row => row.recordId === 'M:deep'), 1), r => { delete r.capabilities[0].scope; }, r => { r.memberships.find(row => row.sourceRefs.length).sourceRefs = []; }, r => r.seedDecisions.pop(), r => r.dependencies.pop(), r => { r.policy = 'forged'; }, r => { r.capabilities[0].dependencyIds.push('missing'); }]) {
    const bad = structuredClone(expected); mutate(bad); const check = validateCapabilityMap(bad, expected); assert.equal(check.valid, false); assert.ok(check.failures.some(value => /Missing|Changed|Dangling|metadata/.test(value)));
  }
  const bad = structuredClone(expected); bad.memberships = bad.memberships.filter(row => row.recordId !== 'T:nested');
  assert.match(validateCapabilityMap(bad, expected).failures.join('\n'), /T:nested.*external\/x.d.ts/);
});

test('reject missing source, duplicate original ID and dangling workspace dependency', async () => {
  const { buildCapabilityMap } = await api();
  for (const mutate of [r => { delete r.surface.source; }, r => r.surface.members.push(r.surface.members[0]), r => { r.surface.packages[0].dependencies.dependencies.b.targetId = 'PKG:absent'; }]) {
    const input = fixture(); mutate(input); assert.throws(() => buildCapabilityMap(input), /source|identity|dependency/i);
  }
});

test('reject original type member/edge/root loss rather than silently shrinking membership', async () => {
  const { buildCapabilityMap } = await api();
  for (const kind of ['member', 'edge', 'root']) {
    const input = fixture(); input.surface.types[0].memberIds = ['M:root']; input.surface.types[0].edgeIds = ['EDGE:1'];
    if (kind === 'member') input.surface.members = input.surface.members.filter(row => row.id !== 'M:root');
    if (kind === 'edge') input.surface.typeEdges = input.surface.typeEdges.filter(row => row.id !== 'EDGE:1');
    if (kind === 'root') input.surface.exports[0].typeId = 'T:missing';
    assert.throws(() => buildCapabilityMap(input), /Dangling|Missing/);
  }
});

test('external unavailable declaration impacts every consuming owner capability', async () => {
  const { buildCapabilityMap } = await api(), input = fixture();
  input.surface.declarations[0].sourceStatus = 'SOURCE_UNAVAILABLE';
  const result = buildCapabilityMap(input), impact = result.analysisImpacts.find(row => row.table === 'declarations' && row.recordId === 'DECL:x');
  assert.deepEqual(impact.capabilityIds.map(id => result.capabilities.find(row => row.id === id).ownerPackageId).sort(), ['PKG:a', 'PKG:b']);
});

test('evaluated internal plugin candidates do not prove public option reachability', async () => {
  const { buildCapabilityMap } = await api(), input = fixture();
  input.surface.plugins[0].status = 'EVALUATED';
  const result = buildCapabilityMap(input);
  for (const id of ['PLUGIN:a', 'T:option']) assert.equal(result.memberships.find(row => row.recordId === id).classification, 'PUBLIC_REVIEW_PENDING');
  input.surface.exports[0].typeId = 'T:option';
  assert.equal(buildCapabilityMap(input).memberships.find(row => row.recordId === 'T:option').classification, 'PUBLIC_REACHABLE');
});

test('reject dangling entry package, export entry and ownerless plugin option roots', async () => {
  const { buildCapabilityMap } = await api();
  for (const mutate of [r => { r.surface.entries[0].packageId = 'PKG:missing'; }, r => { r.surface.exports[0].entryIds = ['ENTRY:missing']; }, r => { r.surface.plugins[0] = { id: 'PLUGIN:unknown', optionsTypeId: 'T:missing' }; }]) {
    const input = fixture(); mutate(input); assert.throws(() => buildCapabilityMap(input), /Dangling/);
  }
});

test('deterministic sharded roundtrip rejects path, count, hash and duplicate identity tampering', async () => {
  const { buildCapabilityMap, writeCapabilityMap, readCapabilityMap } = await api(), result = buildCapabilityMap(fixture()), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capability-map-'));
  try {
    const first = path.join(dir, 'a.json'), second = path.join(dir, 'b.json');
    writeCapabilityMap(first, result, { recordsPerShard: 2 }); writeCapabilityMap(second, result, { recordsPerShard: 2 });
    assert.equal(fs.readFileSync(first, 'utf8'), fs.readFileSync(second, 'utf8')); assert.deepEqual(readCapabilityMap(first), result);
    const original = fs.readFileSync(first, 'utf8');
    for (const mutate of [j => { j.tables.memberships.shards[0].path = '../evil.gz'; }, j => { j.tables.memberships.count++; }, j => { j.tables.memberships.shards[0].sha256 = '0'.repeat(64); }]) {
      const index = JSON.parse(original); mutate(index); fs.writeFileSync(first, JSON.stringify(index)); assert.throws(() => readCapabilityMap(first));
    }
    const index = JSON.parse(original), rows = [result.memberships[0], result.memberships[0]], bytes = gzipSync(JSON.stringify(rows)), digest = createHash('sha256').update(bytes).digest('hex');
    fs.writeFileSync(path.join(first + '.parts', digest + '.json.gz'), bytes); index.tables.memberships = { count: 2, shards: [{ path: digest + '.json.gz', sha256: digest, count: 2, firstId: rows[0].id, lastId: rows[1].id }] }; fs.writeFileSync(first, JSON.stringify(index)); assert.throws(() => readCapabilityMap(first), /identity|order/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
