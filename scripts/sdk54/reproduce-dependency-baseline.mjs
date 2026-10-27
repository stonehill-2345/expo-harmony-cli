import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));
const routerSource = 'packages/expo-router/src/doctor/index.ts';
const validatorSource = 'packages/@expo/cli/src/start/doctor/dependencies/validateDependenciesVersions.ts';
const checkSource = 'packages/@expo/cli/src/install/checkPackages.ts';
const routerRequire = createRequire(path.join(root, routerSource));
const semver = routerRequire('semver');
const manifest = routerRequire('../../package.json');
const allowed = { ...manifest.dependencies, ...manifest.peerDependencies };
const native = '@react-navigation/native';
const bottom = '@react-navigation/bottom-tabs';
const stack = '@react-navigation/native-stack';
const formatting = { bold: (text) => text, learnMore: (text) => text };

// Only TypeScript syntax is erased. Router and version predicates execute their
// original source; CLI configuration, installation and terminal I/O are isolated.
function loadSource(relative, overrides = {}, globals = {}) {
  const filename = path.join(root, relative);
  const localRequire = createRequire(filename);
  const require = (id) => Object.hasOwn(overrides, id) ? overrides[id] : localRequire(id);
  require.resolve = localRequire.resolve;
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  const context = vm.createContext({ console, process, ...globals });
  vm.runInContext(`(function(require,module,exports,__filename,__dirname){${output}\n})`, context, { filename })
    (require, module, module.exports, filename, path.dirname(filename));
  return module.exports;
}

export const dependencyCases = [
  { id: 'NAV-BOTTOM-EXACT', name: bottom, spec: '7.4.0', version: '7.4.0', knownMismatch: true },
  { id: 'NAV-NATIVE-EXACT', name: native, spec: '7.1.17', version: '7.1.17', knownMismatch: true },
  { id: 'NAV-STACK-EXACT', name: stack, spec: '7.3.16', version: '7.3.16', knownMismatch: true },
  { id: 'RANGE-SUBRANGE', name: native, spec: '^7.1.17', version: '7.1.17', knownMismatch: true },
  { id: 'RANGE-INVALID', name: native, spec: '^6.0.0', version: '6.0.0', expectDiagnostic: true, knownMismatch: false },
  { id: 'RANGE-FULL', name: native, spec: '^7.1.8', version: '7.1.17', knownMismatch: false },
  { id: 'ALIAS-COMPATIBLE', name: native, spec: 'npm:@react-navigation/native@7.1.17', version: '7.1.17', knownMismatch: true },
  { id: 'ALIAS-WRONG-TARGET', name: native, spec: 'npm:foreign-nav@7.1.17', version: '7.1.17', expectDiagnostic: true, knownMismatch: true },
  { id: 'TRANSITIVE-ONLY', name: native, version: '7.1.17', knownMismatch: false },
  { id: 'TRANSITIVE-DUPLICATE', name: native, spec: '^7.1.8', version: '7.1.17', duplicate: true, expectWarning: true, knownMismatch: true },
  { id: 'TRANSITIVE-EXCLUDED', name: native, spec: '7.1.17', version: '7.1.17', duplicate: true, excluded: true, expectWarning: true, knownMismatch: false },
];

export function assertDesiredBehavior(entry) {
  if (entry.id === 'CHECK-PACKAGES-JSON') {
    assert.equal(entry.exitCode, 0, 'compatible versions must not exit 1');
    assert.equal(entry.json.upToDate, true);
    assert.equal(entry.json.dependencies.length, 0);
    return;
  }
  assert.equal(entry.actual.error, null, `${entry.id}: dependency syntax must produce a diagnostic instead of throwing`);
  assert.equal(entry.actual.diagnostics.length, entry.expected.diagnostics, `${entry.id}: incorrect diagnostic count`);
  assert.equal(entry.actual.warnings.length, entry.expected.warnings, `${entry.id}: incorrect warning count`);
}

