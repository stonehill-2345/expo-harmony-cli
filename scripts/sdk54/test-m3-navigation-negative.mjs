import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const [reportPath, evidencePath] = process.argv.slice(2).map(value => path.resolve(value));
const consumer = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
assert.equal(consumer.passed, true);
assert.equal(consumer.completed, true);
assert.equal(fs.existsSync(evidencePath), false, 'Choose a fresh evidence file');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const digest = file => hash(fs.readFileSync(file));
assert.equal(digest(path.join(consumer.runtime, 'release.json')), consumer.releaseSha256);
function tree(root, prefix = '') {
  return fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const absolute = path.join(root, entry.name);
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isSymbolicLink()) return [{ path: relative, link: fs.readlinkSync(absolute) }];
    if (entry.isDirectory()) return [{ path: relative, directory: true }, ...tree(absolute, relative)];
    return [{ path: relative, sha256: digest(absolute), mode: fs.statSync(absolute).mode & 0o777 }];
  });
}
const result = consumer.results.find(item => item.pm === 'npm');
assert.equal(result?.passed, true);
const project = result.project;
const nativeRoot = path.join(project, 'harmony');
const dependenciesRoot = path.join(project, 'node_modules');
const native = tree(nativeRoot);
const dependencies = tree(dependenciesRoot);
assert.equal(hash(JSON.stringify(native)), result.nativeTreeSHA256);
assert.equal(hash(JSON.stringify(dependencies)), result.dependencyTreeSHA256);
const request = createRequire(path.join(project, 'package.json'));
const manifestPath = request.resolve('@react-native-ohos/react-native-screens/package.json');
const original = fs.readFileSync(manifestPath);
const manifest = JSON.parse(original);
assert.equal(manifest.name, '@expo-oh/react-native-screens');
assert.equal(manifest.version, '4.9.1');
const cli = request.resolve('expo/bin/cli');
let execution;
try {
  fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, version: '99.0.0' }, null, 2) + '\n');
  execution = spawnSync(process.execPath, [cli, 'prebuild', '--platform', 'harmony', '--no-install'], {
    cwd: project, encoding: 'utf8', timeout: 300000,
    env: { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1', EXPO_NO_UPDATE_CHECK: '1' },
  });
  assert.equal(execution.error, undefined);
  assert.notEqual(execution.status, 0);
  assert.match(execution.stdout + execution.stderr, /installed 99\.0\.0, supported 4\.9\.1/);
  assert.deepEqual(tree(nativeRoot), native);
} finally {
  fs.writeFileSync(manifestPath, original);
}
assert.deepEqual(tree(dependenciesRoot), dependencies);
assert.deepEqual(tree(nativeRoot), native);
fs.writeFileSync(evidencePath, JSON.stringify({ passed: true, releaseSha256: consumer.releaseSha256,
  consumerReportSha256: digest(reportPath), project, manifestPath, exitCode: execution.status,
  nativeTreeSHA256: result.nativeTreeSHA256, dependencyTreeSHA256: result.dependencyTreeSHA256,
  output: execution.stdout + execution.stderr }, null, 2) + '\n', { flag: 'wx' });
console.log('PASS: unknown navigation version rejects before writes; trees restored');
