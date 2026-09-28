const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = process.env.EXPO_LINKING_EVIDENCE_ROOT || path.resolve(__dirname, '../../../../../docs/harmony-sdk54/evidence/2026-09-20-linking-integration/debug-public');
const checker = path.resolve(__dirname, '../linking/check-log.cjs');
// Real captured device events, not a mocked native success payload.
test('Linking evidence checker accepts complete real reloads and rejects missing public hook', () => {
  assert.ok(root, 'EXPO_LINKING_EVIDENCE_ROOT required');
  const original = fs.readFileSync(path.join(root, 'reload3-after-timeout.log'), 'utf8');
  const run = input => spawnSync(process.execPath, [checker], { input, encoding: 'utf8' });
  assert.equal(run(original).status, 0);
  const missingHook = original.split('\n').filter(line => !line.includes('"kind":"hook"')).join('\n');
  const result = run(missingHook);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /hook/);
});

test('Linking checker rejects an old Runtime event appended after a new boot', () => {
  const original = fs.readFileSync(path.join(root, 'reload3-after-timeout.log'), 'utf8');
  const oldEvent = original.split('\n').find(line => line.includes('I0_LINKING=') && line.includes('"kind":"event"'));
  assert.ok(oldEvent);
  const result = spawnSync(process.execPath, [checker], { input: original + '\n' + oldEvent, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Old Runtime/);
});
