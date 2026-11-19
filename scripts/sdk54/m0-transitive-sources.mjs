import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseFixedYarnLock } from './external-sources.mjs';
import { planDeclarationArchives } from './m0-source-context.mjs';
import { readDeclarationArchive, DeclarationArchiveStructureError } from './m0-archive.mjs';
import { verifyArchiveIntegrity } from './metro-type-source.mjs';
import { readArchiveReceipt } from './m0-external-seed-sources.mjs';
import { SDK54_EXPO_COMMIT } from './catalog.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const compare = (a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b));
const prefix = '__sdk54_external__/';
const defaultGraph = 'outputs/sdk54/ai-e2e/20261023-m0-source-closure/semantic-closure.json.gz';
const defaultOutput = 'outputs/sdk54/ai-e2e/20261023-m0-transitive-sources';
const save = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');

export function readTransitiveGraphMetadata(file) {
  const bytes = fs.readFileSync(file);
  const index = JSON.parse(file.endsWith('.gz') ? gunzipSync(bytes).toString() : bytes.toString());
  const graph = index.format === 'sdk54-semantic-shards-v1' ? index.graph : index;
  if (!graph?.externalContext || Object.hasOwn(graph, 'types')) throw new Error('Expected semantic metadata index without types');
  return graph;
}

export function planTransitiveDeclarationArchives({ graph, locks, owners }) {
  const selectors = new Map(), blockers = [], bySelector = new Map();
  for (const lock of locks) {
    if (bySelector.has(lock.selector)) throw new Error(`Duplicate lock selector ${lock.selector}`);
    bySelector.set(lock.selector, lock);
  }
  const boundaries = new Set(['missing-declared-identity', 'missing-compatible-peer-source', 'invalid-peer-source-range', 'ambiguous-archive', 'ambiguous-peer-source']);
  for (const row of [...graph.externalContext.resolutions].sort(compare)) {
    if (row.status !== 'missing-exact-archive') {
      if (boundaries.has(row.status)) blockers.push({ ...row, status: row.status.toUpperCase().replaceAll('-', '_'), resolutionStatus: row.status });
      continue;
    }
    const relation = { from: row.from, request: row.request, name: row.name, requestedSpecs: [...new Set(row.requestedSpecs ?? [])].sort(), resolutionStatus: row.status };
    const block = (status, extra = {}) => blockers.push({ ...relation, status, ...extra });
    const owner = [...owners].sort((a, b) => b.directory.length - a.directory.length).find(item => row.from.startsWith(item.directory));
    if (!owner) { block('MISSING_OWNER_MANIFEST'); continue; }
    const declared = ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies'].flatMap(section => typeof owner.manifest[section]?.[row.name] === 'string' ? [{ section, name: row.name, spec: owner.manifest[section][row.name] }] : []);
    const runtime = declared.filter(item => item.section !== 'devDependencies');
    const active = runtime.length ? runtime : declared;
    const direct = active.filter(item => ['dependencies', 'optionalDependencies'].includes(item.section));
    const selected = direct.length ? direct : active;
    relation.owner = { path: owner.path, sha256: owner.sha256 ?? hash(JSON.stringify(owner.manifest)) };
    relation.declarations = selected;
    if (!relation.requestedSpecs.length || relation.requestedSpecs.some(spec => !selected.some(item => item.spec === spec))) { block('UNDECLARED_OWNER_REQUEST'); continue; }
    if (selected.every(item => item.section === 'peerDependencies')) { block('PEER_ONLY_REQUEST_NOT_EXACT_INSTALL_IDENTITY'); continue; }
    const requestedSelectors = relation.requestedSpecs.map(spec => `${row.name}@${spec}`);
    const missing = requestedSelectors.filter(selector => !bySelector.has(selector));
    if (missing.length) { block('NO_EXACT_LOCK', { selectors: missing }); continue; }
    const candidates = requestedSelectors.map(selector => bySelector.get(selector));
    if (new Set(candidates.map(item => `${item.name}@${item.version}`)).size !== 1) { block('AMBIGUOUS_EXACT_LOCK', { selectors: requestedSelectors }); continue; }
    for (const selector of requestedSelectors) {
      if (!selectors.has(selector)) selectors.set(selector, []);
      selectors.get(selector).push(relation);
    }
  }
  const eligible = [];
  for (const selector of [...selectors.keys()].sort()) {
    const identity = bySelector.get(selector);
    if (!identity.integrity || !identity.resolved) { blockers.push({ selector, status: 'UNSUPPORTED_INTEGRITY', relations: selectors.get(selector) }); continue; }
    try {
      const planned = planDeclarationArchives({ selectors: [selector], locks });
      if (planned.blockers.length) blockers.push(...planned.blockers.map(row => ({ ...row, relations: selectors.get(selector) })));
      else eligible.push(selector);
    } catch (error) { blockers.push({ selector, status: 'INVALID_EXACT_LOCK_SOURCE', reason: String(error), relations: selectors.get(selector) }); }
  }
  const planned = planDeclarationArchives({ selectors: eligible, locks });
  const archives = planned.archives.map(archive => ({ ...archive,
    relations: [...new Map(archive.selectors.flatMap(selector => selectors.get(selector)).map(row => [JSON.stringify(row), row])).values()].sort(compare) }));
  // The navigation router request is the first investigated archive, followed by stable identity order.
  archives.sort((a, b) => Number(b.selectors.includes('@react-navigation/routers@^7.5.1')) - Number(a.selectors.includes('@react-navigation/routers@^7.5.1')) || a.filename.localeCompare(b.filename));
  return { schemaVersion: 1, policies: ['ACTUAL_RESOLVER_REQUESTS_ONLY', 'OWNER_DECLARED_EXACT_LOCK_SELECTORS_ONLY', 'NO_DEPENDENCY_CLOSURE_INSTALL', 'NO_PEER_OR_REACT_COMPATIBILITY_INFERENCE'], archives, blockers: blockers.sort(compare), selectors: eligible };
}

