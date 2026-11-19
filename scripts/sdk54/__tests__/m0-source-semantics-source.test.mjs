import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import { writeSourceSemantics, checkSourceSemantics } from '../m0-source-semantics-source.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-final-semantics-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const contents = new Map([['packages/test/index.ts', 'export interface Props { deep: { name: string } }'], ['packages/test/error.js', 'export function broken( {'], ['packages/test/asset.png', 'asset']]);
  const entries = [...contents].map(([path, content]) => ({ path, type: 'blob', mode: '100644', oid: createHash('sha1').update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest('hex') }));
  const source = { revision: '5b42e3d21e0ac5e086752361ca8a5cb4de53bec1', tree: '5457e824b21d968e55c8f533cdf1751860160a92' };
  const census = { source, files: entries.map(row => ({ ...row, sha256: hash(contents.get(row.path)) })) };
  return { dir, census, io: { readSourceTree: () => ({ tree: source.tree, entries }), readSourceBlobs: (_dir, selected) => new Map(selected.map(row => [row.path, Buffer.from(contents.get(row.path))])) } };
}
test('writes deterministic source shards with exact identity, all script paths and parse boundaries', t => {
  const f = fixture(t), outputFile = path.join(f.dir, 'index.json');
  const first = writeSourceSemantics({ census: f.census, outputFile }, f.io), bytes = fs.readFileSync(outputFile);
  const second = writeSourceSemantics({ census: f.census, outputFile }, f.io);
  assert.deepEqual(first, second); assert.deepEqual(bytes, fs.readFileSync(outputFile));
  assert.equal(first.files.length, 2); assert.equal(first.summary.parsedFiles, 1); assert.equal(first.summary.blockedFiles, 1);
  assert.equal(checkSourceSemantics({ census: f.census, indexFile: outputFile }, f.io).valid, true);
});
test('rejects a missing deep property even after valid JSON/gzip/hash descriptors are resealed', t => {
  const f = fixture(t), indexFile = path.join(f.dir, 'index.json');
  const value = writeSourceSemantics({ census: f.census, outputFile: indexFile }, f.io);
  const descriptor = value.files.find(row => row.path.endsWith('index.ts'));
  const artifact = JSON.parse(gunzipSync(fs.readFileSync(path.join(indexFile + '.parts', descriptor.shard))));
  const target = artifact.facts.find(row => row.name === 'name');
  artifact.facts = artifact.facts.filter(row => row.id !== target.id);
  const { gzipSync } = requireGzip();
  const bytes = gzipSync(JSON.stringify(artifact)); descriptor.sha256 = hash(bytes); descriptor.shard = descriptor.sha256 + '.json.gz'; descriptor.factCount--;
  fs.writeFileSync(path.join(indexFile + '.parts', descriptor.shard), bytes); fs.writeFileSync(indexFile, JSON.stringify(value));
  const result = checkSourceSemantics({ census: f.census, indexFile }, f.io);
  assert.equal(result.valid, false); assert.ok(result.failures.some(row => row.includes(target.id) && row.includes(descriptor.path)));
});
test('rejects content hash substitution, missing file and unknown metadata', t => {
  const f = fixture(t), outputFile = path.join(f.dir, 'index.json');
  const bad = structuredClone(f.census); bad.files[0].sha256 = 'a'.repeat(64);
  assert.throws(() => writeSourceSemantics({ census: bad, outputFile }, f.io), /hash mismatch.*index.ts/);
  const value = writeSourceSemantics({ census: f.census, outputFile }, f.io); value.files.pop(); value.unknown = true; fs.writeFileSync(outputFile, JSON.stringify(value));
  assert.equal(checkSourceSemantics({ census: f.census, indexFile: outputFile }, f.io).valid, false);
});
test('protects input directory and symlink/hardlink input output aliases', t => {
  const f = fixture(t), censusFile = path.join(f.dir, 'census.json'); fs.writeFileSync(censusFile, 'input');
  const alias = path.join(f.dir, 'alias.json'); fs.linkSync(censusFile, alias);
  assert.throws(() => writeSourceSemantics({ census: f.census, censusFile, outputFile: alias }, f.io), /overwrite/);
  assert.throws(() => writeSourceSemantics({ census: f.census, sourceDir: f.dir, outputFile: path.join(f.dir, 'new.json') }, f.io), /overwrite/);
  assert.equal(fs.readFileSync(censusFile, 'utf8'), 'input');
});
import * as zlib from 'node:zlib';
const requireGzip = () => zlib;
