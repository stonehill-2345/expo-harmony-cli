#!/usr/bin/env node
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATES = ['blank-typescript', 'default'];
const PACKAGE_MANAGERS = ['npm', 'pnpm'];
const LIFECYCLES = ['normal', 'ignore-scripts'];
const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/g;

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function slash(value) {
  return value.split(path.sep).join('/');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function portableText(value, roots = []) {
  let text = String(value ?? '');
  for (const root of [...roots].sort((left, right) => right.length - left.length)) {
    if (!root) continue;
    text = text.replace(new RegExp(escapeRegExp(root), 'g'), '<workDir>');
  }
  return text
    .replace(/(^|[\s("'=])\/(?:[^/\s"'():]+\/)*[^/\s"'():]*/g, '$1<absolute-path>')
    .replace(/[A-Za-z]:\\(?:[^\\\s"'():]+\\)*[^\\\s"'():]*/g, '<absolute-path>');
}

function commandFileForReport(file, scenarioRoot) {
  if (!path.isAbsolute(file)) return slash(file);
  return slash(path.relative(scenarioRoot, file));
}

function commandArgForReport(arg, scenarioRoot) {
  if (!path.isAbsolute(arg)) return slash(arg);
  return slash(path.relative(scenarioRoot, arg));
}

function execute(file, args, options) {
  return new Promise((resolve) => {
    execFile(file, args, {
      cwd: options.cwd,
      env: options.env,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      resolve({
        exitCode: error ? (Number.isInteger(error.code) ? error.code : 1) : 0,
        stdout: stdout ?? '',
        stderr: stderr ?? '',
        error,
      });
    });
  });
}

function runtimeProbeStatus(result) {
  const output = `${result.stdout}\n${result.stderr}`.replace(ANSI_PATTERN, '');
  if (/[✓✔]\s*runtime probes\b/i.test(output)) return true;
  if (/[✗×]\s*runtime probes\b/i.test(output) || /runtime probes[^\n]*(?:fail|missing|wrong|未通过|失败)/i.test(output)) return false;
  return null;
}

function commandFailure(label, result, roots) {
  const detail = `${result.stderr}\n${result.stdout}`.trim() || result.error?.message || `exit ${result.exitCode}`;
  return portableText(`${label}: ${detail}`, roots);
}

function validateChoice(value, allowed, label) {
  if (!allowed.includes(value)) throw new Error(`${label} must be one of: ${allowed.join(', ')}`);
}

function installArgs(packageManager, lifecycle) {
  if (packageManager === 'npm') {
    return lifecycle === 'ignore-scripts'
      ? ['install', '--ignore-scripts', '--no-audit', '--no-fund']
      : ['install', '--no-audit', '--no-fund'];
  }
  return lifecycle === 'ignore-scripts'
    ? ['install', '--ignore-scripts', '--reporter=silent']
    : ['install', '--reporter=silent'];
}

/**
 * Install a packed CLI into an isolated harness and exercise one SDK54 matrix cell.
 * The caller owns workDir cleanup; failures intentionally leave all diagnostics in place.
 */
export async function runPackedCliBlackbox({
  cliTgz,
  workDir,
  template,
  packageManager,
  lifecycle,
  noDevice = false,
}) {
  validateChoice(template, TEMPLATES, 'template');
  validateChoice(packageManager, PACKAGE_MANAGERS, 'packageManager');
  validateChoice(lifecycle, LIFECYCLES, 'lifecycle');
  if (!noDevice) throw new Error('Task 23 runner requires noDevice: true (CLI: --no-device)');
  if (!fs.existsSync(cliTgz) || !fs.statSync(cliTgz).isFile()) throw new Error('cliTgz must be an existing TGZ file');

  const scenarioRoot = path.resolve(workDir);
  if (fs.existsSync(scenarioRoot) && fs.readdirSync(scenarioRoot).length > 0) {
    throw new Error('workDir must be absent or empty so existing diagnostics are not overwritten');
  }
  fs.mkdirSync(scenarioRoot, { recursive: true });

  const harnessRoot = path.join(scenarioRoot, 'harness');
  const artifactRoot = path.join(harnessRoot, 'artifacts');
  const projectName = 'app';
  const projectRoot = path.join(harnessRoot, projectName);
  const report = {
    cliTgzFile: path.basename(cliTgz),
    cliTgzSha256: sha256(cliTgz),
    template,
    packageManager,
    lifecycle,
    commands: [],
    checks: {
      cliInstalledFromTgz: false,
      createPassed: false,
      initialRuntimeProbePassed: false,
      prebuildPassed: false,
      normalReinstallRestoredPatch: false,
      ignoreScriptsRuntimeProbeRejected: false,
      deviceSkipped: noDevice,
    },
    failures: [],
  };
  const privateRoots = [scenarioRoot, path.resolve(cliTgz), path.dirname(path.resolve(cliTgz))];
  const npmCache = path.join(harnessRoot, '.npm-cache');
  const environment = {
    ...process.env,
    CI: process.env.CI || '1',
    npm_config_cache: npmCache,
    NPM_CONFIG_CACHE: npmCache,
    npm_config_update_notifier: 'false',
    pnpm_config_store_dir: path.join(harnessRoot, '.pnpm-store'),
  };

  const run = async (file, args, cwd) => {
    const result = await execute(file, args, { cwd, env: environment });
    report.commands.push({
      file: commandFileForReport(file, scenarioRoot),
      args: args.map(arg => commandArgForReport(arg, scenarioRoot)),
      exitCode: result.exitCode,
    });
    return result;
  };

  fs.mkdirSync(artifactRoot, { recursive: true });
  fs.writeFileSync(path.join(harnessRoot, 'package.json'), `${JSON.stringify({
    name: 'expo-harmony-cli-blackbox-harness',
    version: '0.0.0',
    private: true,
  }, null, 2)}\n`);
  const packedName = path.basename(cliTgz);
  const packedCopy = path.join(artifactRoot, packedName);
  fs.copyFileSync(cliTgz, packedCopy);

  const harnessInstall = await run('npm', [
    'install', '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', `./artifacts/${packedName}`,
  ], harnessRoot);
  if (harnessInstall.exitCode !== 0) {
    report.failures.push(commandFailure('CLI TGZ install failed', harnessInstall, privateRoots));
    return report;
  }

  const cliBin = path.join(harnessRoot, 'node_modules/.bin/expo-harmony-cli');
  try {
    const installedBin = fs.realpathSync(cliBin);
    const installedRoot = fs.realpathSync(path.join(harnessRoot, 'node_modules'));
    report.checks.cliInstalledFromTgz = installedBin.startsWith(`${installedRoot}${path.sep}`);
  } catch (error) {
    report.failures.push(portableText(`installed CLI bin missing: ${error instanceof Error ? error.message : error}`, privateRoots));
    return report;
  }
  if (!report.checks.cliInstalledFromTgz) {
    report.failures.push('installed CLI bin resolves outside the isolated harness');
    return report;
  }

  const create = await run(cliBin, [
    'create', projectName, '--sdk', '54', '--template', template, `--${packageManager}`,
  ], harnessRoot);
  report.checks.createPassed = create.exitCode === 0 && fs.existsSync(path.join(projectRoot, 'package.json'));
  if (!report.checks.createPassed) {
    report.failures.push(commandFailure('packed CLI create failed', create, privateRoots));
    return report;
  }

  const initialDoctor = await run(cliBin, ['doctor'], projectRoot);
  report.checks.initialRuntimeProbePassed = runtimeProbeStatus(initialDoctor) === true;
  if (!report.checks.initialRuntimeProbePassed) {
    report.failures.push(commandFailure('initial runtime probe failed', initialDoctor, privateRoots));
    return report;
  }

  const prebuild = await run(cliBin, ['prebuild', '--platform', 'harmony'], projectRoot);
  const harmonyProject = path.join(projectRoot, 'harmony');
  report.checks.prebuildPassed = prebuild.exitCode === 0 && fs.existsSync(harmonyProject) && fs.statSync(harmonyProject).isDirectory();
  if (!report.checks.prebuildPassed) {
    const label = prebuild.exitCode === 0
      ? 'official Harmony prebuild exited zero without creating the Harmony project'
      : 'official Harmony prebuild failed';
    report.failures.push(commandFailure(label, prebuild, privateRoots));
    return report;
  }

  fs.rmSync(path.join(projectRoot, 'node_modules'), { recursive: true, force: true });
  const reinstall = await run(packageManager, installArgs(packageManager, lifecycle), projectRoot);
  if (reinstall.exitCode !== 0) {
    report.failures.push(commandFailure(`${lifecycle} reinstall failed`, reinstall, privateRoots));
    return report;
  }

  const reinstallDoctor = await run(cliBin, ['doctor'], projectRoot);
  const reinstallProbe = runtimeProbeStatus(reinstallDoctor);
  if (lifecycle === 'normal') {
    report.checks.normalReinstallRestoredPatch = reinstallProbe === true;
    if (!report.checks.normalReinstallRestoredPatch) {
      report.failures.push(commandFailure('normal reinstall did not restore patched runtime', reinstallDoctor, privateRoots));
    }
  } else {
    report.checks.ignoreScriptsRuntimeProbeRejected = reinstallProbe === false;
    if (!report.checks.ignoreScriptsRuntimeProbeRejected) {
      report.failures.push(commandFailure('--ignore-scripts unexpectedly passed runtime probes', reinstallDoctor, privateRoots));
    }
  }

  return report;
}

function selector(value, allowed, label) {
  if (value === 'all') return [...allowed];
  validateChoice(value, allowed, label);
  return [value];
}

export function parseBlackboxArgs(argv) {
  const values = new Map();
  let noDevice = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--no-device') {
      noDevice = true;
      continue;
    }
    if (!arg.startsWith('--')) throw new Error(`unknown argument: ${arg}`);
    const equals = arg.indexOf('=');
    const key = equals === -1 ? arg : arg.slice(0, equals);
    const value = equals === -1 ? argv[++index] : arg.slice(equals + 1);
    if (!value) throw new Error(`${key} requires a value`);
    if (!['--cli-tgz', '--work-dir', '--template', '--package-manager', '--lifecycle'].includes(key)) {
      throw new Error(`unknown argument: ${key}`);
    }
    if (values.has(key)) throw new Error(`${key} may only be specified once`);
    values.set(key, value);
  }
  if (!noDevice) throw new Error('--no-device is required for the Task 23 non-device runner');
  for (const key of ['--cli-tgz', '--work-dir']) {
    if (!values.has(key)) throw new Error(`${key} is required`);
  }
  return {
    cliTgz: values.get('--cli-tgz'),
    workDir: values.get('--work-dir'),
    templates: selector(values.get('--template') ?? 'all', TEMPLATES, 'template'),
    packageManagers: selector(values.get('--package-manager') ?? 'all', PACKAGE_MANAGERS, 'packageManager'),
    lifecycles: selector(values.get('--lifecycle') ?? 'all', LIFECYCLES, 'lifecycle'),
    noDevice,
  };
}

async function main() {
  const options = parseBlackboxArgs(process.argv.slice(2));
  const matrixRoot = path.resolve(options.workDir);
  fs.mkdirSync(matrixRoot, { recursive: true });
  const reports = [];
  for (const template of options.templates) {
    for (const packageManager of options.packageManagers) {
      for (const lifecycle of options.lifecycles) {
        reports.push(await runPackedCliBlackbox({
          cliTgz: options.cliTgz,
          workDir: path.join(matrixRoot, `${template}-${packageManager}-${lifecycle}`),
          template,
          packageManager,
          lifecycle,
          noDevice: options.noDevice,
        }));
      }
    }
  }
  process.stdout.write(`${JSON.stringify(reports, null, 2)}\n`);
  if (reports.some(report => report.failures.length > 0)) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(portableText(error instanceof Error ? error.message : error));
    process.exitCode = 1;
  });
}
