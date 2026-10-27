import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFinalSourceCategories, validateFinalSourceCategories } from '../m0-final-source-categories.mjs';
const fixture = () => ({ gaps: ['EVENT', 'PERMISSION', 'PLUGIN_OPTION'].map(category => ({ id: category, category, ownerId: 'O', status: 'SEMANTIC_REVIEW_REQUIRED' })),
  owners: [{ id: 'O', publicPackageId: 'P' }], sourceFiles: [{ path: 'module.kt', ownerId: 'O', sha256: 'a' }],
  analyses: [{ path: 'module.kt', sourceSha256: 'a', reference: 'native.json', referenceSha256: 'b', sourcePointer: '/files/0',
    blockerCount: 2, facts: [{ kind: 'EVENT_DECLARATION', category: 'EVENT', name: 'update' }] }],
  capabilities: [{ id: 'C', ownerPackageId: 'P' }], plugins: [{ id: 'G', packageId: 'P', disposition: { kind: 'PUBLIC_ENTRY_PLUGIN' }, declarationId: 'D' }] });
test('indexes concrete facts, source diagnostics, plugin algorithms and explicit scope uses separately', () => {
  const result = buildFinalSourceCategories(fixture());
  assert.equal(result.records[0].matchedFacts[0].pointer, '/files/0/facts/0');
  assert.match(result.records[1].status, /SOURCE_DIAGNOSTICS/);
  assert.equal(result.records[2].pluginContracts[0].ownerAlgorithmPointer, '/ownershipContract');
  assert.equal(result.publicApiClaim, false);
  assert.deepEqual(result.ownerRuleSets[0].capabilityIds, ['C']);
});
test('does not claim behavior absence from zero category matches', () => {
  const input = fixture(); input.analyses[0].blockerCount = 0;
  assert.equal(buildFinalSourceCategories(input).records[1].status, 'NO_SEPARATE_CATEGORY_DECLARATION_IN_FINITE_SOURCE_RULES');
});
test('rejects missing cells, altered facts, invented support and invalid source identities', () => {
  const expected = buildFinalSourceCategories(fixture());
  for (const mutate of [a => a.records.pop(), a => a.records[0].matchedFacts.pop(), a => a.publicApiClaim = true]) {
    const actual = structuredClone(expected); mutate(actual);
    assert.equal(validateFinalSourceCategories(actual, expected).valid, false);
  }
  const input = fixture(); input.analyses[0].sourceSha256 = 'wrong';
  assert.throws(() => buildFinalSourceCategories(input), /source/);
});
