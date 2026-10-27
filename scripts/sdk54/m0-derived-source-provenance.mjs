const canonical = value => JSON.stringify(value, (_key, row) => row && typeof row === 'object' && !Array.isArray(row)
  ? Object.fromEntries(Object.entries(row).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : row);
const index = (rows, label) => {
  const result = new Map();
  for (const row of rows) {
    if (!row.id || result.has(row.id)) throw new Error(`Duplicate ${label}: ${row.id}`);
    result.set(row.id, row);
  }
  return result;
};
export function buildDerivedSourceProvenance({ types, members, typeEdges, declarations, requested, exports = [] }) {
  const typeIndex = index(types, 'type'), memberIndex = index(members, 'member'), sourceIndex = index(declarations, 'declaration');
  const neighbors = new Map(), outgoing = new Map(), incoming = new Map(), anchors = new Map(), queue = [];
  for (const type of types) {
    const refs = [...new Set([...(type.declarationIds ?? []), type.operationSourceId].filter(Boolean))].map(id => {
      const declaration = sourceIndex.get(id);
      if (!declaration) throw new Error(`Dangling source declaration: ${type.id}/${id}`);
      return declaration;
    }).filter(row => row.sourceStatus === 'HASH_VERIFIED' && row.path && row.sha256);
    if (refs.length) { anchors.set(type.id, { refs, prior: null }); queue.push(type.id); }
  }
  for (const [table, rows] of [['exports', exports], ['members', members]]) for (const row of rows) {
    const refs = (row.declarationIds ?? []).map(id => {
      const source = sourceIndex.get(id);
      if (!source) throw new Error(`Dangling ${table} declaration: ${row.id}/${id}`);
      return { ...source, binding: { table, recordId: row.id } };
    }).filter(ref => ref.sourceStatus === 'HASH_VERIFIED' && ref.path && ref.sha256);
    if (!refs.length) continue;
    for (const typeId of [row.typeId, row.instanceTypeId, row.returnTypeId, row.keyTypeId, row.ownerTypeId].filter(Boolean)) {
      if (!typeIndex.has(typeId)) throw new Error(`Dangling ${table} binding type: ${row.id}/${typeId}`);
      if (!anchors.has(typeId)) { anchors.set(typeId, { refs, prior: null }); queue.push(typeId); }
    }
  }
  const edges = index(typeEdges, 'type edge');
  for (const edge of edges.values()) {
    if (!typeIndex.has(edge.fromTypeId) || !typeIndex.has(edge.toTypeId)) throw new Error(`Dangling type edge: ${edge.id}`);
    for (const [map, key] of [[outgoing, edge.fromTypeId], [incoming, edge.toTypeId]]) {
      if (!map.has(key)) map.set(key, []); map.get(key).push(edge.id);
    }
    for (const [from, to, direction] of [[edge.fromTypeId, edge.toTypeId, 'DECLARATION_TO_USE'], [edge.toTypeId, edge.fromTypeId, 'CONSTRUCTION_TO_COMPONENT']]) {
      if (!neighbors.has(from)) neighbors.set(from, []); neighbors.get(from).push({ target: to, edgeId: edge.id, direction });
    }
  }
  for (let at = 0; at < queue.length; at++) {
    const typeId = queue[at];
    for (const step of neighbors.get(typeId) ?? []) if (!anchors.has(step.target)) {
      anchors.set(step.target, { refs: anchors.get(typeId).refs, prior: { typeId, edgeId: step.edgeId, direction: step.direction } }); queue.push(step.target);
    }
  }
  const records = [], blockers = [], seen = new Set();
  for (const request of requested) {
    const id = `${request.table}:${request.recordId}`;
    if (seen.has(id)) throw new Error(`Duplicate requested provenance: ${id}`); seen.add(id);
    const record = request.table === 'types' ? typeIndex.get(request.recordId) : request.table === 'members' ? memberIndex.get(request.recordId) : null;
    if (!record) throw new Error(`Dangling requested provenance: ${id}`);
    const ownerTypeId = request.table === 'types' ? record.id : record.ownerTypeId;
    if (!typeIndex.has(ownerTypeId)) throw new Error(`Dangling member owner: ${record.id}`);
    const anchor = anchors.get(ownerTypeId);
    if (!anchor) { blockers.push({ ...request, reason: 'NO_DECLARATION_OR_CONSTRUCTION_CONTEXT', ownerTypeId }); continue; }
    const anchorPath = []; let cursor = ownerTypeId;
    while (anchors.get(cursor).prior) {
      const prior = anchors.get(cursor).prior;
      anchorPath.push({ fromTypeId: cursor, toTypeId: prior.typeId, edgeId: prior.edgeId, direction: prior.direction }); cursor = prior.typeId;
    }
    const type = typeIndex.get(ownerTypeId);
    records.push({ ...request, id: `DERIVED-SOURCE:${id}`, ownerTypeId,
      rule: request.table === 'members' ? 'FINITE_MEMBER_OWNER_AND_CONSTRUCTION_CONTEXT' : 'FINITE_TYPE_CONSTRUCTION_AND_CONSUMER_CONTEXT',
      sourceRole: 'CONSUMER_OR_CONSTRUCTION_CONTEXT_NOT_OWN_DECLARATION', sourceRefs: anchor.refs,
      anchorTypeId: cursor, anchorPath, kind: type.kind, display: type.display ?? null,
      constructionEdgeIds: outgoing.get(ownerTypeId) ?? [], consumerEdgeIds: incoming.get(ownerTypeId) ?? [],
      originalDeclarationIds: record.declarationIds ?? [], memberIds: request.table === 'types' ? record.memberIds ?? [] : [],
      ...(request.table === 'members' ? { member: record } : {}) });
  }
  return { schemaVersion: 1, format: 'sdk54-derived-source-provenance-v1', records, blockers,
    boundary: 'FINITE_GRAPH_CONSTRUCTION_AND_SOURCE_USE; NOT_A_NEW_PUBLIC_API_OR_PLATFORM_SUPPORT' };
}
export function validateDerivedSourceProvenance(actual, expected) {
  const failures = [];
  const rows = new Map();
  for (const row of actual?.records ?? []) {
    if (rows.has(row.id)) failures.push(`Duplicate derived provenance: ${row.id}`); rows.set(row.id, row);
  }
  for (const row of expected.records) {
    if (!rows.has(row.id)) failures.push(`Missing derived provenance: ${row.id}`);
    else if (canonical(rows.get(row.id)) !== canonical(row)) failures.push(`Changed derived provenance: ${row.id}`);
    rows.delete(row.id);
  }
  for (const id of rows.keys()) failures.push(`Unexpected derived provenance: ${id}`);
  if (canonical(actual) !== canonical(expected)) failures.push('Derived provenance metadata/closure mismatch');
  return { valid: failures.length === 0, failures };
}
