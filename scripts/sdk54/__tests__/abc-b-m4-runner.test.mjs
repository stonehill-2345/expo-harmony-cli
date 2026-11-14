import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { commandResult, evidenceFile } from './ai-e2e-fixtures.mjs';
import { verifyM4DeviceAssertion } from '../ai-e2e/evidence.mjs';

import { validateM4DeviceEvidence } from '../abc/b-run-m4.mjs';
import { completeCommands } from '../abc/b-complete-v02-commands.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../ai-e2e/cases/registry.json', import.meta.url))).stages['V-02'];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function device(root, scope, ids) {
  const evidence = Buffer.from('device evidence'); fs.writeFileSync(path.join(root, 'evidence.txt'), evidence);
  const value = { schemaVersion: 1, scope, candidateSha256: 'a'.repeat(64), target: '127.0.0.1:5555', systemVersion: '6.0.0.112',
    bundle: 'dev.expo.m4', pid: 42, hapSha256: 'b'.repeat(64), runManifest: { candidateSha256: 'a'.repeat(64), target: '127.0.0.1:5555', bundle: 'dev.expo.m4', pid: 42, hapSha256: 'b'.repeat(64) }, cases: Object.fromEntries(ids.map(id => [id,
      { status: 'PASS', semantic: { oracle: 'fixture-oracle', result: 'PASS' }, evidence: [{ path: 'evidence.txt', sha256: sha(evidence) }] }])) };
  const file = path.join(root, `${scope}.json`); fs.writeFileSync(file, JSON.stringify(value)); return file;
}

test('rejects fully self-reported semantic PASS and embedded identity without independent context', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm4-forged-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const ids = ['M4-A06-error','M4-A06-async','M4-A06-events','M4-A06-resources','M4-A06-view','M4-A06-reload','M4-A06-runtime-isolation'];
  assert.throws(() => validateM4DeviceEvidence(device(root, 'core', ids), 'core'), /independent|manifest/i);
});

// Synthetic parser inputs only; never device acceptance evidence.
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm4-replay-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const names = createRequire(import.meta.url)('../../../packages/expo-modules-core/harmony/example/tools/core-test-cases.cjs');
  const full = Object.entries(names).map(([marker, cases]) => marker + '=' + JSON.stringify(cases.map(name =>
    ({ name, passed: true, detail: 'synthetic parser input' })))).join('\n');
  const boot = id => ['EXPO_CORE_BOOT=' + JSON.stringify({ id, dev: false }), full,
    'EXPO_STANDARD_STARTUP_REGISTERED', 'I0_CONSTANTS_PASS=' + JSON.stringify({ debugMode: false, jsDev: false,
      sessionId: 'session-' + id, publicConfig: { scheme: 'fixture' }, fontCount: 1, runId: id, boot: id }),
    'I0_ASSET_PASS=' + JSON.stringify({ runId: id, boot: id, localUri: 'file://local', embeddedUri: 'file://embedded' })].join('\n');
  const log = [boot(1), 'EXPO_CORE_PUBLIC_RELOAD_REQUEST=1', 'EXPO_CORE_VIEW_PENDING_RELOAD=1', boot(2),
    'EXPO_CORE_INTEROP_NATIVE_LATE_REJECTION destroyed=true', 'EXPO_CORE_VIEW_DELAYED_READ_FINISHED invalid=1 delay=1000'].join('\n');
  const candidate = evidenceFile(root, 'candidate.json', '{"synthetic":true}');
  const hap = evidenceFile(root, 'fixture.hap', 'synthetic HAP');
  const manifest = { runId: 'synthetic', candidate, tools: { hdc: 'hdc' }, device: { target: 'TEST_ONLY', platformVersion: '6.0' },
    m4: { core: { captureCwd: root, bundle: 'dev.expo.test', pid: 42, hap, mode: 'release', bootIds: [1, 2] } } };
  const pidCommand = commandResult(root, 'pid', '42\n', ['hdc', '-t', 'TEST_ONLY', 'shell', 'pidof', 'dev.expo.test']);
  const logCommand = commandResult(root, 'hilog', log, ['hdc', '-t', 'TEST_ONLY', 'shell', 'hilog', '-x', '-P', '42']);
  const installCommand = commandResult(root, 'install', 'install bundle successfully.', ['hdc', '-t', 'TEST_ONLY', 'install', '-r', 'fixture.hap']);
  const ids = ['M4-A06-error','M4-A06-async','M4-A06-events','M4-A06-resources','M4-A06-view','M4-A06-reload','M4-A06-runtime-isolation'];
  const value = { schemaVersion: 1, kind: 'm4-device-assertion', scope: 'core', status: 'PASS', runId: 'synthetic',
    candidateSha256: candidate.sha256, target: 'TEST_ONLY', systemVersion: '6.0', bundle: 'dev.expo.test', pid: 42,
    hapSha256: hap.sha256, mode: 'release', pidCommand, logCommand, installCommand,
    cases: Object.fromEntries(ids.map(id => [id, { status: 'PASS', evidence: [logCommand.stdout] }])) };
  const file = path.join(root, 'assertion.json'), run = path.join(root, 'run-manifest.json');
  const save = () => { fs.writeFileSync(file, JSON.stringify(value)); fs.writeFileSync(run, JSON.stringify(manifest)); };
  const replaceLog = text => { const ref = evidenceFile(root, logCommand.stdout.path, text); logCommand.stdout = ref;
    for (const row of Object.values(value.cases)) row.evidence = [ref]; };
  save();
  return { root, value, manifest, file, run, save, replaceLog, log };
}

