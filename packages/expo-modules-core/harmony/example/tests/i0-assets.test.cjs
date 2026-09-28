const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = process.env.EXPO_I0_FIXTURE_ROOT;
test('standard I0 bundle packages the numeric require with the RNOH asset pipeline', () => {
  assert.ok(root, 'EXPO_I0_FIXTURE_ROOT is required');
  execFileSync(process.execPath, [path.resolve(__dirname, '../bundle.cjs'), root, '--expo'],
    { timeout: 120000, stdio: 'pipe', maxBuffer: 8 * 1024 * 1024 });
  assert.deepEqual(fs.readFileSync(path.join(root, 'harmony/entry/src/main/resources/rawfile/assets/fixtures/lane-b.svg')),
    fs.readFileSync(path.join(root, 'fixtures/lane-b.svg')));
});
