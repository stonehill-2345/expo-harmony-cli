import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { create as createTar } from 'tar';
import * as subject from '../m0-transitive-sources.mjs';

const identity = (name, spec, version = '1.0.0') => ({ name, selector: `${name}@${spec}`, version,
  integrity: 'sha512-' + Buffer.alloc(64, 1).toString('base64'), resolved: `https://registry.yarnpkg.com/${name}/-/a.tgz#${'a'.repeat(40)}` });
const resolution = (name, spec, from = 'packages/consumer/index.ts') => ({ from, request: name, name, requestedSpecs: [spec], status: 'missing-exact-archive' });
const owner = manifest => ({ directory: 'packages/consumer/', path: 'packages/consumer/package.json', manifest });
const graph = resolutions => ({ externalContext: { resolutions, archives: [] } });

test('plans only actually requested owner exact selectors, deduplicates identities, retains every relation', () => {
  const locks = [identity('example', '^1'), identity('example', '~1'), identity('unrequested', '^1')];
  const resolutions = [resolution('example', '^1'), resolution('example', '^1', 'packages/consumer/other.ts')];
  const owners = [owner({ dependencies: { example: '^1', unrequested: '^1' } })];
  const plan = subject.planTransitiveDeclarationArchives({ graph: graph(resolutions), locks, owners });
  assert.equal(plan.archives.length, 1);
  assert.deepEqual(plan.archives[0].selectors, ['example@^1']);
  assert.deepEqual(plan.archives[0].relations.map(row => row.from), resolutions.map(row => row.from));
  assert.deepEqual(plan, subject.planTransitiveDeclarationArchives({ graph: graph([...resolutions].reverse()), locks: [...locks].reverse(), owners }));
});

test('refuses compatible substitutes, SHA1-only, ambiguous and undeclared selectors', () => {
  const locks = [identity('missing', '^2'), { ...identity('sha1', '^1'), integrity: 'sha1-abc' }, identity('ambiguous', '^1'), identity('ambiguous', '^2', '2.0.0'), identity('undeclared', '^1')];
  const resolutions = [resolution('missing', '^1'), resolution('sha1', '^1'), { ...resolution('ambiguous', '^1'), requestedSpecs: ['^1', '^2'] }, resolution('undeclared', '^1')];
  const owners = [owner({ dependencies: { missing: '^1', sha1: '^1', ambiguous: '^1' }, optionalDependencies: { ambiguous: '^2' } })];
  const plan = subject.planTransitiveDeclarationArchives({ graph: graph(resolutions), locks, owners });
  assert.equal(plan.archives.length, 0);
  assert.deepEqual(new Set(plan.blockers.map(row => row.status)), new Set(['NO_EXACT_LOCK', 'UNSUPPORTED_INTEGRITY', 'AMBIGUOUS_EXACT_LOCK', 'UNDECLARED_OWNER_REQUEST']));
});

test('preserves peer and missing declaration boundaries without inventing identities', () => {
  const rows = [resolution('peer', '^1'), { ...resolution('unknown', '^1'), status: 'missing-declared-identity' }, { ...resolution('peerBad', '^2'), status: 'missing-compatible-peer-source' }];
  const plan = subject.planTransitiveDeclarationArchives({ graph: graph(rows), locks: [identity('peer', '^1')], owners: [owner({ peerDependencies: { peer: '^1' } })] });
  assert.equal(plan.archives.length, 0);
  assert.deepEqual(new Set(plan.blockers.map(row => row.status)), new Set(['PEER_ONLY_REQUEST_NOT_EXACT_INSTALL_IDENTITY', 'MISSING_DECLARED_IDENTITY', 'MISSING_COMPATIBLE_PEER_SOURCE']));
});

test('reads metadata index without touching nonexistent type shards', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'transitive-index-'));
  try {
    const file = path.join(directory, 'graph.json.gz');
    fs.writeFileSync(file, gzipSync(JSON.stringify({ format: 'sdk54-semantic-shards-v1', graph: graph([]), typeShards: [{ path: 'absent' }] })));
    assert.deepEqual(subject.readTransitiveGraphMetadata(file), graph([]));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('cached archive receipts remain byte-identical offline and unknown acquisition is explicit', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'transitive-archive-'));
  try {
    fs.mkdirSync(path.join(directory, 'package'));
    fs.writeFileSync(path.join(directory, 'package/package.json'), JSON.stringify({ name: 'example', version: '1.0.0' }));
    fs.writeFileSync(path.join(directory, 'package/index.d.ts'), 'export declare const value: number;');
    const file = path.join(directory, 'archive.tgz');
    createTar({ cwd: directory, file, gzip: true, sync: true }, ['package']);
    const bytes = fs.readFileSync(file), fixed = { ...identity('example', '^1'), integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64'), resolved: 'https://registry.yarnpkg.com/example/-/a.tgz#' + createHash('sha1').update(bytes).digest('hex') };
    const planned = { identity: fixed, selectors: [fixed.selector], filename: 'archive.tgz', downloadUrl: 'https://registry.npmjs.org/example/-/a.tgz' };
    const first = await subject.acquireTransitiveDeclarationArchive(planned, { directory, network: false });
    assert.equal(first.status, 'VERIFIED_FIXED_LOCK_ARCHIVE');
    assert.equal(first.acquisitionReceipt.originalAcquisition.method, 'UNKNOWN_INITIAL_ACQUISITION');
    const receiptBefore = fs.readFileSync(first.receipt.path);
    const second = await subject.acquireTransitiveDeclarationArchive(planned, { directory, network: false });
    assert.deepEqual(fs.readFileSync(second.receipt.path), receiptBefore);
    assert.equal(second.declarationFiles, 1);
    fs.writeFileSync(file, 'changed bytes');
    await assert.rejects(subject.acquireTransitiveDeclarationArchive(planned, { directory, network: false }), /integrity/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
