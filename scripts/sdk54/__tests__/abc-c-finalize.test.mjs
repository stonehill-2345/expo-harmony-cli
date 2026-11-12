import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import * as finalize from '../abc/c-finalize.mjs';

const { buildRequests, evaluateFinalEvidence } = finalize;

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

test('C-34 前置证据不得引用 finalize 尚未生成的协调结论', (t) => {
  const root = fixture(t);
  const evaluation = evaluateFinalEvidence(root, 'public-source');
  const c34 = evaluation.tasks.find(({ id }) => id === 'C-34');
  assert.equal(c34.evidence.includes('c-acceptance.json'), false);
  assert.deepEqual(c34.evidence, ['commands.json']);
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

test('仅伪造 coverage valid 和一致 hash 不能传播结构不完整的 candidate', (t) => {
  const root = fixture(t), candidate = path.join(root, 'frozen/candidate.json');
  writeJson(candidate, { schemaVersion: 1, packages: [], failures: [] });
  const candidateSha256 = crypto.createHash('sha256').update(fs.readFileSync(candidate)).digest('hex');
  writeJson(path.join(root, 'public-candidate/candidate-coverage.json'), {
    schemaVersion: 1,
    valid: true,
    candidate: { path: candidate, sha256: candidateSha256 },
    candidateSha256,
  });
  writeJson(path.join(root, 'handoff/handoff-verification.json'), { schemaVersion: 1, candidateSha256 });
  assert.equal(typeof finalize.resolveCandidateIdentity, 'function');
  const result = finalize.resolveCandidateIdentity(root, 'public-candidate');
  assert.equal(result.candidate, null);
  assert.match(result.errors.join('\n'), /package set|manifest invalid|candidate-mode/i);
});

test('候选文件变更或 handoff hash 不一致时拒绝传播 candidate 身份', (t) => {
  const root = fixture(t), candidate = path.join(root, 'frozen/candidate.json');
  writeJson(candidate, { schemaVersion: 1, packages: [], failures: [] });
  const candidateSha256 = crypto.createHash('sha256').update(fs.readFileSync(candidate)).digest('hex');
  writeJson(path.join(root, 'public-candidate/candidate-coverage.json'), {
    schemaVersion: 1,
    valid: true,
    candidate: { path: candidate, sha256: candidateSha256 },
    candidateSha256,
  });
  writeJson(path.join(root, 'handoff/handoff-verification.json'), { schemaVersion: 1, candidateSha256: 'a'.repeat(64) });
  fs.appendFileSync(candidate, '\n');
  assert.equal(typeof finalize.resolveCandidateIdentity, 'function');
  const result = finalize.resolveCandidateIdentity(root, 'public-candidate');
  assert.equal(result.candidate, null);
  assert.match(result.errors.join('\n'), /candidate.*hash|handoff.*identity/i);
});

test('协调任务证据仅接受目录内真实文件并生成完整性收据', (t) => {
  const root = fixture(t), evidence = path.join(root, 'public-candidate/public-closure.json');
  writeJson(evidence, { schemaVersion: 1 });
  const tasks = [{ id: 'C-32', evidence: ['public-candidate/public-closure.json'], blockers: [], status: 'PASS' }];
  assert.equal(typeof finalize.verifyEvidenceReferences, 'function');
  const result = finalize.verifyEvidenceReferences(root, tasks);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.receipts, [{
    taskId: 'C-32',
    path: 'public-candidate/public-closure.json',
    bytes: fs.statSync(evidence).size,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(evidence)).digest('hex'),
  }]);
});

