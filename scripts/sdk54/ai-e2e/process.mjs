import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { finished } from 'node:stream/promises';

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function terminate(child, signal) {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch {
    try { child.kill(signal); } catch { /* process already exited */ }
  }
}

export async function runCommand({ id, argv, cwd, outputDirectory, timeoutMs, signal }) {
  if (!/^[A-Za-z0-9_.-]+$/.test(id ?? '')) throw new Error('Command id must be filesystem-safe');
  if (!Array.isArray(argv) || argv.length === 0 || argv.some((value) => typeof value !== 'string' || !value)) {
    throw new Error('Command argv must be a non-empty string array');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error('Command timeoutMs must be a positive integer');
  const root = path.resolve(outputDirectory);
  const commandsDirectory = path.join(root, 'commands');
  fs.mkdirSync(commandsDirectory, { recursive: true });
  const stdoutPath = path.join(commandsDirectory, `${id}.stdout.log`);
  const stderrPath = path.join(commandsDirectory, `${id}.stderr.log`);
  const stdoutFile = fs.createWriteStream(stdoutPath, { flags: 'wx' });
  const stderrFile = fs.createWriteStream(stderrPath, { flags: 'wx' });
  const startedAt = new Date().toISOString();
  let timedOut = false;
  let interrupted = false;

  const child = spawn(argv[0], argv.slice(1), {
    cwd,
    env: process.env,
    detached: process.platform !== 'win32',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(stdoutFile);
  child.stderr.pipe(stderrFile);

  let killTimer;
  const stop = () => {
    if (killTimer) return;
    terminate(child, 'SIGTERM');
    killTimer = setTimeout(() => terminate(child, 'SIGKILL'), 1000);
  };
  const timeout = setTimeout(() => {
    timedOut = true;
    stop();
  }, timeoutMs);
  const abort = () => {
    interrupted = true;
    clearTimeout(timeout);
    stop();
  };
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();

  const { code, closeSignal } = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (exitCode, childSignal) => resolve({ code: exitCode, closeSignal: childSignal }));
  }).finally(() => {
    clearTimeout(timeout);
    clearTimeout(killTimer);
    signal?.removeEventListener('abort', abort);
  });
  await Promise.all([finished(stdoutFile), finished(stderrFile)]);

  return {
    id,
    argv: [...argv],
    cwd: path.resolve(cwd),
    pid: child.pid,
    startedAt,
    endedAt: new Date().toISOString(),
    exitCode: code ?? 1,
    signal: closeSignal,
    timedOut,
    interrupted,
    stdout: { path: path.relative(root, stdoutPath), sha256: sha256(stdoutPath) },
    stderr: { path: path.relative(root, stderrPath), sha256: sha256(stderrPath) },
  };
}
