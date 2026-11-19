import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';

const tables = ['capabilities', 'memberships', 'dependencies', 'seedDecisions', 'analysisImpacts', 'sharedUseReviews'];
const memberTables = ['packages', 'entries', 'exports', 'types', 'members', 'plugins', 'candidateDispositions'];
const format = 'sdk54-capability-map-shards-v1';
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const ordered = rows => [...rows].sort((a, b) => compare(a.id, b.id));
const unique = values => [...new Set(values.filter(Boolean))].sort(compare);
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort(compare).map(key => [key, item[key]])) : item);
const hash = value => createHash('sha256').update(value).digest('hex');
const digest = value => hash(canonical(value));
const documentDigest = value => {
  const state = createHash('sha256');
  const visit = item => {
    if (Array.isArray(item)) { state.update('['); item.forEach((row, i) => { if (i) state.update(','); visit(row); }); state.update(']'); }
    else if (item && typeof item === 'object') { state.update('{'); Object.keys(item).filter(key => item[key] !== undefined).sort(compare).forEach((key, i) => { if (i) state.update(','); state.update(JSON.stringify(key) + ':'); visit(item[key]); }); state.update('}'); }
    else state.update(JSON.stringify(item) ?? 'null');
  };
  visit(value); return state.digest('hex');
};
const deferIds = new Set(['DEFER-GO', 'DEFER-EAS-BUILD', 'DEFER-EAS-SERVICES', 'DEFER-UPDATES', 'DEFER-DEV-CLIENT']);
const sharedNames = new Set(['@expo/home', 'eas-expo-go', 'expo-dev-client-components', 'expo-dev-launcher', 'expo-dev-menu', 'expo-dev-menu-interface', 'expo-eas-client', 'expo-updates-interface']);
const policyRef = { id: 'SDK54-FULL-CAPABILITY-SCOPE', path: 'docs/superpowers/specs/2026-10-21-sdk54-platform-coverage-inventory.md', sha256: '8b2eafdb63799703887ce209a142b67542f6ef95c4d1bde72e8fddf16f69f2a6', rule: 'ordinary-auth-debug-metro-local-build-assets-required; only-five-explicit-deferrals; source-census-always-retained' };

function indexRows(rows, name) {
  if (!Array.isArray(rows)) throw new Error(`Missing table: ${name}`);
  const index = new Map();
  for (const row of rows) {
    if (!row || typeof row.id !== 'string' || !row.id || index.has(row.id)) throw new Error(`Duplicate or missing ${name} identity: ${row?.id}`);
    index.set(row.id, row);
  }
  return index;
}

function checkScope(scope) {
  if (!scope || !['REQUIRED', 'DEFERRED', 'REQUIRES_REVIEW'].includes(scope.state) || (scope.state === 'DEFERRED' ? !deferIds.has(scope.scopeId) : scope.scopeId !== null)) throw new Error(`Invalid review scope: ${canonical(scope)}`);
}

function defaultScope(name, facts) {
  if (name === 'expo-updates') return { state: 'DEFERRED', scopeId: 'DEFER-UPDATES' };
  if (name === 'expo-dev-client') return { state: 'DEFERRED', scopeId: 'DEFER-DEV-CLIENT' };
  if (sharedNames.has(name) || facts?.capabilityScope?.state === 'DEFER_ASSOCIATION_REQUIRES_SHARED_USE_REVIEW') return { state: 'REQUIRES_REVIEW', scopeId: null };
  return { state: 'REQUIRED', scopeId: null };
}

