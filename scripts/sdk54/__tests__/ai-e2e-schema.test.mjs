import assert from 'node:assert/strict';
import test from 'node:test';

import { validateCaseSet, validateResults, validateRunManifest } from '../ai-e2e/schema.mjs';

const hash = 'a'.repeat(64);

test('validates a complete run manifest and reports malformed fields without throwing', () => {
  const valid = {
    schemaVersion: 1,
    runId: '20261030-b02',
    stage: 'V-01',
    source: { revision: '1'.repeat(40), dirty: false },
    caseSet: { path: 'case-set.json', sha256: hash },
    candidate: { path: 'candidate.json', sha256: hash },
    repositoryRoot: '/tmp/sdk54-repository',
    consumerRoot: '/tmp/sdk54-consumer',
    tools: { node: '/usr/bin/node', npm: '/usr/bin/npm', pnpm: '/usr/bin/pnpm' },
  };
  assert.deepEqual(validateRunManifest(valid), []);

  const errors = validateRunManifest({ schemaVersion: 1, runId: '', source: {}, caseSet: {}, candidate: {} });
  assert.ok(errors.includes('runId must be a non-empty filesystem-safe string'));
  assert.ok(errors.includes('stage must be a non-empty string'));
  assert.ok(errors.includes('source.revision must be a 40 or 64 character lowercase hex revision'));
  assert.ok(errors.includes('repositoryRoot must be an absolute path'));
  assert.ok(errors.includes('tools.node must be an absolute path'));
});

test('validates unique case definitions and evidence requirements', () => {
  const valid = {
    schemaVersion: 1,
    registryVersion: '2026-11-11',
    registrySha256: hash,
    cases: [{ id: 'V01-ONE', required: true, requiresDevice: false, requiredEvidence: ['command-log'] }],
  };
  assert.deepEqual(validateCaseSet(valid), []);

  const errors = validateCaseSet({ ...valid, cases: [valid.cases[0], valid.cases[0]] });
  assert.ok(errors.includes('duplicate case id: V01-ONE'));
});

test('PASS requires identity timestamps and evidence while NOT_RUN may remain empty', () => {
  const validPass = {
    schemaVersion: 1,
    runId: '20261030-b02',
    results: [{
      caseId: 'V01-ONE', attemptId: 'attempt-1', runId: '20261030-b02',
      caseSetSha256: hash, candidateSha256: hash, status: 'PASS',
      startedAt: '2026-10-30T00:00:00.000Z', endedAt: '2026-10-30T00:00:01.000Z',
      timedOut: false, interrupted: false,
      evidence: [{ type: 'command-log', path: 'commands/one.log', sha256: hash }],
    }],
  };
  assert.deepEqual(validateResults(validPass), []);

  const invalidPass = structuredClone(validPass);
  invalidPass.results[0].evidence = [];
  assert.ok(validateResults(invalidPass).includes('results[0].evidence must be non-empty for PASS'));

  const notRun = structuredClone(validPass);
  Object.assign(notRun.results[0], { status: 'NOT_RUN', startedAt: null, endedAt: null, evidence: [] });
  assert.deepEqual(validateResults(notRun), []);
});
