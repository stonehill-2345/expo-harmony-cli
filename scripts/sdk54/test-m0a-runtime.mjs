import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertExternalConsumerWorkspace } from './creation-workspace.mjs';

const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const repository = fileURLToPath(new URL('../../', import.meta.url));
const activeProcesses = new Set();

async function completeBefore(promise, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      promise.then(() => false),
      new Promise((resolve) => { timer = setTimeout(() => resolve(true), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}

function groupExists(pid) {
  try { process.kill(-pid, 0); return true; } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

function startProcess(command, args, options) {
  const logFd = fs.openSync(options.log, 'w');
  let child;
  try {
    child = spawn(command, args, { cwd: options.cwd, env: options.env, detached: true, stdio: ['ignore', logFd, logFd] });
  } finally { fs.closeSync(logFd); }
  const running = { child, command: [command, ...args], log: options.log, error: null, closed: false };
  running.completion = new Promise((resolve) => {
    child.once('error', (error) => { running.error = error.message; });
    child.once('close', (exitCode, signal) => {
      running.closed = true;
      running.exitCode = exitCode;
      running.signal = signal;
      resolve();
    });
  });
  activeProcesses.add(running);
  return running;
}

async function stopProcessGroup(running) {
  const pid = running.child.pid;
  if (!pid) { await running.completion; activeProcesses.delete(running); return { cleaned: true, pid: null }; }
  const signal = (value) => {
    try { process.kill(-pid, value); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  };
  signal('SIGTERM');
  const deadline = Date.now() + 3000;
  while (groupExists(pid) && Date.now() < deadline) await sleep(100);
  if (groupExists(pid)) signal('SIGKILL');
  await completeBefore(running.completion, 3000);
  const killedDeadline = Date.now() + 3000;
  while (groupExists(pid) && Date.now() < killedDeadline) await sleep(100);
  const result = { pid, cleaned: !groupExists(pid), exitCode: running.exitCode ?? null, signal: running.signal ?? null, error: running.error };
  activeProcesses.delete(running);
  return result;
}

function applicationFingerprint(project) {
  const files = [];
  const visit = (relative) => {
    const absolute = path.join(project, relative);
    if (!fs.existsSync(absolute)) return;
    const stat = fs.lstatSync(absolute);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) visit(path.join(relative, name));
    } else if (stat.isFile()) files.push({ path: relative.split(path.sep).join('/'), sha256: hash(fs.readFileSync(absolute)) });
  };
  for (const relative of ['package.json', 'App.tsx', 'index.ts', 'app', 'components', 'assets']) visit(relative);
  return files;
}

function bundlePath(main) {
  if (main === 'expo-router/entry') return '/node_modules/expo-router/entry.bundle';
  assert.equal(typeof main, 'string', 'Actual installed project must declare package.main');
  assert.ok(!path.isAbsolute(main) && !main.split(/[\\/]/).includes('..'), 'Unsupported project entry path');
  const relative = main.replace(/^\.\//, '').replace(/\.[cm]?[jt]sx?$/, '');
  return `${relative.startsWith('node_modules/') || !relative.includes('/') ? '/' : '/node_modules/'}${relative}.bundle`;
}

async function waitForMetro(port, running) {
  const deadline = Date.now() + 120000;
  let lastError;
  while (Date.now() < deadline) {
    if (running.closed) throw new Error(`Expo start exited before /status was ready: ${running.error ?? running.exitCode}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/status`, { signal: AbortSignal.timeout(1000) });
      const text = await response.text();
      if (response.status === 200 && text.includes('packager-status:running')) return { httpStatus: response.status, body: text };
      lastError = `${response.status} ${text}`;
    } catch (error) { lastError = error.message; }
    await sleep(500);
  }
  throw new Error(`Metro /status did not become ready: ${lastError}`);
}

async function assertPortFree(port) {
  const net = await import('node:net');
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}

export async function testM0aRuntime({ project, port, output, run = false }) {
  project = fs.realpathSync(project);
  output = path.resolve(output);
  assertExternalConsumerWorkspace(project, repository);
  assert.ok(Number.isInteger(port) && port > 0 && port < 65536, 'Expected a TCP port between 1 and 65535');
  await assertPortFree(port);
  fs.mkdirSync(output, { recursive: true });
  const require = createRequire(path.join(project, 'package.json'));
  const cli = require.resolve('expo/bin/cli');
  const manifest = JSON.parse(fs.readFileSync(path.join(project, 'package.json'), 'utf8'));
  const env = { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1', EXPO_OFFLINE: '1', NODE_PATH: '' };
  delete env.EXPO_HARMONY_METRO;
  const managedState = path.join(project, '.expo-harmony/managed-state.json');
  const originalState = fs.existsSync(managedState) ? fs.readFileSync(managedState) : null;
  const report = {
    schemaVersion: 1, project, port, cli, packageMain: manifest.main,
    manualHarmonyEnvironmentEnabled: false, applicationBefore: applicationFingerprint(project),
    managedStateOriginallyExisted: originalState !== null,
    managedStateOriginalSha256: originalState ? hash(originalState) : null,
    starts: [], failures: [], status: 'FAIL', passed: false,
    boundary: 'HTTP bundling and real run command are recorded separately. HTTP 500, failed run, or uncleared processes never count as PASS; device success is not simulated.',
  };
  const recordLog = (log) => ({ log: path.basename(log), logSha256: hash(fs.readFileSync(log)) });
  try {
    for (const phase of ['initial', 'without-managed-state']) {
      if (phase === 'without-managed-state') {
        report.managedStateExistedBeforeRemoval = fs.existsSync(managedState);
        fs.rmSync(managedState, { force: true });
        report.managedStateRemoved = !fs.existsSync(managedState);
      }
      const log = path.join(output, `runtime-${phase}-metro.log`);
      const server = startProcess(process.execPath, [cli, 'start', '--localhost', '--port', String(port)], { cwd: project, env, log });
      const receipt = { phase, command: server.command, bundle: null, passed: false };
      report.starts.push(receipt);
      try {
        receipt.ready = await waitForMetro(port, server);
        const url = `http://127.0.0.1:${port}${bundlePath(manifest.main)}?platform=harmony&dev=true&minify=false`;
        const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
        const bytes = Buffer.from(await response.arrayBuffer());
        const responseFile = `runtime-${phase}-bundle.response`;
        fs.writeFileSync(path.join(output, responseFile), bytes);
        receipt.bundle = {
          url, httpStatus: response.status, contentType: response.headers.get('content-type'),
          bytes: bytes.length, sha256: hash(bytes), responseFile,
        };
        receipt.passed = response.status === 200 && bytes.length > 0 && /(?:javascript|ecmascript)/i.test(response.headers.get('content-type') ?? '');
        if (!receipt.passed) report.failures.push(`${phase}: Harmony bundle HTTP ${response.status}`);
      } catch (error) {
        receipt.error = error.message;
        report.failures.push(`${phase}: ${error.message}`);
      } finally {
        receipt.cleanup = await stopProcessGroup(server);
        Object.assign(receipt, recordLog(log));
        if (!receipt.cleanup.cleaned) report.failures.push(`${phase}: Metro process group was not cleaned`);
      }
    }
    if (run) {
      const log = path.join(output, 'runtime-run-harmony.log');
      const child = startProcess(process.execPath, [cli, 'run:harmony', '--no-install', '--no-bundler', '--port', String(port)], { cwd: project, env, log });
      const receipt = { command: child.command, timedOut: false, timeoutMs: 180000 };
      report.run = receipt;
      try {
        receipt.timedOut = await completeBefore(child.completion, 180000);
        receipt.exitCode = child.exitCode ?? null;
        receipt.signal = child.signal ?? null;
        receipt.error = child.error;
        receipt.passed = !receipt.timedOut && child.exitCode === 0 && !child.error;
        if (!receipt.passed) report.failures.push(`run:harmony failed: ${receipt.timedOut ? '180 second timeout' : `exit ${child.exitCode}`}`);
      } finally {
        receipt.cleanup = await stopProcessGroup(child);
        Object.assign(receipt, recordLog(log));
        if (!receipt.cleanup.cleaned) report.failures.push('run:harmony process group was not cleaned');
      }
    }
  } finally {
    for (const child of [...activeProcesses]) await stopProcessGroup(child);
    report.applicationAfter = applicationFingerprint(project);
    report.applicationUnchanged = JSON.stringify(report.applicationBefore) === JSON.stringify(report.applicationAfter);
    if (!report.applicationUnchanged) report.failures.push('Original application files changed');
    report.managedStateFinallyExists = fs.existsSync(managedState);
    report.passed = report.failures.length === 0 && report.starts.length === 2 && report.starts.every((entry) => entry.passed && entry.cleanup.cleaned) && (!run || report.run?.passed);
    report.status = report.passed ? 'PASS' : 'FAIL';
    fs.writeFileSync(path.join(output, 'runtime-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  const value = (key) => args[args.indexOf(key) + 1];
  if (!['--project', '--port', '--output'].every((key) => args.includes(key) && value(key))) {
    console.error('Usage: node scripts/sdk54/test-m0a-runtime.mjs --project /outside/project --port 8097 --output directory [--run]');
    process.exitCode = 1;
  } else {
    const onSignal = async () => {
      for (const child of [...activeProcesses]) await stopProcessGroup(child);
      process.exit(130);
    };
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
    testM0aRuntime({ project: value('--project'), port: Number(value('--port')), output: value('--output'), run: args.includes('--run') })
      .then((report) => { console.log(JSON.stringify({ status: report.status, failures: report.failures, starts: report.starts.map((entry) => ({ phase: entry.phase, httpStatus: entry.bundle?.httpStatus, passed: entry.passed })), run: report.run })); process.exitCode = report.passed ? 0 : 1; })
      .catch((error) => { console.error(error.stack); process.exitCode = 1; });
  }
}
