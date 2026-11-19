import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('M2 executor rejects the repository root as its consumer directory before candidate access', () => {
  const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-m2-boundary-'));
  try {
    const command = spawnSync(process.execPath, ['scripts/sdk54/test-m2-generation.mjs', '--work-dir', process.cwd(), '--runtime-dir', path.join(evidence, 'missing-runtime'), '--evidence-dir', evidence, '--release-sha256', 'not-a-candidate'], { encoding: 'utf8' });
    assert.notEqual(command.status, 0);
    assert.match(command.stdout + command.stderr, /consumers must be outside repository/);
    assert.equal(fs.existsSync(path.join(evidence, 'generation-consumer-report.json')), false);
  } finally { fs.rmSync(evidence, { recursive: true, force: true }); }
});

test('M2 executor disallows reused installations before candidate access', () => {
  const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-m2-reuse-'));
  try {
    const command = spawnSync(process.execPath, ['scripts/sdk54/test-m2-generation.mjs', '--work-dir', path.join(evidence, 'consumer'), '--runtime-dir', path.join(evidence, 'missing-runtime'), '--evidence-dir', evidence, '--release-sha256', 'not-a-candidate', '--reuse-installed'], { encoding: 'utf8' });
    assert.notEqual(command.status, 0);
    assert.match(command.stdout + command.stderr, /--reuse-installed is disabled/);
    assert.equal(fs.existsSync(path.join(evidence, 'generation-consumer-report.json')), false);
  } finally { fs.rmSync(evidence, { recursive: true, force: true }); }
});
