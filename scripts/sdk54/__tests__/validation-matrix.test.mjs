import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createTestEntryMatrix, verifyTestEntryMatrix } from '../test-entry-matrix.mjs';

test('BASE-04: all workspace packages including missing tests are indexed and mutation is rejected', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-matrix-'));
  try {
    for (const name of ['apps/cli', 'packages/no-tests', 'packages/@expo/example']) fs.mkdirSync(path.join(root, name), { recursive: true });
    fs.writeFileSync(path.join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n  - 'packages/*'\n  - 'packages/@expo/*'\n");
    for (const name of ['apps/cli', 'packages/no-tests', 'packages/@expo/example']) {
      fs.writeFileSync(path.join(root, name, 'package.json'), JSON.stringify({ name, scripts: name === 'packages/no-tests' ? {} : { test: 'node --test' } }));
    }
    fs.mkdirSync(path.join(root, 'packages/@expo/example/harmony/tests'), { recursive: true });
    fs.writeFileSync(path.join(root, 'packages/@expo/example/harmony/tests/a.test.cjs'), 'test();');
    const matrix = createTestEntryMatrix(root);
    assert.equal(matrix.packages.length, 3);
    assert.equal(matrix.packages.find((entry) => entry.name === 'packages/no-tests').testAvailability, 'MISSING');
    assert.equal(matrix.packages.find((entry) => entry.name === 'packages/@expo/example').harmonyTests.length, 1);
    verifyTestEntryMatrix(matrix, root);
    assert.throws(() => verifyTestEntryMatrix({ ...matrix, packages: matrix.packages.slice(1) }, root), /differs/);
    fs.appendFileSync(path.join(root, 'packages/@expo/example/harmony/tests/a.test.cjs'), '\nchanged();');
    assert.throws(() => verifyTestEntryMatrix(matrix, root), /differs/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
