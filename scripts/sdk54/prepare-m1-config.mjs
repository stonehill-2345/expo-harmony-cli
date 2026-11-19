import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { stageBuildAndPack } from './pack-packages.mjs';
import { transformPackage } from './prepare-npm-release.mjs';
import { RELEASE_PACKAGES, RELEASE_ID } from './release-catalog.mjs';
import { verifyRelease } from './verify-npm-release.mjs';

const args = process.argv.slice(2);
const option = (flag, fallback) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
const previousDir = path.resolve(option('--previous', 'outputs/sdk54/ai-e2e/20261027-m0a-creation/runtime'));
const outputDir = path.resolve(option('--output', 'outputs/sdk54/ai-e2e/20261027-m1-config/runtime'));
assert.notEqual(previousDir, outputDir, 'M1 candidates must not overwrite accepted M0A archives');
fs.mkdirSync(outputDir, { recursive: true });
const previous = JSON.parse(fs.readFileSync(path.join(previousDir, 'release.json')));
assert.equal(previous.release, RELEASE_ID);
assert.deepEqual(previous.failures, []);
assert.equal(previous.packages.length, RELEASE_PACKAGES.length);
for (const item of previous.packages) {
  assert.equal(path.basename(item.file), item.file);
  assert.equal(`sha512-${createHash('sha512').update(fs.readFileSync(path.join(previousDir, item.file))).digest('base64')}`, item.integrity, `Previous candidate integrity: ${item.installName}`);
}
const changed = new Set(['expo', '@expo/cli', 'expo-modules-autolinking']);
const report = { release: RELEASE_ID, packages: [], failures: [], rebuilt: [...changed], reused: [] };
for (const descriptor of RELEASE_PACKAGES) {
  const old = previous.packages.find(item => item.installName === descriptor.installName);
  assert.ok(old, `Missing prior candidate: ${descriptor.installName}`);
  const archive = path.join(outputDir, old.file);
  if (changed.has(descriptor.installName)) {
    await stageBuildAndPack({ rootDir: process.cwd(), outputDir, descriptor, transform: transformPackage, archiveFile: old.file });
  } else {
    fs.copyFileSync(path.join(previousDir, old.file), archive);
    report.reused.push(descriptor.installName);
  }
  report.packages.push({ ...old, integrity: `sha512-${createHash('sha512').update(fs.readFileSync(archive)).digest('base64')}` });
  console.log(`${changed.has(descriptor.installName) ? 'BUILT' : 'REUSED'} ${descriptor.installName}`);
}
fs.writeFileSync(path.join(outputDir, 'release.json'), JSON.stringify(report, null, 2) + '\n');
assert.deepEqual(await verifyRelease(outputDir), [], 'M1 candidates failed release verification');
console.log('PASS: M1 changed candidates built and complete candidate set verified');
