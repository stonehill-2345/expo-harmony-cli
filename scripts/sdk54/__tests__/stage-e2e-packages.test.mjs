import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { SDK54_PACKAGES } from '../catalog.mjs';
import { stageE2ePackages } from '../stage-e2e-packages.mjs';

const EXTERNAL_PACKAGES = [
  ['@react-native-oh/react-native-harmony', '0.82.30', 'react-native-oh-react-native-harmony-0.82.30.tgz'],
  ['react-native-gesture-handler', '2.30.0', 'react-native-gesture-handler-2.30.0.tgz'],
  ['@react-native-ohos/react-native-gesture-handler', '2.30.1', 'react-native-ohos-react-native-gesture-handler-2.30.1.tgz'],
  ['react-native-reanimated', '4.2.1', 'react-native-reanimated-4.2.1.tgz'],
  ['@react-native-ohos/react-native-reanimated', '4.0.1', 'react-native-ohos-react-native-reanimated-4.0.1.tgz'],
  ['react-native-safe-area-context', '5.6.2', 'react-native-safe-area-context-5.6.2.tgz'],
  ['@react-native-ohos/react-native-safe-area-context', '5.6.3', 'react-native-ohos-react-native-safe-area-context-5.6.3.tgz'],
  ['react-native-screens', '4.17.1', 'react-native-screens-4.17.1.tgz'],
  ['@react-native-ohos/react-native-screens', '4.9.0', 'react-native-ohos-react-native-screens-4.9.0.tgz'],
  ['react-native-worklets', '0.7.1', 'react-native-worklets-0.7.1.tgz'],
  ['@react-native-ohos/react-native-worklets', '1.0.0', 'react-native-ohos-react-native-worklets-1.0.0.tgz'],
];

const SCRIPT_PATH = fileURLToPath(new URL('../stage-e2e-packages.mjs', import.meta.url));
const REAL_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '../..');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function createFixture(t, { missingExternal } = {}) {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-stage-'));
  const rootDir = path.join(baseDir, 'repository');
  const externalContainer = path.join(baseDir, 'external-input');
  const externalDir = path.join(externalContainer, 'packages');
  const outputDir = path.join(baseDir, 'staging');
  const rootSentinel = path.join(rootDir, 'ROOT_SENTINEL');
  const externalSentinel = path.join(externalDir, 'EXTERNAL_SENTINEL');
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  for (const descriptor of SDK54_PACKAGES) {
    const packageDir = path.join(rootDir, descriptor.relativePath);
    if (descriptor.build) {
      const sourceDir = path.join(REAL_ROOT, descriptor.relativePath);
      fs.cpSync(sourceDir, packageDir, {
        recursive: true,
        dereference: false,
        verbatimSymlinks: true,
        filter(source) {
          const relative = path.relative(sourceDir, source).split(path.sep).join('/');
          return relative !== 'build' && !relative.startsWith('build/') &&
            relative !== 'node_modules' && !relative.startsWith('node_modules/');
        },
      });
      fs.symlinkSync(path.join(sourceDir, 'node_modules'), path.join(packageDir, 'node_modules'));
    } else {
      fs.mkdirSync(packageDir, { recursive: true });
      fs.writeFileSync(
        path.join(packageDir, 'package.json'),
        `${JSON.stringify({
          name: descriptor.name,
          version: descriptor.version,
          private: true,
          files: ['package.json', 'payload.txt'],
        }, null, 2)}
`,
      );
      fs.writeFileSync(path.join(packageDir, 'payload.txt'), `fresh ${descriptor.name}@${descriptor.version}
`);
    }
  }
  fs.mkdirSync(path.join(rootDir, 'node_modules'), { recursive: true });
  fs.symlinkSync(path.join(REAL_ROOT, 'node_modules/.pnpm'), path.join(rootDir, 'node_modules/.pnpm'));
  fs.writeFileSync(rootSentinel, 'keep repository\n');

  fs.mkdirSync(externalDir, { recursive: true });
  for (const [, , file] of EXTERNAL_PACKAGES) {
    if (file !== missingExternal) {
      fs.writeFileSync(path.join(externalDir, file), `external ${file}\n`);
    }
  }
  fs.writeFileSync(externalSentinel, 'keep external input\n');

  const staleWorkspaceFile = SDK54_PACKAGES.find(({ name }) => name === 'expo').patchFile.replace(/\.patch$/, '.tgz');
  fs.writeFileSync(path.join(externalDir, staleWorkspaceFile), 'stale expo archive\n');
  fs.writeFileSync(path.join(externalDir, 'unapproved-extra-1.0.0.tgz'), 'unapproved\n');

  return {
    baseDir,
    rootDir,
    externalContainer,
    externalDir,
    outputDir,
    rootSentinel,
    externalSentinel,
    staleWorkspaceFile,
  };
}

