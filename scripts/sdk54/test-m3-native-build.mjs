import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const option = (flag, fallback) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
const evidence = path.resolve(option('--evidence-dir', 'outputs/sdk54/ai-e2e/20261028-m3-author-contract/native'));
const consumerFile = path.resolve(option('--consumer-report', 'outputs/sdk54/ai-e2e/20261028-m3-author-contract/consumers/author-consumer-report.json'));
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const digest = file => hash(fs.readFileSync(file));
const consumer = json(consumerFile);
assert.equal(consumer.passed, true);
assert.equal(consumer.completed, true);
assert.equal(digest(path.join(consumer.runtime, 'release.json')), consumer.releaseSha256);
const pm = option('--pm', 'pnpm');
const result = consumer.results.find(item => item.pm === pm);
assert.equal(result?.passed, true);
const project = result.project;
const source = path.join(project, 'harmony');
const build = path.join(project, 'harmony-m3-build');
const saved = path.join(project, 'harmony-m3-accepted');
assert.equal(fs.existsSync(build), false, 'Choose a fresh native build directory');
assert.equal(fs.existsSync(saved), false, 'Unrestored native tree exists');
function tree(root, prefix = '') {
  return fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const absolute = path.join(root, entry.name);
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isSymbolicLink()) return [{ path: relative, link: fs.readlinkSync(absolute) }];
    if (entry.isDirectory()) return [{ path: relative, directory: true }, ...tree(absolute, relative)];
    return [{ path: relative, sha256: digest(absolute), mode: fs.statSync(absolute).mode & 0o777 }];
  });
}
const original = tree(source);
const dependencies = tree(path.join(project, 'node_modules'));
assert.equal(hash(JSON.stringify(original)), result.nativeTreeSHA256);
assert.equal(hash(JSON.stringify(dependencies)), result.dependencyTreeSHA256);
assert.deepEqual(dependencies, json(path.join(path.dirname(consumerFile), `${pm}-dependencies-final.json`)));
fs.mkdirSync(evidence, { recursive: true });
const report = { schemaVersion: 1, passed: false, releaseSha256: consumer.releaseSha256,
  consumerReportSha256: digest(consumerFile), project, build, commands: [], inputFiles: original.filter(item => item.sha256),
  deviceStatus: 'NOT_RUN', limitations: ['Unsigned Debug HAP does not accept device calls, reload, or signed Release'] };
const save = () => fs.writeFileSync(path.join(evidence, 'native-build-report.json'), JSON.stringify(report, null, 2) + '\n');
const studio = '/Applications/DevEco-Studio.app/Contents';
const env = { ...process.env, JAVA_HOME: path.join(studio, 'jbr/Contents/Home'), DEVECO_HOME: studio,
  DEVECO_SDK_HOME: path.join(studio, 'sdk'), PATH: [path.join(studio, 'tools/node/bin'), path.join(studio, 'tools/ohpm/bin'), '/usr/bin', '/bin'].join(':') };
function run(command, argv, cwd, logName) {
  const log = path.join(evidence, logName);
  const handle = fs.openSync(log, 'w');
  let executed;
  try { executed = spawnSync(command, argv, { cwd, env, stdio: ['ignore', handle, handle], timeout: 900000 }); }
  finally { fs.closeSync(handle); }
  report.commands.push({ command: [command, ...argv], cwd, exitCode: executed.status, signal: executed.signal,
    error: executed.error?.message, log: logName, logSha256: digest(log) });
  save();
  assert.equal(executed.error, undefined, logName);
  assert.equal(executed.status, 0, logName);
}
try {
  fs.cpSync(source, build, { recursive: true, dereference: false, verbatimSymlinks: true });
  assert.deepEqual(tree(build), original);
  fs.renameSync(source, saved);
  try {
    fs.renameSync(build, source);
    run(path.join(studio, 'tools/ohpm/bin/ohpm'), ['install'], path.join(source, 'entry'), 'ohpm.log');
    run(path.join(studio, 'tools/hvigor/bin/hvigorw'), ['--mode', 'module', '-p', 'product=default', '-p', 'module=entry@default',
      '-p', 'buildMode=debug', 'assembleHap', '--no-daemon', '--stacktrace'], source, 'hvigor.log');
    for (const file of report.inputFiles) assert.equal(digest(path.join(source, file.path)), file.sha256, `Changed native input ${file.path}`);
    assert.deepEqual(tree(path.join(project, 'node_modules')), dependencies);
  } finally {
    try { if (fs.existsSync(source)) fs.renameSync(source, build); }
    finally {
      assert.equal(fs.existsSync(source), false, `Restore accepted native tree from ${saved}`);
      fs.renameSync(saved, source);
    }
  }
  assert.deepEqual(tree(source), original);
  const hap = path.join(build, 'entry/build/default/outputs/default/entry-default-unsigned.hap');
  const output = path.join(evidence, 'entry-default-unsigned.hap');
  fs.copyFileSync(hap, output);
  const member = name => {
    const executed = spawnSync('/usr/bin/unzip', ['-p', output, name], { maxBuffer: 32 * 1024 * 1024 });
    assert.equal(executed.status, 0, name);
    return executed.stdout;
  };
  const compiled = JSON.parse(member('module.json'));
  const app = json(path.join(source, 'AppScope/app.json5')).app;
  assert.equal(compiled.app.bundleName, app.bundleName);
  assert.equal(compiled.app.versionName, app.versionName);
  assert.ok(compiled.module.metadata.some(item => item.name === 'expo.m3.author-fixture' && item.value === '1'));
  assert.deepEqual(member('resources/rawfile/app.config'), fs.readFileSync(path.join(source, 'entry/src/main/resources/rawfile/app.config')));
  report.hap = { path: output, builtAt: hap, sha256: digest(output), bytes: fs.statSync(output).size, bundleName: app.bundleName };
  report.dependencyTreeSHA256 = hash(JSON.stringify(dependencies));
  report.checks = ['REAL_OHPM_HVIGOR', 'SELF_CONTAINED_ETS_AND_CPP', 'UNCHANGED_NATIVE_INPUTS',
    'UNCHANGED_DEPENDENCIES', 'ACCEPTED_TREE_RESTORED', 'HAP_IDENTITY_PLUGIN_AND_CONSTANTS'];
  report.passed = true;
  console.log('PASS: M3 native HAP and candidate dependency integrity');
} catch (error) {
  report.error = error.stack;
  throw error;
} finally { save(); }
