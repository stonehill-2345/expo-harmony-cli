import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PNG } from 'pngjs';
import { validateMultiAppM4Captures, M4_OTHER_CASES, M4_OTHER_PHYSICAL_CASES, M4_OTHER_DERIVED_CASE } from '../abc/c-verify-m4-captures.mjs';
import { completeOtherLog } from './abc-other-log-fixtures.mjs';

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const tinyPng = () => {
  const png = new PNG({ width: 2, height: 2 });
  png.data.fill(255);
  return PNG.sync.write(png);
};

// Synthetic multi-app capture structure per b-other-capture-handoff.md and the
// run-manifest schema. Parser inputs only — never device acceptance evidence.
function buildRun(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-c-captures-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const full = completeOtherLog().split('\n');
  const linesWith = (...markers) => full.filter(line => markers.some(marker => line.includes(marker)));
  const put = (name, bytes) => {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
    return { path: name, sha256: sha256(bytes) };
  };
  const target = '127.0.0.1:5555', hdc = '/opt/hdc';
  const candidate = put('candidate.json', Buffer.from('{"synthetic":true}'));
  const pngRef = put('artifacts/shot.png', tinyPng());
  const layoutRef = put('artifacts/layout.json', Buffer.from('{"attributes":{"bounds":"[0,0][1320,2856]"},"children":[]}'));
  const receipt = (name, argv, cwd, stdoutBytes) => ({
    argv, cwd, exitCode: 0, signal: null, timedOut: false, interrupted: false,
    stdout: put(`io/${name}.stdout`, stdoutBytes), stderr: put(`io/${name}.stderr`, Buffer.alloc(0)),
  });
  const captures = {}, files = {};
  const bootMarker = {
    'M4-A03-splash': 'A04_SPLASH_STATUS',
    'M4-A03-system-ui': 'A04_SYSTEM_UI',
    'M4-A03-status-bar': 'A04_SPLASH_STATUS',
    'M4-A04-linking-router': 'A_ROUTER_PROBE',
    'M4-A05-browser': 'A04_WEB_BROWSER',
  };
  const markerBootIds = (caseId, logLines) => [...new Set(logLines.flatMap(line => {
    const token = `${bootMarker[caseId]}=`;
    const index = line.indexOf(token);
    if (index < 0) return [];
    return [JSON.parse(line.slice(index + token.length)).boot];
  }))];
  const buildCapture = (caseId, bundle, pid, logLines) => {
    const hap = put(`hap/${caseId}.hap`, Buffer.from(`HAP ${caseId}`));
    const entry = {
      bundle, pid, mode: 'release',
      bootIds: markerBootIds(caseId, logLines),
      captureCwd: root, hap,
    };
    const captureValue = {
      ...entry, candidateSha256: candidate.sha256, target, systemVersion: '6.0.0.130',
      pidCommand: receipt(`${caseId}-pid`, [hdc, '-t', target, 'shell', 'pidof', bundle], root, Buffer.from(`${pid}\n`)),
      logCommand: receipt(`${caseId}-log`, [hdc, '-t', target, 'shell', 'hilog', '-x', '-P', String(pid)], root, Buffer.from(logLines.join('\n'))),
      installCommand: receipt(`${caseId}-install`, [hdc, '-t', target, 'install', '-r', hap.path], root, Buffer.from('AppMgr: install bundle successfully.')),
      screenshot: pngRef, layout: layoutRef,
    };
    const captureName = `captures/${caseId}.json`;
    files[caseId] = { entry, captureName, captureValue, hap };
    return { entry, captureName, captureValue };
  };
  const physical = {
    'M4-A03-splash': buildCapture('M4-A03-splash', 'dev.expo.a04.splash', 101, linesWith('A04_SPLASH_STATUS=')),
    'M4-A03-system-ui': buildCapture('M4-A03-system-ui', 'dev.expo.a04.systemui', 102, linesWith('A04_SYSTEM_UI=')),
    'M4-A04-linking-router': buildCapture('M4-A04-linking-router', 'dev.expo.a04.router', 103, linesWith('A_ROUTER_PROBE=', 'A_ROUTER_APP_STATE=', 'LANE_B_LINKING_PUBLIC_READY')),
    'M4-A05-browser': buildCapture('M4-A05-browser', 'dev.expo.harmony.browser', 104, linesWith('A04_WEB_BROWSER=')),
  };
  for (const [caseId, { captureName, captureValue }] of Object.entries(physical)) {
    captures[caseId] = { ...physical[caseId].entry, capture: put(captureName, Buffer.from(JSON.stringify(captureValue))) };
  }
  // status-bar shares the splash capture identity by contract.
  captures['M4-A03-status-bar'] = options.divergeStatusBar
    ? { ...structuredClone(physical['M4-A03-splash'].entry), pid: 999 }
    : { ...structuredClone(physical['M4-A03-splash'].entry), capture: captures['M4-A03-splash'].capture };
  if (options.copyStatusBarCapture) {
    captures['M4-A03-status-bar'].capture = put('captures/M4-A03-status-bar-copy.json',
      fs.readFileSync(path.join(root, captures['M4-A03-splash'].capture.path)));
  }
  // package-sync capture references the member identities.
  const memberEntries = { ...physical, 'M4-A03-status-bar': { entry: physical['M4-A03-splash'].entry } };
  const members = Object.fromEntries(M4_OTHER_CASES.map(caseId => [caseId, structuredClone(memberEntries[caseId].entry)]));
  const syncEntryBase = structuredClone(physical['M4-A03-splash'].entry);
  captures[M4_OTHER_DERIVED_CASE] = {
    ...syncEntryBase,
    capture: put('captures/M4-A07-package-sync.json', Buffer.from(JSON.stringify({
      ...syncEntryBase, candidateSha256: candidate.sha256, target, systemVersion: '6.0.0.130',
      members: options.dropSyncMember ? Object.fromEntries(Object.entries(members).slice(0, -1)) : members,
    }))),
  };
  const manifest = {
    schemaVersion: 1, runId: 'synthetic-multi-app', candidate, device: { target, platformVersion: '6.0.0.130' },
    tools: { hdc }, m4: { other: { caseCaptures: captures } },
  };
  const manifestFile = path.join(root, 'multi-app-run.json');
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  // Post-build mutations rewrite pinned bytes after the fixture exists.
  const withCapture = caseId => ({
    entry: captures[caseId], value: files[caseId]?.captureValue, root,
    captureRef: captures[caseId]?.capture, manifestFile, manifest, rewrite: () => fs.writeFileSync(manifestFile, JSON.stringify(manifest)),
  });
  options.splashMutate?.(withCapture('M4-A03-splash'));
  options.systemUiMutate?.(withCapture('M4-A03-system-ui'));
  options.linkingMutate?.(withCapture('M4-A04-linking-router'));
  options.browserMutate?.(withCapture('M4-A05-browser'));
  options.syncMutate?.(withCapture(M4_OTHER_DERIVED_CASE));
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  return { root, manifestFile, manifest, captures, files };
}

