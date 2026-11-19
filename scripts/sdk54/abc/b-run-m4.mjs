import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { runCommand } from '../ai-e2e/process.mjs';
import { isMain, repository, sha256, writeJSON } from './a-common.mjs';

export const M4_CASES = Object.freeze({
  core: ['M4-A06-error', 'M4-A06-async', 'M4-A06-events', 'M4-A06-resources', 'M4-A06-view', 'M4-A06-reload', 'M4-A06-runtime-isolation'],
  other: ['M4-A03-splash', 'M4-A03-system-ui', 'M4-A03-status-bar', 'M4-A04-linking-router', 'M4-A05-browser', 'M4-A07-package-sync'],
});
const CASES = M4_CASES;

const CORE_FILES = [
  'packages/expo-modules-core/harmony/example/tests/device-log.test.cjs',
  'packages/expo-modules-core/harmony/example/tests/view-lifecycle.test.cjs',
  'packages/expo-modules-core/harmony/example/tests/verify-install.test.cjs',
];
const OTHER_FILES = [
  'packages/expo-splash-screen/harmony/tests/splash-screen-controller.test.mjs',
  'packages/expo-splash-screen/harmony/tests/splash-screen-module.test.cjs',
  'packages/expo-splash-screen/harmony/tests/splash-screen-view.test.cjs',
  'packages/expo-system-ui/harmony/tests/system-ui-color.test.mjs',
  'packages/expo-system-ui/harmony/tests/system-ui-module.test.cjs',
  'packages/expo-linking/harmony/tests/linking-lifecycle.test.mjs',
  'packages/expo-linking/harmony/tests/open-url.test.mjs',
  'packages/expo-web-browser/harmony/tests/web-browser.test.cjs',
  'packages/expo-router/harmony/tests/context.test.mjs',
  'packages/expo-router/harmony/tests/linking-reload.test.cjs',
  'packages/expo-router/harmony/tests/native-dismiss.test.cjs',
  'packages/expo-router/harmony/tests/platform-routes.test.cjs',
];

function safeRef(root, ref) {
  if (!ref || typeof ref.path !== 'string' || !/^[a-f0-9]{64}$/.test(ref.sha256 ?? '')
    || path.isAbsolute(ref.path) || ref.path.split(/[\\/]/).includes('..')) throw new Error('invalid evidence reference');
  const file = fs.realpathSync(path.join(root, ref.path));
  if (!file.startsWith(fs.realpathSync(root) + path.sep)) throw new Error('evidence escapes input root');
  const bytes = fs.readFileSync(file);
  if (sha256(bytes) !== ref.sha256) throw new Error(`evidence SHA256 mismatch: ${ref.path}`);
  return { path: ref.path, sha256: ref.sha256, bytes: bytes.length };
}

// All references are relative to the independent run manifest, never the assertion.
export function validateM4DeviceEvidence(file, scope, runManifestFile) {
  if (!runManifestFile) throw new Error('independent run-manifest is required');
  const root = path.dirname(path.resolve(runManifestFile));
  const readReference = ref => {
    safeRef(root, ref);
    return { bytes: fs.readFileSync(path.join(root, ref.path)) };
  };
  return validateM4DeviceValue(JSON.parse(fs.readFileSync(file, 'utf8')), scope,
    JSON.parse(fs.readFileSync(runManifestFile, 'utf8')), readReference);
}

