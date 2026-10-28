import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { prepareReleasedCompatibility, verifyReleasedCompatibility } from '../prepare-released-compatibility.mjs';
import { loadM1Source } from '../m1-test-support.mjs';

test('release staging rejects unknown inputs before creating compatibility outputs', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-compat-input-'));
  try {
    const input = path.join(root, 'input.har');
    fs.writeFileSync(input, 'unsupported');
    await assert.rejects(prepareReleasedCompatibility({ rootDir: process.cwd(), corePackageRoot: root, rnohHarPath: input, screensHarPath: input, workletsHarPath: input, pythonExecutable: '/missing/python' }), /input SHA256/);
    assert.equal(fs.existsSync(path.join(root, 'harmony')), false);
    assert.equal(fs.readFileSync(input, 'utf8'), 'unsupported');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('consumption rejects unknown HAR without creating output or executing a tool', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-compat-copy-'));
  try {
    const api = loadM1Source('packages/expo-modules-autolinking/src/platforms/harmony/releasedCompatibility.ts');
    const input = path.join(root, 'input.har');
    const output = path.join(root, 'output.har');
    fs.writeFileSync(input, 'unsupported');
    await assert.rejects(api.copyReleasedRnohCompatibilityHarAsync({ corePackageRoot: root, inputHarPath: input, outputHarPath: output }), /input SHA256/);
    assert.equal(fs.existsSync(output), false);
    assert.throws(() => verifyReleasedCompatibility(root));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