test('协调任务证据拒绝缺失文件、目录和越界路径', (t) => {
  const root = fixture(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-c-evidence-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  writeJson(path.join(outside, 'evidence.json'), { schemaVersion: 1 });
  fs.symlinkSync(outside, path.join(root, 'linked-outside'));
  const tasks = [{
    id: 'C-32',
    evidence: ['missing.json', 'public-source', '../outside.json', 'linked-outside/evidence.json'],
    blockers: [],
    status: 'PASS',
  }];
  assert.equal(typeof finalize.verifyEvidenceReferences, 'function');
  const result = finalize.verifyEvidenceReferences(root, tasks);
  assert.equal(result.valid, false);
  assert.equal(result.receipts.length, 0);
  assert.match(result.errors.join('\n'), /missing|regular file|escapes/i);
});

test('finalize 拒绝伪造的空候选身份但仍写入证据收据', (t) => {
  const root = fixture(t), publicOutput = 'public-candidate';
  const candidate = path.join(root, 'frozen/candidate.json');
  writeJson(candidate, { schemaVersion: 1, packages: [], failures: [] });
  const candidateSha256 = crypto.createHash('sha256').update(fs.readFileSync(candidate)).digest('hex');
  for (const name of [
    'scope-review.json', 'finite-declarations.json', 'derived-source-provenance.json',
    'export-source-bindings.json', 'plugin-contracts.json',
  ]) writeJson(path.join(root, publicOutput, name), { schemaVersion: 1 });
  writeJson(path.join(root, publicOutput, 'public-closure.json'), {
    schemaVersion: 1,
    mode: 'candidate',
    relationClosed: true,
    stageClosable: true,
    blockers: [],
  });
  writeJson(path.join(root, publicOutput, 'blockers.json'), []);
  writeJson(path.join(root, publicOutput, 'candidate-coverage.json'), {
    schemaVersion: 1,
    valid: true,
    candidate: { path: candidate, sha256: candidateSha256 },
    candidateSha256,
  });
  writeJson(path.join(root, 'handoff/handoff-verification.json'), {
    schemaVersion: 1,
    valid: true,
    independentlyExecutedByC: true,
    candidateSha256,
    errors: [],
  });
  writeJson(path.join(root, 'commands.json'), [
    { argv: ['corepack', 'pnpm', 'check'], exitCode: 0, signal: null, timedOut: false },
    { argv: ['node', '--test', 'scripts/sdk54/__tests__/abc-c-finalize.test.mjs'], exitCode: 0, signal: null, timedOut: false },
  ]);
  finalize.main(['--output', root, '--public-output', publicOutput]);
  const result = JSON.parse(fs.readFileSync(path.join(root, 'result.json')));
  assert.equal(result.candidate, null);
  assert.ok(result.evidenceReceipts.some(receipt => receipt.path === `${publicOutput}/public-closure.json`));
  assert.ok(result.evidenceReceipts.some(receipt => receipt.path === `${publicOutput}/candidate-coverage.json`));
  assert.equal(result.tasks.find(({ id }) => id === 'C-32').status, 'FAIL');
  assert.notEqual(result.tasks.find(({ id }) => id === 'C-34').status, 'PASS');
});

test('C-32 必须将有效 candidate coverage 作为门禁和证据', (t) => {
  const root = fixture(t), publicOutput = 'public-candidate';
  for (const name of [
    'scope-review.json', 'finite-declarations.json', 'derived-source-provenance.json',
    'export-source-bindings.json', 'plugin-contracts.json',
  ]) writeJson(path.join(root, publicOutput, name), { schemaVersion: 1 });
  writeJson(path.join(root, publicOutput, 'public-closure.json'), {
    schemaVersion: 1,
    mode: 'candidate',
    relationClosed: true,
    stageClosable: true,
    blockers: [],
  });
  writeJson(path.join(root, publicOutput, 'blockers.json'), []);
  writeJson(path.join(root, publicOutput, 'candidate-coverage.json'), {
    schemaVersion: 1,
    valid: false,
    errors: ['candidate public surface mismatch'],
  });
  const evaluation = evaluateFinalEvidence(root, publicOutput);
  const c32 = evaluation.tasks.find(({ id }) => id === 'C-32');
  assert.equal(c32.status, 'FAIL');
  assert.ok(c32.evidence.includes(`${publicOutput}/candidate-coverage.json`));
  assert.match(c32.blockers.join('\n'), /candidate public surface mismatch/i);
  assert.match(finalize.resolveCandidateIdentity(root, publicOutput).errors.join('\n'), /coverage/i);
});

test('candidate-mode 命令必须有固定 argv/cwd 和可核验日志收据', (t) => {
  const root = fixture(t), stdout = Buffer.from('candidate verification\n'), stderr = Buffer.alloc(0);
  fs.writeFileSync(path.join(root, 'candidate.stdout'), stdout);
  fs.writeFileSync(path.join(root, 'candidate.stderr'), stderr);
  const command = {
    argv: [
      'node', 'scripts/sdk54/abc/c-public-closure.mjs',
      '--source-root', root,
      '--reconstruction', path.join(root, 'source'),
      '--scope', path.join(root, 'scope.json'),
      '--candidate', path.join(root, 'candidate.json'),
      '--mode', 'candidate',
      '--output', path.join(root, 'public-candidate'),
    ],
    cwd: root,
    exitCode: 0,
    signal: null,
    timedOut: false,
    stdout: { path: 'candidate.stdout', sha256: crypto.createHash('sha256').update(stdout).digest('hex') },
    stderr: { path: 'candidate.stderr', sha256: crypto.createHash('sha256').update(stderr).digest('hex') },
  };
  assert.deepEqual(finalize.verifyCommandRecord(root, command), []);
  fs.appendFileSync(path.join(root, 'candidate.stdout'), 'tampered');
  assert.match(finalize.verifyCommandRecord(root, command).join('\n'), /stdout hash mismatch/i);
  assert.match(finalize.verifyCommandRecord(root, { ...command, stdout: { path: '../outside', sha256: 'a'.repeat(64) } }).join('\n'), /malformed/i);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-c-command-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  const escaped = path.join(outside, 'stdout');
  fs.writeFileSync(escaped, stdout);
  fs.symlinkSync(outside, path.join(root, 'log-link'));
  const escapedCommand = { ...command, stdout: {
    path: 'log-link/stdout',
    sha256: crypto.createHash('sha256').update(stdout).digest('hex'),
  } };
  assert.match(finalize.verifyCommandRecord(root, escapedCommand).join('\n'), /unsafe|escape/i);
});
