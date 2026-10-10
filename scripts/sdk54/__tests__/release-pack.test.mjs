import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { transformPackage } from '../prepare-npm-release.mjs';
import { verifyRelease } from '../verify-npm-release.mjs';
import { RELEASE_PACKAGES } from '../release-catalog.mjs';
import { readReleaseReadme } from '../release-readme.mjs';

test('staging expo adds runtime metadata and license without changing source', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'release-stage-test-'));
  try {
    const source = JSON.parse(fs.readFileSync('packages/expo/package.json'));
    fs.writeFileSync(path.join(directory, 'README.md'), '# Upstream README');
    await transformPackage(directory, source);
    const output = JSON.parse(fs.readFileSync(path.join(directory, 'package.json')));
    assert.equal(source.name, 'expo');
    assert.equal(output.name, '@expo-oh/expo');
    assert.ok(output.files.includes('harmony-release.json'));
    assert.ok(fs.readFileSync(path.join(directory, 'LICENSE'), 'utf8').includes('MIT'));
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'harmony-release.json'))).packages.length, 15);
    assert.equal(output.scripts.prepare, undefined);
    const readme = fs.readFileSync(path.join(directory, 'README.md'), 'utf8');
    assert.equal(readme, readReleaseReadme(RELEASE_PACKAGES.find(p => p.installName === 'expo')));
    assert.ok(!readme.includes('# Upstream README'));
    assert.equal(output.homepage, 'https://github.com/stonehill-2345/expo-harmony-cli/blob/main/packages/expo/README.md');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('all runtime packages have portable Harmony docs, including external screens', () => {
  for (const descriptor of RELEASE_PACKAGES) {
    const readme = readReleaseReadme(descriptor);
    assert.ok(readme.includes(`npm install --save-exact ${descriptor.installName}@${descriptor.installSpec}`));
    assert.ok(readme.includes(`pnpm add --save-exact ${descriptor.installName}@${descriptor.installSpec}`));
    assert.ok(readme.includes('/docs/harmony/getting-started.md'));
    assert.ok(readme.includes('/expo-harmony-cli/issues'));
  }
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
