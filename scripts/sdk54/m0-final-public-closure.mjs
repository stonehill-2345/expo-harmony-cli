const canonical = value => JSON.stringify(value, (_key, row) => row && typeof row === 'object' && !Array.isArray(row)
  ? Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b))) : row);
const indexed = (rows, name, key = row => row.id) => {
  const result = new Map();
  for (const row of rows) { const id = key(row); if (!id || result.has(id)) throw new Error(`Duplicate or missing ${name}: ${id}`); result.set(id, row); }
  return result;
};

export function buildFinalPublicClosure({ memberships, types, members, typeEdges, publicDispositions, scopeRelations, finite, derived, exportBindings, plugins }) {
  const typeIndex = indexed(types, 'type'), memberIndex = indexed(members, 'member'), capabilities = indexed(scopeRelations.capabilities, 'capability');
  const decisions = Object.fromEntries(['entries', 'candidateDispositions', 'exports'].map(table => [table, indexed(publicDispositions[table], table)]));
  const finiteIndex = indexed(finite.artifact.bindings, 'finite binding'), derivedIndex = indexed(derived.records, 'derived', row => `${row.table}:${row.recordId}`);
  const internalBlockers = indexed(derived.blockers, 'internal context', row => `${row.table}:${row.recordId}`);
  const exportIndex = indexed(exportBindings.bindings, 'export source'), pluginIndex = indexed(plugins.plugins, 'plugin');
  const pluginKinds = new Set(['PUBLIC_FACTORY_RETURNED_PLUGIN', 'PUBLIC_ENTRY_PLUGIN', 'PUBLIC_EXPORTED_OR_COMPOSED_PLUGIN', 'PUBLIC_WRAPPER_EXPOSED_PLUGIN']);
  const adjacency = new Map(), publicTypes = new Set(), queue = [];
  const edge = (from, to, id) => {
    if (!typeIndex.has(from) || !typeIndex.has(to)) throw new Error(`Dangling final type relation: ${id}`);
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from).push(to);
  };
  for (const row of typeEdges) edge(row.fromTypeId, row.toTypeId, row.id);
  for (const member of members) {
    if (!typeIndex.has(member.ownerTypeId)) throw new Error(`Dangling final member owner: ${member.id}`);
    for (const target of [member.typeId, member.returnTypeId, member.keyTypeId, ...(member.typeParameters ?? [])].filter(Boolean)) edge(member.ownerTypeId, target, member.id);
    for (const id of member.parameterIds ?? []) if (!memberIndex.has(id)) throw new Error(`Dangling final member parameter: ${member.id}/${id}`);
  }
  for (const type of types) for (const id of type.memberIds ?? []) if (memberIndex.get(id)?.ownerTypeId !== type.id) throw new Error(`Dangling final declared member: ${type.id}/${id}`);
  for (const row of decisions.exports.values()) if (row.disposition === 'PUBLIC_MODULE_EXPORT' || row.effectiveEntryIds?.length)
    for (const id of [row.typeId, row.instanceTypeId].filter(Boolean)) {
      if (!typeIndex.has(id)) throw new Error(`Dangling final public root: ${row.id}/${id}`);
      if (!publicTypes.has(id)) { publicTypes.add(id); queue.push(id); }
    }
  for (let at = 0; at < queue.length; at++) for (const id of adjacency.get(queue[at]) ?? []) if (!publicTypes.has(id)) { publicTypes.add(id); queue.push(id); }
  const records = [], blockers = [], recordIds = new Set();
  for (const row of memberships) {
    if (recordIds.has(row.id)) throw new Error(`Duplicate final membership: ${row.id}`);
    recordIds.add(row.id);
    for (const id of row.capabilityIds) if (!capabilities.has(id)) throw new Error(`Dangling final record capability: ${row.id}/${id}`);
    const decision = decisions[row.table]?.get(row.recordId);
    if (decisions[row.table] && !decision) throw new Error(`Missing final ${row.table} disposition: ${row.recordId}`);
    let classification = decision?.disposition ?? row.classification;
    if (row.table === 'plugins') {
      const kind = pluginIndex.get(row.recordId)?.disposition?.kind;
      if (!pluginKinds.has(kind)) throw new Error(`Missing reviewed plugin public disposition: ${row.recordId}`);
      classification = kind;
    }
    if (row.table === 'types' || row.table === 'members') {
      const owner = row.table === 'types' ? row.recordId : memberIndex.get(row.recordId)?.ownerTypeId;
      if (!typeIndex.has(owner)) throw new Error(`Missing final graph record: ${row.recordId}`);
      classification = publicTypes.has(owner) ? 'PUBLIC_REACHABLE' : row.classification === 'PUBLIC_REVIEW_PENDING' ? 'IMPLEMENTATION_TYPE_CONTEXT' : row.classification;
    }
    const sourceEvidence = [];
    if (row.sourceRefs.length) sourceEvidence.push({ kind: 'ORIGINAL_SOURCE_REFERENCES', sourceRefs: row.sourceRefs });
    const supplement = finiteIndex.get(row.recordId);
    if (supplement) sourceEvidence.push({ kind: 'FINITE_DECLARATION', bindingId: supplement.id, declarationIds: supplement.declarationIds });
    const derivedSource = derivedIndex.get(`${row.table}:${row.recordId}`);
    if (derivedSource) sourceEvidence.push({ kind: 'DERIVED_CONSUMER_CONTEXT', table: row.table, recordId: row.recordId, sourceRole: derivedSource.sourceRole });
    const exportSource = row.table === 'exports' && exportIndex.get(row.recordId);
    if (exportSource) sourceEvidence.push({ kind: 'EXPORT_SOURCE_RULE', bindingId: exportSource.id });
    if (row.table === 'plugins') {
      const plugin = pluginIndex.get(row.recordId);
      if (!plugin) throw new Error(`Missing final plugin contract: ${row.recordId}`);
      sourceEvidence.push({ kind: 'PLUGIN_FINITE_CONTRACT', pluginId: plugin.id, declarationId: plugin.declarationId });
    }
    const internal = internalBlockers.get(`${row.table}:${row.recordId}`);
    const contextOnly = classification === 'CONTEXT_ONLY' && !row.capabilityIds.length && internal?.classification === 'CONTEXT_ONLY' && !internal.capabilityIds.length;
    const sourceStatus = sourceEvidence.length ? 'FINITE_SOURCE_EVIDENCE_LINKED' : contextOnly ? 'INTERNAL_GRAPH_CONTEXT_NO_OWN_DECLARATION' : 'MISSING_SOURCE_EVIDENCE';
    if (sourceStatus === 'MISSING_SOURCE_EVIDENCE') blockers.push({ id: row.id, table: row.table, recordId: row.recordId, classification, capabilityIds: row.capabilityIds });
    records.push({ id: row.id, table: row.table, recordId: row.recordId, originalRecordSha256: row.recordSha256 ?? null,
      originalClassification: row.classification, classification, capabilityIds: row.capabilityIds, sourceStatus, sourceEvidence,
      ...(decision ? { finalDispositionRecordId: decision.id } : {}),
      scopeReferences: row.capabilityIds.map(id => ({ capabilityId: id, scopePointer: '/scope/uses', milestonePointer: '/milestoneIds' })),
      harmonySupportAccepted: false });
  }
  for (const [table, map] of Object.entries(decisions)) {
    const count = memberships.filter(row => row.table === table).length;
    if (map.size !== count) throw new Error(`Final ${table} identity set mismatch`);
  }
  return { schemaVersion: 1, format: 'sdk54-final-public-closure-v1', records, blockers,
    summary: { memberships: records.length, publicReachableTypes: publicTypes.size, sourceBlockers: blockers.length,
      internalGraphContextsWithoutOwnDeclaration: records.filter(row => row.sourceStatus === 'INTERNAL_GRAPH_CONTEXT_NO_OWN_DECLARATION').length },
    stageClosable: false, harmonySupportAccepted: false };
}

export function validateFinalPublicClosure(actual, expected) {
  const failures = [], rows = indexed(actual?.records ?? [], 'actual final membership');
  for (const row of expected.records) {
    if (!rows.has(row.id) || canonical(rows.get(row.id)) !== canonical(row)) failures.push(`Missing or changed final public relation: ${row.id}`);
    rows.delete(row.id);
  }
  for (const id of rows.keys()) failures.push(`Unexpected final public relation: ${id}`);
  const { records: _actualRecords, ...actualMetadata } = actual;
  const { records: _expectedRecords, ...expectedMetadata } = expected;
  if (canonical(actualMetadata) !== canonical(expectedMetadata)) failures.push('Final public closure content/metadata mismatch');
  return { valid: failures.length === 0, failures };
}
