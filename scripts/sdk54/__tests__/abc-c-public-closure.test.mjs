import test from 'node:test';
import assert from 'node:assert/strict';
import { auditScope } from '../abc/c-public-closure.mjs';

const rows = () => [
  { id: 'A', kind: 'api', scope: 'M4_REQUIRED', acceptance: 'NOT_RUN', acceptanceId: 'M4-A01', source: { path: 'a.ts', line: 1 } },
  { id: 'B', kind: 'member', scope: 'M7_TRANSFER', acceptance: 'NOT_RUN', batch: 'M7.1', target: 'verify', source: { path: 'b.ts', line: 2 } },
  { id: 'C', kind: 'public-export', scope: 'SOURCE_CONTEXT', acceptance: 'NOT_RUN', source: { path: 'c.ts', sha256: 'a'.repeat(64) } },
];

test('keeps public relation closure separate from Harmony runtime acceptance', () => {
  const result = auditScope({ schemaVersion: 1, complete: true, rows: rows() });
  assert.equal(result.valid, true);
  assert.equal(result.relationClosed, true);
  assert.equal(result.harmonySupportAccepted, false);
  assert.equal(result.stageClosable, false);
});

test('rejects duplicate IDs, missing M4 assertion, incomplete M7 transfer and unknown scope', () => {
  const mutations = [
    value => value.push(structuredClone(value[0])),
    value => delete value[0].acceptanceId,
    value => delete value[1].target,
    value => value[2].scope = 'OPTIONAL',
  ];
  for (const mutate of mutations) {
    const value = rows(); mutate(value);
    assert.equal(auditScope({ schemaVersion: 1, complete: true, rows: value }).valid, false);
  }
});

test('does not accept an explicitly incomplete scope document', () => {
  assert.equal(auditScope({ schemaVersion: 1, complete: false, rows: rows() }).relationClosed, false);
});
