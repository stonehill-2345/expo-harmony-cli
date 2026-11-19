const categoryFor = fact => ({ INSTALLATION: 'INSTALL', PLATFORM: 'PLATFORM_CONDITION' })[fact.category] ?? fact.category ?? fact.kind;

export function buildFinalSourceCategories({ gaps, owners, sourceFiles, analyses, capabilities, plugins }) {
  const ownerIndex = new Map(owners.map(row => [row.id, row]));
  const files = new Map(sourceFiles.map(row => [row.path, row]));
  const ownerRules = new Map(owners.map(row => [row.id, { id: `OWNER-RULES:${row.id}`, ownerId: row.id,
    sourceRules: [], blockers: 0, capabilityIds: [], publicApiClaim: false }]));
  const facts = new Map();
  for (const analysis of analyses) {
    const source = files.get(analysis.path);
    if (!source || source.sha256 !== analysis.sourceSha256) throw new Error(`Changed category source: ${analysis.path}`);
    if (!source.ownerId) continue;
    const owner = ownerRules.get(source.ownerId);
    if (!owner) throw new Error(`Dangling category owner: ${source.ownerId}`);
    owner.sourceRules.push({ path: analysis.path, reference: analysis.reference, referenceSha256: analysis.referenceSha256,
      sourcePointer: analysis.sourcePointer, factCount: analysis.facts.length, blockerCount: analysis.blockerCount,
      sourceSha256: analysis.sourceSha256, relationship: 'COMPLETE_FINITE_SYNTAX_RULES_NOT_CATEGORY_BEHAVIOR_PROOF' });
    owner.blockers += analysis.blockerCount;
    for (const [at, fact] of analysis.facts.entries()) {
      const key = `${source.ownerId}:${categoryFor(fact)}`;
      if (!facts.has(key)) facts.set(key, []);
      facts.get(key).push({ path: analysis.path, ruleReference: analysis.reference,
        pointer: `${analysis.sourcePointer}/facts/${at}`, factId: fact.id ?? null, kind: fact.kind, name: fact.name ?? null });
    }
  }
  for (const capability of capabilities) {
    const owner = owners.find(row => row.publicPackageId === capability.ownerPackageId);
    if (!owner) throw new Error(`Missing capability category owner: ${capability.id}`);
    ownerRules.get(owner.id).capabilityIds.push(capability.id);
  }
  const seen = new Set(), records = gaps.map(gap => {
    if (!gap.id || seen.has(gap.id) || !ownerIndex.has(gap.ownerId)) throw new Error(`Missing or duplicate category identity: ${gap.id}`);
    seen.add(gap.id);
    const rules = ownerRules.get(gap.ownerId), matches = facts.get(`${gap.ownerId}:${gap.category}`) ?? [];
    const packageId = ownerIndex.get(gap.ownerId).publicPackageId;
    const contracts = gap.category === 'PLUGIN_OPTION' ? plugins.filter(row => row.packageId === packageId).map(row => ({
      pluginId: row.id, declarationId: row.declarationId, disposition: row.disposition.kind,
      optionPointer: '/optionContract', ownerAlgorithmPointer: '/ownershipContract', effectPointer: '/effectContract' })) : [];
    const state = matches.length || contracts.length ? 'CONCRETE_CATEGORY_RECORDS_INDEXED'
      : rules.blockers ? 'NO_MATCH_WITH_SOURCE_DIAGNOSTICS_REQUIRES_PUBLIC_IMPACT_REVIEW'
        : 'NO_SEPARATE_CATEGORY_DECLARATION_IN_FINITE_SOURCE_RULES';
    return { ...gap, originalStatus: gap.status, status: state, ownerRuleSetId: rules.id,
      matchedFacts: matches, pluginContracts: contracts, capabilityIds: rules.capabilityIds,
      scopeReferences: rules.capabilityIds.map(id => ({ capabilityId: id, pointer: '/scope/uses' })),
      queryRole: 'NAVIGATION_ONLY_COMPLETE_OWNER_RULES_AND_PUBLIC_USE_REVIEW_ARE_AUTHORITATIVE',
      publicApiClaim: false, harmonySupportAccepted: false };
  });
  return { schemaVersion: 1, format: 'sdk54-final-source-categories-v1', records, ownerRuleSets: [...ownerRules.values()],
    summary: { categoryCells: records.length, ownerRuleSets: ownerRules.size,
      concreteCells: records.filter(row => row.status === 'CONCRETE_CATEGORY_RECORDS_INDEXED').length,
      cellsWithSourceDiagnostics: records.filter(row => row.status === 'NO_MATCH_WITH_SOURCE_DIAGNOSTICS_REQUIRES_PUBLIC_IMPACT_REVIEW').length },
    publicApiClaim: false, stageClosable: false };
}

export function validateFinalSourceCategories(actual, expected) {
  const failures = [];
  for (const table of ['records', 'ownerRuleSets']) {
    const rows = new Map();
    for (const row of actual?.[table] ?? []) {
      if (rows.has(row.id)) failures.push(`Duplicate category relation: ${row.id}`);
      rows.set(row.id, row);
    }
    for (const row of expected[table]) {
      if (JSON.stringify(rows.get(row.id)) !== JSON.stringify(row)) failures.push(`Missing or changed category relation: ${row.id}`);
      rows.delete(row.id);
    }
    for (const id of rows.keys()) failures.push(`Unexpected category relation: ${id}`);
  }
  const metadata = value => Object.fromEntries(Object.entries(value ?? {}).filter(([key]) => !['records', 'ownerRuleSets'].includes(key)));
  if (JSON.stringify(metadata(actual)) !== JSON.stringify(metadata(expected))) failures.push('Changed category metadata');
  return { valid: failures.length === 0, failures };
}
