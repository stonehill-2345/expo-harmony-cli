import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { prepare, benchmark } from '../benchmark-prebuild.mjs';

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prebuild-benchmark-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source'), repository = path.join(root, 'repo');
  fs.mkdirSync(repository);
  fs.mkdirSync(path.join(source, 'node_modules/expo/bin'), { recursive: true });
  fs.writeFileSync(path.join(source, 'node_modules/expo/bin/cli'), 'throw Error("must not run")');
  for (const name of ['app', 'package']) fs.writeFileSync(path.join(source, name + '.json'), '{}');
  return { root, source, repository, workspace: path.join(root, 'workspace') };
}
function installAutolinking(source) {
  const installed = path.join(source, 'node_modules/expo-modules-autolinking');
  const repositoryPackage = path.resolve('packages/expo-modules-autolinking');
  fs.mkdirSync(installed);
  fs.cpSync(path.join(repositoryPackage, 'build'), path.join(installed, 'build'), { recursive: true });
  fs.copyFileSync(path.join(repositoryPackage, 'package.json'), path.join(installed, 'package.json'));
  fs.symlinkSync(path.join(repositoryPackage, 'node_modules'), path.join(installed, 'node_modules'), 'dir');
  const fingerprint = path.join(installed, 'build/platforms/harmony/generationState.js');
  fs.writeFileSync(fingerprint, 'fixture');
}
function installHarmonyModule(source, name, version = '1.2.3') {
  const root = path.join(source, 'node_modules', name);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name, version }));
  fs.writeFileSync(path.join(root, 'expo-module.config.json'), JSON.stringify({
    platforms: ['harmony'],
    harmony: {},
  }));
}
test('prepare refuses existing, nested and repository-alias workspaces without touching source', t => {
  const { root, source, repository, workspace } = fixture(t);
  assert.throws(() => prepare(source, source, repository), /must be new/);
  assert.throws(() => prepare(source, path.join(source, 'nested'), repository), /outside source/);
  fs.symlinkSync(repository, path.join(root, 'repo-alias'));
  assert.throws(() => prepare(source, path.join(root, 'repo-alias', 'nested'), repository), /outside the source repository/);
  prepare(source, workspace, repository);
  const sourceStat = fs.statSync(path.join(source, 'app.json'), { bigint: true });
  const copiedStat = fs.statSync(path.join(workspace, 'project/app.json'), { bigint: true });
  assert.equal(copiedStat.mtimeNs, sourceStat.mtimeNs);
  assert.notEqual(copiedStat.ino, sourceStat.ino);
  assert.throws(() => prepare(source, workspace, repository), /must be new/);
  assert.equal(fs.readFileSync(path.join(source, 'app.json'), 'utf8'), '{}');
});
test('benchmark rejects output aliases inside its mutable project before restoring', async t => {
  const { root, source, repository, workspace } = fixture(t);
  prepare(source, workspace, repository);
  fs.symlinkSync(path.join(workspace, 'project'), path.join(root, 'alias'));
  await assert.rejects(benchmark({ workspace, output: path.join(root, 'alias/logs') }), /outside the mutable/);
  assert.equal(fs.existsSync(path.join(workspace, 'project/logs')), false);
});
test('benchmark rejects replaced config, project and snapshot symlinks', async t => {
  const { root, source, repository, workspace } = fixture(t);
  prepare(source, workspace, repository);
  const config = path.join(workspace, 'project/app.json');
  fs.unlinkSync(config); fs.symlinkSync(path.join(source, 'app.json'), config);
  await assert.rejects(benchmark({ workspace, output: path.join(root, 'logs') }), /symlink/);
  assert.equal(fs.readFileSync(path.join(source, 'app.json'), 'utf8'), '{}');
  fs.unlinkSync(config); fs.writeFileSync(config, '{}');
  fs.symlinkSync(source, path.join(workspace, 'snapshot'));
  await assert.rejects(benchmark({ workspace, output: path.join(root, 'logs') }), /symlink/);
  fs.unlinkSync(path.join(workspace, 'snapshot'));
  fs.renameSync(path.join(workspace, 'project'), path.join(workspace, 'saved'));
  fs.symlinkSync(source, path.join(workspace, 'project'));
  await assert.rejects(benchmark({ workspace, output: path.join(root, 'logs') }), /symlink|outside/);
});

test('benchmark adds an installed module from the original package for every sample', async t => {
  const { root, source, repository, workspace } = fixture(t);
  installAutolinking(source);
  installHarmonyModule(source, 'expo-added');
  fs.writeFileSync(path.join(source, 'node_modules/expo/bin/cli'), `
    const fs = require('node:fs');
    const pkg = JSON.parse(fs.readFileSync('package.json'));
    if (pkg.dependencies?.['expo-added'] !== '1.2.3') process.exit(2);
    fs.mkdirSync('harmony', { recursive: true });
  `);
  prepare(source, workspace, repository);
  fs.mkdirSync(path.join(workspace, 'snapshot'));

  const report = await benchmark({
    workspace,
    output: path.join(root, 'logs'),
    samples: 1,
    scenarios: ['module-add'],
    moduleName: 'expo-added',
  });

  assert.equal(report.completed, true);
  assert.equal(report.results[0].runs.length, 2);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(workspace, 'project/package.json'))), {
    dependencies: { 'expo-added': '1.2.3' },
  });
});

