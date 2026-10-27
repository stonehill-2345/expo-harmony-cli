import assert from 'node:assert/strict';
import test from 'node:test';
import { portableAuditEvidence, summarizeM0Baseline, validateM0BaselineAudit } from '../m0-baseline-audit.mjs';

function input() {
  const make = (id, status) => ({ id, status, reason: status === 'NOT_RUN' ? '前置失败' : undefined });
  return {
    current: { scenarios: [...['blank-typescript', 'default'].flatMap(t => ['npm', 'pnpm'].map(p => ({ id: `sdk54-${t}-${p}`, steps: [make('create', 'FAIL'), make('identify', 'PASS'), make('doctor', 'FAIL'), make('prebuild', 'NOT_RUN'), make('native-device', 'NOT_RUN')] }))), ...['npm', 'pnpm'].map(p => ({ id: `sdk52-default-${p}`, steps: [make('create', 'PASS'), make('identify', 'PASS'), make('scan', 'PASS'), make('prebuild', 'FAIL'), make('native-device', 'NOT_RUN')] }))] },
    replay: { scenarios: ['npm', 'pnpm'].map(p => ({ id: `sdk52-${p}`, steps: ['install', 'identity', 'prebuild', 'repeat-prebuild', 'repeat-consistency', 'release-bundle', 'native-device'].map(name => make(name, p === 'pnpm' && ['install', 'identity', 'prebuild'].includes(name) ? 'PASS' : name === 'install' || p === 'pnpm' && name === 'repeat-prebuild' ? 'FAIL' : 'NOT_RUN')) })) },
    followup: { execution: { status: 'FAIL', exitCode: 1 }, artifact: null },
    checks: { currentEvidence: true, replayEvidence: true, followupEvidence: true, archivedEvidence: true, minimalReproductions: true, devicePreflight: true, sameCandidate: true },
  };
}

test('complete failed/blocked observation can accept investigation while preserving product failures', () => {
  const result = summarizeM0Baseline(input());
  assert.equal(result.investigationAccepted, true);
  assert.equal(result.productAllPassed, false);
  assert.equal(result.nativeDeviceAccepted, false);
  assert.deepEqual(result.currentStatuses, { PASS: 10, FAIL: 10, NOT_RUN: 10 });
  assert.deepEqual(result.replayStatuses, { PASS: 3, FAIL: 2, NOT_RUN: 9 });
  assert.equal(result.stageClosable, false);
});

test('missing scenario, missing step, missing evidence or skip reason cannot be accepted', () => {
  for (const mutate of [i => i.current.scenarios.pop(), i => i.replay.scenarios[0].steps.pop(), i => i.checks.archivedEvidence = false, i => i.current.scenarios[0].steps.at(-1).reason = '', i => i.followup.execution.status = 'PASS']) {
    const value = input(); mutate(value); assert.equal(summarizeM0Baseline(value).investigationAccepted, false);
  }
});

test('audit reconstruction rejects altered counts, product completion and omitted failures', () => {
  const expected = summarizeM0Baseline(input());
  for (const mutate of [a => a.currentStatuses.FAIL = 0, a => a.productAllPassed = true, a => a.observations.pop(), a => a.nativeDeviceAccepted = true]) {
    const actual = structuredClone(expected); mutate(actual); assert.equal(validateM0BaselineAudit(actual, expected).valid, false);
  }
  assert.equal(validateM0BaselineAudit(expected, expected).valid, true);
});

test('tracked audit paths are repository-relative and outside files are rejected', () => {
  assert.equal(portableAuditEvidence('/repo/outputs/result.json', '/repo'), 'outputs/result.json');
  assert.equal(portableAuditEvidence('outputs/result.json', '/repo'), 'outputs/result.json');
  assert.throws(() => portableAuditEvidence('/another/result.json', '/repo'), /outside repository/);
});
