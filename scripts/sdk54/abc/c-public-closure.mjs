import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { readSourceTree, readSourceBlobs } from '../source-inventory.mjs';
import { verifyFixedSource } from '../a-rebuild-source-evidence.mjs';
import { verifyCandidateManifest } from '../ai-e2e/evidence.mjs';
import { readPublicSurface } from '../m0-public-surface.mjs';
import { buildFiniteDeclarations } from '../m0-finite-declarations.mjs';
import { buildDerivedSourceProvenance } from '../m0-derived-source-provenance.mjs';
import { buildExportSourceBindings } from '../m0-export-source-bindings.mjs';
import { main as rebuildM4Evidence } from '../a-m4-evidence.mjs';
import { args, read, save, sha256, newOutput, html } from './c-evidence-lib.mjs';

const scopes = new Set(['M4_REQUIRED', 'M7_TRANSFER', 'SOURCE_CONTEXT']);
const count = (rows, key) => rows.reduce((out, row) => (out[row[key]] = (out[row[key]] ?? 0) + 1, out), {});

export function auditScope(document) {
  const errors = [], ids = new Set(), rows = Array.isArray(document?.rows) ? document.rows : [];
  for (const row of rows) {
    if (typeof row?.id !== 'string' || !row.id || ids.has(row.id)) errors.push(`Duplicate or missing public ID: ${row?.id}`);
    ids.add(row?.id);
    if (!scopes.has(row?.scope)) errors.push(`Unknown scope: ${row?.id}/${row?.scope}`);
    if (row.acceptance !== 'NOT_RUN') errors.push(`Scope input must not claim runtime acceptance: ${row?.id}`);
    if (row.scope === 'M4_REQUIRED' && !/^M4-[A-Z]\d\d$/.test(row.acceptanceId ?? '')) errors.push(`Missing M4 assertion: ${row.id}`);
    if (row.scope === 'M7_TRANSFER' && (!/^M7\.[1-6]$/.test(row.batch ?? '') || !row.target)) errors.push(`Incomplete M7 transfer: ${row.id}`);
    if (row.source && (typeof row.source.path !== 'string' || !row.source.path || row.source.sha256 && !/^[a-f0-9]{64}$/.test(row.source.sha256))) {
      errors.push(`Invalid source reference: ${row.id}`);
    }
    if (row.kind === 'public-member-candidate' && (!row.ownerTypeId || !row.membershipId || !['PUBLIC_REACHABLE', 'IMPLEMENTATION_TYPE_CONTEXT'].includes(row.reachability))) {
      errors.push(`Incomplete member relation: ${row.id}`);
    }
  }
  if (!rows.length) errors.push('Public scope is empty');
  const relationClosed = errors.length === 0 && document.complete === true;
  return { valid: errors.length === 0, relationClosed, errors, summary: { records: rows.length, scopes: count(rows, 'scope'), kinds: count(rows, 'kind') },
    harmonySupportAccepted: false, stageClosable: false };
}

export function buildSourceClosure({ scope, surface, files }) {
  const memberRows = scope.rows.filter(row => row.kind === 'public-member-candidate');
  const exportRows = scope.rows.filter(row => row.kind === 'public-export');
  const bindings = memberRows.flatMap(row => {
    const declaration = row.declarations?.find(item => item.path && Number.isInteger(item.start) && Number.isInteger(item.end));
    return declaration ? [{ id: row.id, path: declaration.path, start: declaration.start, end: declaration.end }] : [];
  });
  const finiteInventory = buildFiniteDeclarations({ files, bindings: [] });
  const resolvable = [], unresolvedFinite = [];
  for (const binding of bindings) {
    const matches = finiteInventory.declarations.filter(row => row.path === binding.path
      && Number.isInteger(binding.start) && row.start <= binding.start && row.end >= binding.end);
    if (matches.length) resolvable.push(binding);
    else unresolvedFinite.push(binding);
  }
  const finite = buildFiniteDeclarations({ files, bindings: resolvable });
  const derived = buildDerivedSourceProvenance({
    types: surface.types, members: surface.members, typeEdges: surface.typeEdges,
    declarations: surface.declarations, exports: surface.exports,
    requested: memberRows.map(row => ({ table: 'members', recordId: row.id })),
  });
  const exportBindings = buildExportSourceBindings({
    files,
    requested: exportRows.filter(row => row.source?.path && row.name).map(row => ({ id: row.id, path: row.source.path, name: row.name })),
  });
  const finiteIds = new Set(finite.bindings.map(row => row.id));
  const derivedIds = new Set(derived.records.map(row => row.recordId));
  const exportIds = new Set(exportBindings.bindings.map(row => row.id));
  const blockers = [
    { code: 'MISSING_CAPABILITY_RELATIONS_INPUT', required: ['capabilities', 'dependencies', 'seedDecisions', 'scope review decisions'],
      reason: 'The portable bundle does not contain the historical capability/use relation inputs.' },
    { code: 'MISSING_FULL_MEMBERSHIP_INPUT', required: ['complete memberships for entries, exports, types, members, plugins and candidateDispositions'],
      reason: 'The portable bundle contains M4 reachability rows, not the original 549,312 membership ledger.' },
  ];
  for (const row of unresolvedFinite) blockers.push({ code: 'FINITE_DECLARATION_BLOCKER', table: 'members', recordId: row.id,
    reason: 'NO_NAMED_DECLARATION_CONTAINS_SOURCE_RANGE', path: row.path, start: row.start, end: row.end });
  for (const row of memberRows) if (!finiteIds.has(row.id) && !derivedIds.has(row.id)) {
    blockers.push({ code: 'MISSING_SOURCE_EVIDENCE', table: 'members', recordId: row.id });
  }
  for (const row of exportRows) if (!exportIds.has(row.id)) {
    blockers.push({ code: 'MISSING_EXPORT_SOURCE_BINDING', table: 'exports', recordId: row.id });
  }
  for (const row of derived.blockers) blockers.push({ code: 'DERIVED_SOURCE_BLOCKER', table: row.table, recordId: row.recordId, reason: row.reason });
  return { finite, derived, exportBindings, scopeRelations: null, finalClosure: null, blockers,
    summary: { finiteBindings: finite.bindings.length, derivedRecords: derived.records.length,
      derivedBlockers: derived.blockers.length, exportBindings: exportBindings.bindings.length, exportBlockers: exportBindings.blockers.length },
    harmonySupportAccepted: false, stageClosable: false };
}

