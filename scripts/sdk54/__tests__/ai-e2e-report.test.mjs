import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { candidateBytes, commandResult, deviceAssertion, png, jpeg } from './ai-e2e-fixtures.mjs';
import { verifyRunReport } from '../ai-e2e/report.mjs';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const REPORT_SCRIPT = fileURLToPath(new URL('../ai-e2e/report.mjs', import.meta.url));
const REGISTRY_FILE = fileURLToPath(new URL('../ai-e2e/cases/registry.json', import.meta.url));

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function createRun(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-ai-e2e-report-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const candidate = candidateBytes(root);
  const commandLog = Buffer.from('command completed\n');
  const screenshot = png;
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
  for (const result of results.results) {
    result.command = commandResult(root, result.caseId);
    result.evidence = result.evidence.filter(item => !['command-log', 'device-assertion'].includes(item.type));
    result.evidence.push(...[result.command.stdout, result.command.stderr].map(ref => ({ type: 'command-log', ...ref })));
  }
  const assertion = Buffer.from(JSON.stringify(deviceAssertion(root, '127.0.0.1:5555')));
  fs.writeFileSync(path.join(root, 'evidence/device.json'), assertion);
  results.results[1].evidence.push({ type: 'device-assertion', path: 'evidence/device.json', sha256: sha256(assertion) });
  writeJson(path.join(root, 'results.json'), results);
  return { root, results };
}

function rewriteResults(root, mutate) {
  const file = path.join(root, 'results.json');
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  mutate(value);
  writeJson(file, value);
}

function rewriteCaseSet(root, mutate) {
  const caseSetFile = path.join(root, 'case-set.json');
  const caseSet = JSON.parse(fs.readFileSync(caseSetFile, 'utf8'));
  mutate(caseSet);
  writeJson(caseSetFile, caseSet);
  const manifestFile = path.join(root, 'run-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  manifest.caseSet.sha256 = sha256(fs.readFileSync(caseSetFile));
  writeJson(manifestFile, manifest);
  return manifest.caseSet.sha256;
}

test('recomputes a complete persisted result set as closable', (t) => {
  const { root } = createRun(t);
  const report = verifyRunReport(root);

  assert.equal(report.canClose, true);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.missingCases, []);
});

test('replays the persisted report in an independent process', (t) => {
  const { root } = createRun(t);
  const valid = spawnSync(process.execPath, [REPORT_SCRIPT, '--run-dir', root], { encoding: 'utf8' });
  assert.equal(valid.status, 0, valid.stderr || valid.stdout);
  assert.equal(JSON.parse(valid.stdout).canClose, true);

  rewriteResults(root, ({ results }) => results.pop());
  const invalid = spawnSync(process.execPath, [REPORT_SCRIPT, '--run-dir', root], { encoding: 'utf8' });
  assert.equal(invalid.status, 1, invalid.stderr || invalid.stdout);
  assert.equal(JSON.parse(invalid.stdout).canClose, false);
});

test('rejects a caller-pruned required case even when the case-set hash is updated', (t) => {
  const { root } = createRun(t);
  const caseSetSha256 = rewriteCaseSet(root, ({ cases }) => cases.pop());
  rewriteResults(root, ({ results }) => {
    results.pop();
    results[0].caseSetSha256 = caseSetSha256;
  });

  const report = verifyRunReport(root);
  assert.equal(report.canClose, false);
  assert.match(report.errors.join('\n'), /Registry-required case is missing: V01-DEVICE-PREFLIGHT/);
});

test('returns schema errors instead of throwing on malformed persisted results', (t) => {
  const { root } = createRun(t);
  writeJson(path.join(root, 'results.json'), { schemaVersion: 1, runId: '20261030-b02-test', results: {} });

  const report = verifyRunReport(root);
  assert.equal(report.canClose, false);
  assert.ok(report.errors.includes('results must be an array'));
});

test('accepts a non-empty JPEG screenshot evidence file', (t) => {
  const { root } = createRun(t);
  const screenshot = jpeg;
  fs.writeFileSync(path.join(root, 'evidence/screen.png'), screenshot);
  rewriteResults(root, ({ results }) => {
    results[1].evidence.find(({ type }) => type === 'screenshot').sha256 = sha256(screenshot);
  });

  const report = verifyRunReport(root);
  assert.equal(report.canClose, true, report.errors.join('\n'));
});

