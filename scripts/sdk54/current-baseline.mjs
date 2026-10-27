import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const hash = value => createHash('sha256').update(value).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const save = (file, value) => { fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(value, null, 2)}\n`); fs.renameSync(`${file}.tmp`, file); };
export const baselineScenarios = Object.freeze([
  ...['blank-typescript', 'default'].flatMap(template => ['npm', 'pnpm'].map(packageManager => ({ id: `sdk54-${template}-${packageManager}`, sdk: '54', template, packageManager }))),
  ...['npm', 'pnpm'].map(packageManager => ({ id: `sdk52-default-${packageManager}`, sdk: '52', template: 'default', packageManager })),
].map(Object.freeze));
const stepNames = scenario => ['create', 'identify', scenario.sdk === '52' ? 'scan' : 'doctor', 'prebuild', 'native-device'];
const skipped = (id, reason) => ({ id, status: 'NOT_RUN', reason });

export function requireEmptyDirectory(directory) {
  if (fs.existsSync(directory) && (fs.lstatSync(directory).isSymbolicLink() || !fs.statSync(directory).isDirectory() || fs.readdirSync(directory).length)) throw new Error(`Directory must be absent or empty: ${directory}`);
  fs.mkdirSync(directory, { recursive: true });
}

export async function executeBaselineCommand({ id, command, cwd, output, timeoutMs, env = {} }) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id) || !Array.isArray(command) || !command.length || command.some(arg => typeof arg !== 'string') || !command[0] || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid execution ID/command/timeout');
  fs.mkdirSync(output, { recursive: true });
  const log = `${id}.log`, logPath = path.join(output, log);
  const descriptor = fs.openSync(logPath, 'wx');
  const startedAt = new Date().toISOString();
  return new Promise(resolve => {
    let error = null, timedOut = false, interrupted = false, killTimer;
    const child = spawn(command[0], command.slice(1), { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    const write = buffer => fs.writeSync(descriptor, buffer);
    child.stdout.on('data', write); child.stderr.on('data', write);
    child.on('error', value => { error = value.message; write(Buffer.from(`\nPROCESS_ERROR: ${error}\n`)); });
    const kill = signal => {
      try { if (process.platform === 'win32') child.kill(signal); else if (child.pid) process.kill(-child.pid, signal); }
      catch (value) { if (value.code !== 'ESRCH') { error = value.message; write(Buffer.from(`\nKILL_ERROR: ${error}\n`)); } }
    };
    const stop = () => { kill('SIGTERM'); killTimer ??= setTimeout(() => kill('SIGKILL'), 2000); };
    const interrupt = signal => { interrupted = true; error = `Interrupted by ${signal}`; stop(); };
    const sigint = () => interrupt('SIGINT'), sigterm = () => interrupt('SIGTERM');
    process.on('SIGINT', sigint); process.on('SIGTERM', sigterm);
    const timer = setTimeout(() => { timedOut = true; write(Buffer.from(`\nTIMEOUT: ${timeoutMs}ms\n`)); stop(); }, timeoutMs);
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer); clearTimeout(killTimer); process.off('SIGINT', sigint); process.off('SIGTERM', sigterm);
      fs.closeSync(descriptor);
      resolve({ id, command, cwd, startedAt, finishedAt: new Date().toISOString(), pid: child.pid ?? null, timeoutMs,
        status: exitCode === 0 && !error && !timedOut && !interrupted ? 'PASS' : 'FAIL', exitCode, signal,
        error, timedOut, interrupted, log, logSha256: hash(fs.readFileSync(logPath)) });
    });
  });
}

function snapshotProject(projectRoot, directory) {
  const snapshots = [];
  for (const file of ['package.json', 'app.json', 'app.config.js', 'app.config.ts', 'package-lock.json', 'pnpm-lock.yaml', '.expo-harmony/managed-state.json', 'harmony/build-profile.json5']) {
    const source = path.join(projectRoot, file);
    if (!fs.existsSync(source) || !fs.lstatSync(source).isFile()) continue;
    const target = path.join(directory, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(source, target);
    snapshots.push({ source: file, evidencePath: target, sha256: hash(fs.readFileSync(target)) });
  }
  const installed = [];
  if (fs.existsSync(path.join(projectRoot, 'package.json'))) {
    const manifest = json(path.join(projectRoot, 'package.json'));
    for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).sort()) {
      const manifestPath = path.join(projectRoot, 'node_modules', name, 'package.json');
      if (!fs.existsSync(manifestPath)) { installed.push({ installName: name, state: 'NOT_INSTALLED' }); continue; }
      const realPath = fs.realpathSync(manifestPath), value = json(realPath);
      installed.push({ installName: name, name: value.name, version: value.version, realPath, sha256: hash(fs.readFileSync(realPath)),
        insideProject: realPath.startsWith(`${fs.realpathSync(projectRoot)}${path.sep}`) });
    }
  }
  return { projectRoot, exists: fs.existsSync(projectRoot), snapshots, installed };
}

function snapshotExecutors(cache, directory) {
  const root = path.join(cache, '_npx'), records = [];
  if (!fs.existsSync(root)) return records;
  for (const entry of fs.readdirSync(root).sort()) {
    for (const name of ['create-expo-app', 'create-expo']) {
      const file = path.join(root, entry, 'node_modules', name, 'package.json');
      if (!fs.existsSync(file)) continue;
      const manifest = json(file), evidencePath = path.join(directory, `${entry}-${name}.json`);
      fs.mkdirSync(directory, { recursive: true }); fs.copyFileSync(file, evidencePath);
      records.push({ name: manifest.name, version: manifest.version, dependencies: manifest.dependencies ?? {}, evidencePath, sha256: hash(fs.readFileSync(file)) });
    }
    const lock = path.join(root, entry, 'package-lock.json');
    if (fs.existsSync(lock)) {
      const evidencePath = path.join(directory, `${entry}-package-lock.json`); fs.mkdirSync(directory, { recursive: true }); fs.copyFileSync(lock, evidencePath);
      records.push({ name: 'EXECUTOR_LOCK', evidencePath, sha256: hash(fs.readFileSync(lock)) });
    }
  }
  return records;
}

export async function runCurrentBaseline({ cliTgz, workDir, output, timeoutMs = 180000 }) {
  cliTgz = path.resolve(cliTgz); workDir = path.resolve(workDir); output = path.resolve(output);
  if (!fs.lstatSync(cliTgz).isFile()) throw new Error('CLI candidate must be a regular TGZ');
  if (output === workDir || output.startsWith(`${workDir}${path.sep}`) || workDir.startsWith(`${output}${path.sep}`)) throw new Error('Evidence and work directories must be separate');
  requireEmptyDirectory(output); requireEmptyDirectory(workDir);
  output = fs.realpathSync(output); workDir = fs.realpathSync(workDir);
  if (output === workDir || output.startsWith(`${workDir}${path.sep}`) || workDir.startsWith(`${output}${path.sep}`)) throw new Error('Canonical evidence and work directories must be separate');
  const cache = path.join(workDir, 'npm-cache'), harness = path.join(workDir, 'harness');
  fs.mkdirSync(harness); fs.writeFileSync(path.join(harness, 'package.json'), '{"name":"sdk54-current-baseline-harness","private":true,"version":"0.0.0"}\n');
  const env = { CI: '1', npm_config_cache: cache, NPM_CONFIG_CACHE: cache, npm_config_yes: 'true', npm_config_update_notifier: 'false',
    npm_config_fetch_retries: '1', npm_config_fetch_timeout: '30000', pnpm_config_store_dir: path.join(workDir, 'pnpm-store'), npm_config_store_dir: path.join(workDir, 'pnpm-store') };
  const result = { schemaVersion: 1, executionState: 'RUNNING', candidate: { path: cliTgz, sha256: hash(fs.readFileSync(cliTgz)) },
    workDir, environment: { node: process.version, platform: process.platform, arch: process.arch }, setup: [],
    scenarios: baselineScenarios.map(scenario => ({ ...scenario, steps: stepNames(scenario).map(name => skipped(`${scenario.id}-${name}`, '尚未执行')) })),
    executorIdentities: [], stageClosable: false, productAllPassed: false };
  const resultPath = path.join(output, 'results.json');
  const persist = () => save(resultPath, result);
  let interrupted = false;
  async function run(id, command, cwd = workDir, extraEnv = {}, limit = timeoutMs) {
    const value = await executeBaselineCommand({ id, command, cwd, output, timeoutMs: limit, env: { ...env, ...extraEnv } });
    interrupted ||= value.interrupted;
    console.log(`${id}: ${value.status} (exit=${value.exitCode}, timeout=${value.timedOut})`);
    return value;
  }
  persist();
  for (const [id, command, cwd] of [
    ['git-init', ['git', 'init', '--quiet', workDir], workDir],
    ['install-cli', ['npm', 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', cliTgz], harness],
  ]) {
    if (interrupted || result.setup.some(step => step.status !== 'PASS')) { result.setup.push(skipped(id, '前置安装/初始化失败或中断')); continue; }
    result.setup.push(await run(id, command, cwd)); persist();
  }
  const packageRoot = path.join(harness, 'node_modules/expo-harmony-cli'), cli = path.join(packageRoot, 'dist/index.js');
  if (result.setup.every(step => step.status === 'PASS') && fs.existsSync(cli)) {
    result.candidate.installed = { name: json(path.join(packageRoot, 'package.json')).name, version: json(path.join(packageRoot, 'package.json')).version,
      realPath: fs.realpathSync(packageRoot), entrySha256: hash(fs.readFileSync(cli)), packageJsonSha256: hash(fs.readFileSync(path.join(packageRoot, 'package.json'))) };
    if (!result.candidate.installed.realPath.startsWith(`${harness}${path.sep}`) || result.candidate.installed.name !== 'expo-harmony-cli') throw new Error('Candidate install is not isolated expo-harmony-cli');
    result.setup.push(await run('cli-version', [process.execPath, cli, '--version'], harness)); persist();
  } else result.setup.push(skipped('cli-version', 'CLI安装未通过或入口缺失'));
  const ready = result.setup.every(step => step.status === 'PASS');
  for (const scenario of result.scenarios) {
    const project = path.join(workDir, scenario.id);
    const names = stepNames(scenario);
    for (let index = 0; index < names.length; index++) {
      const name = names[index], id = `${scenario.id}-${name}`;
      if (name === 'native-device') scenario.steps[index] = skipped(id, '本轮未建立原生发行候选、签名和明确设备目标；创建/host命令不能证明原生运行');
      else if (!ready || interrupted) scenario.steps[index] = skipped(id, interrupted ? '执行被中断，保留此前结果' : '隔离CLI安装前置失败');
      else if (name === 'create') scenario.steps[index] = await run(id, [process.execPath, cli, 'create', scenario.id, '--sdk', scenario.sdk, '--template', scenario.template, `--${scenario.packageManager}`]);
      else if (!fs.existsSync(path.join(project, 'package.json'))) scenario.steps[index] = skipped(id, '创建未产生package.json，后续无有效项目输入');
      else if (name === 'identify') {
        const modulePath = path.join(packageRoot, 'dist/sdk54/project-state.js');
        const script = 'const {classifyHarmonyProject}=require(process.argv[1]); const value=classifyHarmonyProject(process.argv[2]); console.log(JSON.stringify({kind:value})); if(value!==process.argv[3])process.exit(2);';
        scenario.steps[index] = await run(id, [process.execPath, '-e', script, modulePath, project, scenario.sdk === '52' ? 'sdk52-legacy' : 'sdk54-scoped-packages'], project);
      } else if (name === 'scan' || name === 'doctor') scenario.steps[index] = await run(id, [process.execPath, cli, name], project);
      else if (name === 'prebuild') {
        if (scenario.steps[0].status !== 'PASS') scenario.steps[index] = skipped(id, 'create失败，不以半成品执行prebuild冒充完整项目');
        else scenario.steps[index] = await run(id, [process.execPath, cli, 'prebuild', '--platform', 'harmony'], project);
      }
      persist();
    }
    scenario.project = snapshotProject(project, path.join(output, 'projects', scenario.id)); persist();
  }
  result.executorIdentities = snapshotExecutors(cache, path.join(output, 'executors'));
  const harnessLock = path.join(harness, 'package-lock.json');
  if (fs.existsSync(harnessLock)) { fs.copyFileSync(harnessLock, path.join(output, 'harness-package-lock.json')); result.candidate.harnessLockSha256 = hash(fs.readFileSync(harnessLock)); }
  result.setup.push(await run('no-git-commits', ['git', 'log', '--oneline', '--all'], workDir));
  // An empty repository exits 0 with --all; any log output means a tool committed unexpectedly.
  const noCommitStep = result.setup.at(-1);
  if (noCommitStep.status === 'PASS' && fs.readFileSync(path.join(output, noCommitStep.log), 'utf8').trim()) {
    noCommitStep.status = 'FAIL'; noCommitStep.assertionFailure = 'Unexpected commit in baseline work repository';
  }
  result.executionState = interrupted ? 'INTERRUPTED' : 'FINISHED';
  result.productAllPassed = result.scenarios.every(scenario => scenario.steps.every(step => step.status === 'PASS'));
  persist();
  return result;
}

export function validateBaselineResults(result, output) {
  const errors = [];
  const checkFile = (file, expected, label) => {
    try { if (!expected || hash(fs.readFileSync(file)) !== expected) errors.push(`${label}: hash mismatch`); }
    catch (error) { errors.push(`${label}: ${error.message}`); }
  };
  if (result.schemaVersion !== 1 || !['FINISHED', 'INTERRUPTED'].includes(result.executionState)) errors.push('Incomplete execution state/schema');
  if (result.stageClosable !== false) errors.push('Current baseline cannot close stage');
  checkFile(result.candidate?.path, result.candidate?.sha256, 'candidate');
  const expectedIds = baselineScenarios.map(scenario => scenario.id).sort();
  const actualIds = (result.scenarios ?? []).map(scenario => scenario.id).sort();
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) errors.push('Missing/duplicate/unexpected scenario set');
  const executedLogs = new Set();
  function checkStep(step) {
    if (!step || !['PASS', 'FAIL', 'NOT_RUN'].includes(step.status)) { errors.push('Invalid step status'); return; }
    if (step.status === 'NOT_RUN') { if (!step.reason || step.reason === '尚未执行' && result.executionState === 'FINISHED') errors.push(`Missing prerequisite reason ${step.id}`); return; }
    if (!Array.isArray(step.command) || !step.command.length || !step.cwd || !step.startedAt || !step.finishedAt) errors.push(`Missing command metadata ${step.id}`);
    if (step.log !== `${step.id}.log` || !/^[a-zA-Z0-9_-]+$/.test(step.id) || executedLogs.has(step.log)) errors.push(`Invalid/duplicate log ${step.id}`);
    executedLogs.add(step.log);
    checkFile(path.join(output, path.basename(step.log ?? 'missing')), step.logSha256, step.id);
    const pass = step.exitCode === 0 && !step.error && !step.signal && !step.timedOut && !step.interrupted && !step.assertionFailure;
    if ((step.status === 'PASS') !== pass) errors.push(`Exit/status mismatch ${step.id}`);
  }
  const setupIds = (result.setup ?? []).map(step => step.id);
  if (JSON.stringify(setupIds) !== JSON.stringify(['git-init', 'install-cli', 'cli-version', 'no-git-commits'])) errors.push('Missing/duplicate setup steps');
  for (const step of result.setup ?? []) checkStep(step);
  if (result.candidate?.installed) {
    const installed = result.candidate.installed;
    const expectedRoot = path.join(result.workDir ?? '', 'harness/node_modules/expo-harmony-cli');
    try {
      if (fs.realpathSync(expectedRoot) !== installed.realPath || !installed.realPath.startsWith(`${fs.realpathSync(result.workDir)}${path.sep}`)) errors.push('Installed CLI is not isolated');
      checkFile(path.join(installed.realPath, 'dist/index.js'), installed.entrySha256, 'installed CLI entry');
      checkFile(path.join(installed.realPath, 'package.json'), installed.packageJsonSha256, 'installed CLI manifest');
      const manifest = json(path.join(installed.realPath, 'package.json'));
      if (installed.name !== 'expo-harmony-cli' || manifest.name !== installed.name || manifest.version !== installed.version) errors.push('Installed CLI identity mismatch');
      const versionStep = result.setup.find(step => step.id === 'cli-version');
      if (versionStep?.status === 'PASS' && fs.readFileSync(path.join(output, versionStep.log), 'utf8').trim() !== installed.version) errors.push('CLI --version output mismatch');
    } catch (error) { errors.push(`Installed CLI evidence unavailable: ${error.message}`); }
    checkFile(path.join(output, 'harness-package-lock.json'), result.candidate.harnessLockSha256, 'isolated harness lock');
  } else if ((result.setup ?? []).find(step => step.id === 'cli-version')?.status === 'PASS') errors.push('CLI version passed without installed identity');
  for (const scenario of result.scenarios ?? []) {
    const definition = baselineScenarios.find(item => item.id === scenario.id);
    if (!definition) continue;
    if (['sdk', 'template', 'packageManager'].some(key => scenario[key] !== definition[key])) errors.push(`Changed scenario identity ${scenario.id}`);
    if (JSON.stringify((scenario.steps ?? []).map(step => step.id)) !== JSON.stringify(stepNames(definition).map(name => `${scenario.id}-${name}`))) errors.push(`Missing/duplicate scenario steps ${scenario.id}`);
    for (const step of scenario.steps ?? []) checkStep(step);
    const createStep = scenario.steps?.[0];
    if (createStep && createStep.status !== 'NOT_RUN') {
      const expected = [path.join(result.workDir, 'harness/node_modules/expo-harmony-cli/dist/index.js'), 'create', definition.id, '--sdk', definition.sdk, '--template', definition.template, `--${definition.packageManager}`];
      if (JSON.stringify(createStep.command?.slice(1)) !== JSON.stringify(expected)) errors.push(`Create command differs from scenario ${scenario.id}`);
    } else if (result.executionState === 'FINISHED' && result.setup?.slice(0, 3).every(step => step.status === 'PASS')) errors.push(`Required create was not executed ${scenario.id}`);
    if (scenario.steps?.[0]?.status === 'PASS' && !scenario.project?.snapshots?.some(file => file.source === 'package.json')) errors.push(`Successful create missing project ${scenario.id}`);
    for (const file of scenario.project?.snapshots ?? []) checkFile(file.evidencePath, file.sha256, `${scenario.id}/${file.source}`);
    if (scenario.steps?.find(step => step.id.endsWith('-prebuild'))?.status === 'PASS' && scenario.steps?.[0]?.status !== 'PASS') errors.push(`Prebuild passed after failed create ${scenario.id}`);
  }
  for (const file of result.executorIdentities ?? []) checkFile(file.evidencePath, file.sha256, 'executor');
  const allPassed = (result.scenarios ?? []).length === 6 && result.scenarios.every(scenario => scenario.steps?.length === 5 && scenario.steps.every(step => step.status === 'PASS'));
  if (result.productAllPassed !== allPassed) errors.push('Fake/missing productAllPassed');
  return { valid: errors.length === 0, errors, productAllPassed: allPassed, stageClosable: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2), options = {};
    for (let index = 0; index < args.length; index++) {
      const flag = args[index];
      if (!['--cli-tgz', '--work-dir', '--output', '--timeout-ms', '--check'].includes(flag) || !args[index + 1] || options[flag]) throw new Error(`Invalid argument ${flag}`);
      options[flag] = args[++index];
    }
    if (options['--check']) {
      if (Object.keys(options).length !== 1) throw new Error('--check only accepts a results JSON path');
      const file = path.resolve(options['--check']); const validation = validateBaselineResults(json(file), path.dirname(file));
      console.log(JSON.stringify(validation, null, 2)); if (!validation.valid) process.exitCode = 1;
    } else {
      if (!options['--cli-tgz'] || !options['--work-dir'] || !options['--output']) throw new Error('Required --cli-tgz <tgz> --work-dir <empty> --output <empty> [--timeout-ms <ms>]');
      const timeoutMs = Number(options['--timeout-ms'] ?? 180000);
      if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid timeout');
      const result = await runCurrentBaseline({ cliTgz: options['--cli-tgz'], workDir: options['--work-dir'], output: options['--output'], timeoutMs });
      const validation = validateBaselineResults(result, path.resolve(options['--output']));
      console.log(JSON.stringify(validation, null, 2));
      if (!validation.valid) process.exitCode = 1;
      else if (!result.productAllPassed) process.exitCode = 2;
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