test('replays existing Core oracle and recomputes semantic results from captured bytes', t => {
  const f = fixture(t);
  const result = validateM4DeviceEvidence(f.file, 'core', f.run);
  assert.equal(result.status, 'PASS');
  assert.match(result.cases['M4-A06-resources'].semantic.stdout, /RESULT=PASS/);
  assert.doesNotMatch(JSON.stringify(result), /fixture-oracle/);
});

for (const [name, mutate] of [
  ['candidate', f => { f.value.candidateSha256 = 'a'.repeat(64); }],
  ['target', f => { f.value.target = 'other'; }],
  ['bundle', f => { f.value.bundle = 'other.bundle'; }],
  ['PID', f => { f.value.pid = 99; }],
  ['HAP', f => { f.value.hapSha256 = 'a'.repeat(64); }],
  ['system', f => { f.value.systemVersion = 'other'; }],
  ['run', f => { f.value.runId = 'other'; }],
  ['boot', f => { f.manifest.m4.core.bootIds = [3, 4]; }],
  ['mode', f => { f.value.mode = 'debug'; }],
  ['HAP bytes', f => { fs.writeFileSync(path.join(f.root, 'fixture.hap'), 'changed'); }],
  ['candidate bytes', f => { fs.writeFileSync(path.join(f.root, 'candidate.json'), 'changed'); }],
  ['PID command', f => { f.value.pidCommand.argv[5] = 'other'; }],
  ['PID output', f => { f.value.pidCommand.stdout = evidenceFile(f.root, 'wrong-pid.log', '99'); }],
  ['unscoped log', f => { f.value.logCommand.argv.pop(); }],
  ['wrong install cwd', f => { f.value.installCommand.cwd = '/unrelated'; }],
  ['failed install', f => { f.value.installCommand.exitCode = 1; }],
  ['fake install', f => { f.value.installCommand.stdout = evidenceFile(f.root, 'wrong-install.log', 'ok'); }],
  ['unknown oracle with arbitrary log', f => { f.replaceLog('device evidence'); }],
  ['missing Asset result', f => { f.replaceLog(f.log.split('\n').filter(line => !line.startsWith('I0_ASSET_PASS=')).join('\n')); }],
  ['stale callback', f => { f.replaceLog(f.log + '\nEXPO_CORE_STALE_CALLBACK'); }],
  ['late completion missing', f => { f.replaceLog(f.log.replace('EXPO_CORE_INTEROP_NATIVE_LATE_REJECTION destroyed=true', '')); }],
  ['failed native row', f => { f.replaceLog(f.log.replace('"passed":true', '"passed":false')); }],
  ['missing case', f => { delete f.value.cases['M4-A06-error']; }],
  ['unknown case', f => { f.value.cases.extra = { status: 'PASS', evidence: [f.value.logCommand.stdout] }; }],
  ['traversal', f => { f.value.logCommand.stdout.path = '../escape.log'; }],
  ['symlink escape', f => { fs.symlinkSync('/etc/hosts', path.join(f.root, 'escape')); f.value.logCommand.stdout.path = 'escape'; }],
]) test('rejects ' + name + ' even with self-reported semantic PASS', t => {
  const f = fixture(t); mutate(f);
  for (const row of Object.values(f.value.cases)) row.semantic = { oracle: 'fixture-oracle', result: 'PASS' };
  f.value.runManifest = { ...f.value }; // Embedded self-consistency must not become authority.
  f.save(); assert.throws(() => validateM4DeviceEvidence(f.file, 'core', f.run));
});

