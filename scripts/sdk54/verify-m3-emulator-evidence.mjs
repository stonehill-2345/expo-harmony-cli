import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const evidence = path.resolve('outputs/sdk54/ai-e2e/20261028-m3-author-contract');
const fixtureRoot = path.resolve('packages/expo-modules-core/harmony/m3-fixture');
const { checkLog } = createRequire(import.meta.url)(path.join(fixtureRoot, 'check-device.cjs'));
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const fileHash = file => sha(fs.readFileSync(file));
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const checkLive = process.argv.includes('--live');
function tree(root, prefix = '') {
  return fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const absolute = path.join(root, entry.name);
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isSymbolicLink()) return [{ path: relative, link: fs.readlinkSync(absolute) }];
    if (entry.isDirectory()) return [{ path: relative, directory: true }, ...tree(absolute, relative)];
    return [{ path: relative, sha256: fileHash(absolute), mode: fs.statSync(absolute).mode & 0o777 }];
  });
}
const release = path.join(evidence, 'runtime-alias-fixed/release.json');
const releaseHash = fileHash(release);
assert.equal(releaseHash, '3bfb790e225b71f7cb3939bfffc4b18664e4a73817c3987728697dfae491648f');
const cases = [
  { pm: 'pnpm', consumer: 'consumers-emulator-order', native: 'native-emulator-order', log: 'emulator-m3-order-hilog.log' },
  { pm: 'npm', consumer: 'consumers-npm-resume2', native: 'native-npm-resume2', log: 'emulator-m3-npm-hilog.log' },
];
const result = { releaseSha256: releaseHash, cases: [] };
let previousFiles;
for (const item of cases) {
  const consumerPath = path.join(evidence, item.consumer, 'author-consumer-report.json');
  const consumer = json(consumerPath);
  const nativePath = path.join(evidence, item.native, 'native-build-report.json');
  const native = json(nativePath);
  assert.equal(consumer.passed, true);
  assert.equal(consumer.completed, true);
  assert.equal(consumer.releaseSha256, releaseHash);
  assert.equal(consumer.results.length, 1);
  assert.equal(consumer.results[0].pm, item.pm);
  assert.equal(consumer.results[0].passed, true);
  assert.ok(consumer.results[0].checks.includes('REMOVE_PLUGIN_AND_DEPENDENCY_CLEARS_GENERATED_REGISTRATION'));
  assert.ok(consumer.results[0].checks.includes('REINSTALL_RESTORES_SINGLE_REGISTRATION_AND_PLUGIN'));
  for (const command of consumer.results[0].commands) {
    assert.equal(command.timedOut, false);
    assert.equal(fileHash(path.join(evidence, item.consumer, command.log)), command.logSha256);
  }
  assert.equal(native.passed, true);
  assert.equal(native.releaseSha256, releaseHash);
  assert.equal(native.consumerReportSha256, fileHash(consumerPath));
  for (const command of native.commands) {
    assert.equal(command.exitCode, 0);
    assert.equal(fileHash(path.join(evidence, item.native, command.log)), command.logSha256);
  }
  const hap = path.join(evidence, item.native, 'entry-default-unsigned.hap');
  assert.equal(fileHash(hap), native.hap.sha256);
  assert.equal(native.hap.bundleName, `com.example.m3${item.pm}`);
  const moduleJson = spawnSync('unzip', ['-p', hap, 'module.json'], { encoding: 'utf8' });
  assert.equal(moduleJson.status, 0, moduleJson.stderr);
  const compiled = JSON.parse(moduleJson.stdout);
  assert.equal(compiled.app.bundleName, native.hap.bundleName);
  assert.ok(compiled.module.metadata.some(entry => entry.name === 'expo.m3.author-fixture' && entry.value === '1'));
  const archive = path.join(evidence, item.consumer, path.basename(consumer.fixture.archive));
  assert.equal(fileHash(archive), consumer.fixture.sha256);
  assert.equal('sha512-' + crypto.createHash('sha512').update(fs.readFileSync(archive)).digest('base64'), consumer.fixture.integrity);
  const listing = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8' });
  assert.equal(listing.status, 0, listing.stderr);
  const files = listing.stdout.trim().split('\n').filter(name => name.startsWith('package/') && !name.endsWith('/')).sort();
  const hashes = {};
  for (const name of files) {
    const relative = name.slice('package/'.length);
    assert.ok(relative && !relative.split('/').includes('..') && !path.isAbsolute(relative));
    const extracted = spawnSync('tar', ['-xOzf', archive, name], { maxBuffer: 16 * 1024 * 1024 });
    assert.equal(extracted.status, 0, name);
    hashes[relative] = sha(extracted.stdout);
    if (relative !== 'README.md') assert.equal(hashes[relative], fileHash(path.join(fixtureRoot, relative)), relative);
    if (checkLive) {
      assert.equal(hashes[relative], fileHash(path.join(consumer.results[0].project, 'node_modules/@expo-harmony/m3-author-fixture', relative)), relative);
    }
  }
  const comparable = Object.fromEntries(Object.entries(hashes).filter(([name]) => name !== 'README.md'));
  if (previousFiles) assert.deepEqual(comparable, previousFiles);
  previousFiles = comparable;
  if (checkLive) {
    const project = consumer.results[0].project;
    assert.equal(sha(JSON.stringify(tree(path.join(project, 'harmony')))), consumer.results[0].nativeTreeSHA256);
    assert.equal(sha(JSON.stringify(tree(path.join(project, 'node_modules')))), consumer.results[0].dependencyTreeSHA256);
  }
  const log = path.join(evidence, item.log);
  assert.deepEqual(checkLog(fs.readFileSync(log, 'utf8')), { passed: true, errors: [], deviceStatus: 'PASS' });
  result.cases.push({ pm: item.pm, consumerSha256: fileHash(consumerPath), nativeReportSha256: fileHash(nativePath),
    fixtureSha256: fileHash(archive), hapSha256: fileHash(hap), logSha256: fileHash(log), packedFiles: files.length, liveTreesChecked: checkLive });
}
console.log(JSON.stringify(result, null, 2));
