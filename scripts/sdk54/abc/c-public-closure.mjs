import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { extract, list } from 'tar';
import ts from 'typescript';
import { readSourceTree, readSourceBlobs } from '../source-inventory.mjs';
import { verifyFixedSource } from '../a-rebuild-source-evidence.mjs';
import { verifyCandidateManifest } from '../ai-e2e/evidence.mjs';
import { readPublicSurface } from '../m0-public-surface.mjs';
import { buildFiniteDeclarations } from '../m0-finite-declarations.mjs';
import { buildDerivedSourceProvenance } from '../m0-derived-source-provenance.mjs';
import { buildExportSourceBindings } from '../m0-export-source-bindings.mjs';
import { buildCapabilityMap, writeCapabilityMap } from '../m0-capability-map.mjs';
import { buildFinalScopeRelations } from '../m0-final-scope-relations.mjs';
import { buildFinalPublicClosure } from '../m0-final-public-closure.mjs';
import { projectTemplateSource } from '../m0-template-projection.mjs';
import { EXPO_IMAGE_UPSTREAM_SHA256, RELEASE_ID, RELEASE_PACKAGES } from '../release-catalog.mjs';
import { validateExports } from '../audit-packages.mjs';
import { main as rebuildM4Evidence } from '../a-m4-evidence.mjs';
import { args, read, save, sha256, newOutput, html, safeFile } from './c-evidence-lib.mjs';

const scopes = new Set(['M4_REQUIRED', 'M7_TRANSFER', 'SOURCE_CONTEXT']);
const count = (rows, key) => rows.reduce((out, row) => (out[row[key]] = (out[row[key]] ?? 0) + 1, out), {});
const sourceSuffixes = ['', '.ts', '.tsx', '.d.ts', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.d.ts', '/index.js',
  '.native.ts', '.native.tsx', '.ios.ts', '.ios.tsx', '.android.ts', '.android.tsx', '.web.ts', '.web.tsx'];
const sourceCodePattern = /\.(?:[cm]?[jt]s|[jt]sx)$/;

export function loadRelationInputs(manifestFile) {
  const root = path.dirname(path.resolve(manifestFile)), manifest = read(manifestFile), receipts = new Map();
  assert.equal(manifest.schemaVersion, 1, 'Invalid relation input manifest');
  const verify = (ref, content = false) => {
    assert.match(ref?.sha256 ?? '', /^[a-f0-9]{64}$/, 'Missing relation input hash');
    if (receipts.has(ref.path)) {
      assert.equal(receipts.get(ref.path).sha256, ref.sha256, 'Conflicting relation receipt');
      if (!content) return;
    }
    const file = safeFile(root, ref.path), bytes = fs.readFileSync(file);
    assert.equal(sha256(bytes), ref.sha256, `Relation input hash mismatch: ${ref.path}`);
    receipts.set(ref.path, { path: ref.path, sha256: ref.sha256, bytes: bytes.length });
    return bytes;
  };
  const values = {};
  for (const key of ['seedFacts', 'sharedReview', 'review', 'census', 'semanticRelations']) {
    const ref = manifest.inputs?.[key], bytes = verify(ref, true);
    values[key] = JSON.parse(ref.path.endsWith('.gz') ? gunzipSync(bytes) : bytes);
    // Like loadCapabilityMapInputs, consume the frozen seed facts themselves.
    // Their historical planning-document citations are not executable inputs.
    if (key !== 'seedFacts') for (const receipt of values[key].inputs ?? []) verify(receipt);
  }
  const source = values.seedFacts.source;
  for (const field of ['revision', 'tree']) {
    assert.ok(typeof source?.[field] === 'string' && source[field], 'Missing relation source identity');
    for (const value of Object.values(values)) assert.equal(value.source?.[field], source[field], 'Relation input source identity differs');
  }
  for (const binding of values.semanticRelations.sourceBindings) {
    verify({ path: binding.reference, sha256: binding.referenceSha256 });
    if (binding.publicImpactReview) verify({ path: binding.publicImpactReview.reference, sha256: binding.publicImpactReview.referenceSha256 });
  }
  return { ...values, sourceFiles: values.census.files, semanticFiles: values.semanticRelations.sourceBindings,
    historicalSeedReferencesNotReplayed: values.seedFacts.inputs ?? [],
    receipts: [...receipts.values()], manifestSha256: sha256(fs.readFileSync(manifestFile)) };
}

// Rebuild in this graph's namespace. Historical TYPE ordinals and the portable
// A-M4-REACHABILITY IDs are not keys into a different graph's memberships.
export function buildCapabilityRelations({ surface, scope, relations }) {
  for (const field of ['revision', 'tree']) assert.equal(relations.review.source?.[field], surface.source[field], 'Scope review source differs');
  const capabilityMap = buildCapabilityMap({ surface, seedFacts: relations.seedFacts,
    sharedReview: relations.sharedReview, pluginContracts: relations.pluginContracts ?? null });
  const scopeRelations = buildFinalScopeRelations({ ...capabilityMap, review: relations.review,
    sourceFiles: relations.sourceFiles, semanticFiles: relations.semanticFiles });
  const memberships = new Map(capabilityMap.memberships.filter(row => row.table === 'members').map(row => [row.recordId, row]));
  const members = new Map(surface.members.map(row => [row.id, row]));
  const declarations = new Map(surface.declarations.map(row => [row.id, row]));
  const blockers = [], memberReview = [];
  for (const row of scope.rows.filter(row => row.kind === 'public-member-candidate')) {
    const membership = memberships.get(row.id), member = members.get(row.id);
    const refs = (member?.declarationIds ?? []).map(id => declarations.get(id));
    const matches = membership && row.declarations?.length && row.declarations.every(ref => refs.some(actual =>
      actual && ['path', 'sha256', 'start', 'end'].every(key => ref[key] !== undefined && actual[key] === ref[key])));
    const valid = Boolean(matches && (row.scope !== 'M4_REQUIRED' || membership.capabilityIds.length));
    if (!valid) blockers.push({ code: 'MEMBER_RELATION_NOT_PROVEN', recordId: row.id,
      reason: !membership ? 'MEMBER_NOT_IN_CURRENT_GRAPH' : !matches ? 'DECLARATION_IDENTITY_DIFFERS' : 'REQUIRED_MEMBER_WITHOUT_CAPABILITY' });
    memberReview.push({ recordId: row.id, originalMembershipId: row.membershipId,
      membershipId: membership?.id ?? null, capabilityIds: membership?.capabilityIds ?? [],
      scope: row.scope, status: valid ? 'REBUILT_FROM_CURRENT_GRAPH' : 'BLOCKED' });
  }
  return { capabilityMap, scopeRelations, memberReview, blockers,
    reconstruction: 'NEW_SOURCE_RECONSTRUCTION', harmonySupportAccepted: false, stageClosable: false };
}

