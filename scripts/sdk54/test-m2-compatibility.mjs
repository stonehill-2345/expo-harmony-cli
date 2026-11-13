import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loadM1Source } from './m1-test-support.mjs';

const args = process.argv.slice(2);
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const output = path.resolve(option('--output') ?? 'outputs/sdk54/ai-e2e/20261027-m2-generation/compat-fixture');
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const toolPath = path.resolve('scripts/sdk54/prepare-released-compatibility.mjs');
assert.ok(fs.existsSync(toolPath), 'release staging must prebuild and verify compatibility artifacts');
const { prepareReleasedCompatibility, verifyReleasedCompatibility } = await import(pathToFileURL(toolPath).href);
const corePackageRoot = path.join(output, 'core');
fs.mkdirSync(corePackageRoot, { recursive: true });
const sources = {
  rnohHarPath: option('--rnoh-har'),
  screensHarPath: option('--screens-har'),
  workletsHarPath: option('--worklets-har'),
};
assert.ok(Object.values(sources).every(Boolean), 'supply --rnoh-har --screens-har --worklets-har');
const before = Object.fromEntries(Object.entries(sources).map(([name, file]) => [name, digest(file)]));
const manifest = args.includes('--reuse-bundle') ? verifyReleasedCompatibility(corePackageRoot)
  : await prepareReleasedCompatibility({ rootDir: process.cwd(), corePackageRoot, ...sources });
