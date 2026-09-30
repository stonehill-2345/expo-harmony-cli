const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = process.env.EXPO_I0_EVIDENCE_ROOT || path.resolve(__dirname, '../../../../../docs/harmony-sdk54/evidence/2026-09-20-i0');
// This checks actual captured integration evidence, not fabricated native output.
test('I0 checker rejects a real log with its Asset result removed', () => {
  assert.ok(root, 'EXPO_I0_EVIDENCE_ROOT required');
  const source = fs.readFileSync(path.join(root, 'release-first.log'), 'utf8');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'i0-checker-'));
  const broken = path.join(temporary, 'missing-asset.log');
  fs.writeFileSync(broken, source.split('\n').filter(line => !line.includes('I0_ASSET_PASS=')).join('\n'));
  const result = spawnSync(process.execPath, [path.resolve(__dirname, '../tools/check-i0-log.cjs'), broken, 'release']);
  assert.equal(result.status, 1);
  assert.match(result.stderr.toString(), /Missing I0_ASSET_PASS/);
  fs.rmSync(temporary, { recursive: true, force: true });
});
test('I0 checker accepts Release but rejects the real Debug old-Runtime rejection', () => {
  for (const mode of ['release', 'debug']) {
    const result = spawnSync(process.execPath, [path.resolve(__dirname, '../tools/check-i0-log.cjs'),
      path.join(root, mode + '-reload3.log'), mode, '--reload']);
    assert.equal(result.status, mode === 'release' ? 0 : 1, result.stderr.toString());
    if (mode === 'debug') assert.match(result.stderr.toString(), /old Runtime callback/);
  }
});
