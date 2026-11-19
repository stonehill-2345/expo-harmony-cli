import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { create as createTar } from 'tar';
import * as subject from '../m0-external-seed-sources.mjs';

test('external seed source investigation module exists', () => assert.ok(subject, 'missing external seed source investigator'));

test('range investigation pins the explicit lower endpoint without claiming an upstream lock', () => {
  const facts = { remaining: { unresolvedIdentityOrFixedRange: [{ name: 'example' }], exactLockWithoutOwnArchive: [] }, records: [{ name: 'example', fixedBundleSpec: '~7.2.0', seedSpec: '~7.2.0' }] };
  const plan = subject.planExternalSeedSources(facts, []);
  assert.equal(plan.seeds[0].version, '7.2.0');
  assert.equal(plan.seeds[0].selection, 'FIXED_REQUEST_LOWER_ENDPOINT_PUBLISHER_CANDIDATE');
  assert.equal(plan.seeds[0].upstreamInstalledIdentity, 'NOT_VERIFIED');
});

test('missing archive identity must come from the exact selector rather than another compatible lock', () => {
  const facts = { remaining: { unresolvedIdentityOrFixedRange: [], exactLockWithoutOwnArchive: ['example'] }, records: [{ name: 'example', fixedBundleSpec: '~1.0.0' }] };
  assert.throws(() => subject.planExternalSeedSources(facts, [{ name: 'example', selector: 'example@^1.0.0', version: '1.0.2' }]), /Missing exact lock/);
});

test('publisher identity requires matching name/version and original SHA512 plus SHA1', () => {
  const bytes = Buffer.from('publisher bytes'), integrity = 'sha512-' + createHash('sha512').update(bytes).digest('base64'), shasum = createHash('sha1').update(bytes).digest('hex');
  const metadata = { name: 'example', version: '1.0.0', dist: { integrity, shasum, tarball: 'https://registry.npmjs.org/example/-/example-1.0.0.tgz' } };
  assert.equal(subject.publisherIdentity(metadata, { name: 'example', version: '1.0.0' }).resolved, metadata.dist.tarball + '#' + shasum);
  assert.throws(() => subject.publisherIdentity(metadata, { name: 'different', version: '1.0.0' }), /identity mismatch/);
  assert.throws(() => subject.publisherIdentity({ ...metadata, dist: { ...metadata.dist, integrity: null } }, metadata), /SHA512/);
  assert.throws(() => subject.publisherIdentity({ ...metadata, dist: { ...metadata.dist, tarball: 'https://example.org/a.tgz' } }, metadata), /registry URL/);
});

test('absence of publisher deprecated field does not assert an active lifecycle', () => {
  assert.deepEqual(subject.publisherLifecycle({}), { status: 'NO_EXPLICIT_DEPRECATION_IN_CAPTURED_VERSION_METADATA', deprecated: null, replacement: 'NOT_INFERRED' });
  assert.equal(subject.publisherLifecycle({ deprecated: 'Use new-example instead.' }).deprecated, 'Use new-example instead.');
});

test('fixed bytes remain integrity verified when duplicate paths reject declaration ingestion', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-seed-archive-'));
  try {
    fs.mkdirSync(path.join(directory, 'package'));
    fs.writeFileSync(path.join(directory, 'package/package.json'), JSON.stringify({ name: 'example', version: '1.0.0' }));
    const file = path.join(directory, 'duplicate.tgz');
    createTar({ cwd: directory, file, gzip: true, sync: true }, ['package/package.json', 'package/package.json']);
    const bytes = fs.readFileSync(file), identity = { name: 'example', version: '1.0.0', integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64'), resolved: 'https://registry.npmjs.org/example/-/example-1.0.0.tgz#' + createHash('sha1').update(bytes).digest('hex') };
    const archive = subject.verifyFixedSeedArchive(file, identity);
    assert.equal(archive.status, 'VERIFIED_BYTES_REJECTED_STRUCTURE');
    assert.equal(archive.integrityVerification.valid, true);
    assert.match(archive.structureError, /Duplicate archive entry/);
    assert.equal(archive.runtimeAcceptance, 'NOT_VERIFIED');
    bytes[0] ^= 1; fs.writeFileSync(file, bytes);
    assert.throws(() => subject.verifyFixedSeedArchive(file, identity), /integrity/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('offline metadata receipt retains the actual retrieval time and rejects changed captured bytes', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-seed-receipt-'));
  try {
    const file = path.join(directory, 'metadata.json'), receiptFile = path.join(directory, 'receipt.json');
    const bytes = Buffer.from('{"name":"example","version":"1.0.0"}');
    fs.writeFileSync(file, bytes);
    const receipt = { path: file, url: 'https://registry.npmjs.org/example/1.0.0', sha256: createHash('sha256').update(bytes).digest('hex'), retrievedAt: '2026-10-23T09:00:00.000Z', headers: { etag: 'original' } };
    fs.writeFileSync(receiptFile, JSON.stringify(receipt));
    assert.deepEqual(subject.readMetadataReceipt(file, receiptFile, receipt.url).receipt, receipt);
    fs.writeFileSync(file, '{}');
    assert.throws(() => subject.readMetadataReceipt(file, receiptFile, receipt.url), /receipt integrity/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('offline archive receipt retains unknown initial acquisition instead of inventing a new download', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-seed-archive-receipt-'));
  try {
    const file = path.join(directory, 'archive.tgz'), receiptFile = path.join(directory, 'receipt.json'), bytes = Buffer.from('fixed archive bytes');
    fs.writeFileSync(file, bytes);
    const identity = { name: 'example', version: '1.0.0', selector: 'example@1.0.0', integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64'), resolved: 'https://registry.npmjs.org/example/-/example-1.0.0.tgz#' + createHash('sha1').update(bytes).digest('hex') };
    const receipt = { file, identity, downloadUrl: identity.resolved.split('#')[0], sha256: createHash('sha256').update(bytes).digest('hex'), originalAcquisition: { method: 'UNKNOWN_INITIAL_ACQUISITION', acquiredAt: null }, recordedAt: '2026-10-23T10:00:00.000Z' };
    fs.writeFileSync(receiptFile, JSON.stringify(receipt));
    assert.deepEqual(subject.readArchiveReceipt(file, receiptFile, identity, receipt.downloadUrl), receipt);
    fs.writeFileSync(file, 'changed bytes');
    assert.throws(() => subject.readArchiveReceipt(file, receiptFile, identity, receipt.downloadUrl), /integrity/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