export function loadTransitiveOwnerManifests({ graph, sourceDir }) {
  const requests = graph.externalContext.resolutions.filter(row => row.status === 'missing-exact-archive');
  const owners = [];
  for (const record of graph.externalContext.archives ?? []) {
    const directory = `${prefix}${record.identity.name.replaceAll('/', '+')}@${record.identity.version}/`;
    if (!requests.some(row => row.from.startsWith(directory))) continue;
    const loaded = readDeclarationArchive(record.archive.path, record.identity);
    if (loaded.archive.sha256 !== record.archive.sha256) throw new Error(`Owner archive evidence mismatch ${record.identity.selector}`);
    const text = loaded.files.get('package.json');
    owners.push({ directory, path: directory + 'package.json', sha256: hash(text), manifest: JSON.parse(text) });
  }
  for (const pkg of graph.packages ?? []) {
    const directory = path.posix.dirname(pkg.sourcePath) + '/';
    if (!requests.some(row => row.from.startsWith(directory))) continue;
    const bytes = execFileSync('git', ['-C', sourceDir, 'show', `${SDK54_EXPO_COMMIT}:${pkg.sourcePath}`], { maxBuffer: 16 * 1024 * 1024 });
    if (hash(bytes) !== pkg.manifestSha256) throw new Error(`Fixed owner manifest mismatch ${pkg.sourcePath}`);
    owners.push({ directory, path: pkg.sourcePath, sha256: hash(bytes), manifest: JSON.parse(bytes) });
  }
  return owners;
}

async function getArchive(url, maximumBytes) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'registry.npmjs.org' || parsed.port || parsed.username || parsed.password || parsed.hash) throw new Error('Unsupported archive GET URL');
  const response = await fetch(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(60000), headers: { accept: 'application/octet-stream' } });
  if (!response.ok) throw new Error(`Archive GET HTTP ${response.status}`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maximumBytes) throw new Error('Archive GET size limit');
    chunks.push(chunk);
  }
  return { bytes: Buffer.concat(chunks), retrievedAt: new Date().toISOString(), headers: Object.fromEntries([...response.headers].sort(([a], [b]) => a.localeCompare(b))) };
}