export function buildCapabilityMap({ surface, seedFacts, pluginContracts = null, sharedReview = null }) {
  if (!surface?.source?.revision || !surface.source.tree || !seedFacts?.source?.revision || !seedFacts.source.tree) throw new Error('Missing fixed source revision/tree');
  if (surface.source.revision !== seedFacts.source.revision || surface.source.tree !== seedFacts.source.tree) throw new Error('Seed source differs from public surface source');
  const indexes = Object.fromEntries(memberTables.map(name => [name, indexRows(surface[name], name)]));
  for (const name of ['modules', 'declarations', 'typeEdges', 'boundaries']) indexes[name] = indexRows(surface[name] ?? [], name);
  for (const type of indexes.types.values()) {
    for (const id of type.memberIds ?? []) if (indexes.members.get(id)?.ownerTypeId !== type.id) throw new Error(`Dangling declared type member: ${type.id}/${id}`);
    for (const id of type.edgeIds ?? []) if (indexes.typeEdges.get(id)?.fromTypeId !== type.id) throw new Error(`Dangling declared type edge: ${type.id}/${id}`);
  }
  for (const entry of indexes.entries.values()) if (!indexes.packages.has(entry.packageId)) throw new Error(`Dangling entry package: ${entry.id}/${entry.packageId}`);
  for (const [name, rows] of [['exports', indexes.exports], ['plugins', indexes.plugins]]) for (const row of rows.values()) {
    for (const id of row.entryIds ?? []) if (!indexes.entries.has(id)) throw new Error(`Dangling ${name} entry: ${row.id}/${id}`);
    for (const id of unique([row.typeId, row.instanceTypeId, row.optionsTypeId, ...(row.optionsTypeIds ?? [])])) if (!indexes.types.has(id)) throw new Error(`Dangling ${name} root type: ${row.id}/${id}`);
  }
  const seeds = indexRows(seedFacts.records, 'seed facts'), templates = indexRows(seedFacts.templatesOutside183RowSeedDiff ?? [], 'template facts');
  if (seedFacts.summary?.records !== undefined && seedFacts.summary.records !== seeds.size) throw new Error('Seed facts count mismatch');
  if (seedFacts.summary?.extraTemplates !== undefined && seedFacts.summary.extraTemplates !== templates.size) throw new Error('Template facts count mismatch');
  const factsByName = new Map([...seeds.values()].map(row => [row.name, row]));
  const packageRoots = [...indexes.packages.values()].map(row => ({ id: row.id, root: path.posix.dirname(row.sourcePath ?? row.source?.path ?? row.entryAudit?.source?.path ?? '') + '/' })).filter(row => row.root !== './').sort((a, b) => b.root.length - a.root.length);
  const ownerAtPath = file => file ? packageRoots.find(row => file.startsWith(row.root))?.id ?? null : null;
  const sourceCache = new WeakMap();
  const sourceRefs = row => {
    if (sourceCache.has(row)) return sourceCache.get(row);
    const refs = [];
    if (row.source?.path) refs.push(row.source);
    if (row.sourcePath) refs.push({ path: row.sourcePath, sha256: row.manifestSha256 ?? null, blob: row.manifestBlob ?? null });
    for (const id of unique([...(row.declarationIds ?? []), row.operationSourceId])) {
      const declaration = indexes.declarations.get(id);
      if (!declaration) throw new Error(`Dangling source declaration: ${row.id}/${id}`);
      refs.push({ declarationId: id, path: declaration.path, sha256: declaration.sha256 ?? null, sourceStatus: declaration.sourceStatus ?? 'NOT_VERIFIED', ...(Number.isInteger(declaration.start) ? { start: declaration.start, end: declaration.end } : {}) });
    }
    if (!refs.length && row.ownerTypeId && indexes.types.has(row.ownerTypeId)) for (const ref of sourceRefs(indexes.types.get(row.ownerTypeId))) refs.push({ ...ref, sourceRelation: 'OWNER_TYPE_CONTEXT_NOT_MEMBER_DECLARATION', ownerTypeId: row.ownerTypeId });
    if (!refs.length && row.path) refs.push({ path: row.path, sha256: row.sha256 ?? null });
    const result = [...new Map(refs.map(ref => [canonical(ref), ref])).values()].sort((a, b) => compare(canonical(a), canonical(b)));
    sourceCache.set(row, result); return result;
  };
  const directOwners = row => unique([row.packageId, row.ownerPackageId, ...(row.ownerPackageIds ?? []), row.moduleId && indexes.modules.get(row.moduleId)?.packageId, ...sourceRefs(row).map(ref => ownerAtPath(ref.path)), row.moduleId && ownerAtPath(indexes.modules.get(row.moduleId)?.source?.path)].filter(id => indexes.packages.has(id)));
  const reviewEntries = new Map(), sharedUseReviews = [];
  if (sharedReview !== null) {
    if (sharedReview.schemaVersion !== 1 || sharedReview.source?.revision !== surface.source.revision || sharedReview.source?.tree !== surface.source.tree || !Array.isArray(sharedReview.packages)) throw new Error('Invalid shared review source/schema');
    indexRows(sharedReview.packages, 'shared review');
    const reviewPackages = new Set();
    for (const review of sharedReview.packages) {
      if (!indexes.packages.has(review.packageId) || reviewPackages.has(review.packageId)) throw new Error(`Invalid or duplicate shared review package: ${review.packageId}`);
      reviewPackages.add(review.packageId);
      if (!Array.isArray(review.sourceRefs) || !review.sourceRefs.length || !Array.isArray(review.entryDecisions)) throw new Error(`Missing shared review evidence: ${review.id}`);
      for (const decision of review.entryDecisions) {
        const entry = indexes.entries.get(decision.entryId);
        if (!entry || entry.packageId !== review.packageId || reviewEntries.has(decision.entryId)) throw new Error(`Invalid or conflicting shared review entry: ${decision.entryId}`);
        checkScope(decision.scope);
        if (!Array.isArray(decision.sourceRefs) || !decision.sourceRefs.length || !decision.reason) throw new Error(`Missing shared review entry evidence: ${decision.entryId}`);
        reviewEntries.set(decision.entryId, { ...decision, reviewId: review.id });
      }
      sharedUseReviews.push({ ...structuredClone(review), recordSha256: digest(review), reviewStatus: (review.unresolvedUses?.length || review.entryDecisions.some(row => row.scope.state === 'REQUIRES_REVIEW')) ? 'REQUIRES_REVIEW' : 'ENTRY_DECISIONS_RECORDED', acceptance: 'SOURCE_REVIEW_NOT_HARMONY_SUPPORT' });
    }
  }
  for (const pkg of indexes.packages.values()) {
    if (!sharedNames.has(pkg.name) || sharedUseReviews.some(row => row.packageId === pkg.id)) continue;
    sharedUseReviews.push({ id: `SHARED-USE-REVIEW:${pkg.id}`, packageId: pkg.id, name: pkg.name, sourceRefs: sourceRefs(pkg), entryDecisions: [], unresolvedUses: ['ENTRY_AND_CONSUMER_SOURCE_REVIEW_NOT_SUPPLIED'], conclusion: 'REQUIRES_REVIEW', reviewStatus: 'REQUIRES_REVIEW', acceptance: 'SOURCE_REVIEW_NOT_HARMONY_SUPPORT' });
  }
  const capabilities = new Map(), rootsByCap = new Map(), publicRoots = new Map(), pendingRoots = new Map(), rowCaps = new Map();
  const depsByPackage = new Map(), dependencies = [];
  for (const pkg of indexes.packages.values()) {
    for (const [section, declarations] of Object.entries(pkg.dependencies ?? {})) {
      const kind = { dependencies: 'runtime', optionalDependencies: 'optional', peerDependencies: 'peer', devDependencies: 'build-test' }[section];
      if (!kind) throw new Error(`Unsupported manifest dependency section: ${pkg.id}/${section}`);
      for (const [name, value] of Object.entries(declarations)) {
        const spec = typeof value === 'string' ? value : value.spec, targetId = typeof value === 'string' ? null : value.targetId ?? null;
        if (typeof spec !== 'string' || (targetId !== null && !indexes.packages.has(targetId))) throw new Error(`Dangling or invalid workspace dependency: ${pkg.id}/${section}/${name}/${targetId}`);
        const id = `CAPABILITY-DEPENDENCY:${encodeURIComponent(pkg.id)}:${section}:${encodeURIComponent(name)}`;
        dependencies.push({ id, ownerPackageId: pkg.id, section, kind, name, spec, targetId, identityStatus: targetId ? 'WORKSPACE_SOURCE_IDENTITY' : 'UNRESOLVED_EXTERNAL_IDENTITY', sourceRefs: sourceRefs(pkg), sourcePointer: `/${section}/${name.replaceAll('~', '~0').replaceAll('/', '~1')}`, historicalInstalledIdentity: 'NOT_VERIFIED' });
        if (!depsByPackage.has(pkg.id)) depsByPackage.set(pkg.id, []); depsByPackage.get(pkg.id).push(id);
      }
    }
  }
  const ensureCap = (packageId, scope, evidence = []) => {
    const id = `CAPABILITY:${encodeURIComponent(packageId)}:${scope.state}:${scope.scopeId ?? 'ordinary'}`;
    if (capabilities.has(id)) return id;
    const pkg = indexes.packages.get(packageId), fact = factsByName.get(pkg.name), batch = fact?.existingPreassignment?.batch;
    const template = [...templates.values()].some(row => row.name === pkg.name);
    const milestoneIds = unique(['M0', ...(template ? ['M0A', 'M7.1'] : batch ? [batch] : [])]);
    capabilities.set(id, { id, kind: 'PACKAGE_SCOPE_FUNCTION_GROUP', ownerPackageId: packageId, rootRecordIds: [], sourceRefs: sourceRefs(pkg), dependencyIds: unique(depsByPackage.get(packageId) ?? []), milestoneIds, milestoneEvidence: fact ? [{ recordId: fact.id, recordSha256: digest(fact), existingPreassignment: fact.existingPreassignment ?? null }] : [], batchAssessment: batch || template ? 'PREASSIGNMENT_RETAINED_NOT_ACCEPTED' : 'REQUIRES_REVIEW', scope: { ...scope }, scopeEvidence: [policyRef, ...sourceRefs(pkg), ...evidence], applicability: 'NOT_ASSESSED', applicabilityEvidence: ['PLATFORM_APPLICABILITY_NOT_INFERRED_FROM_BATCH_OR_SCOPE'], implementationStatus: 'NOT_ASSESSED', originalImplementationStatus: pkg.implementation ?? 'NOT_ASSESSED', analysisBoundaries: [], followupTaskIds: unique([`M0-SOURCE-COVERAGE:${packageId}`, ...(batch || template ? [] : [`BATCH-MAPPING-REVIEW:${packageId}`]), ...(scope.state === 'REQUIRES_REVIEW' ? [`SHARED-USE-REVIEW:${packageId}`] : [])]) });
    rootsByCap.set(id, new Set()); publicRoots.set(id, new Set()); pendingRoots.set(id, new Set()); return id;
  };
  const capsForOwner = packageId => {
    const pkg = indexes.packages.get(packageId), fact = factsByName.get(pkg.name);
    return ensureCap(packageId, defaultScope(pkg.name, fact), fact ? [{ recordId: fact.id, recordSha256: digest(fact) }] : []);
  };
  const attach = (table, row, capIds, root = false) => {
    const key = `${table}\0${row.id}`;
    if (!rowCaps.has(key)) rowCaps.set(key, new Set());
    for (const id of capIds) { rowCaps.get(key).add(id); if (root) rootsByCap.get(id).add(row.id); }
  };
  for (const pkg of indexes.packages.values()) {
    const entries = [...indexes.entries.values()].filter(row => row.packageId === pkg.id), reviews = entries.map(row => reviewEntries.get(row.id)).filter(Boolean);
    const ids = new Set();
    for (const entry of entries) {
      const review = reviewEntries.get(entry.id);
      const cap = review ? ensureCap(pkg.id, review.scope, [{ reviewId: review.reviewId, entryId: entry.id, reason: review.reason, sourceRefs: review.sourceRefs }]) : capsForOwner(pkg.id);
      attach('entries', entry, [cap], true); ids.add(cap);
    }
    if (!ids.size || (reviews.length < entries.length && sharedNames.has(pkg.name))) ids.add(capsForOwner(pkg.id));
    attach('packages', pkg, [...ids], true);
  }
  const entryCaps = entryId => [...(rowCaps.get(`entries\0${entryId}`) ?? [])];
  for (const row of indexes.exports.values()) {
    const capIds = unique([...(row.entryIds ?? []).flatMap(entryCaps), ...((row.entryIds?.length ?? 0) ? [] : directOwners(row).map(capsForOwner))]);
    attach('exports', row, capIds, true);
    for (const id of capIds) for (const typeId of unique([row.typeId, row.instanceTypeId])) ((row.entryIds?.length ?? 0) ? publicRoots : pendingRoots).get(id).add(typeId);
  }
  for (const row of indexes.plugins.values()) {
    const capIds = directOwners(row).map(capsForOwner); attach('plugins', row, capIds, true);
    for (const id of capIds) for (const typeId of unique([row.typeId, row.optionsTypeId, ...(row.optionsTypeIds ?? [])])) pendingRoots.get(id).add(typeId);
  }
  for (const row of indexes.candidateDispositions.values()) attach('candidateDispositions', row, unique([...(row.entryIds ?? []).flatMap(entryCaps), ...directOwners(row).map(capsForOwner)]), true);
  const adjacency = new Map(), membersByType = new Map();
  for (const edge of indexes.typeEdges.values()) {
    if (!indexes.types.has(edge.fromTypeId) || !indexes.types.has(edge.toTypeId)) throw new Error(`Dangling type edge: ${edge.id}`);
    if (!adjacency.has(edge.fromTypeId)) adjacency.set(edge.fromTypeId, []); adjacency.get(edge.fromTypeId).push(edge.toTypeId);
  }
  for (const member of indexes.members.values()) {
    if (!indexes.types.has(member.ownerTypeId)) throw new Error(`Dangling member owner: ${member.id}`);
    if (!membersByType.has(member.ownerTypeId)) membersByType.set(member.ownerTypeId, []); membersByType.get(member.ownerTypeId).push(member);
    for (const target of unique([member.typeId, member.returnTypeId, member.keyTypeId, ...(member.typeParameters ?? [])])) {
      if (!indexes.types.has(target)) throw new Error(`Dangling member type: ${member.id}/${target}`);
      if (!adjacency.has(member.ownerTypeId)) adjacency.set(member.ownerTypeId, []); adjacency.get(member.ownerTypeId).push(target);
    }
    for (const id of member.parameterIds ?? []) if (!indexes.members.has(id)) throw new Error(`Dangling member parameter: ${member.id}/${id}`);
  }
  const publicTypes = new Set(), pendingTypes = new Set();
  // One closure per package/scope group, with visited sets containing cycles and shared generic nodes.
  for (const capId of capabilities.keys()) {
    const visit = (roots, reachable) => {
      const visited = new Set(), queue = [...roots];
      for (let at = 0; at < queue.length; at++) {
        const id = queue[at]; if (visited.has(id)) continue;
        if (!indexes.types.has(id)) throw new Error(`Dangling capability root type: ${capId}/${id}`);
        visited.add(id); reachable.add(id); attach('types', indexes.types.get(id), [capId]);
        for (const member of membersByType.get(id) ?? []) attach('members', member, [capId]);
        for (const next of adjacency.get(id) ?? []) if (!visited.has(next)) queue.push(next);
      }
    };
    visit(publicRoots.get(capId), publicTypes); visit(pendingRoots.get(capId), pendingTypes);
  }
  const memberships = [], memberByRecord = new Map(), analysisImpacts = [], declarationCaps = new Map();
  const impact = (kind, table, row, capIds, details) => {
    const id = `CAPABILITY-IMPACT:${kind}:${table}:${encodeURIComponent(row.id)}`;
    analysisImpacts.push({ id, kind, table, recordId: row.id, recordSha256: digest(row), capabilityIds: unique(capIds), sourceRefs: sourceRefs(row), details, completenessEffect: 'REQUIRES_SOURCE_AND_MEMBER_COVERAGE_REVIEW_NOT_AUTOMATIC_MISSING_CAPABILITY' });
    for (const capId of capIds) capabilities.get(capId)?.analysisBoundaries.push(id);
  };
  for (const table of memberTables) for (const row of indexes[table].values()) {
    const capIds = unique([...(rowCaps.get(`${table}\0${row.id}`) ?? [])]);
    const ownerTypeId = table === 'members' ? row.ownerTypeId : row.id;
    let classification;
    if (table === 'packages') classification = 'SOURCE_CENSUS_CONTEXT';
    else if (table === 'entries') classification = 'PUBLIC_ENTRY';
    else if (table === 'exports') classification = row.entryIds?.length ? 'PUBLIC_ENTRY_EXPORT' : 'PUBLIC_REVIEW_PENDING';
    else if (table === 'plugins') classification = 'PUBLIC_REVIEW_PENDING';
    else if (table === 'candidateDispositions') classification = row.entryIds?.length ? 'PUBLIC_ENTRY_CONTEXT' : /INTERNAL|APPLICATION_SOURCE/.test(row.disposition ?? '') ? 'CONTEXT_ONLY' : 'PUBLIC_REVIEW_PENDING';
    else classification = publicTypes.has(ownerTypeId) ? 'PUBLIC_REACHABLE' : pendingTypes.has(ownerTypeId) ? 'PUBLIC_REVIEW_PENDING' : 'CONTEXT_ONLY';
    const refs = sourceRefs(row);
    for (const ref of refs) if (ref.declarationId) {
      if (!declarationCaps.has(ref.declarationId)) declarationCaps.set(ref.declarationId, new Set());
      for (const id of capIds) declarationCaps.get(ref.declarationId).add(id);
    }
    const membership = { id: `CAPABILITY-MEMBERSHIP:${table}:${encodeURIComponent(row.id)}`, table, recordId: row.id, recordSha256: digest(row), ownerPackageIds: unique([...directOwners(row), ...capIds.map(id => capabilities.get(id).ownerPackageId)]), capabilityIds: capIds, classification, originalClassification: row.disposition ?? row.reachability ?? row.status ?? null, sourceRefs: refs, sourceStatus: refs.length ? 'ORIGINAL_SOURCE_REFERENCES_RETAINED' : 'SOURCE_LOCATION_NOT_AVAILABLE', scopeInheritance: 'CAPABILITY_RELATION_NOT_IMPLEMENTATION_ACCEPTANCE' };
    memberships.push(membership); memberByRecord.set(`${table}\0${row.id}`, membership);
    if (row.boundaries?.length || row.hasTransitiveBoundary) impact('TYPE_ANALYSIS_BOUNDARY', table, row, capIds, { boundaries: row.boundaries ?? [], hasTransitiveBoundary: row.hasTransitiveBoundary ?? false });
    if (!refs.length && classification !== 'CONTEXT_ONLY') impact('SOURCE_LOCATION_UNAVAILABLE', table, row, capIds, { sourceStatus: membership.sourceStatus });
  }
  for (const [table, rows] of [['boundaries', indexes.boundaries], ['modules', indexes.modules], ['declarations', indexes.declarations]]) for (const row of rows.values()) {
    if (table !== 'boundaries' && !row.boundaries?.length && !row.diagnostics?.length && !(table === 'declarations' && row.sourceStatus && row.sourceStatus !== 'HASH_VERIFIED')) continue;
    const caps = new Set([...directOwners(row).flatMap(owner => [...capabilities.values()].filter(cap => cap.ownerPackageId === owner).map(cap => cap.id)), ...(table === 'declarations' ? declarationCaps.get(row.id) ?? [] : [])]);
    for (const id of row.entryId ? entryCaps(row.entryId) : []) caps.add(id);
    impact(table === 'boundaries' ? 'SOURCE_ANALYSIS_BOUNDARY' : 'SOURCE_DIAGNOSTIC_BOUNDARY', table, row, [...caps], { originalRecord: row });
  }
  if (pluginContracts !== null) {
    if (pluginContracts.source?.revision !== surface.source.revision || pluginContracts.source?.tree !== surface.source.tree) throw new Error('Plugin contract source differs from public surface source');
    const coverage = pluginContracts.pluginTypeContracts?.coverage, pluginInputSha256 = documentDigest(pluginContracts);
    if (!Array.isArray(coverage)) {
      impact('PLUGIN_SPECIALIST_SCHEMA_UNKNOWN', 'pluginContracts', { id: 'PLUGIN-CONTRACTS:document' }, [], { inputSha256: pluginInputSha256, schemaKeys: Object.keys(pluginContracts).sort(compare), status: 'REQUIRES_REVIEW' });
    } else {
      indexRows(coverage, 'plugin specialist contract');
      for (const contract of coverage) {
        const member = memberByRecord.get(`plugins\0${contract.id}`);
        impact('PLUGIN_SPECIALIST_CONTRACT', 'pluginContracts', contract, member?.capabilityIds ?? directOwners(contract).map(capsForOwner), { originalRecord: contract, primaryPluginId: indexes.plugins.has(contract.id) ? contract.id : null, associationStatus: indexes.plugins.has(contract.id) ? 'ORIGINAL_PLUGIN_ID_MATCH' : 'PLUGIN_ID_NOT_IN_PRIMARY_SURFACE_REQUIRES_REVIEW', typeIdentityNamespace: 'SPECIALIST_GRAPH_ONLY_NOT_PRIMARY_SURFACE_TYPE_IDS', inputSha256: pluginInputSha256 });
      }
      for (const row of pluginContracts.router?.consumers ?? []) impact('ROUTER_SPECIALIST_SOURCE_FACT', 'pluginContracts.router.consumers', row, directOwners(row).map(capsForOwner), { originalRecord: row, inputSha256: pluginInputSha256, acceptance: 'SOURCE_FACT_NOT_RUNTIME_ACCEPTANCE' });
      if (pluginContracts.router) impact('ROUTER_SPECIALIST_CONTRACT', 'pluginContracts.router', { id: 'ROUTER-SPECIALIST:contract' }, [...capabilities.values()].filter(cap => indexes.packages.get(cap.ownerPackageId).name === 'expo-router').map(cap => cap.id), { originalRecord: pluginContracts.router, inputSha256: pluginInputSha256 });
    }
  }
  const seedDecisions = [...seeds.values(), ...templates.values()].map(row => {
    const pkg = indexes.packages.get(row.sourceId ?? `PKG:${row.name}`), caps = [...capabilities.values()].filter(cap => cap.ownerPackageId === pkg?.id);
    const isTemplate = templates.has(row.id), shared = sharedUseReviews.filter(review => review.packageId === pkg?.id);
    const previousDecision = surface.scopeDecisions?.seeds?.find(previous => previous.id === row.id);
    return { id: `CAPABILITY-SEED-DECISION:${encodeURIComponent(row.id)}`, recordId: row.id, recordSha256: digest(row), category: row.category ?? 'TEMPLATE_OUTSIDE_183', originalRecord: structuredClone(row), sourceRefs: sourceRefs(row), capabilityIds: caps.map(cap => cap.id).sort(compare), sharedUseReviewIds: shared.map(review => review.id).sort(compare), scope: caps.length && unique(caps.map(cap => canonical(cap.scope))).length === 1 ? caps[0].scope : caps.length ? { state: 'REQUIRES_REVIEW', scopeId: null } : defaultScope(row.name, row), scopeEvidence: [policyRef, { recordId: row.id, recordSha256: digest(row) }, ...sourceRefs(row)], milestoneIds: unique(caps.length ? caps.flatMap(cap => cap.milestoneIds) : isTemplate ? ['M0', 'M0A', 'M7.1'] : ['M0', row.existingPreassignment?.batch]), historicalIdentity: row.baselineIdentityStatus ?? 'NOT_ASSESSED', originalScopeDecision: previousDecision ? { recordId: previousDecision.id, recordSha256: digest(previousDecision), originalRecord: structuredClone(previousDecision) } : row.scopeDecision ?? null, applicability: 'NOT_ASSESSED', implementationStatus: 'NOT_ASSESSED', sourceCensusRetained: true, acceptance: 'DECISION_MAPPING_NOT_HISTORICAL_IDENTITY_OR_HARMONY_SUPPORT' };
  });
  for (const cap of capabilities.values()) { cap.rootRecordIds = unique([...rootsByCap.get(cap.id)]); cap.analysisBoundaries = unique(cap.analysisBoundaries); }
  const remaining = ['INDEPENDENT_FIXED_SOURCE_EXPECTED_SET_NOT_PROVEN', 'NON_TYPESCRIPT_NATIVE_LIFECYCLE_ASSET_INSTALL_BEHAVIOR_CENSUS_NOT_PROVEN', 'PUBLIC_BOUNDARY_MEMBER_COMPLETENESS_NOT_PROVEN', ...(sharedUseReviews.some(row => row.reviewStatus === 'REQUIRES_REVIEW') ? ['UNRESOLVED_SHARED_ENTRY_AND_CONSUMER_USES'] : []), ...(pluginContracts === null ? ['PLUGIN_SPECIALIST_CONTRACTS_NOT_SUPPLIED'] : [])];
  const result = { schemaVersion: 1, source: structuredClone(surface.source), policy: 'fixed-source-capability-relations-v1', metadata: { inputHashes: { surface: documentDigest(surface), seedFacts: documentDigest(seedFacts), pluginContracts: pluginContracts === null ? null : documentDigest(pluginContracts), sharedReview: sharedReview === null ? null : documentDigest(sharedReview) }, scopePolicy: policyRef, acceptance: { capabilityMapAcceptance: 'RELATIONAL_MAP_ONLY', sourceCensusComplete: 'NOT_PROVEN', publicMemberCompleteness: 'NOT_PROVEN', stageClosable: false, harmonySupportAccepted: false } }, remaining, capabilities: ordered([...capabilities.values()]), memberships: ordered(memberships), dependencies: ordered(dependencies), seedDecisions: ordered(seedDecisions), analysisImpacts: ordered(analysisImpacts), sharedUseReviews: ordered(sharedUseReviews) };
  result.metadata.counts = Object.fromEntries(tables.map(name => [name, result[name].length]));
  return result;
}

