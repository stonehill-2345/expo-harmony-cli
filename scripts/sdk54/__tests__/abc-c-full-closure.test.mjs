import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSourceClosure } from '../abc/c-public-closure.mjs';

const source = `export interface Demo { value: string }\nexport const demo: Demo = { value: 'x' };\n`;
const fixture = ({ missingMemberSource = false, missingExport = false } = {}) => ({
  scope: { schemaVersion: 1, complete: false, rows: [
    { id: 'M', kind: 'public-member-candidate', scope: 'M4_REQUIRED', acceptance: 'NOT_RUN', acceptanceId: 'M4-A01',
      ownerTypeId: 'T', membershipId: 'MEM:M', reachability: 'PUBLIC_REACHABLE', capabilityIds: [],
      declarations: missingMemberSource ? [] : [{ id: 'D', path: 'demo.ts', start: 24, end: 37, sourceStatus: 'HASH_VERIFIED', sha256: 'ignored' }] },
    { id: 'E', kind: 'public-export', scope: 'SOURCE_CONTEXT', acceptance: 'NOT_RUN', name: missingExport ? 'absent' : 'demo',
      source: { path: 'demo.ts' } },
  ] },
  surface: {
    types: [{ id: 'T', kind: 'object', display: 'Demo', declarationIds: missingMemberSource ? [] : ['D'], memberIds: ['M'] }],
    members: [{ id: 'M', ownerTypeId: 'T', declarationIds: missingMemberSource ? [] : ['D'] }],
    typeEdges: [], exports: [{ id: 'E', typeId: missingMemberSource ? null : 'T', declarationIds: ['D'] }],
    declarations: [{ id: 'D', path: 'demo.ts', start: 24, end: 37, sourceStatus: 'HASH_VERIFIED', sha256: 'ignored' }],
  },
  files: [{ path: 'demo.ts', content: source }],
});

test('runs finite, derived and export builders while retaining unavailable historical relations as blockers', () => {
  const result = buildSourceClosure(fixture());
  assert.equal(result.finite.format, 'sdk54-finite-source-declarations-v1');
  assert.equal(result.derived.format, 'sdk54-derived-source-provenance-v1');
  assert.equal(result.exportBindings.format, 'sdk54-export-source-bindings-v1');
  assert.ok(result.blockers.some(row => row.code === 'MISSING_CAPABILITY_RELATIONS_INPUT'));
  assert.ok(result.blockers.some(row => row.code === 'MISSING_FULL_MEMBERSHIP_INPUT'));
  assert.equal(result.finalClosure, null);
  assert.equal(result.stageClosable, false);
});

test('rejects a member without finite or derived source evidence', () => {
  const result = buildSourceClosure(fixture({ missingMemberSource: true }));
  assert.ok(result.blockers.some(row => row.code === 'MISSING_SOURCE_EVIDENCE' && row.recordId === 'M'));
});

test('retains an unresolved export binding as a blocker', () => {
  const result = buildSourceClosure(fixture({ missingExport: true }));
  assert.ok(result.blockers.some(row => row.code === 'MISSING_EXPORT_SOURCE_BINDING' && row.recordId === 'E'));
});

test('retains an unresolved finite binding without dropping derived evidence', () => {
  const input = fixture();
  input.scope.rows[0].declarations[0] = { ...input.scope.rows[0].declarations[0], start: 40, end: 41 };
  const result = buildSourceClosure(input);
  assert.ok(result.blockers.some(row => row.code === 'FINITE_DECLARATION_BLOCKER' && row.recordId === 'M'));
  assert.ok(result.derived.records.some(row => row.recordId === 'M'));
});