test('rejects incomplete, duplicated, stale or unverifiable PASS results', async (t) => {
  const cases = [
    ['missing required case', ({ results }) => results.pop(), /Missing required case: V01-DEVICE-PREFLIGHT/],
    ['duplicate attempt', ({ results }) => results.push(structuredClone(results[0])), /Duplicate result: V01-CREATE-BLANK-NPM\/attempt-1/],
    ['wrong candidate hash', ({ results }) => { results[0].candidateSha256 = '0'.repeat(64); }, /candidate hash/i],
    ['wrong evidence hash', ({ results }) => { results[0].evidence[0].sha256 = '0'.repeat(64); }, /Evidence .* hash mismatch/],
    ['empty screenshot', (_value, root) => fs.writeFileSync(path.join(root, 'evidence/screen.png'), ''), /Screenshot is empty/],
    ['missing device', (_value, root) => {
      const file = path.join(root, 'run-manifest.json');
      const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
      delete manifest.device;
      writeJson(file, manifest);
    }, /requires a device/],
    ['timed out PASS', ({ results }) => { results[0].timedOut = true; }, /cannot be PASS after timeout/],
    ['interrupted PASS', ({ results }) => { results[0].interrupted = true; }, /cannot be PASS after interruption/],
  ];

  for (const [name, mutate, expected] of cases) {
    await t.test(name, (t) => {
      const { root } = createRun(t);
      rewriteResults(root, (value) => mutate(value, root));
      const report = verifyRunReport(root);

      assert.equal(report.canClose, false);
      assert.match(report.errors.join('\n'), expected);
    });
  }
});

test('rejects contradictory or missing persisted command results', async t => {
  for (const mutate of [r => { r.command.exitCode = 17; }, r => { delete r.command; },
    r => { r.command.timedOut = true; }, r => { r.command.interrupted = true; },
    r => { r.command.signal = 'SIGTERM'; }, r => { r.command.stdout.sha256 = '0'.repeat(64); },
    r => { r.evidence = {}; }]) {
    await t.test(String(mutate), t => {
      const { root } = createRun(t);
      rewriteResults(root, ({ results }) => mutate(results[0]));
      const report = verifyRunReport(root);
      assert.equal(report.canClose, false);
      assert.match(report.errors.join('\n'), /command|Command/);
    });
  }
});

test('rejects truncated or corrupt images even with matching evidence hashes', async t => {
  for (const bytes of [png.subarray(0, 9), jpeg.subarray(0, 12), Buffer.from([255,216,255,217]),
    Buffer.from(png.map((value, i) => i === 45 ? value ^ 1 : value))]) {
    await t.test(bytes.toString('hex').slice(0, 24), t => {
      const { root } = createRun(t);
      fs.writeFileSync(path.join(root, 'evidence/screen.png'), bytes);
      rewriteResults(root, ({ results }) => { results[1].evidence.find(e => e.type === 'screenshot').sha256 = sha256(bytes); });
      const report = verifyRunReport(root);
      assert.equal(report.canClose, false);
      assert.match(report.errors.join('\n'), /Screenshot/);
    });
  }
});

test('rejects empty candidates, failed packaging, missing archives and changed archive bytes', async t => {
  for (const mode of ['empty', 'failed', 'missing', 'changed']) {
    await t.test(mode, t => {
      const { root } = createRun(t);
      const candidateFile = path.join(root, 'candidate.json');
      const candidate = JSON.parse(fs.readFileSync(candidateFile));
      if (mode === 'empty') candidate.packages = [];
      if (mode === 'failed') candidate.failures.push('packing failed');
      if (mode === 'missing') fs.unlinkSync(path.join(root, 'fixture.tgz'));
      if (mode === 'changed') fs.writeFileSync(path.join(root, 'fixture.tgz'), 'drift');
      writeJson(candidateFile, candidate);
      const manifest = JSON.parse(fs.readFileSync(path.join(root, 'run-manifest.json')));
      manifest.candidate.sha256 = sha256(fs.readFileSync(candidateFile));
      writeJson(path.join(root, 'run-manifest.json'), manifest);
      rewriteResults(root, ({ results }) => results.forEach(r => { r.candidateSha256 = manifest.candidate.sha256; }));
      const report = verifyRunReport(root);
      assert.equal(report.canClose, false);
      assert.match(report.errors.join('\n'), /Candidate/);
    });
  }
});

test('rejects arbitrary, mismatched or failed device assertions', async t => {
  for (const mode of ['text', 'target', 'pid', 'failed-command', 'empty-log']) {
    await t.test(mode, t => {
      const { root } = createRun(t);
      const assertion = deviceAssertion(root, '127.0.0.1:5555');
      if (mode === 'target') assertion.target = 'wrong-device';
      if (mode === 'pid') assertion.pid = '99';
      if (mode === 'failed-command') assertion.pidCommand.exitCode = 1;
      if (mode === 'empty-log') assertion.logCommand = commandResult(root, 'hilog', '', assertion.logCommand.argv);
      const bytes = Buffer.from(mode === 'text' ? 'command completed' : JSON.stringify(assertion));
      fs.writeFileSync(path.join(root, 'evidence/device.json'), bytes);
      rewriteResults(root, ({ results }) => { results[1].evidence.find(e => e.type === 'device-assertion').sha256 = sha256(bytes); });
      const report = verifyRunReport(root);
      assert.equal(report.canClose, false);
      assert.match(report.errors.join('\n'), /Device|device/);
    });
  }
});