test('benchmark restores the original package before repeated module-add graph checks', async t => {
  const { root, source, repository, workspace } = fixture(t);
  installAutolinking(source);
  installHarmonyModule(source, 'expo-added');
  fs.writeFileSync(path.join(source, 'node_modules/expo/bin/cli'), `require('node:fs').mkdirSync('harmony', { recursive: true });`);
  prepare(source, workspace, repository);
  fs.mkdirSync(path.join(workspace, 'snapshot'));

  const options = { workspace, samples: 1, scenarios: ['module-add'], moduleName: 'expo-added' };
  const first = await benchmark({ ...options, output: path.join(root, 'logs-first') });
  const second = await benchmark({ ...options, output: path.join(root, 'logs-second') });

  assert.equal(first.completed, true);
  assert.equal(second.completed, true);
});

test('benchmark rejects modules already present through configured search paths', async t => {
  const { root, source, repository, workspace } = fixture(t);
  fs.writeFileSync(path.join(source, 'package.json'), JSON.stringify({
    expo: { autolinking: { harmony: { searchPaths: ['./node_modules'] } } },
  }));
  installAutolinking(source);
  installHarmonyModule(source, 'expo-added');
  fs.writeFileSync(path.join(source, 'node_modules/expo/bin/cli'), `require('node:fs').mkdirSync('harmony', { recursive: true });`);
  prepare(source, workspace, repository);
  fs.mkdirSync(path.join(workspace, 'snapshot'));

  await assert.rejects(
    benchmark({ workspace, output: path.join(root, 'logs'), samples: 1, scenarios: ['module-add'], moduleName: 'expo-added' }),
    /already present in the Harmony Autolinking graph/i
  );
});

test('benchmark allows a module referenced only by a nested optional dependency', async t => {
  const { root, source, repository, workspace } = fixture(t);
  fs.writeFileSync(path.join(source, 'package.json'), JSON.stringify({ dependencies: { bridge: '1.0.0' } }));
  fs.mkdirSync(path.join(source, 'node_modules/bridge'), { recursive: true });
  fs.writeFileSync(path.join(source, 'node_modules/bridge/package.json'), JSON.stringify({
    name: 'bridge',
    version: '1.0.0',
    optionalDependencies: { 'expo-added': '1.2.3' },
  }));
  installAutolinking(source);
  installHarmonyModule(source, 'expo-added');
  fs.writeFileSync(path.join(source, 'node_modules/expo/bin/cli'), `require('node:fs').mkdirSync('harmony', { recursive: true });`);
  prepare(source, workspace, repository);
  fs.mkdirSync(path.join(workspace, 'snapshot'));

  const report = await benchmark({
    workspace,
    output: path.join(root, 'logs'),
    samples: 1,
    scenarios: ['module-add'],
    moduleName: 'expo-added',
  });
  assert.equal(report.completed, true);
});

test('benchmark reports peak Node memory for every diagnostics sample', async t => {
  const { root, source, repository, workspace } = fixture(t);
  fs.mkdirSync(path.join(source, 'node_modules/expo-modules-autolinking/build/platforms/harmony'), { recursive: true });
  fs.writeFileSync(path.join(source, 'node_modules/expo-modules-autolinking/build/platforms/harmony/generationState.js'), 'fixture');
  fs.writeFileSync(path.join(source, 'node_modules/expo/bin/cli'), `
    const fs = require('node:fs');
    global.__memoryFixture = Buffer.alloc(8 * 1024 * 1024);
    fs.mkdirSync('harmony', { recursive: true });
  `);
  prepare(source, workspace, repository);
  fs.mkdirSync(path.join(workspace, 'snapshot'));
  const previous = process.env.SDK54_BENCHMARK_DIAGNOSTICS;
  process.env.SDK54_BENCHMARK_DIAGNOSTICS = '1';
  t.after(() => {
    if (previous === undefined) delete process.env.SDK54_BENCHMARK_DIAGNOSTICS;
    else process.env.SDK54_BENCHMARK_DIAGNOSTICS = previous;
  });

  const output = path.join(root, 'logs');
  const report = await benchmark({ workspace, output, samples: 1, scenarios: ['built-noop'] });

  for (const run of report.results[0].runs) {
    assert.equal(run.memory.unit, 'bytes');
    for (const name of ['rss', 'external', 'arrayBuffers']) assert.ok(run.memory.peak[name] > 0, name);
    assert.ok(!path.isAbsolute(run.memory.evidence));
    assert.ok(fs.existsSync(path.join(output, run.memory.evidence)));
  }
});