export function completeSourceRelations({ rebuilt, surface, publicDispositions, plugins }) {
  const requested = rebuilt.capabilityMap.memberships.filter(row =>
    ['types', 'members'].includes(row.table) && !row.sourceRefs.length);
  const derived = buildDerivedSourceProvenance({ ...surface, requested });
  return buildFinalPublicClosure({ ...surface, memberships: rebuilt.capabilityMap.memberships,
    publicDispositions, scopeRelations: rebuilt.scopeRelations, finite: { artifact: rebuilt.finite },
    derived, exportBindings: rebuilt.exportBindings, plugins });
}

export function relativeSourceTargets(file, content, availablePaths) {
  if (!sourceCodePattern.test(file)) return [];
  const projection = projectTemplateSource({ path: file, text: content });
  const ast = ts.createSourceFile(file, projection.text, ts.ScriptTarget.Latest, true,
    /[jt]sx$/.test(file) ? ts.ScriptKind.TSX : /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  if (ast.parseDiagnostics.length) throw new Error(`Cannot parse source dependency: ${file}`);
  const requests = new Set();
  const add = node => {
    if (node && ts.isStringLiteralLike(node) && node.text.startsWith('.')) requests.add(node.text);
  };
  const visit = node => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) add(node.moduleSpecifier);
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) add(node.moduleReference.expression);
    else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require' && node.arguments.length === 1) add(node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  const targets = new Set();
  const projectedPaths = new Map();
  if (projection.projection) for (const raw of availablePaths.keys()) {
    if (!raw.includes('{%')) continue;
    const projected = projectTemplateSource({ path: raw, text: raw.replaceAll('{%-', '<%-').replaceAll('%}', '%>') }).text;
    if (projectedPaths.has(projected)) throw new Error(`Ambiguous template source: ${projected}`);
    projectedPaths.set(projected, raw);
  }
  for (const request of requests) {
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), request));
    const stems = [base, base.replace(/\.[cm]?jsx?$/, '')];
    for (const stem of stems) for (const suffix of sourceSuffixes) {
      const candidate = stem + suffix;
      if (sourceCodePattern.test(candidate) && availablePaths.has(candidate)) targets.add(candidate);
      if (sourceCodePattern.test(candidate) && projectedPaths.has(candidate)) targets.add(projectedPaths.get(candidate));
    }
  }
  return [...targets].sort();
}

function relativeAssetTargets(file, content, availablePaths) {
  if (!sourceCodePattern.test(file)) return [];
  const projection = projectTemplateSource({ path: file, text: content });
  const ast = ts.createSourceFile(file, projection.text, ts.ScriptTarget.Latest, true,
    /[jt]sx$/.test(file) ? ts.ScriptKind.TSX : /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  if (ast.parseDiagnostics.length) throw new Error(`Cannot parse source dependency: ${file}`);
  const requests = new Set();
  const visit = node => {
    const add = value => {
      if (value && ts.isStringLiteralLike(value) && value.text.startsWith('.')) requests.add(value.text);
    };
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) add(node.moduleSpecifier);
    else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require' && node.arguments.length === 1) add(node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return [...requests].flatMap(request => {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), request));
    return !sourceCodePattern.test(target) && availablePaths.has(target) ? [{ request, path: target }] : [];
  }).sort((a, b) => a.path.localeCompare(b.path));
}

export function expandRelativeSourceEvidence({ contents, entries, readBlobs, assetRelations = [] }) {
  const pending = [...contents.keys()], visited = new Set(), receipts = new Map();
  while (pending.length) {
    const file = pending.shift();
    if (visited.has(file)) continue;
    visited.add(file);
    const source = contents.get(file);
    if (!source) continue;
    const sourceTargets = relativeSourceTargets(file, source.content, entries);
    const assets = relativeAssetTargets(file, source.content, entries);
    const targets = [...sourceTargets, ...assets.map(row => row.path)];
    const missing = targets.filter(target => !contents.has(target));
    for (let offset = 0; offset < missing.length; offset += 100) {
      const batch = missing.slice(offset, offset + 100).map(target => entries.get(target));
      for (const [target, bytes] of readBlobs(batch)) {
        const hash = sha256(bytes), entry = entries.get(target);
        contents.set(target, { path: target, content: bytes.toString(), sha256: hash, origin: 'fixed-expo-git' });
        receipts.set(target, { path: target, sha256: hash, bytes: bytes.length,
          origin: 'fixed-expo-git', blob: entry.oid, role: sourceCodePattern.test(target) ? 'TRANSITIVE_EXPORT_SOURCE' : 'TRANSITIVE_ASSET_SOURCE' });
        if (sourceCodePattern.test(target)) pending.push(target);
      }
    }
    for (const asset of assets) {
      const target = contents.get(asset.path);
      if (target) assetRelations.push({ from: file, request: asset.request, path: asset.path, sha256: target.sha256 });
    }
  }
  return [...receipts.values()].sort((a, b) => a.path.localeCompare(b.path));
}

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