assert.equal(manifest.artifacts.length, 3);
verifyReleasedCompatibility(corePackageRoot);
fs.mkdirSync(path.join(output, 'inputs'), { recursive: true });
for (const [name, file] of Object.entries(sources)) {
  fs.copyFileSync(file, path.join(output, 'inputs', `${name}.har`));
  assert.equal(digest(path.join(output, 'inputs', `${name}.har`)), before[name]);
}
const api = loadM1Source('packages/expo-modules-autolinking/src/platforms/harmony/releasedCompatibility.ts');
const consumer = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-m2-compat-consumer-'));
try {
  process.env.EXPO_HARMONY_PYTHON = '/nonexistent/python-disabled';
  process.env.PATH = '/nonexistent/python-disabled';
  const copies = [];
  for (const artifact of manifest.artifacts) {
    const inputHarPath = sources[artifact.transform === 'rnoh-core-v1-v4' ? 'rnohHarPath' : artifact.transform === 'screens-content-wrapper-v1' ? 'screensHarPath' : 'workletsHarPath'];
    const outputHarPath = path.join(consumer, `${artifact.transform}.har`);
    const options = { corePackageRoot, inputHarPath, outputHarPath, transform: artifact.transform };
    await api.copyReleasedHarmonyHarAsync(options);
    assert.equal(digest(outputHarPath), artifact.outputSHA256);
    assert.ok(fs.existsSync(`${outputHarPath}.manifest.json`));
    const malformed = path.join(consumer, 'bad.har');
    fs.writeFileSync(malformed, 'unsupported input');
    await assert.rejects(api.copyReleasedHarmonyHarAsync({ ...options, inputHarPath: malformed }), /input.*SHA256|Unsupported/i);
    copies.push({ transform: artifact.transform, sha256: digest(outputHarPath) });
  }
  const rnoh = manifest.artifacts[0];
  const artifactFile = path.join(corePackageRoot, 'harmony/released-compatibility', rnoh.file);
  const original = fs.readFileSync(artifactFile);
  fs.appendFileSync(artifactFile, 'corrupt');
  await assert.rejects(api.copyReleasedRnohCompatibilityHarAsync({ corePackageRoot, inputHarPath: sources.rnohHarPath, outputHarPath: path.join(consumer, 'broken.har') }), /SHA256/);
  fs.writeFileSync(artifactFile, original);
  const manifestFile = path.join(corePackageRoot, 'harmony/released-compatibility/manifest.json');
  const manifestBytes = fs.readFileSync(manifestFile);
  for (const corrupt of [
    { ...manifest, schemaVersion: 999 },
    { ...manifest, artifacts: manifest.artifacts.slice(1) },
    { ...manifest, artifacts: [rnoh, rnoh, ...manifest.artifacts.slice(1)] },
    { ...manifest, artifacts: [{ ...rnoh, file: '../escape.har' }, ...manifest.artifacts.slice(1)] },
    { ...manifest, artifacts: [{ ...rnoh, compatibilityId: 'untrusted' }, ...manifest.artifacts.slice(1)] },
  ]) {
    fs.writeFileSync(manifestFile, JSON.stringify(corrupt));
    await assert.rejects(api.copyReleasedRnohCompatibilityHarAsync({ corePackageRoot, inputHarPath: sources.rnohHarPath, outputHarPath: path.join(consumer, 'broken.har') }));
    assert.throws(() => verifyReleasedCompatibility(corePackageRoot));
  }
  fs.writeFileSync(manifestFile, manifestBytes);
  const recordFile = `${artifactFile}.manifest.json`;
  const recordBytes = fs.readFileSync(recordFile);
  fs.appendFileSync(recordFile, 'corrupt');
  await assert.rejects(api.copyReleasedRnohCompatibilityHarAsync({ corePackageRoot, inputHarPath: sources.rnohHarPath, outputHarPath: path.join(consumer, 'broken.har') }), /SHA256/);
  fs.writeFileSync(recordFile, recordBytes);
  const toolFile = path.join(corePackageRoot, 'harmony/released-compatibility', rnoh.tools[0].file);
  const toolBytes = fs.readFileSync(toolFile);
  fs.appendFileSync(toolFile, 'corrupt');
  await assert.rejects(api.copyReleasedRnohCompatibilityHarAsync({ corePackageRoot, inputHarPath: sources.rnohHarPath, outputHarPath: path.join(consumer, 'broken.har') }), /SHA256/);
  fs.writeFileSync(toolFile, toolBytes);
  for (const escape of ['bundle', 'harmony']) {
    const escapedCore = path.join(consumer, `escaped-core-${escape}`);
    fs.mkdirSync(escapedCore);
    if (escape === 'bundle') {
      fs.mkdirSync(path.join(escapedCore, 'harmony'));
      fs.symlinkSync(path.join(corePackageRoot, 'harmony/released-compatibility'), path.join(escapedCore, 'harmony/released-compatibility'));
    } else fs.symlinkSync(path.join(corePackageRoot, 'harmony'), path.join(escapedCore, 'harmony'));
    await assert.rejects(api.copyReleasedRnohCompatibilityHarAsync({ corePackageRoot: escapedCore, inputHarPath: sources.rnohHarPath, outputHarPath: path.join(consumer, `escaped-${escape}.har`) }), /escapes.*Core/);
    assert.throws(() => verifyReleasedCompatibility(escapedCore), /escapes.*Core/);
  }
  const linkedCore = path.join(consumer, 'linked-core');
  fs.symlinkSync(corePackageRoot, linkedCore);
  await api.copyReleasedRnohCompatibilityHarAsync({ corePackageRoot: linkedCore, inputHarPath: sources.rnohHarPath, outputHarPath: path.join(consumer, 'linked-core.har') });
  await assert.rejects(api.copyReleasedRnohCompatibilityHarAsync({ corePackageRoot, inputHarPath: sources.rnohHarPath, outputHarPath: path.join(corePackageRoot, 'overwrite.har') }), /outside installed dependencies/);
  const alias = path.join(consumer, 'core-alias');
  fs.symlinkSync(corePackageRoot, alias);
  await assert.rejects(api.copyReleasedRnohCompatibilityHarAsync({ corePackageRoot, inputHarPath: sources.rnohHarPath, outputHarPath: path.join(alias, 'must-not-create/overwrite.har') }), /outside installed dependencies/);
  assert.equal(fs.existsSync(path.join(corePackageRoot, 'must-not-create')), false, 'reject symlink destinations before creating dependency directories');
  await assert.rejects(prepareReleasedCompatibility({ rootDir: process.cwd(), corePackageRoot: path.resolve('packages/expo-modules-core'), ...sources }), /release staging/);
  await assert.rejects(prepareReleasedCompatibility({ rootDir: process.cwd(), corePackageRoot, ...sources, workletsHarPath: sources.screensHarPath }), /input SHA256/);
  assert.deepEqual(Object.fromEntries(Object.entries(sources).map(([name, file]) => [name, digest(file)])), before);
  fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify({ passed: true, sources: before, copies, manifest }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, output, copies }, null, 2));
} finally {
  fs.rmSync(consumer, { recursive: true, force: true });
}
