import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const flag = args.indexOf('--evidence-dir');
const evidence = path.resolve(flag < 0 ? 'outputs/sdk54/ai-e2e/20261027-m2-generation' : args[flag + 1]);
const consumer = JSON.parse(fs.readFileSync(path.join(evidence, 'consumers/generation-consumer-report.json')));
const native = JSON.parse(fs.readFileSync(path.join(evidence, 'native-build-report.json')));
assert.equal(consumer.passed, true);
assert.equal(native.passed, true);
assert.equal(native.releaseSha256, consumer.releaseSha256);
const project = consumer.results.find(item => item.pm === 'pnpm').project;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const digest = file => hash(fs.readFileSync(file));
function tree(root, prefix = '') {
  return fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const absolute = path.join(root, entry.name);
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isSymbolicLink()) return [{ path: relative, link: fs.readlinkSync(absolute) }];
    if (entry.isDirectory()) return [{ path: relative, directory: true }, ...tree(absolute, relative)];
    return [{ path: relative, sha256: digest(absolute), mode: fs.statSync(absolute).mode & 0o777 }];
  });
}
const source = path.join(project, 'harmony');
const built = path.join(project, 'harmony-hvigor');
const saved = path.join(project, 'harmony-before-run');
assert.equal(fs.existsSync(saved), false);
assert.equal(digest(path.join(consumer.runtime, 'release.json')), consumer.releaseSha256);
const original = tree(source);
assert.equal(hash(JSON.stringify(original)), consumer.snapshots.find(item => item.pm === 'pnpm').treeSHA256);
const dependencies = tree(path.join(project, 'node_modules'));
assert.deepEqual(dependencies, JSON.parse(fs.readFileSync(path.join(evidence, 'consumers/pnpm-dependency-tree-after.json'))));
assert.equal(digest(native.hap.builtAt), native.hap.sha256);
const report = { schemaVersion: 1, passed: false, releaseSha256: consumer.releaseSha256,
  dependencyTreeSHA256: hash(JSON.stringify(dependencies)), deviceRunPassed: false };
const log = path.join(evidence, 'run-harmony-integrity.log');
const request = createRequire(path.join(project, 'package.json'));
const studio = '/Applications/DevEco-Studio.app/Contents';
const commandArgs = [request.resolve('expo/bin/cli'), 'run:harmony', '--no-install', '--no-bundler',
  '--device', 'm2-no-device'];
fs.renameSync(source, saved);
try {
  fs.renameSync(built, source);
  const handle = fs.openSync(log, 'w');
  let result;
  try {
    result = spawnSync(process.execPath, commandArgs, { cwd: project, timeout: 300000,
      stdio: ['ignore', handle, handle], env: { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1',
        JAVA_HOME: path.join(studio, 'jbr/Contents/Home'), DEVECO_HOME: studio, DEVECO_SDK_HOME: path.join(studio, 'sdk'),
        PATH: [path.join(studio, 'tools/node/bin'), path.join(studio, 'tools/ohpm/bin'), '/usr/bin', '/bin'].join(':') } });
  } finally { fs.closeSync(handle); }
  report.command = { command: [process.execPath, ...commandArgs], exitCode: result.status, signal: result.signal,
    error: result.error?.message, log: path.basename(log), sha256: digest(log) };
  const text = fs.readFileSync(log, 'utf8');
  assert.notEqual(result.status, 0, 'Unavailable device target must not report successful execution');
  assert.equal(result.error, undefined, 'Run command must finish without timeout');
  assert.match(text, /BUILD SUCCESSFUL/, 'Real run must complete its build before device failure');
  assert.match(text, /Connect server failed|Unable to connect to the Harmony HDC server|No Harmony device|[Tt]arget.*[Nn]ot.*[Ff]ound|[Dd]evice.*[Nn]ot.*[Ff]ound|[Ff]ail.*[Cc]onnect|[Nn]ot connected/,
    'Expected unavailable-device diagnostic');
  assert.deepEqual(tree(path.join(project, 'node_modules')), dependencies);
  report.checks = ['REAL_CLI_PREBUILD_AND_BUILD', 'UNAVAILABLE_DEVICE_FAILURE', 'UNCHANGED_DEPENDENCY_SOURCE_AND_HAR'];
  report.limitations = ['Expected unavailable device target; installation, launch and device execution are not accepted'];
  report.passed = true;
} finally {
  try { if (fs.existsSync(source)) fs.renameSync(source, built); }
  finally {
    if (!fs.existsSync(source)) fs.renameSync(saved, source);
    else throw new Error(`Restore accepted native tree from ${saved}`);
    assert.deepEqual(tree(source), original);
    fs.writeFileSync(path.join(evidence, 'run-integrity-report.json'), JSON.stringify(report, null, 2) + '\n');
  }
}
console.log('PASS: real run host workflow preserved dependency sources; unavailable device correctly failed');