export function buildSourceClosure({ scope, surface, files, relativeAssetTargets = [], relations = null,
  supplementalExports = [], packageTargets = [], ambientBindings = [] }) {
  const memberRows = scope.rows.filter(row => row.kind === 'public-member-candidate');
  const exportRows = scope.rows.filter(row => row.kind === 'public-export');
  const bindings = memberRows.flatMap(row => {
    const declaration = row.declarations?.find(item => item.path && Number.isInteger(item.start) && Number.isInteger(item.end));
    return declaration ? [{ id: row.id, path: declaration.path, start: declaration.start, end: declaration.end }] : [];
  });
  // Supplemental template exports use the export builder's source projection;
  // the finite member builder consumes only the declarations requested here.
  const finitePaths = new Set(bindings.map(row => row.path));
  const finiteFiles = files.filter(row => finitePaths.has(row.path));
  const finiteInventory = buildFiniteDeclarations({ files: finiteFiles, bindings: [] });
  const resolvable = [], unresolvedFinite = [];
  for (const binding of bindings) {
    const matches = finiteInventory.declarations.filter(row => row.path === binding.path
      && Number.isInteger(binding.start) && row.start <= binding.start && row.end >= binding.end);
    if (matches.length) resolvable.push(binding);
    else unresolvedFinite.push(binding);
  }
  const finite = buildFiniteDeclarations({ files: finiteFiles, bindings: resolvable });
  const derived = buildDerivedSourceProvenance({
    types: surface.types, members: surface.members, typeEdges: surface.typeEdges,
    declarations: surface.declarations, exports: surface.exports,
    requested: memberRows.map(row => ({ table: 'members', recordId: row.id })),
  });
  const exportBindings = buildExportSourceBindings({
    files, packageTargets, ambientBindings,
    relativeAssetTargets,
    requested: [...new Map([...exportRows.filter(row => row.source?.path && row.name).map(row => ({ id: row.id, path: row.source.path, name: row.name })),
      ...supplementalExports].map(row => [row.id, row])).values()],
  });
  const finiteIds = new Set(finite.bindings.map(row => row.id));
  const derivedIds = new Set(derived.records.map(row => row.recordId));
  const exportIds = new Set(exportBindings.bindings.map(row => row.id));
  const relationResult = relations ? buildCapabilityRelations({ surface, scope, relations }) : null;
  const blockers = relationResult ? [...relationResult.blockers] : [
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
  return { finite, derived, exportBindings, scopeRelations: relationResult?.scopeRelations ?? null,
    capabilityMap: relationResult?.capabilityMap ?? null, memberReview: relationResult?.memberReview ?? [], finalClosure: null, blockers,
    summary: { finiteBindings: finite.bindings.length, derivedRecords: derived.records.length,
      derivedBlockers: derived.blockers.length, exportBindings: exportBindings.bindings.length, exportBlockers: exportBindings.blockers.length },
    harmonySupportAccepted: false, stageClosable: false };
}

export function sourceEvidence(scope, sourceGit, sourceRoot, additionalSources = []) {
  const fixed = verifyFixedSource(sourceGit), entries = new Map(fixed.entries.map(row => [row.path, row]));
  const requested = new Set();
  for (const row of scope.rows) {
    if (row.source?.path && entries.has(row.source.path)) requested.add(row.source.path);
    for (const declaration of row.declarations ?? []) if (declaration.path && entries.has(declaration.path)) requested.add(declaration.path);
  }
  for (const ref of additionalSources) if (entries.has(ref.path)) requested.add(ref.path);
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
  for (const ref of additionalSources) receipt(ref, `SUPPLEMENTAL-EXPORT:${ref.path}`);
  const relativeAssetTargets = [];
  for (const row of expandRelativeSourceEvidence({ contents, entries, assetRelations: relativeAssetTargets,
    readBlobs: batch => readSourceBlobs(sourceGit, batch) })) receipts.set(`fixed-expo-git:${row.path}`, row);
  return { source: { revision: '5b42e3d21e0ac5e086752361ca8a5cb4de53bec1', tree: fixed.tree }, records,
    receipts: [...receipts.values()].sort((a, b) => a.path.localeCompare(b.path)),
    files: [...contents.values()].filter(row => sourceCodePattern.test(row.path)), relativeAssetTargets };
}

const manifestEntryFields = new Set(['main', 'module', 'types', 'exports']);
export const DEFAULT_ARCHIVE_LIMITS = Object.freeze({
  maxMembers: 100_000,
  maxFileBytes: 256 * 1024 * 1024,
  maxTotalBytes: 1024 * 1024 * 1024,
});

function pointerEscape(value) {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

function manifestLeaves(value, pointer, entries) {
  if (typeof value === 'string') entries.push({ pointer, target: value });
  else if (Array.isArray(value)) value.forEach((item, index) => manifestLeaves(item, `${pointer}/${index}`, entries));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) manifestLeaves(item, `${pointer}/${pointerEscape(key)}`, entries);
  }
}

function scopeManifestPointer(row) {
  if (row.kind === 'public-entry') {
    const encoded = row.id?.split(':')[3];
    if (encoded) return decodeURIComponent(encoded);
  }
  if (typeof row.entryId === 'string') {
    const hash = row.entryId.indexOf('#'), condition = row.entryId.lastIndexOf(':');
    if (hash >= 0 && condition > hash) return decodeURIComponent(row.entryId.slice(hash + 1, condition));
  }
  return null;
}

function archiveMemberForTarget(target) {
  if (typeof target !== 'string' || !target || target.includes('\\') || path.posix.isAbsolute(target)) return null;
  const normalized = path.posix.normalize(target.replace(/^\.\//, ''));
  if (!normalized || normalized === '..' || normalized.startsWith('../')) return null;
  return `package/${normalized}`;
}

function resolvedArchiveMember(target, field, memberSet) {
  const exact = archiveMemberForTarget(target);
  if (!exact) return null;
  const candidates = [exact];
  if (field === 'types' && !target.endsWith('.d.ts')) {
    candidates.push(`${exact}.d.ts`, `${exact}/index.d.ts`);
  } else if (field !== 'exports' && !path.posix.extname(exact)) {
    for (const extension of ['.js', '.mjs', '.cjs', '.json', '.node', '.ts', '.tsx', '.d.ts']) candidates.push(`${exact}${extension}`);
    for (const extension of ['.js', '.mjs', '.cjs', '.json', '.node', '.ts', '.tsx', '.d.ts']) candidates.push(`${exact}/index${extension}`);
  }
  return candidates.find(candidate => memberSet.has(candidate)) ?? null;
}

function publicManifestEntries(manifest) {
  const entries = [];
  for (const field of manifestEntryFields) {
    if (Object.hasOwn(manifest, field)) manifestLeaves(manifest[field], `/${field}`, entries);
  }
  return entries;
}

function bindingNames(name, output) {
  if (ts.isIdentifier(name)) output.add(name.text);
  else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const element of name.elements) if (ts.isBindingElement(element)) bindingNames(element.name, output);
  }
}