export function validateM4DeviceValue(value, scope, manifest, readReference) {
  if (!Object.hasOwn(M4_CASES, scope)) throw new Error('invalid M4 scope');
  const expected = manifest?.m4?.[scope];
  if (!expected || typeof readReference !== 'function') throw new Error('independent run-manifest M4 identity is required');
  if (value?.schemaVersion !== 1 || value.kind !== 'm4-device-assertion' || value.scope !== scope || value.status !== 'PASS'
    || !manifest.runId || value.runId !== manifest.runId || !manifest.tools?.hdc
    || !/^[a-f0-9]{64}$/.test(manifest.candidate?.sha256 ?? '')
    || value.candidateSha256 !== manifest.candidate.sha256 || !manifest.device?.target
    || value.target !== manifest.device.target || !manifest.device.platformVersion
    || value.systemVersion !== manifest.device.platformVersion
    || !/^[A-Za-z0-9_.-]+$/.test(expected.bundle ?? '') || value.bundle !== expected.bundle
    || !Number.isSafeInteger(expected.pid) || expected.pid <= 0 || value.pid !== expected.pid
    || !/^[a-f0-9]{64}$/.test(expected.hap?.sha256 ?? '') || value.hapSha256 !== expected.hap.sha256
    || typeof expected.captureCwd !== 'string' || !path.isAbsolute(expected.captureCwd)
    || !['debug', 'release'].includes(expected.mode) || value.mode !== expected.mode
    || !Array.isArray(expected.bootIds) || expected.bootIds.length < 2
    || expected.bootIds.some(id => !Number.isSafeInteger(id)) || new Set(expected.bootIds).size !== expected.bootIds.length) {
    throw new Error('M4 identity differs from independent run-manifest');
  }
  const read = (ref, label) => {
    if (!ref || typeof ref.path !== 'string' || path.isAbsolute(ref.path) || ref.path.includes('\\')
      || ref.path.split('/').includes('..') || !/^[a-f0-9]{64}$/.test(ref.sha256 ?? '')) throw new Error(`invalid ${label} reference`);
    const bytes = readReference(ref, label)?.bytes;
    if (!Buffer.isBuffer(bytes) || sha256(bytes) !== ref.sha256) throw new Error(`${label} missing or hash mismatch`);
    return bytes;
  };
  read(manifest.candidate, 'candidate');
  read(expected.hap, 'HAP');
  const command = (row, args, label) => {
    if (!row || row.cwd !== expected.captureCwd || row.exitCode !== 0 || row.signal !== null || row.timedOut !== false || row.interrupted !== false
      || JSON.stringify(row.argv) !== JSON.stringify([manifest.tools.hdc, '-t', value.target, ...args])) {
      throw new Error(`${label} command does not match selected device/process`);
    }
    const stdout = read(row.stdout, `${label} stdout`);
    read(row.stderr, `${label} stderr`);
    return stdout;
  };
  const pid = command(value.pidCommand, ['shell', 'pidof', expected.bundle], 'PID').toString('utf8').trim();
  if (pid !== String(expected.pid)) throw new Error('PID output differs from independent identity');
  const log = command(value.logCommand, ['shell', 'hilog', '-x', '-P', String(expected.pid)], 'hilog');
  const installed = command(value.installCommand, ['install', '-r', expected.hap.path], 'HAP install').toString('utf8');
  if (!/install bundle successfully/i.test(installed) || /\b(fail(?:ed|ure)?|error)\b/i.test(installed)) throw new Error('HAP install has no successful receipt');
  const text = log.toString('utf8');
  const boots = [...text.matchAll(/EXPO_CORE_BOOT=([^\n]*)/g)].map(match => JSON.parse(match[1]));
  if (JSON.stringify(boots.map(boot => boot.id)) !== JSON.stringify(expected.bootIds)
    || boots.some(boot => boot.dev !== (expected.mode === 'debug'))) throw new Error('boot sequence/mode differs from independent identity');
  if (!value.cases || JSON.stringify(Object.keys(value.cases).sort()) !== JSON.stringify([...M4_CASES[scope]].sort())) {
    throw new Error('M4 case set differs from required scope');
  }
  for (const [id, row] of Object.entries(value.cases)) {
    if (row?.status !== 'PASS' || !Array.isArray(row.evidence) || !row.evidence.some(ref =>
      ref.path === value.logCommand.stdout.path && ref.sha256 === value.logCommand.stdout.sha256)) throw new Error(`missing PID-scoped log for ${id}`);
    for (const ref of row.evidence) read(ref, id);
  }
  // These checkers inspect bytes. An input's semantic.oracle/result is never authority.
  const checker = scope === 'core'
    ? 'packages/expo-modules-core/harmony/example/tools/check-i0-log.cjs'
    : 'scripts/sdk54/abc/check-other-log.cjs';
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'm4-oracle-'));
  let replay;
  try {
    const input = path.join(temp, 'device.log'); fs.writeFileSync(input, log);
    replay = spawnSync(process.execPath, [path.join(repository, checker), input, expected.mode, '--reload'],
      { encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024, env: { PATH: process.env.PATH } });
    if (replay.error || replay.status !== 0 || replay.signal) throw new Error(`M4 semantic oracle rejected log: ${replay.error?.message ?? replay.stderr}`);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  const semantic = { oracle: checker, sha256: sha256(fs.readFileSync(path.join(repository, checker))),
    result: 'PASS', stdout: replay.stdout, stderr: replay.stderr };
  return { schemaVersion: 1, kind: 'm4-device-assertion', scope, status: 'PASS', runId: value.runId,
    candidateSha256: value.candidateSha256, target: value.target, systemVersion: value.systemVersion,
    bundle: value.bundle, pid: value.pid, hapSha256: value.hapSha256, mode: value.mode,
    bootIds: expected.bootIds, pidCommand: value.pidCommand, logCommand: value.logCommand, installCommand: value.installCommand,
    cases: Object.fromEntries(M4_CASES[scope].map(id => [id, { status: 'PASS', semantic, evidence: value.cases[id].evidence }])) };
}

