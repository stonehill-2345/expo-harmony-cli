import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateA07Entry } from '../a-m7-entry-gate.mjs';

const unit = (name, isClosed) => ({
  closed: isClosed,
  acceptedUnits: isClosed ? [`${name}-01`] : [],
  pendingUnits: isClosed ? [] : [`${name}-01`],
  totalUnits: 1,
  percent: isClosed ? 100 : 0,
});

function fixture({ m4 = true, m5 = true, validation = true, m6 = true, expoImage = true } = {}) {
  return {
    stageProgress: { schemaVersion: 1, stages: {
      M4: unit('M4', m4), M5: unit('M5', m5), V: unit('V', validation), M6: unit('M6', m6),
    } },
    a06Contract: {
      format: 'sdk54-a06-expo-image-contract-v1', task: 'A-06', version: '3.0.11',
      preparationStatus: 'PASS', implementationStatus: 'NOT_STARTED', stageClosable: false,
    },
    releaseManifest: {
      release: 'fixture',
      packages: expoImage ? [{ installName: 'expo-image', upstreamVersion: '3.0.11' }] : [],
    },
  };
}

test('A-07 formal integration is ready only after M6 and release identity both exist', () => {
  const ready = evaluateA07Entry(fixture());
  assert.equal(ready.decision, 'READY_FOR_FORMAL_INTEGRATION');
  assert.equal(ready.implementationReady, true);
  assert.equal(ready.integrationReady, true);
  assert.deepEqual(ready.blockers, []);
});

test('a closed M6 permits package implementation but not integration without expo-image identity', () => {
  const result = evaluateA07Entry(fixture({ expoImage: false }));
  assert.equal(result.decision, 'READY_FOR_PACKAGE_IMPLEMENTATION');
  assert.equal(result.implementationReady, true);
  assert.equal(result.integrationReady, false);
  assert.deepEqual(result.blockers.map(row => row.id), ['EXPO_IMAGE_RELEASE_IDENTITY_MISSING']);
});

test('an open M6 blocks implementation even when an expo-image release record exists', () => {
  const result = evaluateA07Entry(fixture({ m6: false }));
  assert.equal(result.decision, 'BLOCKED');
  assert.equal(result.implementationReady, false);
  assert.equal(result.integrationReady, false);
  assert.ok(result.blockers.some(row => row.id === 'M6_NOT_CLOSED'));
});

test('unreplayable stage evidence blocks implementation even when frozen stages say closed', () => {
  const input = fixture();
  input.stageEvidenceValid = false;
  input.stageEvidenceError = 'missing checked evidence';
  const result = evaluateA07Entry(input);
  assert.equal(result.implementationReady, false);
  assert.equal(result.decision, 'BLOCKED');
  assert.deepEqual(result.blockers[0], { id: 'STAGE_EVIDENCE_INVALID', owner: 'B/A', detail: 'missing checked evidence' });
});

test('open upstream stages remain visible instead of being hidden behind M6', () => {
  const result = evaluateA07Entry(fixture({ m4: false, m5: false, validation: false, m6: false, expoImage: false }));
  assert.deepEqual(result.blockers.map(row => row.id), [
    'M4_NOT_CLOSED', 'M5_NOT_CLOSED', 'V_NOT_CLOSED', 'M6_NOT_CLOSED', 'EXPO_IMAGE_RELEASE_IDENTITY_MISSING',
  ]);
});

test('changed A-06 status, stage denominator, or expo-image version fails closed', () => {
  const changedA06 = fixture(); changedA06.a06Contract.preparationStatus = 'FAIL';
  assert.equal(evaluateA07Entry(changedA06).implementationReady, false);
  const changedStage = fixture(); changedStage.stageProgress.stages.M6.totalUnits = 2;
  assert.throws(() => evaluateA07Entry(changedStage), /Invalid M6 denominator/);
  const changedVersion = fixture(); changedVersion.releaseManifest.packages[0].upstreamVersion = '3.0.12';
  assert.throws(() => evaluateA07Entry(changedVersion), /wrong expo-image version/);
});
