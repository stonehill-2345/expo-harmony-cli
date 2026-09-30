import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { checkRepository } from '../check-repository.mjs';

const APPROVED_STAGE_COMMAND = 'node scripts/sdk54/stage-e2e-packages.mjs';

function git(root, ...args) {
  execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' });
}

function writeRootManifest(root, overrides = {}) {
  const manifest = {
    name: 'root',
    private: true,
    scripts: { 'sdk54:e2e:stage': APPROVED_STAGE_COMMAND },
    ...overrides,
  };
  fs.writeFileSync(path.join(root, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function createRepository(t, { initializeGit = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-repository-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'apps/cli'), { recursive: true });
  fs.mkdirSync(path.join(root, 'packages/expo-asset'), { recursive: true });
  writeRootManifest(root);
  fs.writeFileSync(path.join(root, 'apps/cli/package.json'), '{"name":"expo-harmony-cli","version":"1.5.0"}\n');
  fs.writeFileSync(path.join(root, 'packages/expo-asset/package.json'), '{"name":"expo-asset","version":"12.0.13","private":true}\n');
  if (initializeGit) git(root, 'init', '--quiet');
  return root;
}

test('allows exactly expo-harmony-cli as the sole publishable workspace package', (t) => {
  const root = createRepository(t);
  assert.deepEqual(checkRepository(root), {
    publishable: ['expo-harmony-cli'],
    forbiddenFiles: [],
    forbiddenText: [],
    failures: [],
  });

  fs.mkdirSync(path.join(root, 'apps/other'));
  fs.writeFileSync(path.join(root, 'apps/other/package.json'), '{"name":"other-public","version":"1.0.0"}\n');
  const report = checkRepository(root);
  assert.deepEqual(report.publishable, ['expo-harmony-cli', 'other-public']);
  assert.ok(report.failures.some((failure) => failure.includes('sole publishable package')));
});

test('rejects repository artifacts, caches, credentials, paths, file links, and private IPv4', (t) => {
  const root = createRepository(t);
  const packageDir = path.join(root, 'packages/expo-asset');
  fs.mkdirSync(path.join(packageDir, 'node_modules/cache'), { recursive: true });
  fs.writeFileSync(path.join(packageDir, 'output.hap'), 'native');
  fs.writeFileSync(path.join(packageDir, 'node_modules/cache/index.js'), 'cache');
  fs.writeFileSync(
    path.join(packageDir, 'unsafe.txt'),
    '-----BEGIN PRIVATE KEY-----\n/Users/example\n/private/tmp/value\nfile:/tmp/pkg\n10.0.0.7\n',
  );
  const report = checkRepository(root);
  assert.ok(report.forbiddenFiles.some((value) => value.endsWith('output.hap')));
  assert.ok(report.forbiddenFiles.some((value) => value.includes('node_modules')));
  for (const expected of ['PRIVATE KEY', '/Users/', '/private/tmp', 'file:/', '10.0.0.7']) {
    assert.ok(report.forbiddenText.some((value) => value.includes(expected)), `${expected}: ${JSON.stringify(report, null, 2)}`);
  }
});

test('ignores workspace-installed root node_modules inside a Git checkout', (t) => {
  const root = createRepository(t, { initializeGit: true });
  const installedFile = path.join(root, 'packages/expo-asset/node_modules/cache/index.js');
  fs.mkdirSync(path.dirname(installedFile), { recursive: true });
  fs.writeFileSync(installedFile, 'installed dependency\n');
  const report = checkRepository(root);
  assert.equal(report.forbiddenFiles.some((value) => value.includes('node_modules')), false, JSON.stringify(report, null, 2));
});

test('does not treat source examples and test fixtures as leaked machine configuration', (t) => {
  const root = createRepository(t);
  const fixture = path.join(root, 'packages/expo-asset/src/__tests__/fixture.ts');
  fs.mkdirSync(path.dirname(fixture), { recursive: true });
  fs.writeFileSync(
    fixture,
    "// /Users/example /private/tmp/value file:/tmp/pkg 192.168.1.8\nconst key = '-----BEGIN PRIVATE KEY-----';\n",
  );
  const runtime = path.join(root, 'packages/expo-asset/src/runtime.ts');
  fs.writeFileSync(runtime, "export const uri = 'file:///data/storage/app/file';\n");
  const report = checkRepository(root);
  assert.deepEqual(report.forbiddenText, []);
  assert.deepEqual(report.failures, []);
});

test('skips only ignored untracked evidence under approved local roots', (t) => {
  const root = createRepository(t, { initializeGit: true });
  fs.writeFileSync(
    path.join(root, '.gitignore'),
    '.superpowers/sdd/\n.tmp/*\n!.tmp/unignored.txt\n',
  );

  const ignoredSdd = path.join(root, '.superpowers/sdd/ignored.txt');
  const trackedSdd = path.join(root, '.superpowers/sdd/tracked.txt');
  const ignoredTmp = path.join(root, '.tmp/ignored.txt');
  const unignoredTmp = path.join(root, '.tmp/unignored.txt');
  for (const filePath of [ignoredSdd, trackedSdd, ignoredTmp, unignoredTmp]) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  fs.writeFileSync(ignoredSdd, '/Users/ignored-sdd\n');
  fs.writeFileSync(trackedSdd, '/Users/tracked-sdd\n');
  fs.writeFileSync(ignoredTmp, '/private/tmp/ignored-tmp\n');
  fs.writeFileSync(unignoredTmp, '/private/tmp/unignored-tmp\n');
  git(root, 'add', '--force', '.superpowers/sdd/tracked.txt');

  const report = checkRepository(root);
  assert.ok(report.forbiddenText.some((value) => value.startsWith('.superpowers/sdd/tracked.txt:')),
    JSON.stringify(report, null, 2));
  assert.ok(report.forbiddenText.some((value) => value.startsWith('.tmp/unignored.txt:')),
    JSON.stringify(report, null, 2));
  assert.equal(report.forbiddenText.some((value) => value.startsWith('.superpowers/sdd/ignored.txt:')), false,
    JSON.stringify(report, null, 2));
  assert.equal(report.forbiddenText.some((value) => value.startsWith('.tmp/ignored.txt:')), false,
    JSON.stringify(report, null, 2));
});

test('fails closed by scanning approved local roots when Git is unavailable', (t) => {
  const root = createRepository(t, { initializeGit: false });
  const evidence = path.join(root, '.tmp/evidence.txt');
  fs.mkdirSync(path.dirname(evidence), { recursive: true });
  fs.writeFileSync(evidence, '/private/tmp/must-be-scanned\n');

  const report = checkRepository(root);
  assert.ok(report.forbiddenText.some((value) => value.startsWith('.tmp/evidence.txt:')),
    JSON.stringify(report, null, 2));
});

test('still scans ignored repository artifacts outside approved evidence roots', (t) => {
  const root = createRepository(t, { initializeGit: true });
  fs.writeFileSync(path.join(root, '.gitignore'), 'packages/expo-asset/ignored.hap\n');
  fs.writeFileSync(path.join(root, 'packages/expo-asset/ignored.hap'), 'ignored native artifact\n');

  const report = checkRepository(root);
  assert.ok(report.forbiddenFiles.includes('packages/expo-asset/ignored.hap'), JSON.stringify(report, null, 2));
});

test('allows only the exact approved sdk54:e2e:stage command in the root manifest', (t) => {
  const root = createRepository(t);
  const report = checkRepository(root);
  assert.deepEqual(report.forbiddenText, []);
  assert.deepEqual(report.failures, []);
});

test('rejects any changed sdk54:e2e:stage command', (t) => {
  const root = createRepository(t);
  writeRootManifest(root, {
    scripts: {
      'sdk54:e2e:stage': 'node scripts/sdk54/stage-e2e-packages.mjs --external ./tgz --output ./staging',
    },
  });

  const report = checkRepository(root);
  assert.ok(report.failures.some((failure) => failure.includes('sdk54:e2e:stage')),
    JSON.stringify(report, null, 2));
});

test('rejects shell operations appended to the approved staging command', (t) => {
  const root = createRepository(t);
  writeRootManifest(root, {
    scripts: { 'sdk54:e2e:stage': `${APPROVED_STAGE_COMMAND} && echo unsafe` },
  });

  const report = checkRepository(root);
  assert.ok(report.failures.some((failure) => failure.includes('sdk54:e2e:stage')),
    JSON.stringify(report, null, 2));
  assert.deepEqual(report.forbiddenText, [], JSON.stringify(report, null, 2));
});

test('rejects absolute local paths in every other root manifest field', (t) => {
  const root = createRepository(t);
  writeRootManifest(root, { localEvidence: '/Users/example', temporaryOutput: '/private/tmp/example' });

  const report = checkRepository(root);
  assert.ok(report.forbiddenText.includes('package.json: /Users/'), JSON.stringify(report, null, 2));
  assert.ok(report.forbiddenText.includes('package.json: /private/tmp'), JSON.stringify(report, null, 2));
});
