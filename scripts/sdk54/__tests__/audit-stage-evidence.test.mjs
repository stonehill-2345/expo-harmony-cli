import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { auditStageEvidence } from '../audit-stage-evidence.mjs';

test('missing or changed artifacts invalidate current evidence without rewriting historical acceptance', t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-evidence-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'docs/releases'), { recursive: true });
  const evidence = [{ path: 'artifact.log', sha256: createHash('sha256').update('accepted').digest('hex') }];
  const acceptance = JSON.stringify({ units: [{ id: 'M3-01', status: 'PASS', evidence }], closures: [{ stage: 'M3', status: 'PASS', evidence }] });
  const manifest = path.join(root, 'docs/releases/sdk54-stage-acceptance.json');
  fs.writeFileSync(manifest, acceptance);
  const missing = auditStageEvidence(root);
  assert.equal(missing.passed, false);
  assert.deepEqual(missing.missing, ['artifact.log']);
  assert.equal(missing.stages[0].evidenceStatus, 'UNVERIFIED');
  fs.writeFileSync(path.join(root, 'artifact.log'), 'accepted');
  assert.equal(auditStageEvidence(root).passed, true);
  fs.writeFileSync(path.join(root, 'artifact.log'), 'changed');
  assert.equal(auditStageEvidence(root).mismatched.length, 1);
  assert.equal(auditStageEvidence(root).passed, false);
  assert.equal(fs.readFileSync(manifest, 'utf8'), acceptance);
});