const rewrite = ref => bytes => {
  fs.writeFileSync(path.join(ref.root, ref.captureRef.path), bytes);
  ref.captureRef.sha256 = sha256(bytes);
  ref.rewrite();
};

test('accepts a complete six-entry manifest with derived package-sync as BLOCKED', t => {
  const run = buildRun(t);
  const result = validateMultiAppM4Captures(run.manifestFile);
  assert.equal(result.status, 'BLOCKED', JSON.stringify(result.cases, null, 2));
  assert.equal(result.logSemantics, 'PASS');
  assert.equal(result.artifacts, 'COMPLETE');
  for (const caseId of [...M4_OTHER_PHYSICAL_CASES, 'M4-A03-status-bar', 'M4-A07-package-sync']) {
    assert.equal(result.cases[caseId].status, 'PASS', `${caseId}: ${JSON.stringify(result.cases[caseId])}`);
  }
  assert.match(result.blockers.join(' '), /视觉证据 Oracle/);
});

test('CLI exits non-zero when complete evidence remains BLOCKED', t => {
  const run = buildRun(t);
  const script = path.resolve('scripts/sdk54/abc/c-verify-m4-captures.mjs');
  const child = spawnSync(process.execPath, [script, '--manifest', run.manifestFile], { encoding: 'utf8' });
  assert.equal(child.status, 1, child.stderr || child.stdout);
  assert.equal(JSON.parse(child.stdout).status, 'BLOCKED');
});

test('CLI exits non-zero when verification returns FAIL', t => {
  const run = buildRun(t);
  fs.writeFileSync(path.join(run.root, 'artifacts/shot.png'), 'not an image');
  const script = path.resolve('scripts/sdk54/abc/c-verify-m4-captures.mjs');
  const child = spawnSync(process.execPath, [script, '--manifest', run.manifestFile], { encoding: 'utf8' });
  assert.equal(child.status, 1, child.stderr || child.stdout);
  assert.equal(JSON.parse(child.stdout).status, 'FAIL');
});

test('rejects a manifest whose caseCaptures misses a key', t => {
  const run = buildRun(t);
  delete run.manifest.m4.other.caseCaptures['M4-A05-browser'];
  fs.writeFileSync(run.manifestFile, JSON.stringify(run.manifest));
  assert.throws(() => validateMultiAppM4Captures(run.manifestFile), /exactly/);
});

