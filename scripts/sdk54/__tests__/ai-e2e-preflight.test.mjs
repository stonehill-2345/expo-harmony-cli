import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { candidateBytes } from './ai-e2e-fixtures.mjs';
import { preflightRun } from '../ai-e2e/preflight.mjs';

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function fixture(t) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-ai-e2e-preflight-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const repositoryRoot = path.join(base, 'repository');
  const runDirectory = path.join(repositoryRoot, 'outputs/sdk54/ai-e2e/run');
  const consumerRoot = path.join(base, 'consumer');
  fs.mkdirSync(runDirectory, { recursive: true });
  const candidate = candidateBytes(runDirectory);
  const caseSet = Buffer.from('{"schemaVersion":1,"registryVersion":"2026-10-30","registrySha256":"' + 'a'.repeat(64) + '","cases":[{"id":"V01-DEVICE-PREFLIGHT","required":true,"requiresDevice":true,"requiredEvidence":["device-assertion","screenshot"]}]}\n');
  fs.writeFileSync(path.join(runDirectory, 'candidate.json'), candidate);
  fs.writeFileSync(path.join(runDirectory, 'case-set.json'), caseSet);
  const manifest = {
    schemaVersion: 1,
    runId: 'preflight-test',
    stage: 'V-01',
    source: { revision: '1'.repeat(40), dirty: false },
    repositoryRoot,
    consumerRoot,
    caseSet: { path: 'case-set.json', sha256: sha256(caseSet) },
    candidate: { path: 'candidate.json', sha256: sha256(candidate) },
    tools: { node: process.execPath, npm: process.execPath, pnpm: process.execPath },
    device: { target: 'device-1', platformVersion: '6.0.0' },
  };
  const manifestFile = path.join(runDirectory, 'run-manifest.json');
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, manifestFile, repositoryRoot, consumerRoot, runDirectory };
}

test('accepts fixed files, executable tools, external consumer root and explicit device', (t) => {
  const { manifestFile } = fixture(t);
  assert.deepEqual(preflightRun(manifestFile, 'V-01'), { ready: true, errors: [] });
});

test('blocks dirty source, stale candidate, missing tool, in-repository consumer and missing device', (t) => {
  const { manifest, manifestFile, repositoryRoot, runDirectory } = fixture(t);
  manifest.source.dirty = true;
  manifest.candidate.sha256 = '0'.repeat(64);
  manifest.tools.npm = path.join(runDirectory, 'missing-npm');
  manifest.consumerRoot = path.join(repositoryRoot, 'consumer');
  delete manifest.device;
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

  const result = preflightRun(manifestFile, 'V-01');
  assert.equal(result.ready, false);
  assert.match(result.errors.join('\n'), /source must be clean/);
  assert.match(result.errors.join('\n'), /candidate hash mismatch/);
  assert.match(result.errors.join('\n'), /tools\.npm is not an executable file/);
  assert.match(result.errors.join('\n'), /consumerRoot must be outside repositoryRoot/);
  assert.match(result.errors.join('\n'), /stage V-01 requires an explicit device/);
});

test('rejects hash-valid empty candidates before execution', t => {
  const { manifest, manifestFile, runDirectory } = fixture(t);
  const bytes = Buffer.from(JSON.stringify({ packages: [], failures: [] }));
  fs.writeFileSync(path.join(runDirectory, 'candidate.json'), bytes);
  manifest.candidate.sha256 = sha256(bytes);
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  const result = preflightRun(manifestFile, 'V-01');
  assert.equal(result.ready, false);
  assert.match(result.errors.join('\n'), /Candidate manifest invalid/);
});
