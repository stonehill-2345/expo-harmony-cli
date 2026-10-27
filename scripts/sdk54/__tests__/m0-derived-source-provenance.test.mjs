import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDerivedSourceProvenance, validateDerivedSourceProvenance } from '../m0-derived-source-provenance.mjs';
const fixture = () => ({
  types: [{ id: 'T:root', kind: 'object', declarationIds: ['D:root'], memberIds: ['M:deep'] }, { id: 'T:union', kind: 'union', declarationIds: [], memberIds: [] }, { id: 'T:null', kind: 'language-type', display: 'null', declarationIds: [], memberIds: [] }],
  members: [{ id: 'M:deep', ownerTypeId: 'T:root', name: 'deep', typeId: 'T:union', declarationIds: [] }],
  typeEdges: [{ id: 'E:deep', fromTypeId: 'T:root', toTypeId: 'T:union', relation: 'properties/0/typeId' }, { id: 'E:null', fromTypeId: 'T:union', toTypeId: 'T:null', relation: 'constituents/0' }],
  declarations: [{ id: 'D:root', path: 'index.ts', start: 0, end: 40, sha256: 'a'.repeat(64), sourceStatus: 'HASH_VERIFIED' }],
  requested: [{ table: 'types', recordId: 'T:union' }, { table: 'types', recordId: 'T:null' }, { table: 'members', recordId: 'M:deep' }],
});
test('preserves derived construction, exact use paths and member ownership without inventing declarations', () => {
  const result = buildDerivedSourceProvenance(fixture());
  assert.equal(result.blockers.length, 0); assert.equal(result.records.length, 3);
  const union = result.records.find(r => r.recordId === 'T:union');
  assert.equal(union.rule, 'FINITE_TYPE_CONSTRUCTION_AND_CONSUMER_CONTEXT');
  assert.ok(union.anchorPath.some(row => row.edgeId === 'E:deep'));
  assert.equal(union.sourceRefs[0].path, 'index.ts');
  assert.deepEqual(union.constructionEdgeIds, ['E:null']);
  assert.equal(result.records.find(r => r.recordId === 'M:deep').ownerTypeId, 'T:root');
});
test('cycles terminate and real unanchored object types remain blocking', () => {
  const f = fixture(); f.types.push({ id: 'T:cycle', kind: 'object', declarationIds: [], memberIds: [] });
  f.typeEdges.push({ id: 'E:cycle', fromTypeId: 'T:cycle', toTypeId: 'T:cycle', relation: 'recursive' });
  f.requested.push({ table: 'types', recordId: 'T:cycle' });
  const result = buildDerivedSourceProvenance(f);
  assert.ok(result.blockers.some(row => row.recordId === 'T:cycle'));
});
test('rejects dangling graph dependencies and forged or dropped provenance', () => {
  const f = fixture(), expected = buildDerivedSourceProvenance(f);
  const bad = structuredClone(expected); bad.records[0].sourceRefs[0].sha256 = 'b'.repeat(64);
  assert.equal(validateDerivedSourceProvenance(bad, expected).valid, false);
  const missing = structuredClone(expected); missing.records.pop();
  assert.equal(validateDerivedSourceProvenance(missing, expected).valid, false);
  f.typeEdges[0].toTypeId = 'T:missing';
  assert.throws(() => buildDerivedSourceProvenance(f), /Dangling/);
});
test('an exported primitive is anchored by its actual export declaration even without an owning type declaration', () => {
  const f = fixture(); f.types.push({ id: 'T:literal', kind: 'language-type', display: '42', declarationIds: [], memberIds: [] });
  f.exports = [{ id: 'EXPORT:answer', typeId: 'T:literal', declarationIds: ['D:root'] }];
  f.requested.push({ table: 'types', recordId: 'T:literal' });
  const value = buildDerivedSourceProvenance(f);
  assert.equal(value.blockers.length, 0);
  assert.equal(value.records.find(row => row.recordId === 'T:literal').sourceRefs[0].binding.recordId, 'EXPORT:answer');
});