test('rejects a capture whose stored identity differs from the manifest entry', t => {
  const run = buildRun(t, { systemUiMutate: ref => {
    ref.value.pid = 777;
    rewrite(ref)(Buffer.from(JSON.stringify(ref.value)));
  } });
  const result = validateMultiAppM4Captures(run.manifestFile);
  assert.equal(result.status, 'FAIL');
  assert.match(result.cases['M4-A03-system-ui'].failures.join(' '), /identity differs|PID output/);
});

test('rejects a pid command whose stdout disagrees with the captured pid', t => {
  const run = buildRun(t, { systemUiMutate: ref => {
    ref.value.pidCommand.stdout = {
      path: ref.value.pidCommand.stdout.path,
      sha256: (() => { const bytes = Buffer.from('999\n'); fs.writeFileSync(path.join(ref.root, ref.value.pidCommand.stdout.path), bytes); return sha256(bytes); })(),
    };
    rewrite(ref)(Buffer.from(JSON.stringify(ref.value)));
  } });
  const result = validateMultiAppM4Captures(run.manifestFile);
  assert.equal(result.status, 'FAIL');
  assert.match(result.cases['M4-A03-system-ui'].failures.join(' '), /PID output/);
});

test('rejects a semantic replay whose log drops the case fixture markers', t => {
  const run = buildRun(t, { systemUiMutate: ref => {
    const lines = completeOtherLog().split('\n').filter(line => line.includes('EXPO_CORE_BOOT='));
    ref.value.logCommand.stdout = {
      path: ref.value.logCommand.stdout.path,
      sha256: (() => { const bytes = Buffer.from(lines.join('\n')); fs.writeFileSync(path.join(ref.root, ref.value.logCommand.stdout.path), bytes); return sha256(bytes); })(),
    };
    rewrite(ref)(Buffer.from(JSON.stringify(ref.value)));
  } });
  const result = validateMultiAppM4Captures(run.manifestFile);
  assert.equal(result.status, 'FAIL');
  assert.equal(result.logSemantics, 'FAIL');
  assert.ok(result.cases['M4-A03-system-ui'].failures.length);
});

test('rejects a screenshot that no longer decodes', t => {
  const run = buildRun(t, { browserMutate: ref => {
    fs.writeFileSync(path.join(ref.root, 'artifacts/shot.png'), 'not an image');
  } });
  const result = validateMultiAppM4Captures(run.manifestFile);
  assert.equal(result.status, 'FAIL');
  assert.equal(result.artifacts, 'INCOMPLETE');
  assert.match(JSON.stringify(result.cases['M4-A05-browser'].failures), /screenshot/);
});

test('rejects a status-bar entry that diverges from the shared splash identity', t => {
  const run = buildRun(t, { divergeStatusBar: true });
  const result = validateMultiAppM4Captures(run.manifestFile);
  assert.equal(result.status, 'FAIL');
  assert.match(result.cases['M4-A03-status-bar'].failures.join(' '), /identity differs/);
});

test('rejects Splash and StatusBar entries that use different capture references with identical bytes', t => {
  const run = buildRun(t, { copyStatusBarCapture: true });
  const result = validateMultiAppM4Captures(run.manifestFile);
  assert.equal(result.status, 'FAIL');
  assert.match(result.cases['M4-A03-status-bar'].failures.join(' '), /shared capture reference/);
  assert.equal(result.cases[M4_OTHER_DERIVED_CASE].status, 'FAIL');
});

test('rejects non-shared physical cases that reuse another application bundle and PID', t => {
  const run = buildRun(t, { browserMutate: ref => {
    ref.entry.bundle = 'dev.expo.a04.systemui';
    ref.entry.pid = 102;
    ref.value.bundle = ref.entry.bundle;
    ref.value.pid = ref.entry.pid;
    ref.value.pidCommand.argv = ['/opt/hdc', '-t', ref.value.target, 'shell', 'pidof', ref.entry.bundle];
    ref.value.logCommand.argv = ['/opt/hdc', '-t', ref.value.target, 'shell', 'hilog', '-x', '-P', String(ref.entry.pid)];
    const pidBytes = Buffer.from('102\n');
    fs.writeFileSync(path.join(ref.root, ref.value.pidCommand.stdout.path), pidBytes);
    ref.value.pidCommand.stdout.sha256 = sha256(pidBytes);
    rewrite(ref)(Buffer.from(JSON.stringify(ref.value)));
  } });
  const result = validateMultiAppM4Captures(run.manifestFile);
  assert.equal(result.status, 'FAIL');
  assert.match(result.cases['M4-A05-browser'].failures.join(' '), /distinct bundle and PID/);
});