test('report verifier reruns oracle rather than trusting producer PASS', t => {
  const f = fixture(t);
  const read = ref => ({ bytes: fs.readFileSync(path.join(f.root, ref.path)) });
  let errors = [];
  verifyM4DeviceAssertion(JSON.stringify(f.value), f.manifest, read, errors, 'core');
  assert.deepEqual(errors, []);
  f.replaceLog(f.log.replace('"passed":true', '"passed":false'));
  errors = [];
  verifyM4DeviceAssertion(JSON.stringify(f.value), f.manifest, read, errors, 'core');
  assert.match(errors.join('\n'), /oracle rejected/);
  errors = [];
  verifyM4DeviceAssertion(JSON.stringify(f.value), f.manifest, read, errors, 'other');
  assert.ok(errors.length);
});

test('Other complete case list remains blocked without complete device oracles', t => {
  const f = fixture(t); f.value.scope = 'other'; f.manifest.m4.other = f.manifest.m4.core;
  f.value.cases = Object.fromEntries(['M4-A03-splash','M4-A03-system-ui','M4-A03-status-bar','M4-A04-linking-router','M4-A05-browser','M4-A07-package-sync']
    .map(id => [id, { status: 'PASS', semantic: { oracle: 'fake', result: 'PASS' }, evidence: [f.value.logCommand.stdout] }]));
  f.save(); assert.throws(() => validateM4DeviceEvidence(f.file, 'other', f.run), /complete Other semantic oracles unavailable/);
});

test('adds real Core and Other commands to the complete V-02 case set', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm4-commands-'));
  const base = path.join(root, 'base.json'), output = path.join(root, 'commands.json'), run = path.join(root, 'run'), consumer = path.join(root, 'consumer');
  fs.mkdirSync(run); fs.mkdirSync(consumer);
  const cases = registry.filter(row => !['V02-CORE-M4','V02-OTHER-M4'].includes(row.id)).map(row => ({ id: row.id, semanticCaseIds: [], command: { argv: ['node','x'], cwd: '.', timeoutMs: 1, evidence: [] } }));
  fs.writeFileSync(base, JSON.stringify({ schemaVersion: 1, stage: 'V-02', cases }));
  const result = completeCommands({ base, consumer, runDirectory: run, coreDeviceEvidence: path.join(root, 'core.json'),
    otherDeviceEvidence: path.join(root, 'other.json'), output });
  assert.equal(result.cases.length, 19); assert.equal(result.omittedCases.length, 0);
  assert.deepEqual(result.cases.map(row=>row.id).sort(),registry.map(row=>row.id).sort());
  const forged = structuredClone(cases); forged[0].id = 'V02-INVENTED';
  fs.writeFileSync(base, JSON.stringify({schemaVersion:1,stage:'V-02',cases:forged}));
  assert.throws(()=>completeCommands({base,consumer,runDirectory:run,coreDeviceEvidence:path.join(root,'core.json'),
    otherDeviceEvidence:path.join(root,'other.json'),output:path.join(root,'forged.json')}),/registered V-02 case set/);
  assert.equal(fs.existsSync(path.join(root,'forged.json')),false);
  for (const id of ['V02-CORE-M4','V02-OTHER-M4']) {
    const row = result.cases.find(item => item.id === id);
    assert.match(row.command.argv[1], /b-run-m4\.mjs$/); assert.ok(row.command.argv.includes('--device-evidence'));
    assert.ok(row.command.argv.includes('--run-manifest'));
    assert.equal(row.command.evidence[0].type, 'device-assertion');
  }
  fs.rmSync(root, { recursive: true, force: true });
});