export function validateCapabilityMap(actual, expected) {
  const failures = [], capIds = new Set((actual?.capabilities ?? []).map(row => row.id)), depIds = new Set((actual?.dependencies ?? []).map(row => row.id));
  const location = row => {
    const ref = row?.sourceRefs?.find(value => value.path);
    return ref ? ` at ${ref.path}:${ref.line ?? ref.start ?? '?'}` : ` [original ${row?.table ?? 'record'}/${row?.recordId ?? row?.id ?? '?'}]`;
  };
  for (const name of tables) {
    if (!Array.isArray(actual?.[name])) { failures.push(`Missing table: ${name}`); continue; }
    const found = new Map();
    for (const row of actual[name]) {
      if (!row?.id || found.has(row.id)) failures.push(`Duplicate or missing ${name} identity: ${row?.id}`);
      found.set(row?.id, row);
    }
    const expectedIds = new Set();
    for (const row of expected[name]) {
      expectedIds.add(row.id); const value = found.get(row.id);
      if (!value || canonical(value) !== canonical(row)) failures.push(`${value ? 'Changed' : 'Missing'} ${name}: ${row.recordId ?? row.id}${location(row)}`);
    }
    for (const row of actual[name]) {
      if (!expectedIds.has(row.id)) failures.push(`Unexpected ${name}: ${row.id}${location(row)}`);
      for (const id of row.capabilityIds ?? []) if (!capIds.has(id)) failures.push(`Dangling capability: ${name}/${row.id}/${id}${location(row)}`);
      for (const id of row.dependencyIds ?? []) if (!depIds.has(id)) failures.push(`Dangling dependency: ${name}/${row.id}/${id}${location(row)}`);
    }
  }
  const metadata = value => Object.fromEntries(Object.entries(value ?? {}).filter(([name]) => !tables.includes(name)));
  if (canonical(metadata(actual)) !== canonical(metadata(expected))) failures.push('Changed capability map metadata/source/policy/counts/remaining');
  return { valid: failures.length === 0, failures };
}

