import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  parseBlackboxArgs,
  runPackedCliBlackbox,
} from '../blackbox-packed-cli.mjs';

const FAKE_CLI = String.raw`#!/usr/bin/env node
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const behavior = JSON.parse(fs.readFileSync(path.join(__dirname, '../behavior.json'), 'utf8'));
const argv = process.argv.slice(2);
const command = argv[0];

if (process.env.FAKE_CLI_LOG) {
  fs.appendFileSync(process.env.FAKE_CLI_LOG, JSON.stringify({
    bin: fs.realpathSync(__filename),
    cwd: process.cwd(),
    argv,
  }) + '\n');
}

function runtimeHealthy(root) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/fake-runtime/package.json'), 'utf8'));
    return pkg.version === '1.0.0' && fs.existsSync(path.join(root, 'node_modules/fake-runtime/PATCHED'));
  } catch {
    return false;
  }
}

if (command === 'create') {
  const projectName = argv[1];
  const templateIndex = argv.indexOf('--template');
  const template = templateIndex === -1 ? 'default' : argv[templateIndex + 1];
  const packageManager = argv.includes('--npm') ? 'npm' : 'pnpm';
  const projectRoot = path.join(process.cwd(), projectName);
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({
    name: projectName,
    private: true,
    scripts: { postinstall: 'node apply-patch.cjs' },
    fakeTemplate: template,
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(projectRoot, 'apply-patch.cjs'), [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const root = path.join(__dirname, 'node_modules/fake-runtime');",
    "fs.mkdirSync(root, { recursive: true });",
    "fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '" + (behavior.mode === 'wrong-version' ? '0.0.0' : '1.0.0') + "' }));",
    "fs.writeFileSync(path.join(root, 'PATCHED'), 'yes\\n');",
  ].join('\n') + '\n');
  fs.mkdirSync(path.join(projectRoot, '.expo-harmony'), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, '.expo-harmony/managed-state.json'), JSON.stringify({
    version: 2,
    sdk54: { mode: 'sdk54-package-patch', template },
  }));
  if (behavior.mode === 'template-drift') {
    console.error('template contract drift');
    process.exit(7);
  }
  const installArgs = packageManager === 'npm'
    ? ['install', '--no-audit', '--no-fund']
    : ['install', '--reporter=silent'];
  childProcess.execFileSync(packageManager, installArgs, { cwd: projectRoot, env: process.env, stdio: 'pipe' });
  console.log('created ' + template);
} else if (command === 'doctor') {
  if (runtimeHealthy(process.cwd())) {
    console.log('✓ runtime probes');
  } else {
    console.error('✗ runtime probes missing or wrong patch version');
    process.exitCode = 1;
  }
} else if (command === 'prebuild') {
  if (!runtimeHealthy(process.cwd())) {
    console.error('runtime probes failed before prebuild');
    process.exit(1);
  }
  if (behavior.mode !== 'missing-prebuild-output') {
    fs.mkdirSync(path.join(process.cwd(), 'harmony'), { recursive: true });
    fs.writeFileSync(path.join(process.cwd(), 'harmony/created-by-installed-cli'), 'yes\n');
  }
  console.log('prebuild harmony');
} else {
  console.error('unexpected command: ' + command);
  process.exit(2);
}
`;

function makeFakeCliTgz(root, mode = 'healthy') {
  const packageDir = path.join(root, `fake-cli-${mode}`);
  const packDir = path.join(root, 'packed');
  fs.mkdirSync(packageDir, { recursive: true });
  fs.mkdirSync(packDir, { recursive: true });
  fs.mkdirSync(path.join(packageDir, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({
    name: `fake-expo-harmony-cli-${mode}`,
    version: '1.5.0',
    bin: { 'expo-harmony-cli': 'dist/index.cjs' },
    files: ['dist', 'behavior.json'],
  }, null, 2));
  fs.writeFileSync(path.join(packageDir, 'behavior.json'), JSON.stringify({ mode }));
  fs.writeFileSync(path.join(packageDir, 'dist/index.cjs'), FAKE_CLI, { mode: 0o755 });
  const output = execFileSync('npm', [
    'pack', '--ignore-scripts', '--json', '--pack-destination', packDir,
  ], {
    cwd: packageDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      npm_config_cache: path.join(root, '.npm-cache'),
      npm_config_update_notifier: 'false',
    },
  });
  return path.join(packDir, JSON.parse(output)[0].filename);
}

function tempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'packed-cli-blackbox-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function withFixtureEnv(root, callback) {
  const previous = {
    FAKE_CLI_LOG: process.env.FAKE_CLI_LOG,
    npm_config_cache: process.env.npm_config_cache,
    npm_config_update_notifier: process.env.npm_config_update_notifier,
  };
  process.env.FAKE_CLI_LOG = path.join(root, 'fake-cli.log');
  const blockedCache = path.join(root, 'blocked-npm-cache');
  fs.writeFileSync(blockedCache, 'not a directory\n');
  process.env.npm_config_cache = blockedCache;
  process.env.npm_config_update_notifier = 'false';
  return Promise.resolve()
    .then(callback)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

function assertReportIsPortable(report, root, cliTgz) {
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes(root), false, serialized);
  assert.equal(serialized.includes(cliTgz), false, serialized);
  assert.equal(serialized.includes(process.cwd()), false, serialized);
  for (const command of report.commands) {
    assert.equal(path.isAbsolute(command.file), false, command.file);
    for (const arg of command.args) assert.equal(path.isAbsolute(arg), false, arg);
  }
}

