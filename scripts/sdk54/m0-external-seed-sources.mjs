import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseFixedYarnLock } from './external-sources.mjs';
import { readDeclarationArchive, DeclarationArchiveStructureError } from './m0-archive.mjs';
import { verifyArchiveIntegrity } from './metro-type-source.mjs';
import { SDK54_EXPO_COMMIT } from './catalog.mjs';

const require = createRequire(new URL('../../apps/cli/package.json', import.meta.url));
const semver = require('semver');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const filename = name => name.replaceAll('/', '-').replace(/^@/, '');

function registryUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'registry.npmjs.org' || url.username || url.password || url.port || url.hash) throw new Error('Unsupported registry URL');
  return url;
}

export function planExternalSeedSources(facts, locks) {
  const seeds = facts.remaining.unresolvedIdentityOrFixedRange.map(({ name }) => {
    const row = facts.records.find(record => record.name === name);
    const spec = row.fixedBundleSpec ?? row.seedSpec;
    const version = semver.minVersion(spec)?.version;
    if (!version) throw new Error(`Missing fixed version request ${name}`);
    return { name, spec, version, baselineIdentityStatus: row.baselineIdentityStatus,
      selection: 'FIXED_REQUEST_LOWER_ENDPOINT_PUBLISHER_CANDIDATE', upstreamInstalledIdentity: 'NOT_VERIFIED',
      metadataUrl: `https://registry.npmjs.org/${encodeURIComponent(name)}/${version}` };
  });
  const archives = facts.remaining.exactLockWithoutOwnArchive.map(name => {
    const row = facts.records.find(record => record.name === name);
    const identity = locks.find(lock => lock.selector === `${name}@${row.fixedBundleSpec}`);
    if (!identity) throw new Error(`Missing exact lock ${name}`);
    const original = new URL(identity.resolved);
    if (!['registry.yarnpkg.com', 'registry.npmjs.org'].includes(original.hostname)) throw new Error(`Unsupported lock source ${name}`);
    return { identity, downloadUrl: `https://registry.npmjs.org${original.pathname}`, filename: `${filename(name)}-${identity.version}.tgz` };
  });
  return { seeds, archives };
}

export function publisherIdentity(metadata, expected) {
  if (metadata.name !== expected.name || metadata.version !== expected.version) throw new Error('Publisher package identity mismatch');
  const { integrity, shasum, tarball } = metadata.dist ?? {};
  if (!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(integrity ?? '') || Buffer.from(integrity.slice(7), 'base64').length !== 64 || !/^[a-f0-9]{40}$/.test(shasum ?? '')) throw new Error('Missing original publisher SHA512/SHA1');
  const url = registryUrl(tarball);
  return { name: metadata.name, version: metadata.version, selector: `${metadata.name}@${metadata.version}`, integrity, resolved: `${url.href}#${shasum}` };
}

export function publisherLifecycle(metadata) {
  return { status: typeof metadata.deprecated === 'string' && metadata.deprecated.length ? 'PUBLISHER_EXPLICIT_VERSION_DEPRECATION' : 'NO_EXPLICIT_DEPRECATION_IN_CAPTURED_VERSION_METADATA',
    deprecated: metadata.deprecated || null, replacement: 'NOT_INFERRED' };
}

export function verifyFixedSeedArchive(file, identity) {
  const integrityVerification = verifyArchiveIntegrity(fs.readFileSync(file), identity);
  try {
    const loaded = readDeclarationArchive(file, identity, { includeConfigJson: true });
    return { integrityVerification, verification: loaded.archive, manifest: JSON.parse(loaded.files.get('package.json')),
      declarationFiles: [...loaded.files.keys()].filter(name => /\.d\.[cm]?ts$/.test(name)), status: 'VERIFIED_FIXED_LOCK_ARCHIVE', runtimeAcceptance: 'NOT_VERIFIED' };
  } catch (error) {
    if (!(error instanceof DeclarationArchiveStructureError)) throw error;
    return { integrityVerification, status: 'VERIFIED_BYTES_REJECTED_STRUCTURE', structureError: error.message, runtimeAcceptance: 'NOT_VERIFIED' };
  }
}

export function readMetadataReceipt(file, receiptFile, expectedUrl) {
  const bytes = fs.readFileSync(file), receipt = JSON.parse(fs.readFileSync(receiptFile));
  if (receipt.path !== file || receipt.url !== expectedUrl || receipt.sha256 !== hash(bytes) || !Number.isFinite(Date.parse(receipt.retrievedAt))) throw new Error('Metadata receipt integrity mismatch');
  return { bytes, receipt };
}

export function readArchiveReceipt(file, receiptFile, identity, downloadUrl) {
  const receipt = JSON.parse(fs.readFileSync(receiptFile));
  const verified = verifyArchiveIntegrity(fs.readFileSync(file), identity);
  if (receipt.file !== file || receipt.downloadUrl !== downloadUrl || receipt.sha256 !== verified.sha256 ||
    ['name', 'version', 'selector', 'integrity', 'resolved'].some(key => receipt.identity?.[key] !== identity[key]) ||
    !receipt.originalAcquisition?.method || !Number.isFinite(Date.parse(receipt.recordedAt))) throw new Error('Archive receipt integrity mismatch');
  return receipt;
}

