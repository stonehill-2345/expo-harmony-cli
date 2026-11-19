import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import test from 'node:test';
const api = () => import('../m0-source-census-source.mjs');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const source = { revision: '5b42e3d21e0ac5e086752361ca8a5cb4de53bec1', tree: '5457e824b21d968e55c8f533cdf1751860160a92' };
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-census-source-'));
  const rootBytes = Buffer.from(JSON.stringify({ workspaces: ['packages/*'] })), manifestBytes = Buffer.from(JSON.stringify({ name: 'demo' })), codeBytes = Buffer.from('export const x = 1;');
  const entries = [{ path: 'package.json', oid: 'a'.repeat(40), mode: '100644', type: 'blob' },
    { path: 'packages/demo/package.json', oid: 'b'.repeat(40), mode: '100644', type: 'blob' }, { path: 'packages/demo/index.ts', oid: 'c'.repeat(40), mode: '100644', type: 'blob' }];
  const blobs = new Map([['package.json', rootBytes], ['packages/demo/package.json', manifestBytes], ['packages/demo/index.ts', codeBytes]]);
  const input = { id: 'INPUT:code', path: 'packages/demo/index.ts', blob: entries[2].oid, sha256: sha(codeBytes), origin: 'fixed-git-blob' };
  const pkg = { id: 'PKG:demo', name: 'demo', sourcePath: entries[1].path, manifestBlob: entries[1].oid, manifestSha256: sha(manifestBytes) };
  const surfaceFile = path.join(directory, 'surface.json'), capabilityMapFile = path.join(directory, 'map.json');
  const writeIndex = (file, format, tables) => {
    fs.mkdirSync(file + '.parts');
    const descriptors = Object.fromEntries(Object.entries(tables).map(([name, values]) => {
      const bytes = gzipSync(JSON.stringify(values)), digest = sha(bytes); fs.writeFileSync(path.join(file + '.parts', digest + '.json.gz'), bytes);
      return [name, { count: values.length, shards: [{ path: digest + '.json.gz', sha256: digest, count: values.length, firstId: values[0].id, lastId: values.at(-1).id }] }];
    }));
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, format, metadata: { source }, tables: descriptors }));
  };
  writeIndex(surfaceFile, 'sdk54-public-surface-shards-v1', { packages: [pkg], inputs: [input] });
  writeIndex(capabilityMapFile, 'sdk54-capability-map-shards-v1', { capabilities: [{ id: 'CAP:demo', ownerPackageId: pkg.id }] });
  const readers = { expectedHashes: { surface: sha(fs.readFileSync(surfaceFile)), capabilityMap: sha(fs.readFileSync(capabilityMapFile)) },
    readSourceTree: () => ({ tree: source.tree, entries }), readSourceBlobs: (_directory, selected) => new Map(selected.map(row => [row.path, blobs.get(row.path)])) };
  return { directory, surfaceFile, capabilityMapFile, entries, blobs, input, readers, options: { surfaceFile, capabilityMapFile },
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) };
}
test('source census arguments require pinned input paths and a single output mode', async () => {
  const { parseSourceCensusArgs } = await api();
  const args = ['--surface', 's', '--capability-map', 'm', '--output', 'o'];
  assert.equal(parseSourceCensusArgs(args)['--output'], 'o');
  for (const bad of [[], args.slice(0, 4), [...args, '--check', 'c'], [...args, '--surface', 'other'], [...args, '--unknown', 'x']]) assert.throws(() => parseSourceCensusArgs(bad), /Usage|duplicate|unknown/i);
});
test('loader reads independent root/workspace manifests, verifies registered bytes and checks pinned indexes before Git', async () => {
  const input = fixture();
  try {
    const { loadSourceCensusInputs } = await api(), loaded = await loadSourceCensusInputs(input.options, input.readers);
    assert.equal(loaded.treeEntries.length, 3); assert.equal(loaded.manifests.length, 2); assert.equal(loaded.coveredInputs.length, 1);
    assert.ok(loaded.inputEvidence.every(row => !path.isAbsolute(row.path) && row.sha256.length === 64));
    fs.appendFileSync(input.surfaceFile, ' '); input.readers.readSourceTree = () => { throw new Error('must not reach Git'); };
    await assert.rejects(loadSourceCensusInputs(input.options, input.readers), /surface.*hash/i);
  } finally { input.cleanup(); }
});
test('loader rejects stale shard bytes, wrong tree, fixed path/blob and content hash conflicts', async () => {
  const { loadSourceCensusInputs } = await api();
  for (const mutate of [
    input => { const index = JSON.parse(fs.readFileSync(input.surfaceFile)); fs.appendFileSync(path.join(input.surfaceFile + '.parts', index.tables.inputs.shards[0].path), 'bad'); },
    input => { input.readers.readSourceTree = () => ({ tree: 'bad', entries: input.entries }); },
    input => { input.entries[2].oid = 'd'.repeat(40); },
    input => { input.blobs.set(input.input.path, Buffer.from('changed')); },
  ]) {
    const input = fixture();
    try { mutate(input); await assert.rejects(loadSourceCensusInputs(input.options, input.readers), /shard|tree|blob|hash/i); }
    finally { input.cleanup(); }
  }
});
test('loader agrees with builder for a positive workspace extglob', async () => {
  const input = fixture();
  try {
    input.blobs.set('package.json', Buffer.from(JSON.stringify({ workspaces: ['!(apps)/*'] })));
    const { loadSourceCensusInputs } = await api();
    assert.equal((await loadSourceCensusInputs(input.options, input.readers)).manifests.length, 2);
  } finally { input.cleanup(); }
});
test('loader reads all ordinary fixed files separately from original analysis inputs', async () => {
  const input = fixture();
  try {
    const extra = { path: 'packages/demo/android/Native.kt', oid: 'd'.repeat(40), mode: '100644', type: 'blob' };
    input.entries.push(extra); input.blobs.set(extra.path, Buffer.from('interface Native {}'));
    const { buildSourceCensusFromSource } = await api(), value = await buildSourceCensusFromSource(input.options, input.readers);
    const row = value.files.find(item => item.path === extra.path);
    assert.equal(row.contentStatus, 'READ_AND_HASH_VERIFIED'); assert.equal(row.inputRefs.length, 0);
    assert.equal(row.sha256, sha(input.blobs.get(extra.path)));
    assert.equal(value.metadata.inputSummary.fixedGitInputs, 1);
  } finally { input.cleanup(); }
});
test('CLI roundtrip rejects an omitted fixed tree file with its original path', async () => {
  const input = fixture();
  try {
    const { runSourceCensusCli } = await api(), output = path.join(input.directory, 'census.json');
    const args = ['--surface', input.surfaceFile, '--capability-map', input.capabilityMapFile];
    await runSourceCensusCli([...args, '--output', output], input.readers);
    assert.equal((await runSourceCensusCli([...args, '--check', output], input.readers)).validation.valid, true);
    const value = JSON.parse(fs.readFileSync(output)), row = value.files.find(row => row.path === input.input.path);
    value.files = value.files.filter(item => item.id !== row.id); fs.writeFileSync(output, JSON.stringify(value));
    await assert.rejects(runSourceCensusCli([...args, '--check', output], input.readers), /packages\/demo\/index\.ts/);
  } finally { input.cleanup(); }
});
test('CLI protects symlink, hardlink and source input shard outputs before writing', async () => {
  const { runSourceCensusCli } = await api();
  for (const kind of ['symlink', 'hardlink', 'shard', 'parts-directory']) {
    const input = fixture();
    try {
      let output = path.join(input.directory, 'alias.json');
      if (kind === 'symlink') fs.symlinkSync(input.surfaceFile, output);
      if (kind === 'hardlink') fs.linkSync(input.surfaceFile, output);
      if (kind === 'shard') output = path.join(input.surfaceFile + '.parts', JSON.parse(fs.readFileSync(input.surfaceFile)).tables.inputs.shards[0].path);
      if (kind === 'parts-directory') output = input.surfaceFile + '.parts';
      const before = fs.readFileSync(input.surfaceFile);
      await assert.rejects(runSourceCensusCli(['--surface', input.surfaceFile, '--capability-map', input.capabilityMapFile, '--output', output], input.readers), /overwrite.*input/i);
      assert.deepEqual(fs.readFileSync(input.surfaceFile), before);
    } finally { input.cleanup(); }
  }
});
test('shared followup requires complete original use IDs and verifies every nested reference and local receipt', async () => {
  const input = fixture();
  try {
    const { loadSourceCensusInputs } = await api(), sharedFollowupFile = path.join(input.directory, 'followup.json');
    const use = { id: 'USE:demo', sourceRefs: [{ path: input.input.path, sha256: input.input.sha256 }] };
    const followup = { schemaVersion: 1, source, uses: [use], fixedSourceInputs: [], inputs: [] };
    input.readers.expectedUseIds = [use.id]; fs.writeFileSync(sharedFollowupFile, JSON.stringify(followup));
    const options = { ...input.options, sharedFollowupFile };
    await loadSourceCensusInputs(options, input.readers);
    use.sourceRefs[0].sha256 = '0'.repeat(64); fs.writeFileSync(sharedFollowupFile, JSON.stringify(followup));
    await assert.rejects(loadSourceCensusInputs(options, input.readers), /unverified.*reference|conflicting.*hash/i);
    followup.uses = []; fs.writeFileSync(sharedFollowupFile, JSON.stringify(followup));
    await assert.rejects(loadSourceCensusInputs(options, input.readers), /use.*identity|use.*ID/i);
    followup.uses = [{ id: 'USE:demo', sourceRefs: [] }]; followup.inputs = [{ path: 'package.json' }]; fs.writeFileSync(sharedFollowupFile, JSON.stringify(followup));
    await assert.rejects(loadSourceCensusInputs(options, input.readers), /hash/i);
  } finally { input.cleanup(); }
});
test('shared local receipts cannot assert different bytes for a fixed source path', async () => {
  const input = fixture();
  try {
    const { loadSourceCensusInputs } = await api(), sharedFollowupFile = path.join(input.directory, 'followup.json');
    input.readers.expectedUseIds = ['USE:demo'];
    const followup = { source, uses: [{ id: 'USE:demo', sourceRefs: [{ path: input.input.path, sha256: input.input.sha256 }] }],
      inputs: [{ path: 'package.json', sha256: sha(fs.readFileSync('package.json')) }], fixedSourceInputs: [] };
    fs.writeFileSync(sharedFollowupFile, JSON.stringify(followup));
    await assert.rejects(loadSourceCensusInputs({ ...input.options, sharedFollowupFile }, input.readers), /conflicting.*source.*hash|source.*hash.*mismatch/i);
  } finally { input.cleanup(); }
});
