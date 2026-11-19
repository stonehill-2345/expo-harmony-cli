import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { readSourceTree, readSourceBlobs } from '../source-inventory.mjs';

const subject = await import('../m0-scope-decisions.mjs').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND' || !error.message.includes('m0-scope-decisions.mjs')) throw error;
  return null;
});
const sourceDir = process.env.SDK54_SCOPE_SOURCE_DIR ?? '/tmp/sdk54-expo-source';
const revision = '5b42e3d21e0ac5e086752361ca8a5cb4de53bec1';
const digest = value => createHash('sha256').update(value).digest('hex');
const surfaceFile = 'outputs/sdk54/ai-e2e/20261027-m0-export-patterns/public-surface.json';
function integrationUnavailable() {
  const required = [
    'outputs/sdk54/ai-e2e/20261023-m0-entry-template/seed-range-facts.json',
    'outputs/sdk54/ai-e2e/20261023-m0-source-closure/external-seed-results.json',
    'outputs/sdk54/ai-e2e/20261027-m0-export-patterns/remaining-work.json', surfaceFile,
  ];
  if (required.some(file => !fs.existsSync(file))) return 'fixed local evidence is not available';
  const external = JSON.parse(fs.readFileSync(required[1]));
  if (external.seeds.some(seed => !fs.existsSync(seed.metadata.path) || !fs.existsSync(seed.metadata.receiptPath))) return 'fixed publisher metadata or receipt is not available';
  const index = JSON.parse(fs.readFileSync(surfaceFile));
  if (index.tables.entries.shards.some(shard => !fs.existsSync(surfaceFile + '.parts/' + shard.path))) return 'fixed public entry shards are not available';
  try { readSourceTree(sourceDir, revision); } catch { return 'fixed local Git source cache is not available'; }
  return false;
}
const integrationSkip = integrationUnavailable();
let base;
function fixture() {
  if (!base) {
    const inputs = subject.loadScopeDecisionInputs({ sourceDir });
    const fixed = readSourceTree(sourceDir, revision);
    const files = new Map([...readSourceBlobs(sourceDir, fixed.entries.filter(row => inputs.gitFiles.includes(row.path)))].map(([file, bytes]) => [file, String(bytes)]));
    const file = surfaceFile;
    const index = JSON.parse(fs.readFileSync(file));
    const entries = index.tables.entries.shards.flatMap(shard => {
      const bytes = fs.readFileSync(file + '.parts/' + shard.path);
      assert.equal(digest(bytes), shard.sha256);
      return JSON.parse(gunzipSync(bytes));
    });
    base = { source: { revision, tree: fixed.tree }, treeEntries: fixed.entries, files, entryLedger: { entries }, inputs };
  }
  return structuredClone(base);
}
const scopeTest = (name, callback) => test('fixed local integration: ' + name, { skip: !subject || integrationSkip }, callback);

test('scope decisions expose fixed input loader and independent decision builder', () => {
  assert.equal(typeof subject?.loadScopeDecisionInputs, 'function');
  assert.equal(typeof subject?.buildScopeDecisions, 'function');
});

scopeTest('real fixed input closes 13 scope decisions while all 13 historical identities stay unknown', () => {
  const args = fixture(), original = structuredClone(args.entryLedger);
  const result = subject.buildScopeDecisions(args);
  assert.equal(result.policy, 'fixed-v1');
  assert.equal(result.seeds.length, 13);
  assert.equal(result.summary.scopeDecisionsComplete, 13);
  assert.equal(result.summary.pendingScopeDecisions, 0);
  assert.equal(result.summary.historicalSeedIdentitiesClosed, 0);
  assert.equal(result.summary.pendingSeedIdentityDecisions, 13);
  for (const seed of result.seeds) {
    assert.equal(seed.id, 'SEED:' + seed.name);
    assert.equal(seed.originalFacts.name, seed.name);
    assert.equal(seed.scopeDecision.status, 'DECIDED');
    assert.equal(seed.historicalIdentity.status, 'NOT_VERIFIED');
    assert.equal(seed.runtime.status, 'NOT_VERIFIED');
    assert.ok(seed.lifecycle.status);
    assert.ok(seed.sourceCompleteness.remaining.length);
  }
  assert.deepEqual(args.entryLedger, original);
  assert.equal(JSON.stringify(subject.buildScopeDecisions(args)), JSON.stringify(result));
  assert.equal(JSON.stringify(subject.buildScopeDecisions({ ...args, treeEntries: [...args.treeEntries].reverse() })), JSON.stringify(result));
});

scopeTest('six real blocked entries retain targets and distinguish five probes from one explicit main gap', () => {
  const args = fixture(), result = subject.buildScopeDecisions(args);
  assert.equal(result.entries.length, 6);
  assert.equal(result.summary.defaultResolutionProbes, 5);
  assert.equal(result.summary.declaredMainTargetGaps, 1);
  for (const row of result.entries) {
    const old = args.entryLedger.entries.find(entry => entry.id === row.id);
    assert.deepEqual(row.target, old.target);
    assert.equal(row.target.status, 'BLOCKED');
    assert.equal(row.obligation.kind, old.condition === '/main' ? 'DECLARED_MAIN_TARGET_GAP' : 'DEFAULT_RESOLUTION_PROBE');
    assert.equal(row.obligation.policy.manifest.blob, old.source.blob);
    assert.equal(row.obligation.absenceEvidence.method, 'COMPLETE_FIXED_TREE_PATH_SET');
    assert.equal(row.obligation.absenceEvidence.treePathCount, args.treeEntries.length);
    assert.ok(row.obligation.evidence.length);
  }
});