export async function acquireTransitiveDeclarationArchive(planned, { directory, network = false, maximumBytes = 32 * 1024 * 1024, cacheDirectory = path.join(os.homedir(), '.npm/_cacache/content-v2/sha512') } = {}) {
  if (path.basename(planned.filename) !== planned.filename) throw new Error('Unsafe archive filename');
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, planned.filename), receiptPath = file + '.receipt.json';
  let originalAcquisition = { method: 'UNKNOWN_INITIAL_ACQUISITION', acquiredAt: null };
  if (!fs.existsSync(file)) {
    if (fs.existsSync(receiptPath)) throw new Error('Archive missing for immutable acquisition receipt');
    const hex = Buffer.from(planned.identity.integrity.slice(7), 'base64').toString('hex');
    const cachePath = path.join(cacheDirectory, hex.slice(0, 2), hex.slice(2, 4), hex.slice(4));
    let bytes;
    if (fs.existsSync(cachePath)) {
      bytes = fs.readFileSync(cachePath);
      originalAcquisition = { method: 'LOCAL_ORIGINAL_NPM_CACHE', acquiredAt: new Date().toISOString(), cachePath, originalRetrievalTime: 'UNKNOWN' };
    } else {
      if (!network) throw new Error('NETWORK_REQUIRED_ARCHIVE_NOT_CACHED');
      const response = await getArchive(planned.downloadUrl, maximumBytes);
      bytes = response.bytes;
      originalAcquisition = { method: 'FIXED_REGISTRY_GET', acquiredAt: response.retrievedAt, url: planned.downloadUrl, headers: response.headers };
    }
    verifyArchiveIntegrity(bytes, planned.identity);
    fs.writeFileSync(file, bytes, { flag: 'wx' });
  }
  const integrityVerification = verifyArchiveIntegrity(fs.readFileSync(file), planned.identity);
  if (!fs.existsSync(receiptPath)) save(receiptPath, { file, identity: planned.identity, downloadUrl: planned.downloadUrl, sha256: integrityVerification.sha256, originalAcquisition, recordedAt: new Date().toISOString() });
  const acquisitionReceipt = readArchiveReceipt(file, receiptPath, planned.identity, planned.downloadUrl);
  const result = { identity: planned.identity, selectors: planned.selectors, file, integrityVerification, acquisitionReceipt, receipt: { path: receiptPath, sha256: hash(fs.readFileSync(receiptPath)) }, runtimeAcceptance: 'NOT_VERIFIED' };
  try {
    const loaded = readDeclarationArchive(file, planned.identity);
    return { ...result, status: 'VERIFIED_FIXED_LOCK_ARCHIVE', archive: loaded.archive, declarationFiles: [...loaded.files.keys()].filter(name => /\.d\.[cm]?ts$/.test(name)).length };
  } catch (error) {
    if (!(error instanceof DeclarationArchiveStructureError)) throw error;
    return { ...result, status: 'VERIFIED_BYTES_REJECTED_STRUCTURE', reason: error.message };
  }
}

export async function investigateTransitiveSources({ graphFile = defaultGraph, sourceDir = '/tmp/sdk54-expo-source', outputDirectory = defaultOutput, network = false, planOnly = false } = {}) {
  const graph = readTransitiveGraphMetadata(graphFile);
  if (graph.source?.revision !== SDK54_EXPO_COMMIT) throw new Error('Semantic graph fixed source revision mismatch');
  const lockBytes = execFileSync('git', ['-C', sourceDir, 'show', `${SDK54_EXPO_COMMIT}:yarn.lock`], { maxBuffer: 32 * 1024 * 1024 });
  const locks = parseFixedYarnLock(lockBytes.toString());
  const owners = loadTransitiveOwnerManifests({ graph, sourceDir });
  const plan = planTransitiveDeclarationArchives({ graph, locks, owners });
  fs.mkdirSync(outputDirectory, { recursive: true });
  save(path.join(outputDirectory, 'transitive-source-plan.json'), plan);
  const result = { schemaVersion: 1, inputs: [{ path: graphFile, sha256: hash(fs.readFileSync(graphFile)) }, { path: 'yarn.lock', revision: SDK54_EXPO_COMMIT, sha256: hash(lockBytes) }], archives: [], verifiedSelectors: [], planOnly, runtimeAcceptance: 'NOT_VERIFIED' };
  if (!planOnly) for (const planned of plan.archives) {
    let row;
    try { row = await acquireTransitiveDeclarationArchive(planned, { directory: path.join(outputDirectory, 'downloads'), network }); }
    catch (error) { row = { identity: planned.identity, selectors: planned.selectors, status: 'UNRESOLVED', error: String(error) }; }
    result.archives.push(row);
    if (row.status === 'VERIFIED_FIXED_LOCK_ARCHIVE') result.verifiedSelectors.push(...row.selectors);
    save(path.join(outputDirectory, 'transitive-source-results.json'), result);
    console.log(JSON.stringify({ name: row.identity.name, version: row.identity.version, status: row.status, error: row.error }));
  }
  result.verifiedSelectors.sort();
  result.summary = { plannedArchives: plan.archives.length, verifiedArchives: result.archives.filter(row => row.status === 'VERIFIED_FIXED_LOCK_ARCHIVE').length, rejectedArchives: result.archives.filter(row => row.status === 'VERIFIED_BYTES_REJECTED_STRUCTURE').length, notAcquired: result.archives.filter(row => row.status === 'UNRESOLVED').length, boundaryRelations: plan.blockers.length };
  save(path.join(outputDirectory, 'transitive-source-results.json'), result);
  save(path.join(outputDirectory, 'verified-selectors.json'), result.verifiedSelectors);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), value = flag => { const index = args.indexOf(flag); if (index === -1) return undefined; if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Missing value ${flag}`); return args[index + 1]; };
  const result = await investigateTransitiveSources({ network: args.includes('--network'), planOnly: args.includes('--plan-only'), graphFile: value('--graph'), sourceDir: value('--source'), outputDirectory: value('--output') });
  console.log(JSON.stringify(result.summary));
}
