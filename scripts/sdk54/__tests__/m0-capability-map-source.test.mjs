import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as api from '../m0-capability-map-source.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const source = { revision: '5b42e3d21e0ac5e086752361ca8a5cb4de53bec1', tree: '5457e824b21d968e55c8f533cdf1751860160a92' };
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-capability-source-'));
  const surfaceFile = path.join(directory, 'surface.json'), seedFile = path.join(directory, 'seeds.json');
  fs.writeFileSync(surfaceFile, '{"fixture":"surface"}');
  fs.writeFileSync(seedFile, JSON.stringify({ source, records: [{ id: 'SEED:demo' }] }));
  const surface = { source, sourceEvidence: { files: [{ path: 'packages/demo/index.ts', sha256: sha('fixed'), origin: 'fixed-git-blob' }] } };
  let reads = 0;
  const readers = { expectedHashes: { surface: sha(fs.readFileSync(surfaceFile)), seeds: sha(fs.readFileSync(seedFile)), pluginContracts: sha('{}') },
    readPublicSurface: () => { reads++; return surface; },
    buildCapabilityMap: () => ({ schemaVersion: 1, source, policy: 'fixture', metadata: { acceptance: { stageClosable: false }, counts: { capabilities: 1, memberships: 1, dependencies: 0, seedDecisions: 0, analysisImpacts: 0, sharedUseReviews: 0 } }, remaining: [],
      capabilities: [{ id: 'CAP:demo', sourceRefs: [{ path: 'packages/demo/index.ts', sha256: sha('fixed') }] }],
      memberships: [{ id: 'MEMBERSHIP:demo', recordId: 'member:deep' }], dependencies: [], seedDecisions: [], analysisImpacts: [], sharedUseReviews: [] }),
    summarizeCapabilityMap: value => ({ memberships: value.memberships.length }),
  };
  return { directory, surface, surfaceFile, seedFile, readers, reads: () => reads, options: { surfaceFile, seedFile },
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) };
}

test('capability CLI requires fixed inputs and exactly one output mode, rejects repeated and unknown flags', () => {
  const args = ['--surface', 'surface', '--seeds', 'seeds', '--output', 'result'];
  assert.equal(api.parseCapabilityMapArgs(args)['--output'], 'result');
  for (const invalid of [[], args.slice(0, 4), [...args, '--check', 'result'], [...args, '--surface', 'other'], [...args, '--guess', 'yes']]) {
    assert.throws(() => api.parseCapabilityMapArgs(invalid), /Usage|duplicate|unknown|mode/i);
  }
});

test('capability loader verifies pinned bytes before reading the surface and attaches portable input evidence', async () => {
  const input = fixture();
  try {
    const value = await api.buildCapabilityMapFromSource(input.options, input.readers);
    assert.equal(value.source.revision, source.revision);
    assert.equal(value.memberships[0].recordId, 'member:deep');
    assert.equal(value.metadata.inputEvidence.length, 2);
    assert.ok(value.metadata.inputEvidence.every(row => row.sha256.length === 64 && !path.isAbsolute(row.path)));
    assert.equal(input.reads(), 1);
    fs.appendFileSync(input.surfaceFile, ' ');
    await assert.rejects(api.loadCapabilityMapInputs(input.options, input.readers), /surface.*hash/i);
    assert.equal(input.reads(), 1);
  } finally { input.cleanup(); }
});

test('capability loader rejects wrong source identity and changed seed bytes', async () => {
  const input = fixture();
  try {
    input.surface.source = { ...source, tree: 'bad' };
    await assert.rejects(api.loadCapabilityMapInputs(input.options, input.readers), /source.*identity|source.*tree/i);
    input.surface.source = source;
    fs.appendFileSync(input.seedFile, ' ');
    await assert.rejects(api.loadCapabilityMapInputs(input.options, input.readers), /seed.*hash/i);
  } finally { input.cleanup(); }
});

test('optional plugin and shared-use inputs require fixed source identity and verified source references', async () => {
  const input = fixture();
  try {
    const pluginContractsFile = path.join(input.directory, 'plugin.json'), sharedReviewFile = path.join(input.directory, 'shared.json');
    fs.writeFileSync(pluginContractsFile, JSON.stringify({ source, batch: { plugins: [] } }));
    input.readers.expectedHashes.pluginContracts = sha(fs.readFileSync(pluginContractsFile));
    const shared = { schemaVersion: 1, source, inputs: [], fixedSourceInputs: [], packages: [{ id: 'REVIEW:demo', packageId: 'PKG:demo',
      sourceRefs: [{ path: 'packages/demo/index.ts', sha256: sha('fixed') }], entryDecisions: [], unresolvedUses: [] }] };
    fs.writeFileSync(sharedReviewFile, JSON.stringify(shared));
    const options = { ...input.options, pluginContractsFile, sharedReviewFile };
    const loaded = await api.loadCapabilityMapInputs(options, input.readers);
    assert.equal(loaded.inputEvidence.length, 4);
    assert.equal(loaded.sharedReview.packages[0].packageId, 'PKG:demo');
    shared.packages[0].sourceRefs[0].sha256 = '0'.repeat(64);
    fs.writeFileSync(sharedReviewFile, JSON.stringify(shared));
    await assert.rejects(api.loadCapabilityMapInputs(options, input.readers), /shared.*source|unverified.*reference/i);
    fs.appendFileSync(pluginContractsFile, ' ');
    await assert.rejects(api.loadCapabilityMapInputs(options, input.readers), /plugin.*hash/i);
  } finally { input.cleanup(); }
});

