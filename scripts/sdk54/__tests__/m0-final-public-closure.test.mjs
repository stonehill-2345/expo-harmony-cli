import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFinalPublicClosure, validateFinalPublicClosure } from '../m0-final-public-closure.mjs';
const fixture = () => ({
  memberships: [{ id: 'ME', table: 'exports', recordId: 'E', capabilityIds: ['C'], classification: 'PUBLIC_REVIEW_PENDING', sourceRefs: [] },
    { id: 'MT', table: 'types', recordId: 'T', capabilityIds: ['C'], classification: 'PUBLIC_REVIEW_PENDING', sourceRefs: [] },
    { id: 'MM', table: 'members', recordId: 'M', capabilityIds: ['C'], classification: 'PUBLIC_REVIEW_PENDING', sourceRefs: [] },
    { id: 'MI', table: 'types', recordId: 'I', capabilityIds: [], classification: 'CONTEXT_ONLY', sourceRefs: [] }],
  types: [{ id: 'T', memberIds: ['M'] }, { id: 'I', memberIds: [] }], members: [{ id: 'M', ownerTypeId: 'T' }], typeEdges: [],
  publicDispositions: { entries: [], candidateDispositions: [], exports: [{ id: 'E', disposition: 'PUBLIC_MODULE_EXPORT', typeId: 'T' }] },
  scopeRelations: { capabilities: [{ id: 'C' }] },
  finite: { artifact: { bindings: [{ id: 'T', declarationIds: ['FD'] }] } },
  derived: { records: [{ table: 'members', recordId: 'M', sourceRole: 'CONSUMER_OR_CONSTRUCTION_CONTEXT_NOT_OWN_DECLARATION' }],
    blockers: [{ table: 'types', recordId: 'I', classification: 'CONTEXT_ONLY', capabilityIds: [] }] },
  exportBindings: { bindings: [{ id: 'E', steps: [{ path: 'index.ts', start: 0, end: 10 }] }] }, plugins: { plugins: [] },
});
test('promotes actually published roots, retains finite/derived/export evidence and internal unresolved nodes separately', () => {
  const result = buildFinalPublicClosure(fixture());
  assert.deepEqual(result.blockers, []);
  assert.equal(result.records.find(r => r.id === 'MT').classification, 'PUBLIC_REACHABLE');
  assert.equal(result.records.find(r => r.id === 'MM').sourceEvidence[0].kind, 'DERIVED_CONSUMER_CONTEXT');
  assert.equal(result.records.find(r => r.id === 'MI').sourceStatus, 'INTERNAL_GRAPH_CONTEXT_NO_OWN_DECLARATION');
  assert.equal(result.records.find(r => r.id === 'ME').sourceEvidence[0].kind, 'EXPORT_SOURCE_RULE');
  assert.equal(result.stageClosable, false);
});
test('does not suppress missing public source, dangling type/member/capability or a dropped final disposition', () => {
  const f = fixture(); f.finite.artifact.bindings = [];
  assert.ok(buildFinalPublicClosure(f).blockers.some(r => r.recordId === 'T'));
  for (const mutate of [f => f.publicDispositions.exports.pop(), f => f.members[0].ownerTypeId = 'missing',
    f => f.scopeRelations.capabilities.pop(), f => f.typeEdges.push({ id: 'edge', fromTypeId: 'T', toTypeId: 'missing' })]) {
    const input = fixture(); mutate(input); assert.throws(() => buildFinalPublicClosure(input));
  }
});
test('reconstruction rejects removed deep members, source role changes and altered capability references', () => {
  const expected = buildFinalPublicClosure(fixture());
  for (const mutate of [r => r.records.splice(2, 1), r => r.records[2].sourceEvidence[0].kind = 'OWN_DECLARATION',
    r => r.records[0].capabilityIds = [], r => r.stageClosable = true]) {
    const actual = structuredClone(expected); mutate(actual);
    assert.equal(validateFinalPublicClosure(actual, expected).valid, false);
  }
});
test('inherits reviewed plugin public dispositions instead of retaining the original pending classification', () => {
  const input = fixture();
  input.memberships.push({ id: 'MP', table: 'plugins', recordId: 'P', capabilityIds: ['C'], classification: 'PUBLIC_REVIEW_PENDING', sourceRefs: [] });
  input.plugins.plugins.push({ id: 'P', disposition: { kind: 'PUBLIC_FACTORY_RETURNED_PLUGIN' }, declarationId: 'PD' });
  const result = buildFinalPublicClosure(input);
  assert.equal(result.records.find(row => row.id === 'MP').classification, 'PUBLIC_FACTORY_RETURNED_PLUGIN');
  delete input.plugins.plugins[0].disposition;
  assert.throws(() => buildFinalPublicClosure(input), /plugin.*disposition/);
});
