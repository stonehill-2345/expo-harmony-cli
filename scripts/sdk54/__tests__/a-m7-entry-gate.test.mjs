import assert from 'node:assert/strict';
import test from 'node:test';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readStageProgress } from '../stage-progress.mjs';

import { buildA07EntryAudit, evaluateA07Entry } from '../a-m7-entry-gate.mjs';

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

for (const name of ['m4', 'm5', 'validation']) {
  test(`open ${name} blocks entry even when M6 is closed`, () => {
    const result = evaluateA07Entry(fixture({ [name]: false }));
    assert.equal(result.decision, 'BLOCKED');
    assert.equal(result.implementationReady, false);
    assert.equal(result.integrationReady, false);
  });
}

test('a frozen progress mismatch invalidates otherwise replayable evidence', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-a07-mismatch-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = ['docs/releases/2026-11-02-sdk54-a06-expo-image-contract.json',
    'docs/releases/sdk54-stage-progress-definition.json', 'scripts/sdk54/catalog.mjs',
    'scripts/sdk54/release-catalog.mjs', 'apps/cli/content/patches/sdk-54/manifest.json'];
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.copyFileSync(file, path.join(root, file));
  }
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  const definitionBytes = fs.readFileSync(path.join(root, files[1]));
  const definition = JSON.parse(definitionBytes);
  fs.writeFileSync(path.join(root, 'evidence.txt'), 'fixture');
  const evidence = [{ path: 'evidence.txt', sha256: sha('fixture') }];
  const acceptance = { schemaVersion: 1, definitionSha256: sha(definitionBytes),
    units: Object.values(definition.stages).flat().map(id => ({ id, status: 'PASS', evidence })),
    closures: Object.keys(definition.stages).map(stage => ({ stage, status: 'PASS', evidence })) };
  fs.writeFileSync(path.join(root, 'docs/releases/sdk54-stage-acceptance.json'), JSON.stringify(acceptance));
  const frozen = readStageProgress(root);
  frozen.stages.M6.closed = false;
  fs.writeFileSync(path.join(root, 'docs/releases/sdk54-stage-progress.json'), JSON.stringify(frozen));
  const result = buildA07EntryAudit(root).gate;
  assert.equal(result.decision, 'BLOCKED');
  assert.ok(result.blockers.some(row => row.id === 'STAGE_EVIDENCE_INVALID'));
});
