import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFinalScopeRelations, validateFinalScopeRelations } from '../m0-final-scope-relations.mjs';
const fixture = () => ({
  capabilities: [{ id: 'CAP:old-deferred', ownerPackageId: 'PKG:a', scope: { state: 'DEFERRED', scopeId: 'DEFER-UPDATES' }, milestoneIds: ['M0', 'M7.5'], dependencyIds: ['DEP:1'] }],
  dependencies: [{ id: 'DEP:1', ownerPackageId: 'PKG:a', targetId: 'PKG:a', sourceRefs: [{ path: 'package.json', sha256: 'a'.repeat(64) }] }],
  seedDecisions: [{ id: 'SEED:a', category: 'WORKSPACE', capabilityIds: ['CAP:old-deferred'] }],
  review: { decisions: [{ id: 'CAP:old-deferred', ownerPackageId: 'PKG:a', oldScope: { state: 'DEFERRED', scopeId: 'DEFER-UPDATES' },
    finalMilestoneIds: ['M0', 'M7.2', 'M7.5'], sourceRefs: [{ path: 'package.json', sha256: 'a'.repeat(64) }],
    scope: { state: 'MIXED_BY_USE', uses: [{ use: 'embedded launch', state: 'REQUIRED', deferId: null, batch: 'M7.2' },
      { use: 'updates', state: 'DEFERRED', deferId: 'DEFER-UPDATES', batch: 'M7.5' }] } }],
  seedDecisions: [{ id: 'SEED:a', reviewedCapabilityIds: ['CAP:old-deferred'] }] },
  sourceFiles: [{ path: 'package.json', sha256: 'a'.repeat(64), capabilityIds: ['CAP:old-deferred'] }],
  semanticFiles: [{ path: 'package.json', sourceSha256: 'a'.repeat(64), format: 'support', factCount: 5, reference: 'support.json' }],
});
test('preserves original IDs and dependencies while binding mixed responsibilities to explicit uses and batches', () => {
  const result = buildFinalScopeRelations(fixture());
  assert.equal(result.capabilities[0].id, 'CAP:old-deferred');
  assert.equal(result.capabilities[0].scope.uses[0].state, 'REQUIRED');
  assert.deepEqual(result.capabilities[0].milestoneIds, ['M0', 'M7.2', 'M7.5']);
  assert.deepEqual(result.capabilities[0].originalScope, { state: 'DEFERRED', scopeId: 'DEFER-UPDATES' });
  assert.deepEqual(result.sourceBindings[0].capabilityIds, ['CAP:old-deferred']);
  assert.equal(result.sourceBindings[0].relationship, 'SOURCE_OWNER_CONTEXT_WITH_EXPLICIT_CAPABILITY_USES');
  assert.equal(result.harmonySupportAccepted, false);
});
test('rejects omitted old IDs, changed source receipts, invented deferrals and dangling dependencies', () => {
  for (const mutate of [f => f.review.decisions.pop(), f => f.review.decisions[0].sourceRefs[0].sha256 = 'b'.repeat(64),
    f => f.review.decisions[0].scope.uses[0].state = 'DEFERRED', f => f.dependencies[0].targetId = 'PKG:missing',
    f => f.review.decisions[0].finalMilestoneIds = ['M0', 'M7.5'], f => f.sourceFiles[0].capabilityIds = ['CAP:missing']]) {
    const input = fixture(); mutate(input); assert.throws(() => buildFinalScopeRelations(input));
  }
});
test('source reconstruction rejects removed relations, changed use scopes, batch changes and false support', () => {
  const expected = buildFinalScopeRelations(fixture());
  for (const mutate of [r => r.sourceBindings.pop(), r => r.capabilities[0].scope.uses[0].state = 'DEFERRED',
    r => r.capabilities[0].milestoneIds = ['M0'], r => r.harmonySupportAccepted = true, r => r.dependencies.pop()]) {
    const actual = structuredClone(expected); mutate(actual);
    assert.equal(validateFinalScopeRelations(actual, expected).valid, false);
  }
});
test('keeps capability-seed IDs separate from original seed IDs and checks the original receipt', () => {
  const input = fixture();
  input.seedDecisions[0].id = 'CAPABILITY-SEED-DECISION:SEED%3Aa';
  input.seedDecisions[0].recordId = 'SEED:a';
  input.seedDecisions[0].recordSha256 = 'c'.repeat(64);
  input.review.seedDecisions[0].originalRecordSha256 = 'c'.repeat(64);
  assert.equal(buildFinalScopeRelations(input).seedDecisions[0].id, 'CAPABILITY-SEED-DECISION:SEED%3Aa');
  input.review.seedDecisions[0].originalRecordSha256 = 'd'.repeat(64);
  assert.throws(() => buildFinalScopeRelations(input), /seed.*receipt/);
});