test('rejects package-sync without all five member references', t => {
  const run = buildRun(t, { dropSyncMember: true });
  const result = validateMultiAppM4Captures(run.manifestFile);
  assert.equal(result.status, 'FAIL');
  assert.match(result.cases['M4-A07-package-sync'].failures.join(' '), /identity mismatch/);
});

test('package-sync preserves its own identity failure instead of overwriting it with derived PASS', t => {
  const run = buildRun(t, { syncMutate: ref => {
    const value = JSON.parse(fs.readFileSync(path.join(ref.root, ref.captureRef.path), 'utf8'));
    value.candidateSha256 = 'b'.repeat(64);
    rewrite(ref)(Buffer.from(JSON.stringify(value)));
  } });
  const result = validateMultiAppM4Captures(run.manifestFile);
  assert.equal(result.status, 'FAIL');
  assert.equal(result.cases[M4_OTHER_DERIVED_CASE].status, 'FAIL');
  assert.match(result.cases[M4_OTHER_DERIVED_CASE].failures.join(' '), /candidateSha256/);
});

test('returns FAIL instead of throwing for a package-sync capture that is not JSON', t => {
  const run = buildRun(t, { syncMutate: ref => rewrite(ref)(Buffer.from('not json')) });
  const result = validateMultiAppM4Captures(run.manifestFile);
  assert.equal(result.status, 'FAIL');
  assert.match(result.cases['M4-A07-package-sync'].failures.join(' '), /JSON/);
});

test('rejects bootIds that do not match the log boot sequence', t => {
  const run = buildRun(t, { browserMutate: ref => {
    ref.entry.bootIds = [9];
    ref.value.bootIds = [9];
    rewrite(ref)(Buffer.from(JSON.stringify(ref.value)));
    ref.rewrite();
  } });
  const result = validateMultiAppM4Captures(run.manifestFile);
  assert.equal(result.status, 'FAIL');
  assert.match(result.cases['M4-A05-browser'].failures.join(' '), /bootIds|EXPO_CORE_BOOT/);
});

test('rejects a string boot identity containing NUL even when every reference agrees', t => {
  const run = buildRun(t);
  const caseId = 'M4-A04-linking-router';
  const entry = run.manifest.m4.other.caseCaptures[caseId];
  const invalidBoot = 'uuid\0suffix';
  entry.bootIds = [invalidBoot];

  const captureFile = path.join(run.root, entry.capture.path);
  const capture = JSON.parse(fs.readFileSync(captureFile, 'utf8'));
  capture.bootIds = [invalidBoot];
  const logFile = path.join(run.root, capture.logCommand.stdout.path);
  const log = fs.readFileSync(logFile, 'utf8').split('\n').map(line => {
    const token = 'A_ROUTER_PROBE=';
    const index = line.indexOf(token);
    if (index < 0) return line;
    const value = JSON.parse(line.slice(index + token.length));
    value.boot = invalidBoot;
    return `${line.slice(0, index + token.length)}${JSON.stringify(value)}`;
  }).join('\n');
  fs.writeFileSync(logFile, log);
  capture.logCommand.stdout.sha256 = sha256(Buffer.from(log));
  const captureBytes = Buffer.from(JSON.stringify(capture));
  fs.writeFileSync(captureFile, captureBytes);
  entry.capture.sha256 = sha256(captureBytes);

  const syncEntry = run.manifest.m4.other.caseCaptures[M4_OTHER_DERIVED_CASE];
  const syncFile = path.join(run.root, syncEntry.capture.path);
  const syncCapture = JSON.parse(fs.readFileSync(syncFile, 'utf8'));
  syncCapture.members[caseId].bootIds = [invalidBoot];
  const syncBytes = Buffer.from(JSON.stringify(syncCapture));
  fs.writeFileSync(syncFile, syncBytes);
  syncEntry.capture.sha256 = sha256(syncBytes);
  fs.writeFileSync(run.manifestFile, JSON.stringify(run.manifest));

  const result = validateMultiAppM4Captures(run.manifestFile);
  assert.equal(result.status, 'FAIL');
  assert.match(result.cases[caseId].failures.join(' '), /boot identity|malformed/);
});

test('identity reference comparison ignores path and sha256 key order', t => {
  const run = buildRun(t, { systemUiMutate: ref => {
    ref.value.hap = { sha256: ref.value.hap.sha256, path: ref.value.hap.path };
    rewrite(ref)(Buffer.from(JSON.stringify(ref.value)));
  } });
  const result = validateMultiAppM4Captures(run.manifestFile);
  assert.equal(result.status, 'BLOCKED', JSON.stringify(result.cases['M4-A03-system-ui']));
});
