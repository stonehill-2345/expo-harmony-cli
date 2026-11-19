import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import ts from 'typescript';
import { serializeInventory } from './source-inventory.mjs';
import { semanticTypeReferences } from './m0-consolidated.mjs';
import { collectDeclarationReferences } from './m0-reference-uses.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const sorted = rows => [...rows].sort((a, b) => compare(a.id, b.id));
const canonical = serializeInventory;
const format = 'sdk54-public-surface-shards-v1';
const tableNames = ['packages', 'entries', 'candidateDispositions', 'publication', 'inputs', 'modules', 'exports', 'types', 'members', 'typeEdges', 'declarations', 'uses', 'resolutions', 'fileDependencies', 'inferences', 'plugins', 'boundaries'];
const scalarReferences = ['constraintTypeId', 'defaultTypeId', 'genericDefinitionTypeId', 'sourceFamilyRepresentativeTypeId', 'checkTypeId', 'extendsTypeId', 'trueTypeId', 'falseTypeId', 'objectTypeId', 'indexTypeId', 'baseConstraintTypeId'];

function assertUnique(rows, name) {
  const ids = new Set();
  for (const row of rows) {
    if (!row.id || ids.has(row.id)) throw new Error(`Duplicate or missing ${name} identity: ${row.id}`);
    ids.add(row.id);
  }
  return ids;
}

function collectResolutions(graph) {
  const grouped = new Map();
  const add = (from, request, resolution, observer) => {
    const key = `${from}\0${request}`;
    if (!grouped.has(key)) grouped.set(key, { id: `RESOLUTION:${hash(key)}`, key, from, request, observations: [] });
    const row = grouped.get(key), value = { observer, resolution };
    if (!row.observations.some(previous => canonical(previous) === canonical(value))) row.observations.push(value);
  };
  for (const module of graph.modules) for (const dependency of module.dependencies ?? []) add(dependency.sourcePath, dependency.request, dependency.resolution, 'semantic-program');
  for (const row of graph.externalContext?.resolutions ?? []) {
    const { from, request, ...resolution } = row;
    add(from, request, resolution, 'external-declaration-context');
  }
  return sorted([...grouped.values()].map(row => {
    row.observations.sort((a, b) => compare(canonical(a), canonical(b)));
    const outcomes = new Set(row.observations.map(value => canonical({ status: value.resolution.status, path: value.resolution.path ?? null })));
    return { ...row, status: outcomes.size === 1 ? row.observations[0].resolution.status : 'AMBIGUOUS_OBSERVATION' };
  }));
}