function relativeCodeCandidates(from, request) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), request));
  const candidates = [base];
  if (!path.posix.extname(base)) {
    for (const extension of ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.d.ts']) candidates.push(`${base}${extension}`);
    for (const extension of ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.d.ts']) candidates.push(`${base}/index${extension}`);
  }
  return [...new Set(candidates)];
}

function staticEntrySurface(entryFile, readRelative) {
  const cache = new Map(), files = new Map(), memo = new Map(), active = new Set();
  const read = file => {
    if (!cache.has(file)) cache.set(file, readRelative(file));
    return cache.get(file);
  };
  const resolve = (from, request) => relativeCodeCandidates(from, request).find(candidate => read(candidate)) ?? null;
  const scan = file => {
    if (memo.has(file)) return memo.get(file);
    if (active.has(file)) return { names: [], reexports: [], complete: false };
    active.add(file);
    const names = new Set(), reexports = new Set();
    let complete = true;
    const bytes = read(file);
    if (!bytes) {
      active.delete(file);
      return { names: [], reexports: [], complete: false };
    }
    files.set(file, sha256(bytes));
    const source = ts.createSourceFile(file, bytes.toString(), ts.ScriptTarget.Latest, true,
      /[jt]sx$/.test(file) ? ts.ScriptKind.TSX : /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS);
    if (source.parseDiagnostics.length) complete = false;
    const containsExportsReference = node => {
      if (ts.isIdentifier(node) && node.text === 'exports') return true;
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)
        && node.expression.text === 'module' && node.name.text === 'exports') return true;
      let found = false;
      ts.forEachChild(node, child => { if (!found && containsExportsReference(child)) found = true; });
      return found;
    };
    const taintedFunctions = new Set(), functionAliases = [], taintedExportObjects = new Set(), exportObjectAliases = [];
    for (const statement of source.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name && statement.body && containsExportsReference(statement.body)) {
        taintedFunctions.add(statement.name.text);
      }
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
        if ((ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))
          && containsExportsReference(declaration.initializer.body)) taintedFunctions.add(declaration.name.text);
        else if (ts.isIdentifier(declaration.initializer)) {
          functionAliases.push([declaration.name.text, declaration.initializer.text]);
          if (declaration.initializer.text === 'exports') taintedExportObjects.add(declaration.name.text);
          else exportObjectAliases.push([declaration.name.text, declaration.initializer.text]);
        } else if (ts.isPropertyAccessExpression(declaration.initializer) && ts.isIdentifier(declaration.initializer.expression)
          && declaration.initializer.expression.text === 'module' && declaration.initializer.name.text === 'exports') {
          taintedExportObjects.add(declaration.name.text);
        }
      }
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const [alias, target] of functionAliases) if (taintedFunctions.has(target) && !taintedFunctions.has(alias)) {
        taintedFunctions.add(alias); changed = true;
      }
      for (const [alias, target] of exportObjectAliases) if (taintedExportObjects.has(target) && !taintedExportObjects.has(alias)) {
        taintedExportObjects.add(alias); changed = true;
      }
    }
    const containsExportObjectReference = node => {
      if (containsExportsReference(node) || ts.isIdentifier(node) && taintedExportObjects.has(node.text)) return true;
      let found = false;
      ts.forEachChild(node, child => { if (!found && containsExportObjectReference(child)) found = true; });
      return found;
    };
    const follow = (request, mode = 'star', expected = []) => {
      if (!request.startsWith('.')) { reexports.add(request); complete = false; return; }
      const target = resolve(file, request);
      if (!target) { reexports.add(`${request}:missing`); complete = false; return; }
      const child = scan(target);
      for (const boundary of child.reexports) reexports.add(boundary);
      if (!child.complete) complete = false;
      if (mode === 'star') for (const name of child.names) if (name !== 'default') names.add(name);
      if (mode === 'named') for (const name of expected) if (!child.names.includes(name)) complete = false;
    };
    for (const statement of source.statements) {
      const exported = statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);
      if (exported && (ts.isClassDeclaration(statement) || ts.isFunctionDeclaration(statement)
        || ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)
        || ts.isEnumDeclaration(statement) || ts.isModuleDeclaration(statement))) {
        const isDefault = statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword);
        names.add(isDefault ? 'default' : statement.name?.text ?? 'default');
      } else if (exported && ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) bindingNames(declaration.name, names);
      }
      if (ts.isExportAssignment(statement)) names.add('default');
      if (ts.isExportDeclaration(statement)) {
        if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
          for (const element of statement.exportClause.elements) names.add(element.name.text);
          if (statement.moduleSpecifier && ts.isStringLiteralLike(statement.moduleSpecifier)) {
            follow(statement.moduleSpecifier.text, 'named', statement.exportClause.elements.map(element => element.propertyName?.text ?? element.name.text));
          }
        } else if (statement.exportClause && ts.isNamespaceExport(statement.exportClause)) {
          names.add(statement.exportClause.name.text);
          if (statement.moduleSpecifier && ts.isStringLiteralLike(statement.moduleSpecifier)) follow(statement.moduleSpecifier.text, 'named');
        } else if (statement.moduleSpecifier && ts.isStringLiteralLike(statement.moduleSpecifier)) follow(statement.moduleSpecifier.text);
      }
      if (!ts.isExpressionStatement(statement)) continue;
      const expression = statement.expression;
      if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const left = expression.left;
        if (ts.isPropertyAccessExpression(left)
          && (ts.isIdentifier(left.expression) && left.expression.text === 'exports'
            || ts.isIdentifier(left.expression) && taintedExportObjects.has(left.expression.text)
            || ts.isPropertyAccessExpression(left.expression) && ts.isIdentifier(left.expression.expression)
              && left.expression.expression.text === 'module' && left.expression.name.text === 'exports')) names.add(left.name.text);
        else if (ts.isPropertyAccessExpression(left) && ts.isIdentifier(left.expression)
          && left.expression.text === 'module' && left.name.text === 'exports' && ts.isObjectLiteralExpression(expression.right)) {
          for (const property of expression.right.properties) {
            if ((ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property) || ts.isMethodDeclaration(property))
              && property.name) names.add(property.name.getText(source).replace(/^['"]|['"]$/g, ''));
          }
        } else if (ts.isPropertyAccessExpression(left) && ts.isIdentifier(left.expression)
          && left.expression.text === 'module' && left.name.text === 'exports'
          && ts.isCallExpression(expression.right) && ts.isIdentifier(expression.right.expression) && expression.right.expression.text === 'require'
          && expression.right.arguments.length === 1 && ts.isStringLiteralLike(expression.right.arguments[0])) {
          follow(expression.right.arguments[0].text);
        } else if (ts.isPropertyAccessExpression(left) && ts.isIdentifier(left.expression)
          && left.expression.text === 'module' && left.name.text === 'exports') {
          names.add('default');
          complete = false;
        } else if (ts.isElementAccessExpression(left)
          && (ts.isIdentifier(left.expression) && left.expression.text === 'exports'
            || ts.isIdentifier(left.expression) && taintedExportObjects.has(left.expression.text)
            || ts.isPropertyAccessExpression(left.expression) && ts.isIdentifier(left.expression.expression)
              && left.expression.expression.text === 'module' && left.expression.name.text === 'exports')) {
          if (left.argumentExpression && ts.isStringLiteralLike(left.argumentExpression)) names.add(left.argumentExpression.text);
          else complete = false;
        }
      }
      if (!ts.isCallExpression(expression)) continue;
      let recognizedExportCall = false;
      if (ts.isPropertyAccessExpression(expression.expression) && ts.isIdentifier(expression.expression.expression)
        && expression.expression.expression.text === 'Object' && expression.expression.name.text === 'defineProperty'
        && expression.arguments.length >= 2 && ts.isIdentifier(expression.arguments[0])
        && (expression.arguments[0].text === 'exports' || taintedExportObjects.has(expression.arguments[0].text))
        && ts.isStringLiteralLike(expression.arguments[1]) && expression.arguments[1].text !== '__esModule') {
        names.add(expression.arguments[1].text);
        recognizedExportCall = true;
      } else if (ts.isIdentifier(expression.expression) && expression.expression.text === '__exportStar'
        && expression.arguments.length >= 1 && ts.isCallExpression(expression.arguments[0])
        && ts.isIdentifier(expression.arguments[0].expression) && expression.arguments[0].expression.text === 'require'
        && expression.arguments[0].arguments.length === 1 && ts.isStringLiteralLike(expression.arguments[0].arguments[0])) {
        follow(expression.arguments[0].arguments[0].text);
        recognizedExportCall = true;
      } else if (ts.isIdentifier(expression.expression) && expression.expression.text === '__createBinding'
        && expression.arguments.length >= 3 && ts.isIdentifier(expression.arguments[0]) && expression.arguments[0].text === 'exports'
        && ts.isStringLiteralLike(expression.arguments[2])) {
        const exportedName = expression.arguments[3];
        names.add(exportedName && ts.isStringLiteralLike(exportedName) ? exportedName.text : expression.arguments[2].text);
        recognizedExportCall = true;
      } else if (ts.isPropertyAccessExpression(expression.expression) && ts.isIdentifier(expression.expression.expression)
        && expression.expression.expression.text === 'Object' && expression.expression.name.text === 'assign'
        && expression.arguments.length >= 2 && ts.isIdentifier(expression.arguments[0])
        && (expression.arguments[0].text === 'exports' || taintedExportObjects.has(expression.arguments[0].text))) {
        for (const argument of expression.arguments.slice(1)) {
          if (ts.isCallExpression(argument) && ts.isIdentifier(argument.expression) && argument.expression.text === 'require'
            && argument.arguments.length === 1 && ts.isStringLiteralLike(argument.arguments[0])) follow(argument.arguments[0].text);
          else complete = false;
        }
        recognizedExportCall = true;
      }
      if (!recognizedExportCall && (expression.arguments.some(containsExportObjectReference)
        || ts.isIdentifier(expression.expression) && taintedFunctions.has(expression.expression.text))) complete = false;
    }
    active.delete(file);
    const surface = { names: [...names].filter(name => name !== '__esModule').sort(), reexports: [...reexports].sort(), complete };
    memo.set(file, surface);
    return surface;
  };
  const surface = scan(entryFile);
  return { ...surface,
    files: [...files].sort(([a], [b]) => a.localeCompare(b)).map(([file, hash]) => ({ path: file, sha256: hash })) };
}

