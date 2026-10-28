import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const evidence = path.resolve(option('--evidence-dir', 'outputs/sdk54/ai-e2e/20261027-m2-generation'));
const consumerFile = path.join(evidence, 'consumers/generation-consumer-report.json');
const consumer = JSON.parse(fs.readFileSync(consumerFile));
assert.equal(consumer.passed, true, 'Generation consumer matrix must pass first');
const project = consumer.results.find(item => item.pm === option('--pm', 'pnpm'))?.project;
assert.ok(project, 'Missing accepted consumer project');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
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
const build = path.join(project, 'harmony-hvigor');
assert.equal(fs.existsSync(build), false, 'Use a fresh native build directory');
const dependencies = tree(path.join(project, 'node_modules'));
const sourceTree = tree(source);
assert.equal(digest(path.join(consumer.runtime, 'release.json')), consumer.releaseSha256, 'Frozen release changed');
const pm = option('--pm', 'pnpm');
assert.equal(hash(JSON.stringify(sourceTree)), consumer.snapshots.find(item => item.pm === pm)?.treeSHA256, 'Consumer native tree changed before build');
assert.deepEqual(dependencies, JSON.parse(fs.readFileSync(path.join(evidence, `consumers/${pm}-dependency-tree-after.json`))), 'Consumer dependencies changed before build');
fs.cpSync(source, build, { recursive: true, dereference: false, verbatimSymlinks: true });
assert.deepEqual(tree(build), sourceTree);
const report = { schemaVersion: 1, passed: false, releaseSha256: consumer.releaseSha256,
  consumerReportSha256: digest(consumerFile), project: build, copiedFrom: source,
  commands: [], inputFiles: sourceTree.filter(item => item.sha256), checks: [] };
const reportFile = path.join(evidence, 'native-build-report.json');
const writeReport = () => fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
const studio = '/Applications/DevEco-Studio.app/Contents';
const env = { ...process.env, JAVA_HOME: path.join(studio, 'jbr/Contents/Home'),
  DEVECO_HOME: studio, DEVECO_SDK_HOME: path.join(studio, 'sdk'),
  PATH: [path.join(studio, 'tools/node/bin'), path.join(studio, 'tools/ohpm/bin'), '/usr/bin', '/bin'].join(':') };
function run(command, commandArgs, cwd, logName, commandEnv = env) {
  const log = path.join(evidence, logName);
  const handle = fs.openSync(log, 'w');
  let result;
  try { result = spawnSync(command, commandArgs, { cwd, env: commandEnv, stdio: ['ignore', handle, handle], timeout: 900000 }); }
  finally { fs.closeSync(handle); }
  report.commands.push({ command: [command, ...commandArgs].join(' '), cwd, exitCode: result.status,
    error: result.error?.message, log: logName, sha256: digest(log) });
  writeReport();
  assert.equal(result.status, 0, `Native command failed; see ${log}`);
}
try {
  assert.deepEqual(tree(source), sourceTree, 'Source native tree changed');
  const savedSource = path.join(project, 'harmony-before-build');
  assert.equal(fs.existsSync(savedSource), false);
  fs.renameSync(source, savedSource);
  try {
    fs.renameSync(build, source);
    run(path.join(studio, 'tools/ohpm/bin/ohpm'), ['install'], path.join(source, 'entry'), 'hvigor-ohpm-install.log');
    run(path.join(studio, 'tools/hvigor/bin/hvigorw'), ['--mode', 'module', '-p', 'product=default', '-p', 'module=entry@default',
      '-p', 'buildMode=debug', 'assembleHap', '--no-daemon', '--stacktrace'], source, 'hvigor-assemble.log');
    for (const item of report.inputFiles) assert.equal(digest(path.join(source, item.path)), item.sha256, `Build changed input: ${item.path}`);
    assert.deepEqual(tree(path.join(project, 'node_modules')), dependencies, 'Build changed dependency source or HAR');
    const request = createRequire(path.join(project, 'package.json'));
    run(process.execPath, [request.resolve('expo/bin/cli'), 'prebuild', '--platform', 'harmony', '--no-install'],
      project, 'hvigor-post-build-prebuild.log', { ...env, CI: '1', EXPO_NO_TELEMETRY: '1',
        PATH: path.join(consumer.work, 'python-free-bin'), EXPO_HARMONY_PYTHON: '/nonexistent/python', PYTHON: '/nonexistent/python' });
    for (const item of report.inputFiles) assert.equal(digest(path.join(source, item.path)), item.sha256, `Regeneration changed build input: ${item.path}`);
    assert.deepEqual(tree(path.join(project, 'node_modules')), dependencies, 'Post-build generation changed dependencies');
  } finally {
    try {
      if (fs.existsSync(source)) fs.renameSync(source, build);
    } finally {
      if (!fs.existsSync(source)) fs.renameSync(savedSource, source);
      else throw new Error(`Restore accepted native tree from ${savedSource}; build directory could not be moved`);
    }
  }
  assert.deepEqual(tree(source), sourceTree, 'Accepted native tree changed during post-build check');
  const hapSource = path.join(build, 'entry/build/default/outputs/default/entry-default-unsigned.hap');
  const output = path.join(evidence, 'native-build');
  fs.mkdirSync(output, { recursive: true });
  const hap = path.join(output, 'entry-default-unsigned.hap');
  fs.copyFileSync(hapSource, hap);
  const readMember = member => {
    const result = spawnSync('/usr/bin/unzip', ['-p', hap, member], { maxBuffer: 32 * 1024 * 1024 });
    assert.equal(result.status, 0, `Missing HAP member: ${member}`);
    return result.stdout;
  };
  const app = JSON.parse(fs.readFileSync(path.join(build, 'AppScope/app.json5'))).app;
  const module = JSON.parse(readMember('module.json'));
  assert.equal(module.app.bundleName, app.bundleName);
  assert.equal(module.app.versionName, app.versionName);
  assert.equal(module.app.versionCode, app.versionCode);
  assert.deepEqual(readMember('resources/rawfile/app.config'), fs.readFileSync(path.join(build, 'entry/src/main/resources/rawfile/app.config')));
  report.hap = { path: hap, builtAt: hapSource, sha256: digest(hap), bytes: fs.statSync(hap).size };
  report.dependencyTreeSHA256 = hash(JSON.stringify(dependencies));
  report.checks = ['FINAL_CANDIDATE_GENERATION_MATRIX', 'UNCHANGED_NATIVE_INPUTS', 'UNCHANGED_DEPENDENCY_TREE',
    'ARKTS_AND_NATIVE_BUILD', 'POST_BUILD_PREBUILD_WITH_CACHES', 'HAP_IDENTITY', 'HAP_CONSTANTS_BYTES'];
  report.limitations = ['Unsigned debug HAP; no device execution or signed Release claim'];
  report.passed = true;
  console.log('PASS: M2 native build, dependency integrity and HAP contents verified');
} finally { writeReport(); }
