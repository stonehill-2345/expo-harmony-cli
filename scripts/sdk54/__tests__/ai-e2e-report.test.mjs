import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

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
  const screenshot = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
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
