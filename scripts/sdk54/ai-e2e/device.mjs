import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { decodeScreenshot } from './evidence.mjs';
import { runCommand } from './process.mjs';

let sequence = 0;
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function safeName(value, label) {
  if (!/^[A-Za-z0-9_.-]+$/.test(value ?? '')) throw new Error(`${label} must be filesystem-safe`);
  return value;
}

async function hdc({ hdcPath, target, args, outputDirectory, timeoutMs = 10_000, label }) {
  const root = path.resolve(outputDirectory);
  fs.mkdirSync(root, { recursive: true });
  const id = `hdc-${safeName(label, 'HDC label')}-${++sequence}`;
  const result = await runCommand({
    id,
    argv: [hdcPath, ...(target ? ['-t', target] : []), ...args],
    cwd: root,
    outputDirectory: root,
    timeoutMs,
  });
  const stdout = fs.readFileSync(path.join(root, result.stdout.path), 'utf8');
  const stderr = fs.readFileSync(path.join(root, result.stderr.path), 'utf8');
  const diagnostic = `${stdout}\n${stderr}`.trim();
  if (result.exitCode !== 0 || result.timedOut || result.interrupted
    || /Connect server failed/i.test(diagnostic)
    || /^\s*\[(?:Fail|F)\]/im.test(diagnostic)
    || /^\s*Sizeo of of parament '-t'/im.test(diagnostic)) {
    throw new Error(`HDC ${label} failed: ${diagnostic || `exit ${result.exitCode}`}`);
  }
  return { result, stdout: stdout.trim() };
}

export async function resolveDevice({ hdcPath, requested, outputDirectory, timeoutMs }) {
  const { stdout } = await hdc({ hdcPath, args: ['list', 'targets'], outputDirectory, timeoutMs, label: 'targets' });
  const targets = stdout.split(/\r?\n/).map((line) => line.trim().split(/\s+/)[0])
    .filter((target) => target && target !== '[Empty]');
  if (requested) {
    if (!targets.includes(requested)) throw new Error(`Harmony target ${requested} is not connected`);
    return requested;
  }
  if (targets.length === 0) throw new Error('No Harmony target is connected');
  if (targets.length !== 1) throw new Error('Specify a target when multiple Harmony targets are connected');
  return targets[0];
}

export async function stopTestApp({ hdcPath, target, bundleName, outputDirectory, timeoutMs }) {
  safeName(bundleName, 'bundleName');
  await hdc({
    hdcPath, target, outputDirectory, timeoutMs, label: 'stop-app',
    args: ['shell', 'aa', 'force-stop', bundleName],
  });
}

export async function startTestApp({
  hdcPath, target, bundleName, abilityName = 'EntryAbility', outputDirectory, timeoutMs,
}) {
  safeName(bundleName, 'bundleName');
  safeName(abilityName, 'abilityName');
  await hdc({
    hdcPath, target, outputDirectory, timeoutMs, label: 'start-app',
    args: ['shell', 'aa', 'start', '-a', abilityName, '-b', bundleName],
  });
}

export async function collectDeviceEvidence({
  hdcPath, requested, bundleName, screenshotName, outputDirectory, timeoutMs,
}) {
  safeName(bundleName, 'bundleName');
  safeName(screenshotName, 'screenshotName');
  const root = path.resolve(outputDirectory);
  fs.mkdirSync(root, { recursive: true });
  const target = await resolveDevice({ hdcPath, requested, outputDirectory: root, timeoutMs });
  const pidOutput = await hdc({
    hdcPath, target, outputDirectory: root, timeoutMs, label: 'pid',
    args: ['shell', 'pidof', bundleName],
  });
  const pids = pidOutput.stdout.split(/\s+/).filter(Boolean);
  if (pids.length !== 1 || !/^\d+$/.test(pids[0])) throw new Error(`Expected one PID for ${bundleName}`);
  const pid = pids[0];
  const log = await hdc({
    hdcPath, target, outputDirectory: root, timeoutMs, label: 'hilog',
    args: ['shell', 'hilog', '-x', '-P', pid],
  });

  const remoteScreenshot = `/data/local/tmp/sdk54-${screenshotName}.jpeg`;
  const relativeScreenshot = `device/${screenshotName}.jpeg`;
  const localScreenshot = path.join(root, relativeScreenshot);
  fs.mkdirSync(path.dirname(localScreenshot), { recursive: true });
  try {
    await hdc({
      hdcPath, target, outputDirectory: root, timeoutMs, label: 'screenshot',
      args: ['shell', 'snapshot_display', '-f', remoteScreenshot],
    });
    await hdc({
      hdcPath, target, outputDirectory: root, timeoutMs, label: 'recv-screenshot',
      args: ['file', 'recv', remoteScreenshot, localScreenshot],
    });
  } finally {
    await hdc({
      hdcPath, target, outputDirectory: root, timeoutMs, label: 'remove-screenshot',
      args: ['shell', 'rm', '-f', remoteScreenshot],
    }).catch(() => undefined);
  }
  const screenshot = fs.readFileSync(localScreenshot);
  if (decodeScreenshot(screenshot) !== 'JPEG') throw new Error('Device screenshot must be JPEG');
  const pidAfter = await hdc({
    hdcPath, target, outputDirectory: root, timeoutMs, label: 'pid-after',
    args: ['shell', 'pidof', bundleName],
  });
  if (pidAfter.stdout !== pid) throw new Error(`PID changed during capture for ${bundleName}`);
  const assertionPath = `device/${screenshotName}.json`;
  const assertion = Buffer.from(JSON.stringify({ schemaVersion: 1, kind: 'device-preflight',
    target, bundleName, pid, pidCommand: pidOutput.result, pidAfterCommand: pidAfter.result, logCommand: log.result }) + '\n');
  fs.writeFileSync(path.join(root, assertionPath), assertion);

  return {
    target,
    pid,
    evidence: [
      { type: 'device-assertion', path: assertionPath, sha256: sha256(assertion) },
      { type: 'screenshot', path: relativeScreenshot, sha256: sha256(screenshot) },
    ],
  };
}