const surfaceShape = surface => surface && ({ names: surface.names, reexports: surface.reexports, complete: surface.complete });

function frozenGitReader(sourceRoot, revision) {
  return relative => {
    if (typeof relative !== 'string' || path.posix.isAbsolute(relative) || relative.includes('\\') || relative.split('/').includes('..')) return null;
    const result = spawnSync('git', ['-C', sourceRoot, 'show', `${revision}:${relative}`], { encoding: null, maxBuffer: 64 * 1024 * 1024 });
    return result.status === 0 ? result.stdout : null;
  };
}

async function inspectCandidateArchive(file, limits = DEFAULT_ARCHIVE_LIMITS) {
  const members = [], memberPaths = new Set();
  let entryError = null, memberCount = 0, totalBytes = 0;
  await list({
    file,
    strict: true,
    onentry(entry) {
      if (entryError) return;
      memberCount += 1;
      if (memberCount > limits.maxMembers) entryError = new Error(`archive member count limit exceeded: ${memberCount} > ${limits.maxMembers}`);
      if (!['File', 'Directory'].includes(entry.type)) entryError = new Error(`unsupported archive member type: ${entry.path}`);
      if (!entry.path.startsWith('package/') || entry.path.includes('\\') || entry.path.split('/').includes('..')) {
        entryError ??= new Error(`unsafe archive member: ${entry.path}`);
      }
      const normalized = path.posix.normalize(entry.path);
      if (normalized !== entry.path) entryError ??= new Error(`non-canonical archive member: ${entry.path}`);
      if (memberPaths.has(normalized)) entryError ??= new Error(`duplicate archive member: ${entry.path}`);
      memberPaths.add(normalized);
      if (entry.type === 'File') {
        if (!Number.isSafeInteger(entry.size) || entry.size < 0) entryError ??= new Error(`invalid archive member size: ${entry.path}`);
        else {
          if (entry.size > limits.maxFileBytes) entryError ??= new Error(`archive file size limit exceeded: ${entry.path}/${entry.size} > ${limits.maxFileBytes}`);
          totalBytes += entry.size;
          if (!Number.isSafeInteger(totalBytes) || totalBytes > limits.maxTotalBytes) {
            entryError ??= new Error(`archive expanded bytes limit exceeded: ${totalBytes} > ${limits.maxTotalBytes}`);
          }
        }
        members.push(normalized);
      }
    },
  });
  if (entryError) throw entryError;
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-c-candidate-'));
  try {
    await extract({ file, cwd: temporary, strict: true });
    const manifestFile = path.join(temporary, 'package/package.json');
    if (!fs.existsSync(manifestFile)) throw new Error('archive omits package/package.json');
    const manifestBytes = fs.readFileSync(manifestFile), manifest = JSON.parse(manifestBytes), memberSet = new Set(members);
    const entryFiles = {}, entrySurfaces = {};
    const readRelative = relative => {
      const member = `package/${relative}`;
      if (!memberSet.has(member)) return null;
      const target = path.join(temporary, member);
      return fs.statSync(target).isFile() ? fs.readFileSync(target) : null;
    };
    for (const entry of publicManifestEntries(manifest)) {
      const member = resolvedArchiveMember(entry.target, entry.pointer.split('/')[1], memberSet);
      if (!member) continue;
      const bytes = fs.readFileSync(path.join(temporary, member)), relative = member.slice('package/'.length);
      entryFiles[entry.pointer] = { member, relative, bytes, sha256: sha256(bytes) };
      if (sourceCodePattern.test(relative)) entrySurfaces[entry.pointer] = staticEntrySurface(relative, readRelative);
    }
    return { manifest, manifestSha256: sha256(manifestBytes), members: members.sort(), entryFiles, entrySurfaces };
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

export async function loadExternalManifestBaselines({ sourceRoot, scopeFile }) {
  const baselines = new Map(), errors = [], inputsRoot = path.resolve(path.dirname(scopeFile), '..');
  let taskInputs;
  try { taskInputs = read(path.join(sourceRoot, 'docs/releases/sdk54-abc-20261111/inputs.json')); }
  catch (error) { return { baselines, errors: [`External public baseline manifest invalid: ${error.message}`] }; }
  const filesByPath = new Map((Array.isArray(taskInputs.files) ? taskInputs.files : []).map(row => [row.path, row]));
  const inputsByPackage = new Map([
    ['@react-native-ohos/react-native-screens', 'inputs/screens-4.9.0-upstream.tgz'],
    ['expo-image', 'inputs/expo-image-3.0.11.tgz'],
  ]);
  for (const descriptor of RELEASE_PACKAGES.filter(row => !row.relativePath)) {
    const relative = inputsByPackage.get(descriptor.installName);
    // Image was added after the historical input bundle. Its release-catalog
    // pin is authoritative; do not rewrite the old bundle or trust a new hash.
    const receipt = descriptor.installName === 'expo-image'
      ? { sha256: EXPO_IMAGE_UPSTREAM_SHA256 } : filesByPath.get(relative);
    try {
      if (!relative || !receipt) throw new Error('fixed input receipt is missing');
      const archive = path.resolve(inputsRoot, relative), relation = path.relative(inputsRoot, archive);
      if (relation === '..' || relation.startsWith(`..${path.sep}`)) throw new Error('fixed input path escapes the input root');
      const bytes = fs.readFileSync(archive);
      if ((receipt.bytes !== undefined && bytes.length !== receipt.bytes) || sha256(bytes) !== receipt.sha256) throw new Error('fixed input bytes differ from pinned receipt');
      const inspected = await inspectCandidateArchive(archive);
      if (inspected.manifest.name !== descriptor.installName || inspected.manifest.version !== descriptor.upstreamVersion) {
        throw new Error('fixed input package identity differs from the release catalog');
      }
      baselines.set(descriptor.installName, { entries: publicManifestEntries(inspected.manifest), entrySurfaces: inspected.entrySurfaces,
        path: relative, sha256: receipt.sha256, manifestSha256: inspected.manifestSha256 });
    } catch (error) {
      errors.push(`External public baseline invalid: ${descriptor.installName}/${error.message}`);
    }
  }
  return { baselines, errors };
}

export async function verifyCandidatePublicSurface({ candidateFile, scope, sourceRevision, sourceRoot,
  packageCatalog = RELEASE_PACKAGES, releaseId = RELEASE_ID, externalManifestBaselines = new Map(), baselineErrors = [],
  archiveLimits = DEFAULT_ARCHIVE_LIMITS, readFrozenSource = null }) {
  const manifestErrors = verifyCandidateManifest(candidateFile), errors = [...manifestErrors, ...baselineErrors], packages = [], root = path.dirname(candidateFile);
  let candidate, handoff;
  try {
    candidate = read(candidateFile);
    handoff = read(path.join(root, 'b-candidate.json'));
  } catch (error) {
    errors.push(`Candidate handoff invalid: ${error.message}`);
    return { valid: false, candidateSha256: null, bCandidateSha256: null, source: null, packages, errors,
      harmonySupportAccepted: false, boundary: 'Candidate files do not establish device/runtime support.' };
  }
  const result = () => {
    const candidateSha256 = sha256(fs.readFileSync(candidateFile));
    return { valid: errors.length === 0, candidate: { path: path.resolve(candidateFile), sha256: candidateSha256 }, candidateSha256,
    bCandidateSha256: sha256(fs.readFileSync(path.join(root, 'b-candidate.json'))), source: handoff?.source ?? null, packages, errors,
    harmonySupportAccepted: false,
    boundary: 'Candidate identity, manifests and archive membership are verified here; device/runtime support remains independently unaccepted.' };
  };
  if (!handoff || typeof handoff !== 'object' || Array.isArray(handoff)) {
    errors.push('B candidate handoff invalid: expected an object');
    return result();
  }
  if (handoff?.source?.revision !== sourceRevision) {
    errors.push(`Source revision mismatch: candidate=${handoff?.source?.revision ?? '<missing>'} current=${sourceRevision ?? '<missing>'}`);
  }
  if (handoff?.source?.dirty !== false || !Array.isArray(handoff?.source?.changes) || handoff.source.changes.length) {
    errors.push('B candidate source must be clean and contain no recorded changes');
  }
  if (!Array.isArray(handoff?.failures) || handoff.failures.length) errors.push('B candidate handoff contains failures');

  if (manifestErrors.length) return result();

  const candidateRows = Array.isArray(candidate.packages) ? candidate.packages
    : [...(Array.isArray(candidate.expoPackages) ? candidate.expoPackages : []),
      ...(Array.isArray(candidate.externalPackages) ? candidate.externalPackages : [])];
  const runtimeRows = Array.isArray(handoff.runtimePackages) ? handoff.runtimePackages : [];
  const validRuntimeRows = Array.isArray(handoff.runtimePackages) && runtimeRows.every(row => row && typeof row === 'object'
    && typeof row.name === 'string' && row.name
    && typeof row.installName === 'string' && row.installName
    && typeof row.version === 'string' && row.version
    && typeof row.file === 'string' && row.file
    && Number.isSafeInteger(row.bytes) && row.bytes > 0
    && /^[a-f0-9]{64}$/.test(row.sha256 ?? '')
    && Array.isArray(row.members) && row.members.every(member => typeof member === 'string' && member));
  if (handoff?.schemaVersion !== 1 || !validRuntimeRows) {
    errors.push('B candidate handoff invalid: runtimePackages contains a malformed package row');
    return result();
  }
  const catalogByPublishedName = new Map(packageCatalog.map(row => [row.publishName, row]));
  const catalogByInstallName = new Map(packageCatalog.map(row => [row.installName, row]));
  const runtimeByPublishedName = new Map(runtimeRows.map(row => [row.name, row]));
  const runtimeByInstallName = new Map(runtimeRows.map(row => [row.installName, row]));
  if (candidate.release !== releaseId) errors.push(`Candidate release mismatch: ${candidate.release ?? '<missing>'}`);
  if (candidateRows.length !== packageCatalog.length || runtimeRows.length !== packageCatalog.length
    || runtimeByPublishedName.size !== runtimeRows.length || runtimeByInstallName.size !== runtimeRows.length) {
    errors.push('Candidate package set differs from the release catalog');
  }
  for (const descriptor of packageCatalog) {
    if (!candidateRows.some(row => row?.name === descriptor.publishName)) errors.push(`Catalog package absent from candidate: ${descriptor.publishName}`);
  }
  const scopeRowsByPackage = new Map();
  for (const row of Array.isArray(scope?.rows) ? scope.rows : []) {
    if (!row.packageId?.startsWith('PKG:')) continue;
    const name = row.packageId.slice(4);
    if (!scopeRowsByPackage.has(name)) scopeRowsByPackage.set(name, []);
    scopeRowsByPackage.get(name).push(row);
  }
  for (const name of scopeRowsByPackage.keys()) {
    if (!runtimeByInstallName.has(name)) errors.push(`Scope package absent from candidate: ${name}`);
  }
  if (runtimeRows.length !== candidateRows.length) errors.push('B candidate package count differs from candidate.json');
  const readSource = readFrozenSource ?? frozenGitReader(sourceRoot, sourceRevision);

  for (const item of candidateRows) {
    const descriptor = catalogByPublishedName.get(item.name);
    const runtime = runtimeByPublishedName.get(item.name);
    if (!runtime) {
      errors.push(`Candidate package absent from b-candidate.json: ${item.name}`);
      continue;
    }
    if (!descriptor || runtime.installName !== descriptor.installName || runtime.name !== descriptor.publishName
      || runtime.version !== descriptor.publishVersion || catalogByInstallName.get(runtime.installName) !== descriptor) {
      errors.push(`Release catalog mapping mismatch: ${runtime.installName ?? '<missing>'}/${item.name}`);
    }
    for (const key of ['name', 'version', 'file', 'bytes', 'sha256']) {
      if (runtime[key] !== item[key]) errors.push(`B candidate package identity mismatch: ${item.name}/${key}`);
    }
    let inspected;
    try {
      inspected = await inspectCandidateArchive(path.resolve(root, item.file), archiveLimits);
    } catch (error) {
      errors.push(`Cannot inspect candidate archive ${item.file}: ${error.message}`);
      continue;
    }
    if (inspected.manifest.name !== item.name || inspected.manifest.version !== item.version) {
      errors.push(`Archive manifest identity mismatch: ${item.file}`);
    }
    if (!Array.isArray(runtime.members) || JSON.stringify(runtime.members) !== JSON.stringify(inspected.members)) {
      errors.push(`B candidate member list mismatch: ${item.file}`);
    }
    const memberSet = new Set(inspected.members), manifestEntries = publicManifestEntries(inspected.manifest);
    if (Object.hasOwn(inspected.manifest, 'exports')) {
      errors.push(...validateExports(inspected.manifest.exports).failures.map(failure => `${runtime.installName}: ${failure}`));
    }
    for (const entry of manifestEntries) {
      const member = resolvedArchiveMember(entry.target, entry.pointer.split('/')[1], memberSet);
      if (!member || !memberSet.has(member)) errors.push(`Manifest entry member absent: ${runtime.installName}/${entry.pointer}/${entry.target}`);
      const surface = inspected.entrySurfaces[entry.pointer];
      if (surface && surface.complete !== true) errors.push(`Candidate public entry export analysis incomplete: ${runtime.installName}/${entry.pointer}`);
    }

    const trackedRows = scopeRowsByPackage.get(runtime.installName) ?? [];
    const scopedPointers = new Set();
    for (const row of trackedRows) {
      let pointer;
      try { pointer = scopeManifestPointer(row); }
      catch (error) { errors.push(`Invalid scope manifest pointer: ${row.id}/${error.message}`); continue; }
      if (pointer && manifestEntryFields.has(pointer.split('/')[1])) scopedPointers.add(pointer);
    }
    for (const pointer of scopedPointers) {
      const entry = manifestEntries.find(value => value.pointer === pointer);
      if (!entry) errors.push(`Scope manifest entry absent from candidate: ${runtime.installName}/${pointer}`);
    }

    let baselineEntries = null, baselineSurfaces = null, baselineKind = null;
    if (descriptor?.relativePath && sourceRoot) {
      try {
        const sourceManifestBytes = readSource(`${descriptor.relativePath}/package.json`);
        if (!sourceManifestBytes) throw new Error('manifest is absent from the frozen source revision');
        const sourceManifest = JSON.parse(sourceManifestBytes);
        baselineEntries = publicManifestEntries(sourceManifest);
        baselineSurfaces = {};
        const readPackageFile = relative => readSource(`${descriptor.relativePath}/${relative}`);
        for (const entry of baselineEntries) {
          const candidateEntry = inspected.entryFiles[entry.pointer];
          if (!candidateEntry || !sourceCodePattern.test(candidateEntry.relative)) continue;
          const frozenBytes = readPackageFile(candidateEntry.relative);
          if (!frozenBytes) errors.push(`Frozen source public entry absent: ${runtime.installName}/${entry.pointer}/${candidateEntry.relative}`);
          else {
            if (sha256(frozenBytes) !== candidateEntry.sha256) errors.push(`Frozen source public entry bytes mismatch: ${runtime.installName}/${entry.pointer}`);
            baselineSurfaces[entry.pointer] = staticEntrySurface(candidateEntry.relative, readPackageFile);
          }
        }
        baselineKind = { kind: 'frozen-source-commit', revision: sourceRevision, path: `${descriptor.relativePath}/package.json`,
          sha256: sha256(sourceManifestBytes) };
      } catch (error) {
        errors.push(`Public entry baseline invalid: ${runtime.installName}/${error.message}`);
      }
    }
    const externalBaseline = externalManifestBaselines.get(runtime.installName);
    if (!baselineEntries && externalBaseline) {
      baselineEntries = Array.isArray(externalBaseline) ? externalBaseline : externalBaseline.entries;
      baselineSurfaces = Array.isArray(externalBaseline) ? null : externalBaseline.entrySurfaces;
      baselineKind = { kind: 'verified-portable-input', path: externalBaseline.path ?? null, sha256: externalBaseline.sha256 ?? null };
    }
    if (!baselineEntries && scopedPointers.size) baselineEntries = manifestEntries.filter(entry => scopedPointers.has(entry.pointer));
    if (!baselineEntries) errors.push(`Public entry baseline missing: ${runtime.installName}`);
    else {
      const baselineByPointer = new Map(baselineEntries.map(entry => [entry.pointer, entry]));
      const candidateByPointer = new Map(manifestEntries.map(entry => [entry.pointer, entry]));
      for (const baseline of baselineEntries) {
        const entry = candidateByPointer.get(baseline.pointer);
        if (!entry) errors.push(`Source manifest public entry absent from candidate: ${runtime.installName}/${baseline.pointer}`);
        else if (entry.target !== baseline.target) errors.push(`Source manifest public entry target mismatch: ${runtime.installName}/${baseline.pointer}`);
      }
      for (const entry of manifestEntries) if (!baselineByPointer.has(entry.pointer)) {
        errors.push(`Manifest public entry absent from scope or source baseline: ${runtime.installName}/${entry.pointer}`);
      }
      if (!baselineSurfaces) errors.push(`Public entry export baseline missing: ${runtime.installName}`);
      else for (const [pointer, baselineSurface] of Object.entries(baselineSurfaces)) {
        const candidateSurface = inspected.entrySurfaces[pointer];
        const expected = descriptor?.relativePath ? baselineSurface : surfaceShape(baselineSurface);
        const actual = descriptor?.relativePath ? candidateSurface : surfaceShape(candidateSurface);
        if (!candidateSurface || JSON.stringify(actual) !== JSON.stringify(expected)) {
          errors.push(`Public entry exports mismatch: ${runtime.installName}/${pointer}`);
        }
      }
      if (baselineSurfaces) for (const pointer of Object.keys(inspected.entrySurfaces)) {
        if (!Object.hasOwn(baselineSurfaces, pointer)) errors.push(`Candidate public entry exports absent from baseline: ${runtime.installName}/${pointer}`);
      }
    }
    for (const row of trackedRows.filter(value => value.kind === 'public-entry')) {
      let pointer;
      try { pointer = scopeManifestPointer(row); } catch { continue; }
      if (pointer && manifestEntryFields.has(pointer.split('/')[1])) continue;
      const prefix = `${runtime.installName}/`;
      if (typeof row.name === 'string' && row.name.startsWith(prefix)) {
        const member = archiveMemberForTarget(row.name.slice(prefix.length));
        if (!member || !memberSet.has(member)) errors.push(`Scope public entry member absent: ${row.id}/${member ?? '<invalid>'}`);
      }
    }
    packages.push({ installName: runtime.installName, name: item.name, version: item.version, file: item.file, sha256: item.sha256,
      manifestSha256: inspected.manifestSha256, members: inspected.members,
      manifestEntries, entrySurfaces: inspected.entrySurfaces, scopeTracked: trackedRows.length > 0,
      publicEntryBaseline: baselineKind });
  }
  return result();
}

export async function main(argv) {
  const a = args(argv, ['source-root', 'reconstruction', 'scope', 'candidate', 'mode', 'output', 'relations']);
  for (const key of ['source-root', 'reconstruction', 'scope', 'mode', 'output']) assert.ok(a[key], `Missing --${key}`);
  assert.ok(['source', 'candidate'].includes(a.mode), 'Mode must be source or candidate');
  assert.equal(Boolean(a.candidate), a.mode === 'candidate', 'Candidate mode requires --candidate and source mode forbids it');
  const output = newOutput(a.output), scope = read(a.scope), audit = auditScope(scope);
  const surface = readPublicSurface(path.join(a.reconstruction, 'public-surface.json'));
  const relations = a.relations ? loadRelationInputs(a.relations) : null;
  const supplementalExports = relations ? surface.exports.filter(row => !row.declarationIds?.length)
    .map(row => ({ id: row.id, path: row.moduleId.slice('MODULE:'.length), name: row.name })) : [];
  const packageTargets = relations ? surface.entries.filter(row => row.request === '@expo/config-plugins').flatMap(row =>
    (row.target.projectionCandidates ?? []).map(candidate => ({ request: row.request, path: candidate.path, entryId: row.id, config: candidate.config }))) : [];
  const ambientBindings = relations ? [{ request: 'xcode', name: 'XcodeProject', path: 'packages/@expo/cli/ts-declarations/xcode/index.d.ts' }] : [];
  const evidence = sourceEvidence(scope, path.join(a.reconstruction, 'expo-official.git'), a['source-root'],
    [...supplementalExports, ...packageTargets, ...ambientBindings]);
  const rebuilt = buildSourceClosure({ scope, surface, files: evidence.files, relativeAssetTargets: evidence.relativeAssetTargets,
    relations, supplementalExports, packageTargets, ambientBindings });
  const sourceErrors = [...audit.errors];
  if (evidence.source.revision !== '5b42e3d21e0ac5e086752361ca8a5cb4de53bec1' || evidence.source.tree !== '5457e824b21d968e55c8f533cdf1751860160a92') sourceErrors.push('Fixed Expo identity mismatch');
  if (!audit.relationClosed) sourceErrors.push('Reviewed scope explicitly remains incomplete');
  const publicClosure = { schemaVersion: 1, format: 'sdk54-c-public-closure-orchestration-v1', mode: a.mode, source: evidence.source, records: evidence.records,
    sourceReceipts: evidence.receipts, summary: audit.summary, blockers: sourceErrors, relationClosed: sourceErrors.length === 0,
    finalClosure: rebuilt.finalClosure, intermediateSummary: rebuilt.summary, harmonySupportAccepted: false, stageClosable: false };
  const sourceRevision = spawnSync('git', ['-C', a['source-root'], 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const external = a.mode === 'candidate' ? await loadExternalManifestBaselines({ sourceRoot: a['source-root'], scopeFile: a.scope }) : null;
  const coverage = a.mode === 'candidate' ? await verifyCandidatePublicSurface({ candidateFile: a.candidate, scope, sourceRevision,
    sourceRoot: a['source-root'], externalManifestBaselines: external.baselines, baselineErrors: external.errors })
    : { valid: false, candidate: null, candidateSha256: null, packages: [], errors: ['Candidate not supplied in source mode'], harmonySupportAccepted: false,
      boundary: 'Source mode cannot accept candidate coverage.' };
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
  if (relations) {
    save(path.join(output, 'relation-input-audit.json'), { manifestSha256: relations.manifestSha256, receipts: relations.receipts,
      historicalSeedReferencesNotReplayed: relations.historicalSeedReferencesNotReplayed,
      reconstruction: 'NEW_SOURCE_RECONSTRUCTION', historicalAcceptanceRestored: false });
    writeCapabilityMap(path.join(output, 'capability-map.json'), rebuilt.capabilityMap);
    save(path.join(output, 'member-relations.json'), rebuilt.memberReview);
    if (pluginReplay.valid) {
      const dispositionFile = path.join(a.reconstruction, 'public-dispositions.json');
      const receipt = read(path.join(a.reconstruction, 'reconstruction-manifest.json')).files.find(row => row.path === 'public-dispositions.json');
      assert.equal(sha256(fs.readFileSync(dispositionFile)), receipt?.sha256, 'Reconstructed dispositions changed');
      const full = completeSourceRelations({ rebuilt, surface, publicDispositions: read(dispositionFile),
        plugins: read(path.join(output, 'plugin-contracts.json')) });
      // Use the existing final-closure shard format; avoid a single huge JSON string.
      const parts = path.join(output, 'final-public-closure.json.parts'); fs.mkdirSync(parts);
      const recordShards = [];
      for (let at = 0; at < full.records.length; at += 256) {
        const rows = full.records.slice(at, at + 256), bytes = gzipSync(JSON.stringify(rows)), hash = sha256(bytes), file = `${hash}.json.gz`;
        fs.writeFileSync(path.join(parts, file), bytes, { flag: 'wx' });
        recordShards.push({ path: file, sha256: hash, count: rows.length, firstId: rows[0].id, lastId: rows.at(-1).id });
      }
      const { records, ...metadata } = full;
      save(path.join(output, 'final-public-closure.json'), { ...metadata, recordCount: records.length, recordShards });
      publicClosure.finalClosure = { path: 'final-public-closure.json', summary: full.summary };
      rebuilt.blockers.push(...full.blockers.map(row => ({ ...row, code: 'FINAL_SOURCE_RELATION_BLOCKER' })));
    }
  }
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
  save(path.join(output, 'scope-relations.json'), { status: rebuilt.scopeRelations ? 'NEW_SOURCE_RECONSTRUCTION' : 'BLOCKED_MISSING_INPUTS', value: rebuilt.scopeRelations,
    blocker: rebuilt.blockers.find(row => row.code === 'MISSING_CAPABILITY_RELATIONS_INPUT') });
  save(path.join(output, 'plugin-contract-verification.json'), pluginReplay);
  save(path.join(output, 'candidate-coverage.json'), coverage);
  save(path.join(output, 'scope-review.json'), review);
  save(path.join(output, 'blockers.json'), { schemaVersion: 1, blockers });
  fs.writeFileSync(path.join(output, 'report.html'), html('SDK54 C 公开面闭合核验', { publicClosure, coverage, review, blockers }), { flag: 'wx' });
  return blockers.length ? 1 : 0;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) process.exitCode = await main(process.argv.slice(2));
