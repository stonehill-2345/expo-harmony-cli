import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { stageBuildAndPack } from './pack-packages.mjs';
import { transformPackage } from './prepare-npm-release.mjs';
import { RELEASE_PACKAGES, RELEASE_ID } from './release-catalog.mjs';
import { verifyRelease } from './verify-npm-release.mjs';
import { prepareReleasedCompatibility } from './prepare-released-compatibility.mjs';

const args = process.argv.slice(2);
const option = (flag, fallback) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
const previousDir = path.resolve(option('--previous', 'outputs/sdk54/ai-e2e/20261027-m1-config/runtime-next'));
const outputDir = path.resolve(option('--output', 'outputs/sdk54/ai-e2e/20261027-m2-generation/runtime'));
assert.notEqual(previousDir, outputDir, 'M2 must not overwrite accepted M1 archives');
assert.ok(!fs.existsSync(path.join(outputDir, 'release.json')), 'Choose a new output directory for each candidate build');
fs.mkdirSync(outputDir, { recursive: true });
const previous = JSON.parse(fs.readFileSync(path.join(previousDir, 'release.json')));
assert.equal(previous.release, RELEASE_ID);
assert.deepEqual(previous.failures, []);
assert.equal(previous.packages.length, RELEASE_PACKAGES.length);
const integrity = file => 'sha512-' + createHash('sha512').update(fs.readFileSync(file)).digest('base64');
for (const item of previous.packages) {
  assert.equal(path.basename(item.file), item.file);
  assert.equal(integrity(path.join(previousDir, item.file)), item.integrity, `Prior candidate integrity: ${item.installName}`);
}
const cliOnly = args.includes('--rebuild-cli-only');
if (cliOnly) assert.deepEqual(await verifyRelease(previousDir), [], 'CLI-only rebuild requires a complete verified M2 candidate');
const changed = new Set(cliOnly ? ['@expo/cli'] : ['@expo/cli', 'expo-modules-autolinking', 'expo-modules-core']);
const report = { release: RELEASE_ID, packages: [], failures: [], rebuilt: [...changed], reused: [] };
if (cliOnly) report.compatibility = previous.compatibility;
for (const descriptor of RELEASE_PACKAGES) {
  const old = previous.packages.find(item => item.installName === descriptor.installName);
  assert.ok(old, `Missing prior candidate: ${descriptor.installName}`);
  const archive = path.join(outputDir, old.file);
  if (changed.has(descriptor.installName)) {
    await stageBuildAndPack({ rootDir: process.cwd(), outputDir, descriptor, archiveFile: old.file,
      transform: async (directory, source) => {
        await transformPackage(directory, source);
        if (source.name === 'expo-modules-core') {
          report.compatibility = await prepareReleasedCompatibility({ rootDir: process.cwd(), corePackageRoot: directory,
            rnohHarPath: path.resolve(option('--rnoh-har')), screensHarPath: path.resolve(option('--screens-har')),
            workletsHarPath: path.resolve(option('--worklets-har')),
          });
        }
      },
    });
  } else {
    fs.copyFileSync(path.join(previousDir, old.file), archive);
    report.reused.push(descriptor.installName);
  }
  report.packages.push({ ...old, integrity: integrity(archive) });
  console.log(`${changed.has(descriptor.installName) ? 'BUILT' : 'REUSED'} ${descriptor.installName}`);
}
fs.writeFileSync(path.join(outputDir, 'release.json'), JSON.stringify(report, null, 2) + '\n');
assert.deepEqual(await verifyRelease(outputDir), [], 'M2 candidate verification failed');
console.log('PASS: M2 changed candidates built; complete release and compatibility verified');
