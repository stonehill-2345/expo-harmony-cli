import assert from 'node:assert/strict';
import test from 'node:test';
import { memberReachability, pluginLinkage } from '../a-m4-evidence.mjs';

function fixture() {
  const surface = { types: [{ id: 'root', memberIds: [] }, { id: 'child', memberIds: ['method'] }, { id: 'private', memberIds: ['internal'] }],
    members: [{ id: 'method', ownerTypeId: 'child' }, { id: 'internal', ownerTypeId: 'private' }],
    typeEdges: [{ id: 'root-child', fromTypeId: 'root', toTypeId: 'child' }, { id: 'cycle', fromTypeId: 'child', toTypeId: 'root' }],
    exports: [{ id: 'public', typeId: 'root', instanceTypeId: null }, { id: 'implementation', typeId: 'private', instanceTypeId: null }] };
  const dispositions = { exports: surface.exports.map(row => ({ ...row, disposition: row.id === 'public' ? 'PUBLIC_MODULE_EXPORT' : 'IMPLEMENTATION_MODULE_EXPORT' })) };
  return { surface, dispositions, candidates: surface.members };
}

test('member graph uses public roots, follows cycles, and retains a witness for transitive members', () => {
  const { surface, dispositions, candidates } = fixture();
  const result = memberReachability(surface, dispositions, candidates);
  assert.equal(result.records[0].classification, 'PUBLIC_REACHABLE');
  assert.deepEqual(result.records[0].publicWitness, { exportId: 'public', parentTypeId: 'root', relationId: 'root-child' });
  assert.equal(result.records[1].classification, 'IMPLEMENTATION_TYPE_CONTEXT');
  assert.equal(result.complete, false);
});

test('instance roots and method return types participate in public reachability', () => {
  const { surface, dispositions, candidates } = fixture();
  surface.exports[0].instanceTypeId = 'private'; dispositions.exports[0].instanceTypeId = 'private';
  surface.members[1].returnTypeId = 'child'; surface.typeEdges = [];
  assert.ok(memberReachability(surface, dispositions, candidates).records.every(row => row.classification === 'PUBLIC_REACHABLE'));
});

test('changed exports, missing owners/parameters and dangling graph edges cannot silently become context', () => {
  for (const mutate of [
    ({ dispositions }) => dispositions.exports.pop(),
    ({ dispositions }) => { dispositions.exports[0].typeId = 'private'; },
    ({ surface }) => { surface.typeEdges[0].toTypeId = 'missing'; },
    ({ surface }) => { surface.members[0].ownerTypeId = 'missing'; },
    ({ surface }) => { surface.members[0].parameterIds = ['missing']; },
    ({ surface }) => { surface.types.push(surface.types[0]); },
  ]) {
    const input = fixture(); mutate(input);
    assert.throws(() => memberReachability(input.surface, input.dispositions, input.candidates));
  }
});

test('plugin direct linkage requires the actual declaration path and offset, not a matching name', () => {
  const candidate = { id: 'plugin', sourcePath: 'plugin.ts', start: 12, symbol: 'withPlugin' };
  const surface = { declarations: [{ id: 'actual', path: 'plugin.ts', start: 12 }, { id: 'other', path: 'other.ts', start: 12 }] };
  const dispositions = { modules: [], exports: [
    { id: 'good', name: 'withPlugin', disposition: 'PUBLIC_MODULE_EXPORT', declarationIds: ['actual'], effectiveEntryIds: ['entry'] },
    { id: 'wrong', name: 'withPlugin', disposition: 'PUBLIC_MODULE_EXPORT', declarationIds: ['other'], effectiveEntryIds: ['wrong-entry'] },
  ] };
  const [link] = pluginLinkage(surface, dispositions, [candidate]);
  assert.deepEqual(link.directPublicExportIds, ['good']); assert.deepEqual(link.directEntryIds, ['entry']);
});
