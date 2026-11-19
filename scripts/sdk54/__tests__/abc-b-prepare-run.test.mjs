import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { prepareRun } from '../abc/b-prepare-run.mjs';

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const registry = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../ai-e2e/cases/registry.json', import.meta.url))));

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-abc-b-run-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repositoryRoot = path.join(root, 'repository');
  const consumerRoot = path.join(root, 'consumers');
  const candidate = path.join(root, 'candidate');
  const output = path.join(repositoryRoot, 'outputs/run');
  fs.mkdirSync(repositoryRoot, { recursive: true });
  fs.mkdirSync(consumerRoot);
  fs.mkdirSync(candidate);
  const archive = Buffer.from('candidate');
  fs.writeFileSync(path.join(candidate, 'fixture.tgz'), archive);
  writeJson(path.join(candidate, 'candidate.json'), {
    packages: [{ name: 'fixture', version: '1.0.0', file: 'fixture.tgz', bytes: archive.length, sha256: sha256(archive) }],
    failures: [],
  });
  const definitions = registry.stages['V-01'];
  const cases = definitions.map((definition) => ({
    ...definition,
    command: { argv: [process.execPath, '-e', 'process.exit(0)'], cwd: '.', timeoutMs: 1000 },
  }));
  const aContract = path.join(root, 'a-contract.json');
  const caseReview = path.join(root, 'c-case-review.json');
  writeJson(aContract, { schemaVersion: 1, cases });
  writeJson(caseReview, {
    schemaVersion: 1, stages: { 'V-01': definitions.map(({ id, requiredEvidence }) => ({ id, requiredEvidence })) },
  });
  return { repositoryRoot, consumerRoot, candidate, output, aContract, caseReview, definitions };
}

test('prepares a complete parameterized run from verified A and C handoffs', async (t) => {
  const input = fixture(t);
  const { definitions } = input;
  const result = await prepareRun({
    ...input, stage: 'V-01', target: 'device-1', platformVersion: '6.0.0',
    sourceRevision: 'a'.repeat(40), sourceDirty: false,
  });
  assert.equal(result.caseSet.cases.length, definitions.length);
  assert.equal(result.manifest.device.target, 'device-1');
  assert.equal(result.manifest.source.dirty, false);
  assert.ok(path.isAbsolute(result.manifest.tools.node));
  assert.deepEqual(Object.keys(result.manifest.caseCommands).sort(), definitions.map(({ id }) => id).sort());
  assert.equal(JSON.parse(fs.readFileSync(path.join(input.output, 'candidate/candidate.json'))).packages.length, 1);
});

test('rejects missing review coverage, unsafe commands, dirty source and output reuse', async (t) => {
  const missing = fixture(t);
  writeJson(missing.caseReview, { schemaVersion: 1, stages: { 'V-01': [] } });
  await assert.rejects(() => prepareRun({
    ...missing, stage: 'V-01', target: 'device-1', platformVersion: '6.0.0',
    sourceRevision: 'a'.repeat(40), sourceDirty: false,
  }), /review is missing required case/);

  const dirty = fixture(t);
  await assert.rejects(() => prepareRun({
    ...dirty, stage: 'V-01', target: 'device-1', platformVersion: '6.0.0',
    sourceRevision: 'a'.repeat(40), sourceDirty: true,
  }), /source must be clean/);

  const existing = fixture(t);
  fs.mkdirSync(existing.output, { recursive: true });
  await assert.rejects(() => prepareRun({
    ...existing, stage: 'V-01', target: 'device-1', platformVersion: '6.0.0',
    sourceRevision: 'a'.repeat(40), sourceDirty: false,
  }), /output already exists/);
});