export function writeCapabilityMap(file, result, { recordsPerShard = 128 } = {}) {
  if (!Number.isSafeInteger(recordsPerShard) || recordsPerShard < 1) throw new Error('Invalid recordsPerShard');
  const parts = file + '.parts'; fs.mkdirSync(parts, { recursive: true });
  const metadata = Object.fromEntries(Object.entries(result).filter(([name]) => !tables.includes(name))), tableIndex = {};
  for (const name of tables) {
    indexRows(result[name], name); const rows = ordered(result[name]), shards = [];
    for (let at = 0; at < rows.length; at += recordsPerShard) {
      const selected = rows.slice(at, at + recordsPerShard), bytes = gzipSync(canonical(selected), { level: 9, mtime: 0 }), sha256 = hash(bytes), relative = sha256 + '.json.gz';
      fs.writeFileSync(path.join(parts, relative), bytes); shards.push({ path: relative, sha256, count: selected.length, firstId: selected[0].id, lastId: selected.at(-1).id });
    }
    tableIndex[name] = { count: rows.length, shards };
  }
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, canonical({ schemaVersion: 1, format, metadata, tables: tableIndex }));
}

export function readCapabilityMap(file) {
  const index = JSON.parse(fs.readFileSync(file));
  if (index.schemaVersion !== 1 || index.format !== format || !index.metadata || canonical(Object.keys(index.tables ?? {}).sort(compare)) !== canonical([...tables].sort(compare))) throw new Error('Invalid capability map index');
  const result = { ...index.metadata };
  if (result.schemaVersion !== 1 || !result.source?.revision || !result.source.tree || !result.metadata?.counts || tables.some(name => Object.hasOwn(index.metadata, name))) throw new Error('Invalid capability map metadata');
  if (!fs.lstatSync(file + '.parts').isDirectory()) throw new Error('Invalid capability map parts directory');
  for (const name of tables) {
    const table = index.tables[name], rows = [], paths = new Set(); let previous = null;
    if (!Number.isSafeInteger(table.count) || table.count < 0 || !Array.isArray(table.shards)) throw new Error(`Invalid capability table count: ${name}`);
    for (const shard of table.shards) {
      if (!/^[a-f0-9]{64}\.json\.gz$/.test(shard.path) || paths.has(shard.path) || shard.path !== shard.sha256 + '.json.gz' || !Number.isSafeInteger(shard.count) || shard.count < 1) throw new Error(`Invalid capability shard path/count: ${name}`);
      paths.add(shard.path); const shardFile = path.join(file + '.parts', shard.path);
      if (!fs.lstatSync(shardFile).isFile()) throw new Error(`Invalid capability shard file: ${shard.path}`);
      const bytes = fs.readFileSync(shardFile);
      if (hash(bytes) !== shard.sha256) throw new Error(`Capability shard integrity mismatch: ${name}/${shard.path}`);
      const selected = JSON.parse(gunzipSync(bytes).toString('utf8'));
      if (!Array.isArray(selected) || selected.length !== shard.count || selected[0]?.id !== shard.firstId || selected.at(-1)?.id !== shard.lastId) throw new Error(`Capability shard count mismatch: ${name}`);
      for (const row of selected) { if (typeof row?.id !== 'string' || (previous !== null && compare(previous, row.id) >= 0)) throw new Error(`Duplicate identity or invalid capability shard order: ${name}/${row?.id}`); previous = row.id; rows.push(row); }
    }
    if (rows.length !== table.count) throw new Error(`Capability table count mismatch: ${name}`);
    result[name] = rows;
  }
  if (canonical(result.metadata.counts) !== canonical(Object.fromEntries(tables.map(name => [name, result[name].length])))) throw new Error('Capability metadata table count mismatch');
  return result;
}

export function summarizeCapabilityMap(result) {
  const counts = values => Object.fromEntries(unique(values).map(value => [value, values.filter(item => item === value).length]));
  return { schemaVersion: 1, source: result.source, counts: Object.fromEntries(tables.map(name => [name, result[name].length])), scopeStates: counts(result.capabilities.map(row => row.scope.state)), classifications: counts(result.memberships.map(row => row.classification)), remaining: result.remaining, acceptance: result.metadata.acceptance };
}
