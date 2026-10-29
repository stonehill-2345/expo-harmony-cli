import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertExternalConsumerWorkspace } from './creation-workspace.mjs';

function physical(file) {
  const missing = [];
  let ancestor = path.resolve(file);
  while (!fs.existsSync(ancestor)) {
    missing.unshift(path.basename(ancestor)); ancestor = path.dirname(ancestor);
  }
  return path.join(fs.realpathSync(ancestor), ...missing);
}
function inside(parent, child) {
  return child === parent || child.startsWith(parent + path.sep);
}
function noLink(file) {
  try { assert.ok(!fs.lstatSync(file).isSymbolicLink(), `Benchmark paths must not be symlinks: ${file}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const marker = '.sdk54-prebuild-benchmark.json';
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function copy(source, target) {
  fs.cpSync(source, target, { recursive: true, verbatimSymlinks: true, preserveTimestamps: true, mode: fs.constants.COPYFILE_FICLONE });
}
export function inventory(directory) {
  const categories = {};
  function visit(dir, prefix = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const relative = path.posix.join(prefix, entry.name);
      const file = path.join(dir, entry.name);
      const stat = fs.lstatSync(file);
      const category = ['entry/.cxx', 'entry/build', '.hvigor', 'entry/oh_modules', 'oh_modules', 'expo-modules']
        .find(key => relative === key || relative.startsWith(key + '/')) ?? 'source-and-other';
      const row = categories[category] ??= { files: 0, links: 0, bytes: 0, allocatedBytes: 0 };
      if (stat.isSymbolicLink()) row.links++;
      else if (stat.isDirectory()) visit(file, relative);
      else if (stat.isFile()) { row.files++; row.bytes += stat.size; row.allocatedBytes += stat.blocks * 512; }
    }
  }
  if (fs.existsSync(directory)) visit(directory);
  return categories;
}
export function prepare(source, workspace, repository) {
  source = fs.realpathSync(source);
  workspace = physical(workspace);
  assertExternalConsumerWorkspace(workspace, repository);
  assert.ok(!fs.existsSync(workspace), 'Benchmark workspace must be new');
  assert.ok(!inside(source, workspace) && !inside(workspace, source), 'Workspace must be outside source consumer');
  assert.ok(fs.existsSync(path.join(source, 'node_modules/expo/bin/cli')), 'Use a complete installed consumer');
  fs.mkdirSync(workspace);
  const project = path.join(workspace, 'project');
  fs.mkdirSync(project);
  for (const entry of fs.readdirSync(source)) {
    if (['.git', '.expo', '.expo-harmony-generation', 'harmony'].includes(entry)) continue;
    copy(path.join(source, entry), path.join(project, entry));
  }
  fs.copyFileSync(path.join(project, 'app.json'), path.join(workspace, 'app.original.json'));
  fs.copyFileSync(path.join(project, 'package.json'), path.join(workspace, 'package.original.json'));
  fs.writeFileSync(path.join(workspace, marker), JSON.stringify({ source, project, repository: fs.realpathSync(repository), createdAt: new Date().toISOString() }, null, 2));
  return project;
}
function owned(workspace) {
  workspace = fs.realpathSync(workspace);
  noLink(path.join(workspace, marker));
  const metadata = JSON.parse(fs.readFileSync(path.join(workspace, marker)));
  const project = path.join(workspace, 'project');
  assert.equal(metadata.project, project);
  assertExternalConsumerWorkspace(workspace, metadata.repository);
  for (const name of ['app.original.json', 'package.original.json', 'project/app.json', 'project/package.json', 'project/.expo', 'project/.expo/harmony-backups', 'project/.expo-harmony-generation']) noLink(path.join(workspace, name));
  for (const directory of [project, ...['snapshot', 'generated-snapshot'].map(name => path.join(workspace, name)).filter(p => fs.existsSync(p))]) {
    assert.ok(!fs.lstatSync(directory).isSymbolicLink(), 'Benchmark paths must not be symlinks');
    assert.ok(fs.realpathSync(directory).startsWith(workspace + path.sep));
  }
  return { workspace, project };
}
async function run(command, args, cwd, log, env) {
  const fd = fs.openSync(log, 'w');
  const started = performance.now();
  try {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', fd, fd] });
    return await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (exitCode, signal) => resolve({ command: [command, ...args], exitCode, signal, seconds: (performance.now() - started) / 1000 }));
    });
  } finally { fs.closeSync(fd); }
}
export async function benchmark({ workspace, output, samples = 5, scenarios = ['built-noop', 'config-change'], label = 'candidate' }) {
  ({ workspace } = owned(workspace));
  const { project } = owned(workspace);
  assert.ok(Number.isInteger(samples) && samples >= 1 && samples <= 20);
  assert.ok(scenarios.every(x => ['first', 'generated-noop', 'built-noop', 'config-change', 'module-remove', 'clean'].includes(x)));
  output = physical(output);
  assert.ok(!inside(workspace, output) && !inside(output, workspace), 'Evidence must be outside the mutable benchmark workspace');
  assert.ok(!fs.existsSync(output), 'Evidence output must be new');
  fs.mkdirSync(output, { recursive: true });
  const env = { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1', EXPO_NO_UPDATE_CHECK: '1' };
  const report = { label, project, node: process.version, platform: process.platform, samples, measuredScope: 'CLI prebuild only; clone/restore and installation excluded', installedAutolinking: digest(path.join(project, 'node_modules/expo-modules-autolinking/build/platforms/harmony/generationState.js')), diagnostics: process.env.SDK54_BENCHMARK_DIAGNOSTICS === '1', snapshot: inventory(path.join(workspace, 'snapshot')), results: [], completed: false };
  const save = () => fs.writeFileSync(path.join(output, 'benchmark.json'), JSON.stringify(report, null, 2) + '\n');
  save();
  for (const scenario of scenarios) {
    const row = { scenario, runs: [] }; report.results.push(row);
    for (let index = 0; index <= samples; index++) {
      owned(workspace);
      const harmony = path.join(project, 'harmony');
      assert.ok(!fs.existsSync(path.join(project, '.expo-harmony-generation/lock.json')), 'Restore refused while a transaction lock exists');
      if (fs.existsSync(harmony)) assert.ok(!fs.lstatSync(harmony).isSymbolicLink());
      fs.rmSync(harmony, { recursive: true, force: true });
      if (scenario !== 'first') copy(path.join(workspace, scenario === 'generated-noop' ? 'generated-snapshot' : 'snapshot'), harmony);
      for (const name of ['app', 'package']) fs.copyFileSync(path.join(workspace, `${name}.original.json`), path.join(project, `${name}.json`));
      if (scenario === 'config-change') {
        const app = JSON.parse(fs.readFileSync(path.join(project, 'app.json')));
        app.expo.version = '1.0.1';
        fs.writeFileSync(path.join(project, 'app.json'), JSON.stringify(app, null, 2));
      }
      if (scenario === 'module-remove') {
        const app = JSON.parse(fs.readFileSync(path.join(project, 'package.json')));
        app.expo = { ...(app.expo ?? {}), autolinking: { harmony: { exclude: ['expo-font'] } } };
        fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify(app, null, 2));
      }
      const runEnv = { ...env };
      if (report.diagnostics) {
        const directory = path.join(output, `${scenario}-${index}-diagnostics`); fs.mkdirSync(directory);
        runEnv.SDK54_PREBUILD_DIAGNOSTICS = directory;
        runEnv.NODE_OPTIONS = `${env.NODE_OPTIONS ?? ''} --require=${fileURLToPath(new URL('./prebuild-diagnostics.cjs', import.meta.url))}`;
      }
      const beforeInode = fs.existsSync(harmony) ? fs.statSync(harmony).ino : null;
      const result = await run(process.execPath, ['node_modules/expo/bin/cli', 'prebuild', '--platform', 'harmony', '--no-install', ...(scenario === 'clean' ? ['--clean'] : [])], project, path.join(output, `${scenario}-${index}.log`), runEnv);
      result.beforeInode = beforeInode; result.afterInode = fs.statSync(harmony).ino;
      // clean retains full backups; record and remove only this owned disposable run's backup.
      const backups = path.join(project, '.expo/harmony-backups');
      owned(workspace);
      if (result.exitCode === 0 && scenario === 'clean' && fs.existsSync(backups)) {
        assert.ok(!fs.existsSync(path.join(project, '.expo-harmony-generation/lock.json')), 'Keep backups while a transaction lock exists');
        result.backup = inventory(backups); fs.rmSync(backups, { recursive: true });
      }
      row.runs.push({ warmup: index === 0, ...result }); save();
      console.log(JSON.stringify({ label, scenario, index, ...result }));
      assert.equal(result.exitCode, 0, 'Prebuild failed; keep workspace and log for recovery');
    }
    const times = row.runs.filter(r => !r.warmup).map(r => r.seconds).sort((a, b) => a - b);
    row.medianSeconds = times[Math.floor(times.length / 2)]; row.maxSeconds = times.at(-1); save();
  }
  report.completed = true; save();
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = name => args[args.indexOf(name) + 1];
  try {
    assert.ok(args.includes('--workspace'), 'Required: --workspace <new/existing owned directory>');
    const workspace = path.resolve(value('--workspace'));
    if (args.includes('--prepare-from')) console.log(prepare(value('--prepare-from'), workspace, process.cwd()));
    else if (args.includes('--snapshot')) {
      const { project } = owned(workspace); const name = value('--snapshot');
      assert.ok(['snapshot', 'generated-snapshot'].includes(name));
      assert.ok(!fs.existsSync(path.join(workspace, name)), 'Snapshot already exists');
      copy(path.join(project, 'harmony'), path.join(workspace, name));
      console.log(JSON.stringify(inventory(path.join(workspace, name))));
    } else {
      assert.ok(args.includes('--output'), 'Required: --output <new evidence directory>');
      await benchmark({ workspace, output: path.resolve(value('--output')), samples: args.includes('--samples') ? Number(value('--samples')) : 5,
        scenarios: args.includes('--scenarios') ? value('--scenarios').split(',') : undefined, label: args.includes('--label') ? value('--label') : undefined });
    }
  } catch (error) { console.error(error.stack); process.exitCode = 1; }
}
