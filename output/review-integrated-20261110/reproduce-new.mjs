import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { verifyRunReport } from '../../scripts/sdk54/ai-e2e/report.mjs';
import { runCommand } from '../../scripts/sdk54/ai-e2e/process.mjs';
import { loadM1Source } from '../../scripts/sdk54/m1-test-support.mjs';
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const REGISTRY_FILE = path.resolve('scripts/sdk54/ai-e2e/cases/registry.json');
const findings = [];
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function createRun(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-ai-e2e-report-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const candidate = Buffer.from('{"packages":[]}\n');
  const commandLog = Buffer.from('command completed\n');
  const screenshot = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
  fs.mkdirSync(path.join(root, 'evidence'), { recursive: true });
  fs.writeFileSync(path.join(root, 'candidate.json'), candidate);
  fs.writeFileSync(path.join(root, 'evidence/command.log'), commandLog);
  fs.writeFileSync(path.join(root, 'evidence/screen.png'), screenshot);

  const caseSet = {
    schemaVersion: 1,
    registryVersion: '2026-10-30',
    registrySha256: sha256(fs.readFileSync(REGISTRY_FILE)),
    cases: [
      {
        id: 'V01-CREATE-BLANK-NPM',
        required: true,
        requiresDevice: false,
        requiredEvidence: ['command-log'],
      },
      {
        id: 'V01-DEVICE-PREFLIGHT',
        required: true,
        requiresDevice: true,
        requiredEvidence: ['device-assertion', 'screenshot'],
      },
    ],
  };
  writeJson(path.join(root, 'case-set.json'), caseSet);
  const caseSetBytes = fs.readFileSync(path.join(root, 'case-set.json'));

  const candidateSha256 = sha256(candidate);
  const caseSetSha256 = sha256(caseSetBytes);
  writeJson(path.join(root, 'run-manifest.json'), {
    schemaVersion: 1,
    runId: '20261030-b02-test',
    stage: 'V-01',
    source: { revision: '19a0375cff7e0ef3bc62d54fd5ed57b913bb2000', dirty: false },
    caseSet: { path: 'case-set.json', sha256: caseSetSha256 },
    candidate: { path: 'candidate.json', sha256: candidateSha256 },
    repositoryRoot: root,
    consumerRoot: path.join(root, 'consumer'),
    tools: { node: process.execPath, npm: '/usr/bin/npm', pnpm: '/usr/bin/pnpm' },
    device: { target: '127.0.0.1:5555', platformVersion: '6.0.0' },
  });

  const common = {
    runId: '20261030-b02-test',
    caseSetSha256,
    candidateSha256,
    startedAt: '2026-10-30T01:00:00.000Z',
    endedAt: '2026-10-30T01:00:01.000Z',
    status: 'PASS',
    timedOut: false,
    interrupted: false,
  };
  const results = {
    schemaVersion: 1,
    runId: common.runId,
    results: [
      {
        ...common,
        caseId: 'V01-CREATE-BLANK-NPM',
        attemptId: 'attempt-1',
        evidence: [
          { type: 'command-log', path: 'evidence/command.log', sha256: sha256(commandLog) },
        ],
      },
      {
        ...common,
        caseId: 'V01-DEVICE-PREFLIGHT',
        attemptId: 'attempt-1',
        evidence: [
          { type: 'device-assertion', path: 'evidence/command.log', sha256: sha256(commandLog) },
          { type: 'screenshot', path: 'evidence/screen.png', sha256: sha256(screenshot) },
        ],
      },
    ],
  };
  writeJson(path.join(root, 'results.json'), results);
  return { root, results };
}


const cleanup = [];
try {
  const { root, results } = createRun({ after(fn) { cleanup.push(fn); } });
  const report = verifyRunReport(root);
  assert.equal(report.canClose, true);
  findings.push({ id: 'invalid-evidence-accepted', screenshotBytes: 9,
    candidate: { packages: [] }, deviceAssertion: 'command completed', report });
  results.results[0].command = { exitCode: 17, timedOut: false, interrupted: false };
  writeJson(path.join(root, 'results.json'), results);
  const inconsistent = verifyRunReport(root);
  assert.equal(inconsistent.canClose, true);
  findings.push({ id: 'failed-command-accepted', exitCode: 17, report: inconsistent });

  const project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-sparse-review-')));
  cleanup.push(() => fs.rmSync(project, { recursive: true, force: true }));
  const put = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); };
  const current = path.join(project, 'harmony/entry/config.json');
  const outside = path.join(project, 'outside/config.json');
  put(current, 'before'); put(outside, 'before');
  put(path.join(project, 'harmony/.expo-harmony-state.json'), '{}');
  const fp = file => ({ kind: 'file', sha256: sha256(fs.readFileSync(file)), mode: fs.statSync(file).mode & 0o7777 });
  const { runHarmonyGenerationTransactionAsync: run } = loadM1Source('packages/expo-modules-autolinking/src/platforms/harmony/generationTransaction.ts');
  await run({ projectRoot: project, generate: async (stage, hash) => {
    const target = path.join(stage, 'entry/config.json'); put(target, 'after');
    hash.applyManagedPatch({ writes: ['entry/config.json'], deletes: [], entries: {
      'entry/config.json': { before: fp(current), after: fp(target) }
    } });
  }, fault: async point => {
    if (point !== 'after-backup') return;
    fs.renameSync(path.join(project, 'harmony/entry'), path.join(project, 'harmony/entry-saved'));
    fs.symlinkSync(path.join(project, 'outside'), path.join(project, 'harmony/entry'));
  } });
  assert.equal(fs.readFileSync(outside, 'utf8'), 'after');
  findings.push({ id: 'sparse-parent-symlink-escape', transaction: 'succeeded', externalFile: fs.readFileSync(outside, 'utf8'),
    originalFile: fs.readFileSync(path.join(project, 'harmony/entry-saved/config.json'), 'utf8'),
    trigger: 'managed parent replaced with symlink after backup; identical before bytes/mode' });

  const processRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-timeout-review-')));
  cleanup.push(() => fs.rmSync(processRoot, { recursive: true, force: true }));
  const pidFile = path.join(processRoot, 'child.pid');
  let settled = false;
  const started = Date.now();
  const pending = runCommand({ id: 'ignore-term', argv: [process.execPath, '-e',
    'process.on("SIGTERM", () => {}); require("node:fs").writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 100);', pidFile],
    cwd: processRoot, outputDirectory: processRoot, timeoutMs: 500 }).then(r => { settled = true; return r; });
  await new Promise(resolve => setTimeout(resolve, 1600));
  const stillPending = !settled;
  if (fs.existsSync(pidFile)) process.kill(-Number(fs.readFileSync(pidFile, 'utf8')), 'SIGKILL');
  const result = await pending;
  assert.equal(stillPending, true);
  assert.equal(result.timedOut, true);
  findings.push({ id: 'timeout-does-not-bound-process', timeoutMs: 500, stillPendingAfterMs: 1600,
    elapsedMs: Date.now() - started, cleanup: 'review harness SIGKILL to owned process group', result });
} finally { for (const fn of cleanup.reverse()) fn(); }
fs.writeFileSync(path.join(import.meta.dirname, 'new-findings.json'), JSON.stringify(findings, (key, value) => typeof value === 'string' ? value.replaceAll(process.env.HOME, '<home>') : value, 2) + '\n');
console.log(JSON.stringify(findings, null, 2));