test('shared-use provenance rejects unsafe local receipts and fixed Git blob mismatches', async () => {
  const input = fixture();
  try {
    const sharedReviewFile = path.join(input.directory, 'shared.json');
    const shared = { source, packages: [], inputs: [{ path: '../escape.json', sha256: 'a'.repeat(64) }], fixedSourceInputs: [] };
    fs.writeFileSync(sharedReviewFile, JSON.stringify(shared));
    await assert.rejects(api.loadCapabilityMapInputs({ ...input.options, sharedReviewFile }, input.readers), /unsafe.*evidence/i);
    shared.inputs = []; shared.fixedSourceInputs = [{ path: 'packages/demo/native.mm', blob: 'a'.repeat(40), sha256: sha('fixed') }];
    fs.writeFileSync(sharedReviewFile, JSON.stringify(shared));
    input.readers.readSourceTree = () => ({ tree: source.tree, entries: [{ path: 'packages/demo/native.mm', oid: 'b'.repeat(40), type: 'blob', mode: '100644' }] });
    input.readers.readSourceBlobs = () => new Map([['packages/demo/native.mm', Buffer.from('fixed')]]);
    await assert.rejects(api.loadCapabilityMapInputs({ ...input.options, sharedReviewFile }, input.readers), /shared.*blob/i);
  } finally { input.cleanup(); }
});

test('shared receipts require explicit hashes', async () => {
  const input = fixture();
  try {
    const sharedReviewFile = path.join(input.directory, 'shared.json');
    const shared = { source, packages: [], fixedSourceInputs: [], inputs: [{ path: 'package.json' }] };
    fs.writeFileSync(sharedReviewFile, JSON.stringify(shared));
    await assert.rejects(api.loadCapabilityMapInputs({ ...input.options, sharedReviewFile }, input.readers), /evidence.*hash/i);
  } finally { input.cleanup(); }
});

test('nested observed-use source references cannot bypass shared source verification', async () => {
  const input = fixture();
  try {
    const sharedReviewFile = path.join(input.directory, 'shared.json');
    const sourceRef = { path: 'packages/demo/index.ts', sha256: sha('fixed') };
    const shared = { source, inputs: [], fixedSourceInputs: [], packages: [{ packageId: 'PKG:demo', sourceRefs: [sourceRef], entryDecisions: [],
      observedUses: [{ sourceRefs: [{ ...sourceRef, sha256: '0'.repeat(64) }] }] }] };
    fs.writeFileSync(sharedReviewFile, JSON.stringify(shared));
    await assert.rejects(api.loadCapabilityMapInputs({ ...input.options, sharedReviewFile }, input.readers), /unverified.*source/i);
  } finally { input.cleanup(); }
});

test('shared receipts cannot replace a fixed-source reference with local bytes', async () => {
  const input = fixture();
  try {
    const sharedReviewFile = path.join(input.directory, 'shared.json');
    const localHash = sha(fs.readFileSync('package.json'));
    input.surface.sourceEvidence.files.push({ path: 'package.json', origin: 'fixed-git-blob', sha256: 'f'.repeat(64) });
    const shared = { source, packages: [], fixedSourceInputs: [], inputs: [{ path: 'package.json', sha256: localHash }] };
    fs.writeFileSync(sharedReviewFile, JSON.stringify(shared));
    await assert.rejects(api.loadCapabilityMapInputs({ ...input.options, sharedReviewFile }, input.readers), /conflicting.*source/i);
  } finally { input.cleanup(); }
});

test('CLI roundtrip checks source metadata and rejects deleting a concrete member mapping', async () => {
  const input = fixture();
  try {
    const output = path.join(input.directory, 'map.json');
    const args = ['--surface', input.surfaceFile, '--seeds', input.seedFile];
    await api.runCapabilityMapCli([...args, '--output', output], input.readers);
    assert.equal((await api.runCapabilityMapCli([...args, '--check', output], input.readers)).validation.valid, true);
    const mapApi = await import('../m0-capability-map.mjs');
    const value = mapApi.readCapabilityMap(output); value.memberships.pop(); value.metadata.counts.memberships--; mapApi.writeCapabilityMap(output, value);
    await assert.rejects(api.runCapabilityMapCli([...args, '--check', output], input.readers), /Missing.*MEMBERSHIP:demo|capability.*validation/i);
    await assert.rejects(api.runCapabilityMapCli([...args, '--output', input.surfaceFile], input.readers), /overwrite.*input/i);
  } finally { input.cleanup(); }
});

test('CLI rejects an output symlink targeting its fixed surface input', async () => {
  const input = fixture();
  try {
    const output = path.join(input.directory, 'alias.json'), before = fs.readFileSync(input.surfaceFile);
    fs.symlinkSync(input.surfaceFile, output);
    await assert.rejects(api.runCapabilityMapCli(['--surface', input.surfaceFile, '--seeds', input.seedFile, '--output', output], input.readers), /overwrite.*input/i);
    assert.deepEqual(fs.readFileSync(input.surfaceFile), before);
  } finally { input.cleanup(); }
});

test('CLI rejects an output hardlink targeting its fixed surface input', async () => {
  const input = fixture();
  try {
    const output = path.join(input.directory, 'hardlink.json'), before = fs.readFileSync(input.surfaceFile);
    fs.linkSync(input.surfaceFile, output);
    await assert.rejects(api.runCapabilityMapCli(['--surface', input.surfaceFile, '--seeds', input.seedFile, '--output', output], input.readers), /overwrite.*input/i);
    assert.deepEqual(fs.readFileSync(input.surfaceFile), before);
  } finally { input.cleanup(); }
});
