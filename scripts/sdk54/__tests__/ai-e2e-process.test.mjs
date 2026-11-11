import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runCommand } from '../ai-e2e/process.mjs';

function outputDirectory(t) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-ai-e2e-process-')));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('runs an argv array without a shell and records separate logs', async (t) => {
  const output = outputDirectory(t);
  const marker = 'value with spaces; echo must-not-run';
  const result = await runCommand({
    id: 'argv',
    argv: [process.execPath, '-e', 'process.stdout.write(process.argv[1]); process.stderr.write("stderr\\n")', marker],
    cwd: output,
    outputDirectory: output,
    timeoutMs: 5_000,
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.timedOut, false);
  assert.equal(result.interrupted, false);
  assert.equal(fs.readFileSync(path.join(output, result.stdout.path), 'utf8'), marker);
  assert.equal(fs.readFileSync(path.join(output, result.stderr.path), 'utf8'), 'stderr\n');
  assert.equal(result.argv.at(-1), marker);
});

test('times out only the spawned process group and preserves partial logs', async (t) => {
  const output = outputDirectory(t);
  const result = await runCommand({
    id: 'timeout',
    argv: [process.execPath, '-e', 'process.stdout.write("started\\n"); setInterval(() => {}, 1000)'],
    cwd: output,
    outputDirectory: output,
    timeoutMs: 500,
  });

  assert.equal(result.timedOut, true);
  assert.equal(result.interrupted, false);
  assert.notEqual(result.exitCode, 0);
  assert.equal(fs.readFileSync(path.join(output, result.stdout.path), 'utf8'), 'started\n');
});

test('records an explicit abort as interruption', async (t) => {
  const output = outputDirectory(t);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 50);
  const result = await runCommand({
    id: 'interrupt',
    argv: [process.execPath, '-e', 'setInterval(() => {}, 1000)'],
    cwd: output,
    outputDirectory: output,
    timeoutMs: 5_000,
    signal: controller.signal,
  });

  assert.equal(result.timedOut, false);
  assert.equal(result.interrupted, true);
  assert.notEqual(result.exitCode, 0);
});

for (const interrupt of [false, true]) {
  test(`escalates ${interrupt ? 'abort' : 'timeout'} when a child ignores SIGTERM`, async (t) => {
    const output = outputDirectory(t);
    const controller = new AbortController();
    const pidFile = path.join(output, 'pid');
    let forcedByTest = false;
    const watchdog = setTimeout(() => {
      forcedByTest = true;
      if (fs.existsSync(pidFile)) process.kill(-Number(fs.readFileSync(pidFile)), 'SIGKILL');
    }, 4000);
    t.after(() => clearTimeout(watchdog));
    const pending = runCommand({ id: 'ignore-term', cwd: output, outputDirectory: output,
      argv: [process.execPath, '-e', 'process.on("SIGTERM",()=>{});require("fs").writeFileSync(process.argv[1],String(process.pid));process.stdout.write("ready\\n");setInterval(()=>{},100)', pidFile],
      timeoutMs: interrupt ? 10000 : 500, signal: controller.signal });
    if (interrupt) {
      while (!fs.existsSync(pidFile) && !forcedByTest) await new Promise(resolve => setTimeout(resolve, 10));
      controller.abort();
    }
    const result = await pending;
    assert.equal(forcedByTest, false, 'runCommand must terminate without the test watchdog');
    assert.equal(result.interrupted, interrupt);
    assert.equal(result.timedOut, !interrupt);
    assert.equal(result.signal, 'SIGKILL');
    assert.match(fs.readFileSync(path.join(output, result.stdout.path), 'utf8'), /ready/);
  });
}
