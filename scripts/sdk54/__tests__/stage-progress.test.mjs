import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { calculateStageProgress } from '../stage-progress.mjs';

test('BASE-07: frozen denominator and evidence control progress; partial work counts zero', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-progress-'));
  try {
    fs.writeFileSync(path.join(root, 'report.md'), 'Accepted evidence');
    const evidence = [{ path: 'report.md', sha256: createHash('sha256').update('Accepted evidence').digest('hex') }];
    const definition = { schemaVersion: 1, formula: 'floor(100 * acceptedUnits / totalUnits)', stages: { M0: ['A', 'B', 'C'] } };
    const acceptance = { units: [{ id: 'A', status: 'PASS', evidence }], closures: [] };
    const result = calculateStageProgress(definition, acceptance, root);
    assert.equal(result.M0.percent, 33);
    assert.equal(result.M0.closed, false);
    const invalid = (units, closures = []) => () => calculateStageProgress(definition, { units, closures }, root);
    assert.throws(invalid([...acceptance.units, ...acceptance.units]), /Duplicate/);
    assert.throws(invalid([{ id: 'UNKNOWN', status: 'PASS', evidence }]), /Unknown/);
    assert.throws(invalid([{ id: 'B', status: 'PASS', evidence: [] }]), /evidence/);
    assert.throws(invalid([{ id: 'B', status: 'FAIL', evidence }]), /PASS/);
    assert.throws(invalid(acceptance.units, [{ stage: 'M0', status: 'PASS', evidence }]), /incomplete/);
    assert.throws(invalid(acceptance.units, [{ stage: 'UNKNOWN', status: 'PASS', evidence }]), /Unknown/);
    fs.writeFileSync(path.join(root, 'report.md'), 'changed');
    assert.throws(invalid(acceptance.units), /hash/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