export async function runDependencyBaseline() {
  const warnings = [];
  const { doctor } = loadSource(routerSource, {}, { console: { ...console, warn: (...args) => warnings.push(args.join(' ')) } });
  const { isDependencyVersionIncorrect } = loadSource(validatorSource, {
    '../../../harmony/release': {}, './getVersionedPackages': {}, './resolvePackages': {},
    '../../../log': {}, '../../../utils/env': {},
  });
  const cases = dependencyCases.map((fixture) => {
    warnings.length = 0;
    const pkg = { dependencies: fixture.spec ? { [fixture.name]: fixture.spec } : {},
      ...(fixture.excluded ? { expo: { install: { exclude: [fixture.name] } } } : {}) };
    let diagnostics = [], error = null;
    try { diagnostics = doctor(pkg, fixture.duplicate ? '/fixture/other/native.js' : undefined, formatting); }
    catch (caught) { error = `${caught.name}: ${caught.message}`; }
    const entry = {
      ...fixture, allowedRange: allowed[fixture.name],
      installedVersionSatisfies: semver.satisfies(fixture.version, allowed[fixture.name]),
      standardVersionCheckIncorrect: isDependencyVersionIncorrect(fixture.name, fixture.version, allowed[fixture.name]),
      expected: { diagnostics: fixture.expectDiagnostic ? 1 : 0, warnings: fixture.expectWarning ? 1 : 0 },
      actual: { diagnostics: JSON.parse(JSON.stringify(diagnostics)), warnings: [...warnings], error },
      coverage: fixture.spec ? 'explicit declaration; resolved version predicate checked separately' : 'transitive dependencies skipped; compatibility NOT verified',
    };
    let mismatch = false;
    try { assertDesiredBehavior(entry); } catch { mismatch = true; }
    assert.equal(mismatch, fixture.knownMismatch, `${fixture.id}: source behavior changed; review baseline`);
    if (fixture.spec?.startsWith('npm:')) assert.match(error ?? '', /Invalid comparator/);
    entry.desiredBehavior = mismatch ? 'FAIL' : 'PASS';
    entry.reproduction = 'PASS';
    return entry;
  });
  const logs = [];
  const pkg = { dependencies: { 'expo-router': manifest.version,
    [bottom]: '7.4.0', [native]: '7.1.17', [stack]: '7.3.16' } };
  const forbidden = () => { throw new Error('Installation/interactive side effects forbidden in baseline'); };
  class Exit extends Error { constructor(code) { super('isolated process.exit'); this.code = code; } }
  const cliRequire = createRequire(path.join(root, checkSource));
  const { checkPackagesAsync } = loadSource(checkSource, {
    '@expo/config': { getConfig: () => ({ pkg, exp: { sdkVersion: '54.0.0' } }) },
    './fixPackages': { fixPackagesAsync: forbidden },
    '../log': { log: forbidden, exit: forbidden },
    '../start/doctor/dependencies/validateDependenciesVersions': {
      getVersionedDependenciesAsync: async () => [], logIncorrectDependencies: forbidden,
    },
    '../utils/interactive': { isInteractive: forbidden }, '../utils/link': formatting,
    '../utils/prompts': { confirmAsync: forbidden }, '../utils/strings': {},
    'expo-router/doctor.js': { doctor },
    'resolve-from': { silent: () => routerRequire.resolve(native) },
    chalk: cliRequire('chalk'),
  }, { console: { ...console, log: (value) => logs.push(value) }, process: { exit: (code) => { throw new Exit(code); } } });
  let exitCode = 0;
  try {
    await checkPackagesAsync('/fixture', { packages: [], packageManager: {}, options: { fix: false, json: true }, packageManagerArguments: [] });
  } catch (error) { if (error instanceof Exit) exitCode = error.code; else throw error; }
  assert.equal(logs.length, 1);
  const json = JSON.parse(logs[0]);
  assert.equal(exitCode, 1);
  assert.equal(json.upToDate, false);
  assert.deepEqual(json.dependencies.map((entry) => entry.packageName).sort(), [bottom, native, stack].sort());
  return {
    schemaVersion: 1, productFixed: false,
    scope: 'Current TypeScript source, real semver; CLI config/version collection/I/O isolated. Not packed CLI or device acceptance.',
    sourceInputs: [routerSource, 'packages/expo-router/package.json', checkSource, validatorSource].map((file) => ({
      path: file, sha256: createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex'),
    })),
    cases,
    integration: { id: 'CHECK-PACKAGES-JSON', exitCode, json, desiredBehavior: 'FAIL', reproduction: 'PASS' },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await runDependencyBaseline();
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--output')) throw new Error('Usage: --output <json>');
  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (args[1]) fs.writeFileSync(args[1], output); else process.stdout.write(output);
}
