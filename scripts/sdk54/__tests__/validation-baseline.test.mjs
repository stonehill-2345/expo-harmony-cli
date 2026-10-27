import assert from 'node:assert/strict';
import test from 'node:test';

import { dependencyCases, runDependencyBaseline } from '../reproduce-dependency-baseline.mjs';

test('BASE-01/02: observes current source behavior without treating known defects as product PASS', async () => {
  const result = await runDependencyBaseline();
  assert.equal(result.sourceInputs.length, 4);
  assert.equal(result.cases.length, dependencyCases.length);
  const mismatches = result.cases.filter((entry) => entry.desiredBehavior === 'FAIL').map((entry) => entry.id);
  assert.deepEqual(mismatches, dependencyCases.filter((entry) => entry.knownMismatch).map((entry) => entry.id));
  assert.equal(result.productFixed, false);
  for (const entry of result.cases) assert.equal(entry.reproduction, 'PASS');
  for (const id of ['NAV-BOTTOM-EXACT', 'NAV-NATIVE-EXACT', 'NAV-STACK-EXACT']) {
    const entry = result.cases.find((value) => value.id === id);
    assert.equal(entry.installedVersionSatisfies, true);
    assert.equal(entry.standardVersionCheckIncorrect, false);
    assert.equal(entry.actual.diagnostics.length, 1);
  }
});

test('BASE-03: actual checkPackages source appends Router false positives and exits with JSON false', async () => {
  const result = await runDependencyBaseline();
  assert.equal(result.integration.exitCode, 1);
  assert.equal(result.integration.json.upToDate, false);
  assert.equal(result.integration.json.dependencies.length, 3);
  assert.equal(result.integration.desiredBehavior, 'FAIL');
  assert.equal(result.integration.reproduction, 'PASS');
});
