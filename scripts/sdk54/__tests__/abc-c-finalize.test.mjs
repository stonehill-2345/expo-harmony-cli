import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildRequests, evaluateFinalEvidence } from '../abc/c-finalize.mjs';

const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-c-finalize-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeJson(path.join(root, 'input-audit/c-input-audit.json'), { schemaVersion: 1, valid: true });
  writeJson(path.join(root, 'public-source/public-closure.json'), {
    schemaVersion: 1,
    mode: 'source',
    relationClosed: false,
    stageClosable: false,
    blockers: ['Reviewed scope explicitly remains incomplete'],
  });
  writeJson(path.join(root, 'public-source/blockers.json'), ['Reviewed scope explicitly remains incomplete']);
  writeJson(path.join(root, 'handoff/handoff-verification.json'), {
    schemaVersion: 1,
    valid: false,
    independentlyExecutedByC: false,
    errors: ['Missing raw run manifests'],
  });
  writeJson(path.join(root, 'commands.json'), [{
    argv: ['corepack', 'pnpm', 'check'],
    cwd: '/repo',
    exitCode: 1,
    signal: null,
    timedOut: false,
  }]);
  return root;
}

test('公开面未闭合且必达命令失败时，C-32/C-34 不得写成 PASS', (t) => {
  const root = fixture(t);
  const evaluation = evaluateFinalEvidence(root, 'public-source');
  assert.equal(evaluation.tasks.find(({ id }) => id === 'C-32').status, 'FAIL');
  assert.notEqual(evaluation.tasks.find(({ id }) => id === 'C-34').status, 'PASS');
  assert.equal(evaluation.recommendClose, false);
  assert.ok(evaluation.errors.some((error) => /pnpm check/i.test(error)));
});

test('缺少命令记录不能以证据目录存在为由通过 C-34', (t) => {
  const root = fixture(t);
  fs.rmSync(path.join(root, 'commands.json'));
  const evaluation = evaluateFinalEvidence(root, 'public-source');
  assert.equal(evaluation.tasks.find(({ id }) => id === 'C-34').status, 'BLOCKED');
  assert.ok(evaluation.errors.some((error) => /commands\.json/i.test(error)));
});

test('A 契约已读取时不再报告契约缺失，只保留真实的设备与 B 候选 blocker', () => {
  const requests = buildRequests({
    aContract: { valid: true, acceptanceReady: false, blockers: ['A device case S01 is NOT_RUN'] },
    candidateSha256: null,
  }, []);
  assert.equal(requests.some(({ id }) => id === 'C-REQ-A-CONTRACT'), false);
  assert.ok(requests.some(({ id }) => id === 'C-REQ-A-DEVICE'));
  assert.ok(requests.some(({ id }) => id === 'C-REQ-B-CANDIDATE'));
  assert.equal(requests.some(({ id }) => id === 'C-REQ-INSTALL'), false);
});

test('相同 argv 的成功重放会关闭旧失败，但 commands.json 仍保留原始记录', (t) => {
  const root=fixture(t);
  const commands=JSON.parse(fs.readFileSync(path.join(root,'commands.json')));
  commands.push({...commands[0],exitCode:0});
  commands.push({argv:['node','--test','scripts/sdk54/__tests__/abc-c-finalize.test.mjs'],exitCode:0,signal:null,timedOut:false});
  writeJson(path.join(root,'commands.json'),commands);
  const evaluation=evaluateFinalEvidence(root,'public-source');
  assert.equal(evaluation.errors.some(error=>/Command failed: corepack pnpm check/.test(error)),false);
  assert.equal(commands.length,3);
});