async function readRegistry(url, maximum) {
  const response = await fetch(registryUrl(url), { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(120000), headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maximum) throw new Error('Registry response size limit');
    chunks.push(chunk);
  }
  return { bytes: Buffer.concat(chunks), headers: { etag: response.headers.get('etag'), lastModified: response.headers.get('last-modified') } };
}

export async function investigateExternalSeeds({ sourceDir = '/tmp/sdk54-expo-source', outputDirectory = 'outputs/sdk54/ai-e2e/20261023-m0-source-closure', network = false } = {}) {
  const factsPath = 'outputs/sdk54/ai-e2e/20261023-m0-entry-template/seed-range-facts.json';
  const factsBytes = fs.readFileSync(factsPath), facts = JSON.parse(factsBytes);
  const git = args => execFileSync('git', ['-C', sourceDir, ...args], { maxBuffer: 16 * 1024 * 1024 });
  if (git(['rev-parse', `${SDK54_EXPO_COMMIT}^{commit}`]).toString().trim() !== facts.source.revision) throw new Error('Fixed source revision mismatch');
  const lockBytes = git(['show', `${SDK54_EXPO_COMMIT}:yarn.lock`]), locks = parseFixedYarnLock(lockBytes.toString());
  const plan = planExternalSeedSources(facts, locks);
  const archiveDirectory = path.join(outputDirectory, 'seed-archives');
  fs.mkdirSync(archiveDirectory, { recursive: true });
  const save = (name, value) => fs.writeFileSync(path.join(outputDirectory, `external-seed-${name}.json`), JSON.stringify(value, null, 2) + '\n');
  save('plan', plan);
  const relatedInputs = ['docs/releases/sdk54-external-source-review.json', 'docs/releases/sdk54-source-provenance.json'].map(file => ({ path: file, sha256: hash(fs.readFileSync(file)) }));
  const result = { schemaVersion: 1, source: facts.source, inputs: [{ path: factsPath, sha256: hash(factsBytes) }, ...relatedInputs, { path: 'yarn.lock', revision: SDK54_EXPO_COMMIT, sha256: hash(lockBytes), blob: git(['rev-parse', `${SDK54_EXPO_COMMIT}:yarn.lock`]).toString().trim() }],
    policies: ['REGISTRY_GET_ONLY_NO_INSTALL_PUBLISH_OR_COMMIT', 'PUBLISHER_CANDIDATE_IS_NOT_UPSTREAM_INSTALLED_IDENTITY', 'NO_DEPRECATION_OR_RENAME_INFERRED_FROM_ABSENCE', 'ARCHIVE_VERIFICATION_REUSES_M0_ARCHIVE_API'],
    seeds: [], archives: [], stageClosable: false, harmonySupportAccepted: false };
  for (const seed of plan.seeds) {
    const metadataPath = path.join(outputDirectory, `external-seed-metadata-${filename(seed.name)}-${seed.version}.json`);
    const receiptPath = path.join(outputDirectory, `external-seed-receipt-${filename(seed.name)}-${seed.version}.json`);
    const row = { ...seed, metadata: { path: metadataPath, url: seed.metadataUrl } };
    try {
      let bytes, receipt;
      if (fs.existsSync(metadataPath) && fs.existsSync(receiptPath)) ({ bytes, receipt } = readMetadataReceipt(metadataPath, receiptPath, seed.metadataUrl));
      else {
        if (!network) throw new Error('NETWORK_REQUIRED_METADATA_NOT_CACHED');
        const response = await readRegistry(seed.metadataUrl, 16 * 1024 * 1024);
        bytes = response.bytes;
        JSON.parse(bytes);
        const previousSha256 = fs.existsSync(metadataPath) ? hash(fs.readFileSync(metadataPath)) : null;
        let previousPath = null;
        if (previousSha256 && previousSha256 !== hash(bytes)) {
          previousPath = path.join(outputDirectory, `external-seed-prior-metadata-${previousSha256}.json`);
          fs.copyFileSync(metadataPath, previousPath);
        }
        fs.writeFileSync(metadataPath, bytes);
        receipt = { path: metadataPath, url: seed.metadataUrl, sha256: hash(bytes), retrievedAt: new Date().toISOString(), headers: response.headers,
          previousObservation: previousSha256 ? { sha256: previousSha256, preservedPath: previousPath, retrievedAt: 'NOT_RECORDED_INITIAL_RUN' } : null };
        fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
      }
      row.metadata = { ...receipt, receiptPath, receiptSha256: hash(fs.readFileSync(receiptPath)) };
      const metadata = JSON.parse(bytes);
      row.identity = publisherIdentity(metadata, seed);
      row.sourceRepository = metadata.repository ?? null;
      row.gitHead = metadata.gitHead ?? null;
      row.lifecycle = publisherLifecycle(metadata);
      row.status = 'PUBLISHER_FIXED_VERSION_CANDIDATE_METADATA_RECORDED';
      row.sourceLinkStatus = row.sourceRepository && row.gitHead ? 'REPOSITORY_AND_GITHEAD_RECORDED_NOT_FETCHED' : 'SOURCE_REPOSITORY_OR_COMMIT_MISSING';
      row.runtimePeerDependencies = metadata.peerDependencies ?? {};
      row.remaining = ['UPSTREAM_INSTALLED_IDENTITY_NOT_ESTABLISHED', 'ARCHIVE_BYTES_NOT_YET_VERIFIED', 'SOURCE_COMMIT_TO_PUBLISHED_BUILD_EQUIVALENCE_NOT_ESTABLISHED',
        ...(!row.sourceRepository ? ['PUBLISHER_SOURCE_REPOSITORY_MISSING'] : []), ...(!row.gitHead ? ['PUBLISHER_SOURCE_COMMIT_MISSING'] : [])];
    } catch (error) { row.status = 'UNRESOLVED'; row.error = String(error); }
    result.seeds.push(row);
    save('results', result);
    console.log(JSON.stringify({ name: seed.name, status: row.status }));
  }
  for (const planned of plan.archives) {
    const file = path.join(archiveDirectory, planned.filename);
    const receiptPath = path.join(outputDirectory, `external-seed-archive-receipt-${filename(planned.identity.name)}-${planned.identity.version}.json`);
    const row = { ...planned, file };
    try {
      let originalAcquisition = { method: 'UNKNOWN_INITIAL_ACQUISITION', acquiredAt: null };
      if (!fs.existsSync(file)) {
        const hex = Buffer.from(planned.identity.integrity.slice(7), 'base64').toString('hex');
        const cache = path.join(os.homedir(), '.npm/_cacache/content-v2/sha512', hex.slice(0, 2), hex.slice(2, 4), hex.slice(4));
        if (fs.existsSync(cache)) {
          fs.copyFileSync(cache, file);
          originalAcquisition = { method: 'LOCAL_ORIGINAL_NPM_CACHE', acquiredAt: new Date().toISOString(), cachePath: cache };
        }
        else {
          if (!network) throw new Error('NETWORK_REQUIRED_ARCHIVE_NOT_CACHED');
          const response = await readRegistry(planned.downloadUrl, 256 * 1024 * 1024);
          fs.writeFileSync(file, response.bytes);
          originalAcquisition = { method: 'FIXED_REGISTRY_GET', acquiredAt: new Date().toISOString(), url: planned.downloadUrl, headers: response.headers };
        }
      }
      Object.assign(row, verifyFixedSeedArchive(file, planned.identity));
      if (!fs.existsSync(receiptPath)) {
        const logFile = path.join(outputDirectory, 'external-seed-acquisition.log');
        const initialRunEvidence = originalAcquisition.method === 'UNKNOWN_INITIAL_ACQUISITION' && fs.existsSync(logFile) ? [{ path: logFile, sha256: hash(fs.readFileSync(logFile)), limitation: 'INITIAL_LOG_ESTABLISHES_OBSERVED_RESULTS_NOT_ORIGINAL_SOURCE_OR_GET_TIME' }] : [];
        const receipt = { file, identity: planned.identity, downloadUrl: planned.downloadUrl, sha256: row.integrityVerification.sha256,
          originalAcquisition, initialRunEvidence, recordedAt: new Date().toISOString() };
        fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
      }
      row.acquisitionReceipt = readArchiveReceipt(file, receiptPath, planned.identity, planned.downloadUrl);
      row.receipt = { path: receiptPath, sha256: hash(fs.readFileSync(receiptPath)) };
      row.verificationObservation = { verifiedAt: new Date().toISOString(), method: 'LOCAL_BYTES_INTEGRITY_AND_STRUCTURE_CHECK' };
    } catch (error) { row.status = 'UNRESOLVED'; row.error = String(error); }
    result.archives.push(row);
    save('results', result);
    console.log(JSON.stringify({ name: row.identity.name, status: row.status, error: row.error }));
  }
  result.summary = { seeds: result.seeds.length, publisherIdentities: result.seeds.filter(row => row.identity).length, fixedArchiveBytesVerified: result.archives.filter(row => row.integrityVerification?.valid).length,
    fixedArchiveVerified: result.archives.filter(row => row.status === 'VERIFIED_FIXED_LOCK_ARCHIVE').length, rejectedStructure: result.archives.filter(row => row.status === 'VERIFIED_BYTES_REJECTED_STRUCTURE').length,
    publisherSourceLinksRecordedNotFetched: result.seeds.filter(row => row.sourceRepository && row.gitHead).length,
    explicitVersionDeprecations: result.seeds.filter(row => row.lifecycle?.status === 'PUBLISHER_EXPLICIT_VERSION_DEPRECATION').length,
    historicalSeedIdentitiesClosed: 0, pendingSeedIdentityDecisions: result.seeds.length,
    acquisitionFailures: result.seeds.filter(row => row.status === 'UNRESOLVED').length + result.archives.filter(row => row.status === 'UNRESOLVED').length };
  save('results', result);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await investigateExternalSeeds({ network: process.argv.includes('--network') });