function definitions(scope) {
  if (scope === 'core') return [
    { id: 'core-contracts', argv: [process.execPath, '--test', ...CORE_FILES.map(file => path.join(repository, file))] },
    { id: 'core-platform', argv: [process.execPath, '--test', '--test-name-pattern=published Core Platform accepts Harmony',
      path.join(repository, 'packages/expo-modules-core/harmony/tests/platform-declaration.test.mjs')] },
  ];
  return [{ id: 'other-contracts', argv: [process.execPath, '--test', ...OTHER_FILES.map(file => path.join(repository, file))] }];
}

export async function runM4({ scope, consumer, deviceEvidence, runManifest, output }) {
  if (!CASES[scope]) throw new Error('scope must be core or other');
  const destination = path.resolve(output);
  if (fs.existsSync(destination)) throw new Error(`output exists: ${destination}`);
  const consumerRoot = fs.realpathSync(path.resolve(consumer));
  const nodeModules = path.join(consumerRoot, 'node_modules');
  if (!fs.statSync(nodeModules).isDirectory()) throw new Error('consumer node_modules is required');
  fs.mkdirSync(destination, { recursive: true });
  const previous = { tooling: process.env.EXPO_HARMONY_TOOLING_ROOT, modules: process.env.EXPO_HARMONY_CONSUMER_NODE_MODULES,
    core: process.env.EXPO_CORE_DECLARATION_PACKAGE, options: process.env.NODE_OPTIONS };
  Object.assign(process.env, { EXPO_HARMONY_TOOLING_ROOT: repository, EXPO_HARMONY_CONSUMER_NODE_MODULES: nodeModules,
    EXPO_CORE_DECLARATION_PACKAGE: path.join(nodeModules, 'expo-modules-core'), NODE_OPTIONS: '--experimental-vm-modules' });
  const commands = [];
  try {
    for (const command of definitions(scope)) commands.push(await runCommand({ ...command, cwd: repository,
      outputDirectory: destination, timeoutMs: 300_000 }));
  } finally {
    for (const [key, value] of Object.entries({ EXPO_HARMONY_TOOLING_ROOT: previous.tooling,
      EXPO_HARMONY_CONSUMER_NODE_MODULES: previous.modules, EXPO_CORE_DECLARATION_PACKAGE: previous.core, NODE_OPTIONS: previous.options })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
  let assertion;
  let deviceError = null;
  try { assertion = validateM4DeviceEvidence(deviceEvidence, scope, runManifest); }
  catch (error) { deviceError = error.message; assertion = { schemaVersion: 1, kind: 'm4-device-assertion', scope,
    status: 'BLOCKED', blocker: deviceError, requiredCases: CASES[scope] }; }
  // The log checker replays event/state-machine semantics for the six Other
  // cases. Pixel-level rendering evidence (ArkWeb page, window colors, decoded
  // screenshots) still needs the historical image verifiers, whose originals
  // are missing; a log PASS alone must not close the Other scope.
  if (scope === 'other' && !deviceError) {
    deviceError = 'BLOCKED: Other image/pixel evidence verifiers are missing (verify-browser-evidence.cjs, system-ui and splash-status evidence originals)';
    assertion = { ...assertion, status: 'BLOCKED', logSemantics: 'PASS', blocker: deviceError };
  }
  writeJSON(path.join(destination, 'device-assertion.json'), assertion);
  const hostPassed = commands.every(row => row.exitCode === 0 && !row.timedOut && !row.interrupted);
  const status = hostPassed && !deviceError ? 'PASS' : hostPassed ? 'BLOCKED' : 'FAIL';
  const result = { schemaVersion: 1, scope, status, consumer: consumerRoot, deviceEvidence: path.resolve(deviceEvidence),
    commands, deviceAssertion: { path: 'device-assertion.json', sha256: sha256(fs.readFileSync(path.join(destination, 'device-assertion.json'))) },
    blockers: deviceError ? [deviceError] : [], failures: commands.filter(row => row.exitCode !== 0).map(row => row.id) };
  writeJSON(path.join(destination, 'result.json'), result);
  if (status !== 'PASS') process.exitCode = 1;
  return result;
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({ options: { scope: { type: 'string' }, consumer: { type: 'string' },
    'device-evidence': { type: 'string' }, 'run-manifest': { type: 'string' }, output: { type: 'string' }, help: { type: 'boolean' } } });
  if (values.help) console.log('b-run-m4.mjs --scope core|other --consumer <installed consumer> --device-evidence <json> --run-manifest <independent run json> --output <new directory>');
  else {
    try { console.log(JSON.stringify(await runM4({ scope: values.scope, consumer: values.consumer,
      deviceEvidence: values['device-evidence'], runManifest: values['run-manifest'], output: values.output }), null, 2)); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
