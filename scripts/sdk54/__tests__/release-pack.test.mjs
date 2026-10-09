import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { transformPackage } from '../prepare-npm-release.mjs';
import { verifyRelease } from '../verify-npm-release.mjs';

test('staging expo adds runtime metadata and license without changing source', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'release-stage-test-'));
  try {
    const source = JSON.parse(fs.readFileSync('packages/expo/package.json'));
    await transformPackage(directory, source);
    const output = JSON.parse(fs.readFileSync(path.join(directory, 'package.json')));
    assert.equal(source.name, 'expo');
    assert.equal(output.name, '@expo-oh/expo');
    assert.ok(output.files.includes('harmony-release.json'));
    assert.ok(fs.readFileSync(path.join(directory, 'LICENSE'), 'utf8').includes('MIT'));
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'harmony-release.json'))).packages.length, 15);
    assert.equal(output.scripts.prepare, undefined);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('verification rejects incomplete release and unsafe artifact path', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'release-verify-test-'));
  try {
    fs.writeFileSync(path.join(directory, 'release.json'), JSON.stringify({ release: 'sdk54-expo-oh-harmony.0', failures: [], packages: [{ name: '@expo-oh/expo', file: '../outside.tgz' }] }));
    const failures = await verifyRelease(directory);
    assert.ok(failures.includes('Incomplete release set'));
    assert.ok(failures.some(f => f.includes('Unsafe archive filename')));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

import { assertReleaseAccepted } from '../publish-npm-release.mjs';

test('publication is blocked by missing device evidence or mismatched tarballs', () => {
  const report = { release: 'r', packages: [{ name: '@expo-oh/expo', integrity: 'sha512-test' }] };
  assert.throws(() => assertReleaseAccepted(report, { release: 'r' }), /Missing acceptance/);
  const checks = Object.fromEntries(['npm-blank', 'npm-default', 'pnpm-blank', 'pnpm-default', 'debug-device', 'clean-release-device', 'cold-start-device'].map(name => [name, { status: 'passed', evidence: 'test evidence' }]));
  assert.throws(() => assertReleaseAccepted(report, { release: 'r', checks, artifacts: {} }), /artifact mismatch/);
  assertReleaseAccepted(report, { release: 'r', checks, artifacts: { '@expo-oh/expo': 'sha512-test' } });
});