export function buildPublicSurface({ graph, entryLedger, files, publication = [], templateProjection = false, referenceResolution = null, nodeSelfReferenceResolver = null }) {
  if (referenceResolution !== null && referenceResolution !== 'node-self') throw new Error('Unsupported reference resolution rule');
  if (referenceResolution && typeof nodeSelfReferenceResolver !== 'function') throw new Error('Node self-reference resolver required');
  for (const name of ['packages', 'modules', 'exports', 'types', 'inferences', 'plugins']) assertUnique(graph[name], name);
  const sourceHashes = new Map([...files].map(([file, text]) => [file, hash(String(text))]));
  for (const input of [...graph.inputs, ...(graph.externalContext?.files ?? []), ...(graph.compilerLibraries?.files ?? [])]) {
    if (!sourceHashes.has(input.path) || sourceHashes.get(input.path) !== input.sha256) throw new Error(`Input hash mismatch: ${input.path}`);
  }
  const typeIds = new Set(graph.types.map(row => row.id)), moduleIds = new Set(graph.modules.map(row => row.id));
  const declarations = new Map(), positionIndexes = new Map();
  const origin = location => {
    if (!location) return null;
    if ((!Number.isSafeInteger(location.start) || !Number.isSafeInteger(location.end)) && files.has(location.path) && Number.isSafeInteger(location.line) && Number.isSafeInteger(location.column)) {
      if (!positionIndexes.has(location.path)) {
        const source = ts.createSourceFile(location.path, String(files.get(location.path)), ts.ScriptTarget.Latest, true), positions = new Map();
        const visit = node => {
          if (ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
            const start = node.getStart(source), point = source.getLineAndCharacterOfPosition(start), key = `${point.line + 1}:${point.character + 1}`;
            if (!positions.has(key)) positions.set(key, []);
            positions.get(key).push({ start, end: node.end, kind: ts.SyntaxKind[node.kind] });
          }
          ts.forEachChild(node, visit);
        };
        visit(source); positionIndexes.set(location.path, positions);
      }
      const candidates = positionIndexes.get(location.path).get(`${location.line}:${location.column}`) ?? [];
      if (candidates.length === 1) location = { ...location, ...candidates[0], rangeOrigin: 'EXACT_AST_LINE_COLUMN' };
    }
    const hasRange = Number.isSafeInteger(location.start) && Number.isSafeInteger(location.end);
    const identity = [location.origin ?? 'fixed-source', location.path, ...(hasRange ? [location.start, location.end] : ['unmatched-position', location.line ?? null, location.column ?? null])];
    const id = `DECLARATION:${hash(JSON.stringify(identity))}`;
    if (!declarations.has(id)) {
      const text = files.has(location.path) ? String(files.get(location.path)) : null;
      const valid = text !== null && Number.isSafeInteger(location.start) && Number.isSafeInteger(location.end) && location.start >= 0 && location.end >= location.start && location.end <= text.length;
      declarations.set(id, { ...location, id, origin: identity[0], sha256: sourceHashes.get(location.path) ?? null,
        sliceSha256: valid ? hash(text.slice(location.start, location.end)) : null, sourceStatus: text === null ? 'SOURCE_UNAVAILABLE' : valid ? 'HASH_VERIFIED' : 'RANGE_INVALID' });
    }
    return id;
  };
  const origins = rows => [...new Set((rows ?? []).map(origin))].sort(compare);
  const resolutions = collectResolutions(graph), resolutionByKey = new Map(resolutions.map(row => [row.key, row]));
  const entryLinksByModule = new Map();
  for (const entry of entryLedger.entries) {
    const targets = [{ moduleId: entry.target?.moduleId, kind: ['fixed-ncc-entry-recipe', 'fixed-taskr-entry-recipe'].includes(entry.target?.method) ? 'CONDITIONAL_SOURCE_PROJECTION' : 'FIXED_ENTRY_TARGET' }, ...(entry.target?.projectionCandidates ?? []).map(row => ({ ...row, kind: 'CONDITIONAL_SOURCE_PROJECTION' }))];
    for (const target of targets) {
      const id = target.moduleId;
      if (!id) continue;
      if (!moduleIds.has(id)) throw new Error(`Dangling entry module: ${id}`);
      if (!entryLinksByModule.has(id)) entryLinksByModule.set(id, []);
      entryLinksByModule.get(id).push({ entryId: entry.id, kind: target.kind, runtimeAcceptance: 'NOT_VERIFIED' });
    }
  }
  const exports = sorted(graph.exports.map(row => {
    if (!moduleIds.has(row.moduleId)) throw new Error(`Dangling export module: ${row.id}`);
    for (const id of [row.typeId, row.instanceTypeId].filter(Boolean)) if (!typeIds.has(id)) throw new Error(`Dangling export type: ${row.id}/${id}`);
    const { declarations: locations, ...rest } = row;
    const entryLinks = (entryLinksByModule.get(row.moduleId) ?? []).sort((a, b) => compare(a.entryId, b.entryId) || compare(a.kind, b.kind));
    return { ...rest, declarationIds: origins(locations), entryIds: [...new Set(entryLinks.map(link => link.entryId))].sort(compare), entryLinks,
      disposition: entryLinks.length ? 'ENTRY_MODULE_EXPORT' : 'CONSERVATIVE_MODULE_CANDIDATE' };
  }));
  const reachable = new Set(), queue = exports.filter(row => row.entryIds.length).flatMap(row => [row.typeId, row.instanceTypeId]).filter(Boolean);
  const typeById = new Map(graph.types.map(row => [row.id, row]));
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    if (reachable.has(id)) continue;
    const type = typeById.get(id);
    if (!type) throw new Error(`Dangling public root type: ${id}`);
    reachable.add(id); queue.push(...semanticTypeReferences(type));
  }
  const members = [], typeEdges = [], types = [];
  for (const type of graph.types) {
    const memberIds = [], edgeIds = [], edgeTargets = [];
    const edge = (relation, toTypeId) => {
      if (!toTypeId) return;
      if (!typeIds.has(toTypeId)) throw new Error(`Dangling type reference: ${type.id}/${relation} -> ${toTypeId}`);
      const id = `TYPE-EDGE:${type.id}/${relation}`;
      typeEdges.push({ id, fromTypeId: type.id, relation, toTypeId }); edgeIds.push(id); edgeTargets.push(toTypeId);
    };
    const member = (relation, value) => {
      const id = `MEMBER:${type.id}/${relation}`;
      members.push({ id, ownerTypeId: type.id, relation, ...value }); memberIds.push(id);
      return id;
    };
    for (const name of ['arguments', 'constituents', 'aliasTypeArguments']) (type[name] ?? []).forEach((target, index) => edge(`${name}/${index}`, target));
    for (const name of scalarReferences) edge(name, type[name]);
    type.properties.forEach((property, index) => {
      const { declarations: locations, ...rest } = property;
      member(`properties/${index}`, { kind: 'property', ...rest, declarationIds: origins(locations) });
      edge(`properties/${index}/typeId`, property.typeId);
    });
    for (const kind of ['calls', 'constructs']) type[kind].forEach((signature, index) => {
      const prefix = `${kind}/${index}`;
      const parameterIds = signature.parameters.map((parameter, position) => {
        const { source, ...rest } = parameter;
        edge(`${prefix}/parameters/${position}/typeId`, parameter.typeId);
        return member(`${prefix}/parameters/${position}`, { kind: 'parameter', ...rest, declarationIds: source ? [origin(source)] : [] });
      });
      const { source, parameters, ...rest } = signature;
      member(prefix, { kind: kind === 'calls' ? 'call-signature' : 'construct-signature', ...rest, parameterIds, declarationIds: source ? [origin(source)] : [] });
      edge(`${prefix}/returnTypeId`, signature.returnTypeId);
      signature.typeParameters.forEach((target, position) => edge(`${prefix}/typeParameters/${position}`, target));
    });
    (type.indexes ?? []).forEach((value, index) => {
      const { source, ...rest } = value;
      member(`indexes/${index}`, { kind: 'index-signature', ...rest, declarationIds: source ? [origin(source)] : [] });
      edge(`indexes/${index}/keyTypeId`, value.keyTypeId); edge(`indexes/${index}/typeId`, value.typeId);
    });
    const actualReferences = edgeTargets.sort(compare);
    if (canonical(actualReferences) !== canonical(semanticTypeReferences(type).sort(compare))) throw new Error(`Semantic edge contract mismatch: ${type.id}`);
    const { properties, calls, constructs, indexes, declarations: locations, operationSource, ...details } = type;
    types.push({ ...details, declarationIds: origins(locations), operationSourceId: origin(operationSource), memberIds, edgeIds,
      reachability: reachable.has(type.id) ? 'ENTRY_REACHABLE' : 'CONSERVATIVE_CANDIDATE' });
  }
  const candidates = rows => sorted(rows.map(row => {
    const { source, ...rest } = row;
    for (const id of [row.typeId, row.optionsTypeId, ...(row.optionsTypeIds ?? [])].filter(Boolean)) if (!typeIds.has(id)) throw new Error(`Dangling candidate type: ${row.id}/${id}`);
    return { ...rest, declarationIds: source ? [origin(source)] : [] };
  }));
  const inferences = candidates(graph.inferences), plugins = candidates(graph.plugins);
  const scanned = collectDeclarationReferences({ files: new Map([...files].map(([file, text]) => [file, String(text)])), declarations: sorted([...declarations.values()]), resolutions, templateProjection });
  if (referenceResolution === 'node-self') {
    for (const use of scanned.uses) {
      if (resolutionByKey.has(use.resolutionKey)) continue;
      const from = declarations.get(use.declarationId)?.path;
      if (!/^__sdk54_external__\/@types\+node@[^/]+\//.test(from ?? '')) continue;
      const resolution = nodeSelfReferenceResolver(use.request, from);
      if (resolution?.status !== 'node-global-context') continue;
      const prefix = from.slice(0, from.indexOf('/', '__sdk54_external__/'.length) + 1);
      if (!resolution.declarations?.length || resolution.declarations.some(row => !row.path.startsWith(prefix) || !files.has(row.path) || !Number.isSafeInteger(row.start) || row.start < 0 || row.start >= String(files.get(row.path)).length)) throw new Error('Invalid Node probe declaration source');
      const value = { ...resolution, declarations: resolution.declarations.map(row => ({ ...row, sha256: sourceHashes.get(row.path) })) };
      const row = { id: `RESOLUTION:${hash(use.resolutionKey)}`, key: use.resolutionKey, from, request: use.request, status: value.status,
        observations: [{ observer: 'lexical-reference-source-probe', resolution: value }] };
      resolutions.push(row); resolutionByKey.set(row.key, row);
    }
    resolutions.sort((a, b) => compare(a.id, b.id));
  }
  const scans = new Map(scanned.declarations.map(row => [row.id, row]));
  const declarationRows = sorted([...declarations.values()].map(row => ({ ...row, ...scans.get(row.id) })));
  const uses = sorted(scanned.uses.map(row => ({ ...row, resolutionStatus: resolutionByKey.get(row.resolutionKey)?.status ?? row.resolutionStatus, resolutionId: resolutionByKey.get(row.resolutionKey)?.id ?? null })));
  const fileDependencies = resolutions.map(row => ({ id: `FILE-DEPENDENCY:${row.id}`, path: row.from, resolutionId: row.id, precision: 'FILE_CONTEXT_ONLY' }));
  const result = {
    schemaVersion: 1, source: graph.source, compilerVersion: graph.compilerVersion,
    policy: 'fixed-source entry and semantic coverage; reachability does not accept publication, runtime, platform, or truncated type completeness',
    publicSurfaceComplete: false, stageClosable: false,
    ...(templateProjection ? { templateProjections: scanned.projections } : {}),
    ...(referenceResolution ? { referenceResolution: { rule: referenceResolution, observer: 'lexical-reference-source-probe', acceptance: 'NODE_DECLARATION_CONTEXT_ONLY' } } : {}),
    packages: sorted(graph.packages.map(row => ({ ...row, entryAudit: entryLedger.packages.find(item => item.id === row.id) ?? null }))), entries: sorted(entryLedger.entries), candidateDispositions: sorted(entryLedger.candidateDispositions),
    publication: sorted(publication.map(row => ({ ...row, id: row.id ?? `PUBLICATION:${row.packageId}` }))),
    inputs: [...files].map(([file]) => ({ id: `INPUT:${file}`, path: file, sha256: sourceHashes.get(file) })).sort((a, b) => compare(a.id, b.id)),
    modules: sorted(graph.modules.map(({ dependencies, ...row }) => row)), exports, types: sorted(types), members: sorted(members), typeEdges: sorted(typeEdges),
    declarations: declarationRows, uses, resolutions, fileDependencies: sorted(fileDependencies), inferences, plugins,
    boundaries: sorted((entryLedger.boundaries ?? []).map((row, index) => typeof row === 'string' ? { id: `ENTRY-BOUNDARY:${index}`, kind: row } : { ...row, id: row.id ?? `ENTRY-BOUNDARY:${hash(canonical(row))}` })),
  };
  for (const name of tableNames) assertUnique(result[name], name);
  return structuredClone(result);
}