async function captureError(operation) {
  try {
    await operation();
    return null;
  } catch (error) {
    return error;
  }
}

test('rejects dangerous output paths before deleting repository or external sentinels', async (t) => {
  const cases = [
    ['output equals rootDir', ({ rootDir }) => rootDir],
    ['output equals externalDir', ({ externalDir }) => externalDir],
    ['output contains externalDir', ({ externalContainer }) => externalContainer],
    ['output is nested inside rootDir', ({ rootDir }) => path.join(rootDir, 'nested-staging')],
  ];

  for (const [name, selectOutput] of cases) {
    await t.test(name, async (t) => {
      const fixture = createFixture(t);
      const error = await captureError(() => stageE2ePackages({
        ...fixture,
        outputDir: selectOutput(fixture),
      }));

      assert.ok(fs.existsSync(fixture.rootSentinel), 'repository sentinel must not be deleted');
      assert.ok(fs.existsSync(fixture.externalSentinel), 'external sentinel must not be deleted');
      assert.match(error?.message ?? '', /outputDir must not overlap rootDir or externalDir/);
    });
  }
});

test('canonicalizes an existing output symlink before overlap validation', async (t) => {
  const fixture = createFixture(t);
  const outputAlias = path.join(fixture.baseDir, 'external-alias');
  fs.symlinkSync(fixture.externalDir, outputAlias, 'dir');

  const error = await captureError(() => stageE2ePackages({
    ...fixture,
    outputDir: outputAlias,
  }));

  assert.ok(fs.existsSync(fixture.rootSentinel));
  assert.ok(fs.existsSync(fixture.externalSentinel));
  assert.ok(fs.lstatSync(outputAlias).isSymbolicLink(), 'output symlink must not be removed');
  assert.match(error?.message ?? '', /outputDir must not overlap rootDir or externalDir/);
});

test('rejects lexical output ancestors containing source symlink aliases', async (t) => {
  const cases = [
    ['rootDir symlink alias', 'rootDir'],
    ['externalDir symlink alias', 'externalDir'],
  ];

  for (const [name, sourceKey] of cases) {
    await t.test(name, async (t) => {
      const fixture = createFixture(t);
      const outputDir = path.join(fixture.baseDir, `${sourceKey}-alias-container`);
      const sourceAlias = path.join(outputDir, 'source-alias');
      fs.mkdirSync(outputDir);
      fs.symlinkSync(fixture[sourceKey], sourceAlias, 'dir');

      const error = await captureError(() => stageE2ePackages({
        ...fixture,
        [sourceKey]: sourceAlias,
        outputDir,
      }));

      assert.ok(fs.existsSync(fixture.rootSentinel), 'repository sentinel must not be deleted');
      assert.ok(fs.existsSync(fixture.externalSentinel), 'external sentinel must not be deleted');
      assert.ok(fs.existsSync(sourceAlias), `${name} must not be deleted`);
      assert.ok(fs.lstatSync(sourceAlias).isSymbolicLink(), `${name} must remain a symlink`);
      assert.match(error?.message ?? '', /outputDir must not overlap rootDir or externalDir/);
    });
  }
});

test('rejects mixed lexical and canonical alias overlaps', async (t) => {
  const cases = [
    ['rootDir symlink nested in canonical output', 'rootDir'],
    ['externalDir symlink nested in canonical output', 'externalDir'],
  ];

  for (const [name, sourceKey] of cases) {
    await t.test(name, async (t) => {
      const fixture = createFixture(t);
      const realOutput = path.join(fixture.baseDir, `${sourceKey}-real-output`);
      const outputAlias = path.join(fixture.baseDir, `${sourceKey}-output-alias`);
      const sourceAlias = path.join(realOutput, 'source-alias');
      fs.mkdirSync(realOutput);
      fs.symlinkSync(realOutput, outputAlias, 'dir');
      fs.symlinkSync(fixture[sourceKey], sourceAlias, 'dir');

      const error = await captureError(() => stageE2ePackages({
        ...fixture,
        [sourceKey]: sourceAlias,
        outputDir: outputAlias,
      }));

      assert.ok(fs.existsSync(fixture.rootSentinel), 'repository sentinel must not be deleted');
      assert.ok(fs.existsSync(fixture.externalSentinel), 'external sentinel must not be deleted');
      assert.ok(fs.existsSync(fixture[sourceKey]), `${name} target must remain intact`);
      assert.ok(fs.existsSync(outputAlias), `${name} output alias must not be deleted`);
      assert.ok(fs.lstatSync(outputAlias).isSymbolicLink(), `${name} output alias must remain a symlink`);
      assert.ok(fs.existsSync(sourceAlias), `${name} source alias must not be deleted`);
      assert.ok(fs.lstatSync(sourceAlias).isSymbolicLink(), `${name} source alias must remain a symlink`);
      assert.match(error?.message ?? '', /outputDir must not overlap rootDir or externalDir/);
    });
  }
});