function sourceEvidence(scope, sourceGit, sourceRoot) {
  const fixed = verifyFixedSource(sourceGit), entries = new Map(fixed.entries.map(row => [row.path, row]));
  const requested = new Set();
  for (const row of scope.rows) {
    if (row.source?.path && entries.has(row.source.path)) requested.add(row.source.path);
    for (const declaration of row.declarations ?? []) if (declaration.path && entries.has(declaration.path)) requested.add(declaration.path);
  }
  const blobs = new Map();
  const selected = [...requested].map(file => entries.get(file));
  for (let offset = 0; offset < selected.length; offset += 100) {
    for (const [file, bytes] of readSourceBlobs(sourceGit, selected.slice(offset, offset + 100))) blobs.set(file, bytes);
  }
  const receipts = new Map(), contents = new Map();
  const receipt = (ref, id) => {
    if (!ref?.path) return null;
    let bytes, origin, blob = entries.get(ref.path)?.oid ?? null;
    if (blobs.has(ref.path)) { bytes = blobs.get(ref.path); origin = 'fixed-expo-git'; }
    else {
      const file = path.resolve(sourceRoot, ref.path), relation = path.relative(sourceRoot, file);
      if (relation === '..' || relation.startsWith(`..${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) throw Error(`Missing source for ${id}: ${ref.path}`);
      bytes = fs.readFileSync(file); origin = 'current-source-tree';
    }
    const hash = sha256(bytes);
    if (ref.sha256 && ref.sha256 !== hash) throw Error(`Source hash mismatch for ${id}: ${ref.path}`);
    if (ref.line && (ref.line < 1 || ref.line > bytes.toString().split('\n').length)) throw Error(`Source line out of range for ${id}: ${ref.path}:${ref.line}`);
    const key = `${origin}:${ref.path}`;
    if (!receipts.has(key)) receipts.set(key, { path: ref.path, sha256: hash, bytes: bytes.length, origin, blob });
    contents.set(ref.path, { path: ref.path, content: bytes.toString(), sha256: hash, origin });
    return { ...ref, sha256: hash, origin, blob };
  };
  const records = scope.rows.map(row => ({ id: row.id, kind: row.kind, scope: row.scope, acceptance: row.acceptance,
    acceptanceId: row.acceptanceId ?? null, batch: row.batch ?? null, source: receipt(row.source, row.id),
    declarations: (row.declarations ?? []).map(ref => receipt(ref, row.id)), relationStatus: 'SOURCE_RELATION_VERIFIED',
    runtimeStatus: 'NOT_RUN', harmonySupportAccepted: false }));
  return { source: { revision: '5b42e3d21e0ac5e086752361ca8a5cb4de53bec1', tree: fixed.tree }, records,
    receipts: [...receipts.values()].sort((a, b) => a.path.localeCompare(b.path)), files: [...contents.values()] };
}

function candidateCoverage(candidateFile, scope) {
  const errors = verifyCandidateManifest(candidateFile), manifest = read(candidateFile), root = path.dirname(candidateFile);
  const packages = (manifest.packages ?? [...(manifest.expoPackages ?? []), ...(manifest.externalPackages ?? [])]);
  const entries = [];
  for (const item of packages) {
    const archive = path.resolve(root, item.file);
    const result = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (result.status !== 0) errors.push(`Cannot list archive ${item.file}: ${result.stderr.trim()}`);
    entries.push({ name: item.name, version: item.version, file: item.file, sha256: item.sha256,
      members: result.status === 0 ? result.stdout.trim().split('\n').filter(Boolean).sort() : [] });
  }
  const packageNames = new Set(entries.map(row => row.name));
  for (const row of scope.rows.filter(row => row.packageId?.startsWith('PKG:'))) {
    const name = row.packageId.slice(4);
    if (!packageNames.has(name)) errors.push(`Scope package absent from candidate: ${row.id}/${name}`);
  }
  return { valid: errors.length === 0, candidateSha256: sha256(fs.readFileSync(candidateFile)), packages: entries, errors,
    boundary: 'Archive membership is verified here; device/runtime support remains independently unaccepted.' };
}

export async function main(argv) {
  const a = args(argv, ['source-root', 'reconstruction', 'scope', 'candidate', 'mode', 'output']);
  for (const key of ['source-root', 'reconstruction', 'scope', 'mode', 'output']) assert.ok(a[key], `Missing --${key}`);
  assert.ok(['source', 'candidate'].includes(a.mode), 'Mode must be source or candidate');
  assert.equal(Boolean(a.candidate), a.mode === 'candidate', 'Candidate mode requires --candidate and source mode forbids it');
  const output = newOutput(a.output), scope = read(a.scope), audit = auditScope(scope);
  const evidence = sourceEvidence(scope, path.join(a.reconstruction, 'expo-official.git'), a['source-root']);
  const surface = readPublicSurface(path.join(a.reconstruction, 'public-surface.json'));
  const rebuilt = buildSourceClosure({ scope, surface, files: evidence.files });
  const sourceErrors = [...audit.errors];
  if (evidence.source.revision !== '5b42e3d21e0ac5e086752361ca8a5cb4de53bec1' || evidence.source.tree !== '5457e824b21d968e55c8f533cdf1751860160a92') sourceErrors.push('Fixed Expo identity mismatch');
  if (!audit.relationClosed) sourceErrors.push('Reviewed scope explicitly remains incomplete');
  const publicClosure = { schemaVersion: 1, format: 'sdk54-c-public-closure-orchestration-v1', mode: a.mode, source: evidence.source, records: evidence.records,
    sourceReceipts: evidence.receipts, summary: audit.summary, blockers: sourceErrors, relationClosed: sourceErrors.length === 0,
    finalClosure: rebuilt.finalClosure, intermediateSummary: rebuilt.summary, harmonySupportAccepted: false, stageClosable: false };
  const coverage = a.mode === 'candidate' ? candidateCoverage(a.candidate, scope)
    : { valid: false, candidateSha256: null, packages: [], errors: ['Candidate not supplied in source mode'], boundary: 'Source mode cannot accept candidate coverage.' };
  let pluginReplay;
  try {
    const typeContracts = path.join(path.dirname(a.scope), 'plugin-type-contracts.json');
    fs.copyFileSync(typeContracts, path.join(output, 'plugin-type-contracts.json'), fs.constants.COPYFILE_EXCL);
    await rebuildM4Evidence(['plugins', a.reconstruction, output]);
    const contracts = read(path.join(output, 'plugin-contracts.json'));
    pluginReplay = { valid: true, source: contracts.source, summary: contracts.summary,
      pluginContractsSha256: sha256(fs.readFileSync(path.join(output, 'plugin-contracts.json'))) };
  } catch (error) {
    pluginReplay = { valid: false, error: error.message };
  }
  const pluginBlockers = pluginReplay.valid ? [] : [{ code: 'PLUGIN_CONTRACT_REPLAY_FAILED', reason: pluginReplay.error }];
  const blockers = [...sourceErrors, ...rebuilt.blockers, ...pluginBlockers, ...coverage.errors];
  publicClosure.blockers = blockers;
  publicClosure.relationClosed = blockers.length === 0;
  publicClosure.intermediateOutputs = {
    finiteDeclarations: 'finite-declarations.json', derivedSourceProvenance: 'derived-source-provenance.json',
    exportSourceBindings: 'export-source-bindings.json', scopeRelations: 'scope-relations.json',
    pluginContracts: pluginReplay.valid ? 'plugin-contracts.json' : null,
  };
  const review = { schemaVersion: 1, scope: path.resolve(a.scope), scopeSha256: sha256(fs.readFileSync(a.scope)), ...audit };
  save(path.join(output, 'public-closure.json'), publicClosure);
  save(path.join(output, 'finite-declarations.json'), rebuilt.finite);
  save(path.join(output, 'derived-source-provenance.json'), rebuilt.derived);
  save(path.join(output, 'export-source-bindings.json'), rebuilt.exportBindings);
  save(path.join(output, 'scope-relations.json'), { status: 'BLOCKED_MISSING_INPUTS', value: rebuilt.scopeRelations,
    blocker: rebuilt.blockers.find(row => row.code === 'MISSING_CAPABILITY_RELATIONS_INPUT') });
  save(path.join(output, 'plugin-contract-verification.json'), pluginReplay);
  save(path.join(output, 'candidate-coverage.json'), coverage);
  save(path.join(output, 'scope-review.json'), review);
  save(path.join(output, 'blockers.json'), { schemaVersion: 1, blockers });
  fs.writeFileSync(path.join(output, 'report.html'), html('SDK54 C 公开面闭合核验', { publicClosure, coverage, review, blockers }), { flag: 'wx' });
  return blockers.length ? 1 : 0;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) process.exitCode = await main(process.argv.slice(2));