export function validatePublicSurface(actual, expected) {
  const failures = [];
  const declarationById = new Map(expected.declarations.map(row => [row.id, row]));
  const location = row => {
    const source = row.source ?? (row.declarationIds?.length ? declarationById.get(row.declarationIds[0]) : null);
    return source?.path ? ` at ${source.path}:${source.line ?? source.start ?? '?'}` : '';
  };
  for (const name of tableNames) {
    if (!Array.isArray(actual?.[name])) { failures.push(`Missing table: ${name}`); continue; }
    const rows = new Map();
    for (const row of actual[name]) {
      if (!row.id || rows.has(row.id)) failures.push(`Duplicate or missing ${name} identity: ${row.id}`);
      rows.set(row.id, row);
    }
    for (const row of expected[name]) {
      const found = rows.get(row.id);
      if (!found || canonical(found) !== canonical(row)) failures.push(`${found ? 'Changed' : 'Missing'} ${name}: ${row.id}${location(row)}`);
      rows.delete(row.id);
    }
    for (const id of rows.keys()) failures.push(`Unexpected ${name}: ${id}`);
  }
  const metadata = document => Object.fromEntries(Object.entries(document ?? {}).filter(([name]) => !tableNames.includes(name)));
  if (canonical(metadata(actual)) !== canonical(metadata(expected))) failures.push('Public surface metadata differs from fixed input reconstruction');
  return { valid: failures.length === 0, failures };
}

