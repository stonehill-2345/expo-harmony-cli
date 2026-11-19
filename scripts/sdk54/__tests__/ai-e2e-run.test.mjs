import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { candidateBytes, deviceAssertion, png } from './ai-e2e-fixtures.mjs';
import { runValidation } from '../ai-e2e/run.mjs';

const REGISTRY_FILE = fileURLToPath(new URL('../ai-e2e/cases/registry.json', import.meta.url));
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function fixture(t) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-ai-e2e-run-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const repositoryRoot = path.join(base, 'repository');
  const runDirectory = path.join(repositoryRoot, 'outputs/sdk54/ai-e2e/run');
  const consumerRoot = path.join(base, 'consumer');
  fs.mkdirSync(runDirectory, { recursive: true });
  fs.mkdirSync(consumerRoot);

  const candidate = candidateBytes(runDirectory);
  fs.writeFileSync(path.join(runDirectory, 'candidate.json'), candidate);
  const caseSet = {
    schemaVersion: 1,
    registryVersion: '2026-11-11',
    registrySha256: sha256(fs.readFileSync(REGISTRY_FILE)),
    cases: [
      { id: 'V01-CREATE-BLANK-NPM', required: true, requiresDevice: false, requiredEvidence: ['command-log'] },
      { id: 'V01-DEVICE-PREFLIGHT', required: true, requiresDevice: true, requiredEvidence: ['device-assertion', 'screenshot'] },
    ],
  };
  writeJson(path.join(runDirectory, 'case-set.json'), caseSet);
  const caseSetSha256 = sha256(fs.readFileSync(path.join(runDirectory, 'case-set.json')));
  const assertion = deviceAssertion(runDirectory);
  const manifest = {
    schemaVersion: 1,
    runId: 'run-test',
    stage: 'V-01',
    source: { revision: '1'.repeat(40), dirty: false },
    repositoryRoot,
    consumerRoot,
    caseSet: { path: 'case-set.json', sha256: caseSetSha256 },
    candidate: { path: 'candidate.json', sha256: sha256(candidate) },
    tools: { node: process.execPath, npm: process.execPath, pnpm: process.execPath },
    device: { target: 'device-1', platformVersion: '6.0.0' },
    caseCommands: {
      'V01-CREATE-BLANK-NPM': {
        argv: [process.execPath, '-e', 'process.stdout.write("created\\n")'],
        cwd: consumerRoot,
        timeoutMs: 5_000,
      },
      'V01-DEVICE-PREFLIGHT': {
        argv: [process.execPath, '-e', [
          'const fs=require("fs")',
          'fs.mkdirSync("evidence",{recursive:true})',
          `fs.writeFileSync("evidence/device.txt",${JSON.stringify(JSON.stringify(assertion))})`,
          `fs.writeFileSync("evidence/screen.png",Buffer.from("${png.toString('base64')}","base64"))`,
        ].join(';')],
        cwd: runDirectory,
        timeoutMs: 5_000,
        evidence: [
          { type: 'device-assertion', path: 'evidence/device.txt' },
          { type: 'screenshot', path: 'evidence/screen.png' },
        ],
      },
    },
  };
  const manifestFile = path.join(runDirectory, 'run-manifest.json');
  writeJson(manifestFile, manifest);
  return { manifest, manifestFile, runDirectory };
}

test('runs registered cases sequentially and independently recomputes closure', async (t) => {
  const { manifestFile, runDirectory } = fixture(t);
  const report = await runValidation(manifestFile, 'V-01');

  assert.equal(report.canClose, true);
  const results = JSON.parse(fs.readFileSync(path.join(runDirectory, 'results.json'), 'utf8'));
  assert.deepEqual(results.results.map(({ caseId, status }) => [caseId, status]), [
    ['V01-CREATE-BLANK-NPM', 'PASS'],
    ['V01-DEVICE-PREFLIGHT', 'PASS'],
  ]);
  assert.ok(fs.existsSync(path.join(runDirectory, 'closure-report.json')));
});

test('missing device writes BLOCKED results and never executes case commands', async (t) => {
  const { manifest, manifestFile, runDirectory } = fixture(t);
  const sentinel = path.join(runDirectory, 'must-not-run');
  delete manifest.device;
  manifest.caseCommands['V01-CREATE-BLANK-NPM'].argv = [process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(sentinel)},'bad')`];
  writeJson(manifestFile, manifest);

  const report = await runValidation(manifestFile, 'V-01');
  assert.equal(report.canClose, false);
  assert.equal(fs.existsSync(sentinel), false);
  const results = JSON.parse(fs.readFileSync(path.join(runDirectory, 'results.json'), 'utf8'));
  assert.ok(results.results.every(({ status }) => status === 'BLOCKED'));
  assert.match(results.results[0].reason.join('\n'), /requires an explicit device/);
});

test('rejects an escaping case-set path before reading the external file', async (t) => {
  const { manifest, manifestFile, runDirectory } = fixture(t);
  const external = path.resolve(runDirectory, '../../outside.json');
  fs.writeFileSync(external, '{not-json');
  manifest.caseSet = { path: '../../outside.json', sha256: sha256(fs.readFileSync(external)) };
  writeJson(manifestFile, manifest);

  const report = await runValidation(manifestFile, 'V-01');
  assert.equal(report.canClose, false);
  assert.match(report.errors.join('\n'), /caseSet\.path must be a safe relative path|Case set path escapes/);
});
