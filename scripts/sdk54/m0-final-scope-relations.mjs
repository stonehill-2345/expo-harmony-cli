const canonical = value => JSON.stringify(value, (_key, row) => row && typeof row === 'object' && !Array.isArray(row)
  ? Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b))) : row);
const allowedDeferrals = new Set(['DEFER-GO', 'DEFER-EAS-BUILD', 'DEFER-EAS-SERVICES', 'DEFER-UPDATES', 'DEFER-DEV-CLIENT']);
const index = (rows, name, key = 'id') => {
  const result = new Map();
  for (const row of rows) {
    if (!row[key] || result.has(row[key])) throw new Error(`Missing or duplicate ${name}: ${row[key]}`);
    result.set(row[key], row);
  }
  return result;
};

export function buildFinalScopeRelations({ capabilities, dependencies, seedDecisions, review, sourceFiles, semanticFiles }) {
  const original = index(capabilities, 'capability'), decisions = index(review.decisions, 'scope decision');
  const deps = index(dependencies, 'dependency'), sources = index(sourceFiles, 'source', 'path');
  const packages = new Set(capabilities.map(row => row.ownerPackageId));
  const checkRefs = (refs, id) => {
    if (!refs?.length) throw new Error(`Missing source receipts: ${id}`);
    for (const ref of refs) {
      const source = sources.get(ref.path);
      if (!source || ref.sha256 && source.sha256 !== ref.sha256 || ref.blob && source.oid && ref.blob !== source.oid) throw new Error(`Changed scope source receipt: ${id}/${ref.path}`);
    }
  };
  if (original.size !== decisions.size) throw new Error('Original scope decision identity set mismatch');
  const result = [];
  for (const row of capabilities) {
    const decision = decisions.get(row.id);
    if (!decision || decision.ownerPackageId !== row.ownerPackageId || canonical(decision.oldScope) !== canonical(row.scope)) throw new Error(`Changed original scope identity: ${row.id}`);
    checkRefs(decision.sourceRefs, row.id);
    if (!decision.scope?.uses?.length || !['REQUIRED', 'DEFERRED', 'MIXED_BY_USE'].includes(decision.scope.state)) throw new Error(`Unresolved final scope: ${row.id}`);
    for (const [at, use] of decision.scope.uses.entries()) {
      if (!['REQUIRED', 'DEFERRED'].includes(use.state) || (use.state === 'DEFERRED' ? !allowedDeferrals.has(use.deferId) : use.deferId != null)) throw new Error(`Invalid final use scope: ${row.id}/${at}`);
      if (!/^M7\.[1-6]$/.test(use.batch) || !decision.finalMilestoneIds.includes(use.batch)) throw new Error(`Missing final use milestone: ${row.id}/${at}`);
      if (use.evidence?.length) checkRefs(use.evidence, `${row.id}/${at}`);
    }
    for (const id of row.dependencyIds ?? []) if (!deps.has(id)) throw new Error(`Dangling capability dependency: ${row.id}/${id}`);
    result.push({ ...row, originalScope: row.scope, originalMilestoneIds: row.milestoneIds,
      scope: { ...decision.scope, uses: decision.scope.uses.map((use, at) => ({ ...use, id: `${row.id}/USE:${at + 1}` })) },
      milestoneIds: decision.finalMilestoneIds, scopeReview: decision, scopeAssessment: 'FIXED_SOURCE_USE_REVIEW_RECORDED',
      batchAssessment: 'FIXED_SOURCE_RESPONSIBILITY_REVIEW_RECORDED', applicability: 'NOT_ASSESSED', implementationStatus: 'NOT_ASSESSED' });
  }
  for (const dependency of dependencies) {
    if (!packages.has(dependency.ownerPackageId) || dependency.targetId && !packages.has(dependency.targetId)) throw new Error(`Dangling final dependency: ${dependency.id}`);
    checkRefs(dependency.sourceRefs, dependency.id);
  }
  const seedReviews = index(review.seedDecisions, 'seed review');
  if (seedReviews.size !== seedDecisions.length) throw new Error('Original seed identity set mismatch');
  const seeds = seedDecisions.map(row => {
    const final = seedReviews.get(row.recordId ?? row.id);
    if (!final) throw new Error(`Missing final seed review: ${row.id}`);
    if (row.recordSha256 && row.recordSha256 !== final.originalRecordSha256) throw new Error(`Changed original seed source receipt: ${row.id}`);
    for (const id of final.reviewedCapabilityIds ?? []) if (!original.has(id)) throw new Error(`Dangling final seed capability: ${row.id}/${id}`);
    return { ...row, finalReview: final };
  });
  for (const source of sourceFiles) for (const id of source.capabilityIds ?? []) if (!original.has(id)) throw new Error(`Dangling source capability: ${source.path}/${id}`);
  const sourceBindings = semanticFiles.map(file => {
    const source = sources.get(file.path);
    if (!source || source.sha256 !== file.sourceSha256) throw new Error(`Changed semantic source identity: ${file.path}`);
    const ids = source.capabilityIds ?? [];
    return { ...file, id: `FINAL-SOURCE-RELATION:${file.format}:${encodeURIComponent(file.path)}`, capabilityIds: ids,
      relationship: ids.length ? 'SOURCE_OWNER_CONTEXT_WITH_EXPLICIT_CAPABILITY_USES' : 'OUTSIDE_DISCOVERED_OWNER_SOURCE_CONTEXT',
      scopeReferences: ids.map(id => ({ capabilityId: id, scopePointer: '/scope/uses', milestonePointer: '/milestoneIds' })),
      publicApiClaim: false, harmonySupportAccepted: false };
  });
  index(sourceBindings, 'semantic relation');
  return { schemaVersion: 1, format: 'sdk54-final-scope-relations-v1', capabilities: result, dependencies, seedDecisions: seeds, sourceBindings,
    summary: { capabilities: result.length, dependencies: dependencies.length, seedDecisions: seeds.length, semanticSourceFiles: sourceBindings.length },
    harmonySupportAccepted: false, stageClosable: false };
}

export function validateFinalScopeRelations(actual, expected) {
  const failures = [];
  for (const table of ['capabilities', 'dependencies', 'seedDecisions', 'sourceBindings']) {
    const actualRows = index(actual?.[table] ?? [], `actual ${table}`);
    for (const row of expected[table]) {
      if (!actualRows.has(row.id) || canonical(actualRows.get(row.id)) !== canonical(row)) failures.push(`Missing or changed final ${table}: ${row.id}`);
      actualRows.delete(row.id);
    }
    for (const id of actualRows.keys()) failures.push(`Unexpected final ${table}: ${id}`);
  }
  if (canonical(actual) !== canonical(expected)) failures.push('Final scope relation metadata/content mismatch');
  return { valid: failures.length === 0, failures };
}
