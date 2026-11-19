import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { verifyRelease } from './verify-npm-release.mjs';
import { validateInstall, validateMetro } from './m3-review-bindings.mjs';

const base = path.resolve('outputs/sdk54/ai-e2e/20261028-m3-author-contract');
const fixture = path.resolve('packages/expo-modules-core/harmony/m3-fixture');
const checkLog = createRequire(import.meta.url)(path.join(fixture, 'check-device.cjs')).checkLog;
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const digest = file => hash(fs.readFileSync(file));
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const run = (command, args) => {
  const result = spawnSync(command, args, { maxBuffer: 128 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr?.toString());
  return result.stdout;
};
function tree(root, prefix = '') {
  return fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const absolute = path.join(root, entry.name), relative = path.posix.join(prefix, entry.name);
    if (entry.isSymbolicLink()) return [{ path: relative, link: fs.readlinkSync(absolute) }];
    if (entry.isDirectory()) return [{ path: relative, directory: true }, ...tree(absolute, relative)];
    return [{ path: relative, sha256: digest(absolute), mode: fs.statSync(absolute).mode & 0o777 }];
  });
}
const releaseDir = path.join(base, 'runtime-independent-review');
const releaseHash = digest(path.join(releaseDir, 'release.json'));
assert.equal(releaseHash, '8ccbf3a6b6f923e9695e353e80039a5f4ce8df2ff640587b6a20a268f377f852');
assert.deepEqual(await verifyRelease(releaseDir), []);
for (const [archiveName, sourceRoot, selected] of [
  ['expo-oh-expo-modules-core-3.0.31.tgz', 'packages/expo-modules-core', ['harmony/src/']],
  ['expo-oh-expo-modules-autolinking-3.0.28.tgz', 'packages/expo-modules-autolinking', [
    'src/autolinking/findModules.ts', 'src/autolinking/resolveModules.ts', 'src/platforms/harmony/harmony.ts',
    'src/platforms/harmony/nativeProject.ts', 'src/platforms/harmony/rnohConfig.ts',
    'src/platforms/harmony/moduleValidation.ts', 'src/types.ts']],
]) {
  const packageArchive = path.join(releaseDir, archiveName);
  const entries = run('tar', ['-tzf', packageArchive]).toString().trim().split('\n')
    .filter(name => !name.endsWith('/') && selected.some(prefix => name.slice(8).startsWith(prefix)));
  assert.ok(entries.length >= selected.length);
  for (const entry of entries) assert.equal(hash(run('tar', ['-xOzf', packageArchive, entry])), digest(path.join(sourceRoot, entry.slice(8))), entry);
}
const consumerPath = path.join(base, 'consumers-final-review2/author-consumer-report.json');
const consumer = json(consumerPath);
assert.ok(consumer.passed && consumer.completed);
assert.equal(consumer.releaseSha256, releaseHash);
const archive = path.join(base, 'consumers-final-review2', path.basename(consumer.fixture.archive));
assert.equal(digest(archive), consumer.fixture.sha256);
const files = run('tar', ['-tzf', archive]).toString().trim().split('\n').filter(n => n.startsWith('package/') && !n.endsWith('/'));
for (const file of files) {
  const relative = file.slice('package/'.length);
  assert.ok(relative && !relative.split('/').includes('..'));
  assert.equal(hash(run('tar', ['-xOzf', archive, file])), digest(path.join(fixture, relative)), relative);
}
const navigation = path.join(base, 'navigation-negative-review2.json');
assert.equal(json(navigation).releaseSha256, releaseHash);
assert.equal(json(navigation).consumerReportSha256, digest(consumerPath));
assert.equal(json(navigation).passed, true);
const result = { releaseSha256: releaseHash, consumerSha256: digest(consumerPath), fixtureSha256: digest(archive), navigationSha256: digest(navigation), cases: [] };
for (const [pm, pid, serverLog, installIndex] of [['npm', '30151', 'bundle-server.log', 2], ['pnpm', '31366', 'bundle-server-final.log', 1]]) {
  const item = consumer.results.find(row => row.pm === pm);
  assert.ok(item?.passed);
  assert.deepEqual(item.checks, ['UNLISTED_TGZ_REAL_INSTALL_AND_AUTOLINKING', 'PLUGIN_AND_NATIVE_REGISTRATION',
    'IDEMPOTENT_GENERATION_AND_UNCHANGED_DEPENDENCIES', 'MISSING_SOURCE_FAILS_WITH_OLD_TREE_PRESERVED',
    'REAL_INSTALLED_NATIVE_CONFLICT_REPORTS_BOTH_SOURCES_BEFORE_WRITES', 'TRANSITIVE_REFERENCE_PRESERVES_NATIVE_MODULE_WITHOUT_PLUGIN',
    'REMOVE_PLUGIN_AND_DEPENDENCY_CLEARS_GENERATED_REGISTRATION', 'UNINSTALLED_PLUGIN_REJECTED_WITHOUT_NATIVE_OR_DEPENDENCY_WRITES',
    'REINSTALL_RESTORES_SINGLE_REGISTRATION_AND_PLUGIN']);
  assert.equal(hash(JSON.stringify(tree(path.join(item.project, 'node_modules')))), item.dependencyTreeSHA256);
  assert.equal(hash(JSON.stringify(tree(path.join(item.project, 'harmony')))), item.nativeTreeSHA256);
  for (const command of item.commands) {
    assert.equal(command.timedOut, false);
    assert.equal(digest(path.join(base, 'consumers-final-review2', command.log)), command.logSha256);
  }
  const nativeDir = path.join(base, `native-review2-${pm}`), nativePath = path.join(nativeDir, 'native-build-report.json');
  const native = json(nativePath), hap = path.join(nativeDir, 'entry-default-unsigned.hap');
  assert.ok(native.passed);
  assert.equal(native.releaseSha256, releaseHash);
  assert.equal(native.consumerReportSha256, digest(consumerPath));
  assert.equal(digest(hap), native.hap.sha256);
  assert.equal(native.hap.bundleName, `com.example.m3${pm}`);
  for (const command of native.commands) {
    assert.equal(command.exitCode, 0);
    assert.equal(digest(path.join(nativeDir, command.log)), command.logSha256);
  }
  const moduleJson = JSON.parse(run('unzip', ['-p', hap, 'module.json']).toString());
  assert.equal(moduleJson.app.bundleName, native.hap.bundleName);
  assert.ok(moduleJson.module.metadata.some(row => row.name === 'expo.m3.author-fixture' && row.value === '1'));
  assert.ok(run('unzip', ['-p', hap, 'libs/arm64-v8a/librnoh_app.so']).includes(Buffer.from('M3_NATIVE_BUILD=m3-review-20261028-v2')));
  const deviceDir = path.join(base, `device-review2-${pm}`), device = path.join(deviceDir, 'device.log');
  const log = fs.readFileSync(device, 'utf8');
  assert.ok(log.trim().split('\n').every(line => line.trim().split(/\s+/)[2] === pid));
  assert.match(fs.readFileSync(path.join(deviceDir, 'process.log'), 'utf8'), new RegExp(`\\b${pid}\\b.*com\\.example\\.m3${pm}\\b`));
  assert.deepEqual(checkLog(log), { passed: true, errors: [], deviceStatus: 'PASS' });
  assert.ok(validateInstall(fs.readFileSync(path.join(deviceDir, `ordered-${installIndex}.log`), 'utf8'), hap));
  assert.match(fs.readFileSync(path.join(deviceDir, pm === 'npm' ? 'ordered-3.log' : 'ordered-2.log'), 'utf8'), /clean bundle data files successfully/);
  assert.match(fs.readFileSync(path.join(deviceDir, pm === 'npm' ? 'ordered-5.log' : 'ordered-4.log'), 'utf8'), /start ability successfully/);
  const bundle = path.join(deviceDir, 'index.bundle'), bundleHash = digest(bundle);
  assert.equal(digest(path.join(deviceDir, 'index-rebuilt.bundle')), bundleHash);
  assert.ok(validateMetro(fs.readFileSync(path.join(deviceDir, 'metro-rebuild.log'), 'utf8'), fs.realpathSync(item.project)));
  const requests = fs.readFileSync(path.join(deviceDir, serverLog), 'utf8').trim().split('\n').map(JSON.parse)
    .filter(row => row.status === 200 && row.url?.startsWith('/index.bundle?'));
  assert.equal(requests.length, 2);
  assert.ok(requests.every(row => row.sha256 === bundleHash));
  assert.ok(fs.readFileSync(bundle).includes(Buffer.from('M3_JS_BUILD=m3-review-20261028-v2')));
  result.cases.push({ pm, pid, nativeReportSha256: digest(nativePath), hapSha256: digest(hap), bundleSha256: bundleHash,
    deviceLogSha256: digest(device), serverLogSha256: digest(path.join(deviceDir, serverLog)), requests: requests.length });
}
console.log(JSON.stringify(result, null, 2));
