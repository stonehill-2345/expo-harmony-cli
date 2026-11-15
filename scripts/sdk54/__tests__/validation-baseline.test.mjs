import assert from 'node:assert/strict';
import test from 'node:test';

import { dependencyCases, runDependencyBaseline } from '../reproduce-dependency-baseline.mjs';

test('BASE-01/02: accepts repaired exact pins while retaining unresolved alias and duplicate defects', async () => {
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
    assert.equal(entry.actual.diagnostics.length, 0);
    assert.equal(entry.desiredBehavior, 'PASS');
  }
  for (const id of ['RANGE-INVALID', 'RANGE-TOO-WIDE']) {
    const entry = result.cases.find((value) => value.id === id);
    assert.equal(entry.actual.diagnostics.length, 1);
    assert.equal(entry.desiredBehavior, 'PASS');
  }
});

test('BASE-03: actual checkPackages source accepts compatible pinned dependencies with JSON true', async () => {
  const result = await runDependencyBaseline();
  assert.equal(result.integration.exitCode, 0);
  assert.equal(result.integration.json.upToDate, true);
  assert.equal(result.integration.json.dependencies.length, 0);
  assert.equal(result.integration.desiredBehavior, 'PASS');
  assert.equal(result.integration.reproduction, 'PASS');
});