test('stages fourteen fresh workspace archives plus exactly eleven approved external archives', async (t) => {
  const fixture = createFixture(t);
  const manifest = await stageE2ePackages(fixture);

  assert.deepEqual(manifest.failures, []);
  assert.equal(manifest.expoPackages.length, 14);
  assert.equal(manifest.externalPackages.length, 11);
  assert.equal(manifest.packages, 25);
  assert.deepEqual(
    manifest.externalPackages.map(({ name, version, file }) => [name, version, file]),
    EXTERNAL_PACKAGES,
  );

  const expectedArchiveFiles = [
    ...SDK54_PACKAGES.map(({ patchFile }) => patchFile.replace(/\.patch$/, '.tgz')),
    ...EXTERNAL_PACKAGES.map(([, , file]) => file),
  ].sort((left, right) => left.localeCompare(right, 'en'));
  const stagedArchiveFiles = fs.readdirSync(fixture.outputDir)
    .filter((file) => file.endsWith('.tgz'))
    .sort((left, right) => left.localeCompare(right, 'en'));
  assert.deepEqual(stagedArchiveFiles, expectedArchiveFiles);
  assert.equal(stagedArchiveFiles.length, 25);
  assert.ok(!stagedArchiveFiles.includes('unapproved-extra-1.0.0.tgz'));

  const staleHash = sha256(Buffer.from('stale expo archive\n'));
  const freshExpo = manifest.expoPackages.find(({ name }) => name === 'expo');
  assert.notEqual(freshExpo.sha256, staleHash);
  assert.equal(freshExpo.sha256, sha256(fs.readFileSync(path.join(fixture.outputDir, fixture.staleWorkspaceFile))));

  for (const entry of [...manifest.expoPackages, ...manifest.externalPackages]) {
    const archivePath = path.join(fixture.outputDir, entry.file);
    assert.equal(entry.bytes, fs.statSync(archivePath).size);
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    assert.equal(entry.sha256, sha256(fs.readFileSync(archivePath)));
  }
  assert.ok(manifest.expoPackages.every(({ source }) => source === 'workspace'));
  assert.ok(manifest.externalPackages.every(({ source }) => source === 'external'));

  const firstManifestText = fs.readFileSync(path.join(fixture.outputDir, 'manifest.json'), 'utf8');
  assert.ok(firstManifestText.endsWith('\n'));
  assert.ok(!firstManifestText.endsWith('\n\n'));
  assert.deepEqual(JSON.parse(firstManifestText), manifest);

  await stageE2ePackages(fixture);
  const secondManifestText = fs.readFileSync(path.join(fixture.outputDir, 'manifest.json'), 'utf8');
  assert.equal(secondManifestText, firstManifestText);
});

test('reports a missing approved external archive as a failure', async (t) => {
  const missingExternal = EXTERNAL_PACKAGES[0][2];
  const fixture = createFixture(t, { missingExternal });
  const manifest = await stageE2ePackages(fixture);

  assert.equal(manifest.expoPackages.length, 14);
  assert.equal(manifest.externalPackages.length, 10);
  assert.equal(manifest.packages, 24);
  assert.deepEqual(manifest.failures, [`Missing external package: ${missingExternal}`]);
  assert.ok(!fs.existsSync(path.join(fixture.outputDir, missingExternal)));
});

test('supports explicit --external and --output CLI arguments', (t) => {
  const fixture = createFixture(t);
  const result = spawnSync(
    process.execPath,
    [SCRIPT_PATH, '--external', fixture.externalDir, '--output', fixture.outputDir],
    { cwd: fixture.rootDir, encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const manifest = JSON.parse(result.stdout);
  assert.equal(manifest.packages, 25);
  assert.deepEqual(manifest.failures, []);
  assert.equal(fs.readdirSync(fixture.outputDir).filter((file) => file.endsWith('.tgz')).length, 25);
});