export function writePublicSurface(file, result, { recordsPerShard = 128 } = {}) {
  if (!Number.isSafeInteger(recordsPerShard) || recordsPerShard < 1 || recordsPerShard > 1024) throw new Error('Invalid public surface shard size');
  const directory = file + '.parts'; fs.mkdirSync(directory, { recursive: true });
  const metadata = Object.fromEntries(Object.entries(result).filter(([name]) => !tableNames.includes(name))), tables = {};
  for (const name of tableNames) {
    const rows = result[name], shards = [];
    for (let index = 0; index < rows.length; index += recordsPerShard) {
      const selected = rows.slice(index, index + recordsPerShard), bytes = gzipSync(canonical(selected)), sha256 = hash(bytes), filename = sha256 + '.json.gz';
      fs.writeFileSync(path.join(directory, filename), bytes);
      shards.push({ path: filename, sha256, count: selected.length, firstId: selected[0].id, lastId: selected.at(-1).id });
    }
    tables[name] = { count: rows.length, shards };
  }
  fs.writeFileSync(file, canonical({ schemaVersion: 1, format, metadata, tables }));
}

export function readPublicSurface(file) {
  const index = JSON.parse(fs.readFileSync(file));
  if (index.schemaVersion !== 1 || index.format !== format || canonical(Object.keys(index.tables ?? {}).sort()) !== canonical([...tableNames].sort())) throw new Error('Invalid public surface index');
  const result = { ...index.metadata };
  for (const name of tableNames) {
    const table = index.tables[name], rows = [], seen = new Set();
    for (const shard of table.shards) {
      if (!/^[a-f0-9]{64}\.json\.gz$/.test(shard.path) || seen.has(shard.path)) throw new Error('Invalid public surface shard path');
      seen.add(shard.path);
      const bytes = fs.readFileSync(path.join(file + '.parts', shard.path));
      if (hash(bytes) !== shard.sha256 || shard.path !== shard.sha256 + '.json.gz') throw new Error('Public surface shard integrity mismatch');
      const selected = JSON.parse(gunzipSync(bytes).toString());
      if (!Array.isArray(selected) || !selected.length || selected.length !== shard.count || selected[0].id !== shard.firstId || selected.at(-1).id !== shard.lastId) throw new Error('Public surface shard count mismatch');
      rows.push(...selected);
    }
    if (rows.length !== table.count) throw new Error('Public surface table count mismatch');
    assertUnique(rows, name); result[name] = rows;
  }
  return result;
}

export function summarizePublicSurface(result) {
  const counts = values => Object.fromEntries([...new Set(values)].sort(compare).map(value => [value, values.filter(item => item === value).length]));
  return { schemaVersion: 1, source: result.source, counts: Object.fromEntries(tableNames.map(name => [name, result[name].length])),
    entryKinds: counts(result.entries.map(row => row.kind)), reachableTypes: result.types.filter(row => row.reachability === 'ENTRY_REACHABLE').length,
    directTypeBoundaries: counts(result.types.flatMap(row => row.boundaries ?? [])),
    reachableTypeBoundaries: counts(result.types.filter(row => row.reachability === 'ENTRY_REACHABLE').flatMap(row => row.boundaries ?? [])),
    sourceStatuses: counts(result.declarations.map(row => row.sourceStatus)), referenceScanStatuses: counts(result.declarations.map(row => row.referenceScanStatus)),
    useResolutionStatuses: counts(result.uses.map(row => row.resolutionStatus)), publicSurfaceComplete: false, stageClosable: false };
}