scopeTest('migration is explicit publisher guidance and never an inferred rename', () => {
  const result = subject.buildScopeDecisions(fixture());
  assert.equal(result.seeds.find(row => row.name === 'expo-app-auth').lifecycle.migration.package, 'expo-auth-session');
  assert.equal(result.seeds.find(row => row.name === '@react-native-community/viewpager').lifecycle.migration.package, 'react-native-pager-view');
  assert.equal(result.seeds.find(row => row.name === 'sentry-expo').lifecycle.migration, null);
  assert.ok(result.seeds.every(row => row.lifecycle.rename === 'NOT_ESTABLISHED'));
});

scopeTest('RSDW retains bundle, lock mismatch, consumer and publisher peer conflicts and security deprecation', () => {
  const result = subject.buildScopeDecisions(fixture());
  const row = result.seeds.find(seed => seed.name === 'react-server-dom-webpack');
  assert.equal(row.originalFacts.fixedBundleSpec, '~19.1.4');
  assert.equal(row.originalFacts.baselineIdentityStatus, 'LOCK_RANGE_MISMATCH');
  assert.equal(row.scopeDecision.disposition, 'RETAIN_FIXED_BUNDLE_RANGE_WITH_UNRESOLVED_COMPATIBILITY');
  assert.equal(row.scopeDecision.compatibility.baselineUpgradeAccepted, false);
  assert.ok(row.scopeDecision.compatibility.consumerPeerConflicts.length >= 2);
  assert.match(row.lifecycle.deprecated, /Security Vulnerability/);
  assert.equal(row.scopeDecision.compatibility.publisherPeerDependencies.react, '^19.1.4');
});

scopeTest('target-only Harmony identity stays separate from upstream fixed bundle scope', () => {
  const row = subject.buildScopeDecisions(fixture()).seeds.find(seed => seed.name === '@react-native-oh/react-native-harmony');
  assert.equal(row.scopeDecision.disposition, 'HARMONY_TARGET_ONLY_SEPARATE_FROM_UPSTREAM_BASELINE');
  assert.equal(row.originalFacts.fixedBundleSpec, null);
});

for (const [name, mutate, expected] of [
  ['revision', args => { args.source.revision = '0'.repeat(40); }, /revision/],
  ['tree', args => { args.source.tree = '0'.repeat(40); }, /tree/],
  ['partial tree', args => { args.treeEntries.pop(); }, /complete fixed tree/i],
  ['invented tree target', args => { args.treeEntries.push({ path: 'packages/expo-env-info/index.js', type: 'blob', mode: '100644', oid: '0'.repeat(40) }); }, /complete fixed tree/i],
  ['manifest bytes', args => { args.files.set('packages/expo-env-info/package.json', '{"name":"expo-env-info","main":"index.js"}'); }, /blob integrity/i],
  ['manifest missing from selective files', args => { args.files.delete('packages/expo-dev-launcher/package.json'); }, /source text/i],
  ['identity metadata', args => { args.inputs.publisherMetadata[0].metadata.name = 'forged-name'; }, /metadata|input/i],
  ['facts range', args => { args.inputs.facts.records.find(row => row.name === 'react-server-dom-webpack').fixedBundleSpec = '~19.1.5'; }, /input|facts/i],
  ['forged historical closure', args => { args.inputs.externalResults.summary.historicalSeedIdentitiesClosed = 13; }, /input|historical/i],
  ['receipt bytes', args => { const row = args.inputs.documents.find(row => row.kind === 'publisher-receipt'); row.text = row.text.replace('2026-', '2025-'); }, /receipt|hash/i],
  ['metadata bytes', args => { const row = args.inputs.documents.find(row => row.kind === 'publisher-metadata'); row.text += ' '; }, /metadata|hash/i],
  ['input evidence', args => { args.inputs.evidence[0].sha256 = '0'.repeat(64); }, /evidence|input/i],
  ['entry target', args => { args.entryLedger.entries.find(row => row.request === 'expo-env-info' && row.condition === '/implicit-index').target.status = 'SOURCE'; }, /entry.*target|blocked/i],
  ['entry deletion', args => { args.entryLedger.entries = args.entryLedger.entries.filter(row => row.request !== 'expo-env-info'); }, /entry|missing/i],
]) scopeTest('rejects mutated ' + name, () => {
  const args = fixture(); mutate(args);
  assert.throws(() => subject.buildScopeDecisions(args), expected);
});

test('input loader rejects any source directory without the fixed local revision', { skip: !subject }, () => {
  assert.throws(() => subject.loadScopeDecisionInputs({ sourceDir: '/tmp' }), /Git|revision|repository/i);
});
