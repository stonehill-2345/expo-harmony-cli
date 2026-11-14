import fs from 'node:fs';
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

export function validateM4DeviceEvidence(file, scope) {
  const root = path.dirname(path.resolve(file));
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  const assertion = validateM4DeviceValue(value, scope);
  const cases = {};
  for (const [id, row] of Object.entries(assertion.cases)) {
    cases[id] = { status: row.status, semantic: row.semantic, evidence: row.evidence.map(ref => safeRef(root, ref)) };
  }
  return { ...assertion, cases };
}

export function validateM4DeviceValue(value, scope) {
  if (!M4_CASES[scope]) throw new Error('scope must be core or other');
  if (value.schemaVersion !== 1 || value.scope !== scope || !/^[a-f0-9]{64}$/.test(value.candidateSha256 ?? '')
    || typeof value.target !== 'string' || !value.target || typeof value.systemVersion !== 'string' || !value.systemVersion
    || typeof value.bundle !== 'string' || !value.bundle || !Number.isSafeInteger(value.pid) || value.pid <= 0
    || !/^[a-f0-9]{64}$/.test(value.hapSha256 ?? '') || typeof value.cases !== 'object' || value.cases === null) {
    throw new Error('invalid M4 device identity');
  }
  const manifest = value.runManifest;
  if (!manifest || manifest.candidateSha256 !== value.candidateSha256 || manifest.target !== value.target
    || manifest.bundle !== value.bundle || manifest.pid !== value.pid || manifest.hapSha256 !== value.hapSha256) {
    throw new Error('M4 identity disagrees with run-manifest');
  }
  const cases = {};
  for (const id of M4_CASES[scope]) {
    const row = value.cases[id];
    if (!row || row.status !== 'PASS' || !row.semantic || typeof row.semantic.oracle !== 'string' || !row.semantic.oracle
      || row.semantic.result !== 'PASS' || !Array.isArray(row.evidence) || row.evidence.length === 0) {
      throw new Error(`missing passing device case or semantic oracle: ${id}`);
    }
    cases[id] = { status: row.status, semantic: { oracle: row.semantic.oracle, result: row.semantic.result }, evidence: row.evidence };
  }
  return { schemaVersion: 1, kind: 'm4-device-assertion', scope, status: 'PASS', candidateSha256: value.candidateSha256,
    target: value.target, systemVersion: value.systemVersion, bundle: value.bundle, pid: value.pid, hapSha256: value.hapSha256,
    runManifest: manifest, cases };
}

function definitions(scope) {
  if (scope === 'core') return [
    { id: 'core-contracts', argv: [process.execPath, '--test', ...CORE_FILES.map(file => path.join(repository, file))] },
    { id: 'core-platform', argv: [process.execPath, '--test', '--test-name-pattern=published Core Platform accepts Harmony',
      path.join(repository, 'packages/expo-modules-core/harmony/tests/platform-declaration.test.mjs')] },
  ];
  return [{ id: 'other-contracts', argv: [process.execPath, '--test', ...OTHER_FILES.map(file => path.join(repository, file))] }];
}

export async function runM4({ scope, consumer, deviceEvidence, output }) {
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
  try { assertion = validateM4DeviceEvidence(deviceEvidence, scope); }
  catch (error) { deviceError = error.message; assertion = { schemaVersion: 1, kind: 'm4-device-assertion', scope,
    status: 'BLOCKED', blocker: deviceError, requiredCases: CASES[scope] }; }
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
    'device-evidence': { type: 'string' }, output: { type: 'string' }, help: { type: 'boolean' } } });
  if (values.help) console.log('b-run-m4.mjs --scope core|other --consumer <installed consumer> --device-evidence <json> --output <new directory>');
  else {
    try { console.log(JSON.stringify(await runM4({ scope: values.scope, consumer: values.consumer,
      deviceEvidence: values['device-evidence'], output: values.output }), null, 2)); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