test('installs the TGZ into an isolated harness and uses only its bin for normal reinstall', async (t) => {
  const root = tempRoot(t);
  const cliTgz = makeFakeCliTgz(root);

  await withFixtureEnv(root, async () => {
    for (const [template, packageManager] of [
      ['blank-typescript', 'npm'],
      ['default', 'pnpm'],
    ]) {
      const workDir = path.join(root, `${template}-${packageManager}`);
      const report = await runPackedCliBlackbox({
        cliTgz,
        workDir,
        template,
        packageManager,
        lifecycle: 'normal',
        noDevice: true,
      });

      assert.deepEqual(report.failures, []);
      assert.equal(report.cliTgzFile, path.basename(cliTgz));
      assert.equal(report.checks.cliInstalledFromTgz, true);
      assert.equal(report.checks.createPassed, true);
      assert.equal(report.checks.initialRuntimeProbePassed, true);
      assert.equal(report.checks.prebuildPassed, true);
      assert.equal(report.checks.normalReinstallRestoredPatch, true);
      assert.equal(report.checks.deviceSkipped, true);
      assert.ok(report.commands.some((command) => command.file === 'harness/node_modules/.bin/expo-harmony-cli'));
      assert.ok(report.commands.some((command) => command.file === packageManager && command.args[0] === 'install'));
      assertReportIsPortable(report, root, cliTgz);
    }

    const invocations = fs.readFileSync(process.env.FAKE_CLI_LOG, 'utf8').trim().split('\n').map(JSON.parse);
    assert.ok(invocations.length >= 8);
    for (const invocation of invocations) {
      assert.match(invocation.bin, /harness[/\\]node_modules[/\\]fake-expo-harmony-cli-healthy[/\\]dist[/\\]index\.cjs$/);
      assert.equal(invocation.bin.startsWith(path.join(process.cwd(), 'node_modules')), false);
    }
  });
});

test('treats --ignore-scripts runtime-probe failure as the required negative result', async (t) => {
  const root = tempRoot(t);
  const cliTgz = makeFakeCliTgz(root);

  await withFixtureEnv(root, async () => {
    const report = await runPackedCliBlackbox({
      cliTgz,
      workDir: path.join(root, 'ignore-scripts'),
      template: 'default',
      packageManager: 'npm',
      lifecycle: 'ignore-scripts',
      noDevice: true,
    });

    assert.deepEqual(report.failures, []);
    assert.equal(report.checks.ignoreScriptsRuntimeProbeRejected, true);
    assert.ok(report.commands.some((command) => command.file === 'npm' && command.args.includes('--ignore-scripts')));
    const doctors = report.commands.filter((command) => command.args[0] === 'doctor');
    assert.equal(doctors.at(-1).exitCode, 1);
    assertReportIsPortable(report, root, cliTgz);
  });
});

test('fails closed for wrong patched package versions and template drift', async (t) => {
  const root = tempRoot(t);

  await withFixtureEnv(root, async () => {
    const wrongVersionTgz = makeFakeCliTgz(root, 'wrong-version');
    const wrongVersion = await runPackedCliBlackbox({
      cliTgz: wrongVersionTgz,
      workDir: path.join(root, 'wrong-version'),
      template: 'blank-typescript',
      packageManager: 'npm',
      lifecycle: 'normal',
      noDevice: true,
    });
    assert.ok(wrongVersion.failures.some((failure) => /initial runtime probe/i.test(failure)), wrongVersion.failures.join('\n'));
    assert.equal(wrongVersion.checks.initialRuntimeProbePassed, false);
    assertReportIsPortable(wrongVersion, root, wrongVersionTgz);

    const driftTgz = makeFakeCliTgz(root, 'template-drift');
    const drift = await runPackedCliBlackbox({
      cliTgz: driftTgz,
      workDir: path.join(root, 'template-drift'),
      template: 'default',
      packageManager: 'pnpm',
      lifecycle: 'normal',
      noDevice: true,
    });
    assert.ok(drift.failures.some((failure) => /template contract drift/i.test(failure)), drift.failures.join('\n'));
    assert.equal(drift.checks.createPassed, false);
    assertReportIsPortable(drift, root, driftTgz);
  });
});

test('parses template, package-manager, lifecycle and no-device CLI selectors', () => {
  assert.deepEqual(parseBlackboxArgs([
    '--cli-tgz', './expo-harmony-cli-1.5.0.tgz',
    '--work-dir', './blackbox',
    '--template', 'all',
    '--package-manager', 'all',
    '--lifecycle', 'all',
    '--no-device',
  ]), {
    cliTgz: './expo-harmony-cli-1.5.0.tgz',
    workDir: './blackbox',
    templates: ['blank-typescript', 'default'],
    packageManagers: ['npm', 'pnpm'],
    lifecycles: ['normal', 'ignore-scripts'],
    noDevice: true,
  });
  assert.throws(() => parseBlackboxArgs([
    '--cli-tgz', './cli.tgz', '--work-dir', './blackbox', '--template', 'default',
    '--package-manager', 'npm', '--lifecycle', 'normal',
  ]), /--no-device/);
});


test('fails closed when prebuild exits zero without creating the Harmony project', async (t) => {
  const root = tempRoot(t);
  const cliTgz = makeFakeCliTgz(root, 'missing-prebuild-output');
  await withFixtureEnv(root, async () => {
    const report = await runPackedCliBlackbox({
      cliTgz,
      workDir: path.join(root, 'missing-prebuild-output'),
      template: 'blank-typescript',
      packageManager: 'npm',
      lifecycle: 'normal',
      noDevice: true,
    });
    assert.equal(report.checks.prebuildPassed, false);
    assert.ok(report.failures.some((failure) => /Harmony project/i.test(failure)), report.failures.join('\n'));
  });
});
