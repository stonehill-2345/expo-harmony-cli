import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const release = JSON.parse(fs.readFileSync(path.join(repository, 'docs/releases/sdk54-expo-oh-harmony.1.json'), 'utf8'));
const expo = release.packages.find((item) => item.installName === 'expo');
const rnoh = '@react-native-oh/react-native-harmony';

function loadSource(relative) {
  const filename = path.join(repository, relative);
  const localRequire = createRequire(filename);
  const require = (id) => {
    if (id === '../utils/args') return {};
    if (id === '../utils/errors') return {};
    if (id === '@expo/metro-config/build/harmonyProject') return loadSource('packages/@expo/metro-config/src/harmonyProject.ts');
    if (id.startsWith('.')) {
      const target = path.resolve(path.dirname(filename), id.replace(/\.js$/, '') + '.ts');
      if (fs.existsSync(target)) return loadSource(path.relative(repository, target));
    }
    if (id === 'fs') return localRequire('fs');
    if (id === 'path') return localRequire('path');
    if (id === 'resolve-from') return localRequire('resolve-from');
    if (id === 'chalk') return localRequire('chalk');
    throw new Error(`Unsupported platform test dependency: ${id}`);
  };
  require.resolve = localRequire.resolve;
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText.replace(/^#![^\n]*\n/, '');
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports,__filename,__dirname){${output}\n})`, { console, process }, { filename })
    (require, module, module.exports, filename, path.dirname(filename));
  return module.exports;
}

export function runHarmonyPlatformIdentity({ verbose = true } = {}) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-harmony-platform-'));
  const previous = process.env.EXPO_HARMONY_METRO;
  const cases = [];
  const write = (file, value) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
  };
  const fixture = (name, options = {}) => {
    const root = path.join(temporary, name);
    fs.mkdirSync(root, { recursive: true });
    write(path.join(root, 'package.json'), { name, dependencies: { expo: expo.installSpec, [rnoh]: release.catalog.external[rnoh] } });
    if (!options.declarationOnly) {
      const expoRoot = options.pnpm ? path.join(root, 'node_modules/.pnpm/expo/node_modules/expo') : path.join(root, 'node_modules/expo');
      write(path.join(expoRoot, 'package.json'), { name: options.official ? 'expo' : expo.publishName, version: options.expoVersion ?? expo.publishVersion });
      if (!options.noManifest) write(path.join(expoRoot, 'harmony-release.json'), options.manifest ?? release);
      if (options.pnpm) fs.symlinkSync(path.relative(path.join(root, 'node_modules'), expoRoot), path.join(root, 'node_modules/expo'), 'dir');
      if (!options.noRnoh) write(path.join(root, 'node_modules', rnoh, 'package.json'), { name: options.rnohName ?? rnoh, version: options.rnohVersion ?? release.catalog.external[rnoh] });
    }
    return root;
  };
  try {
    delete process.env.EXPO_HARMONY_METRO;
    const { enableHarmonyMetroForManagedProject: enable } = loadSource('packages/@expo/cli/src/start/index.ts');
    const check = (id, action) => {
      action();
      cases.push({ id, passed: true });
      if (verbose) console.log(`PASS ${id}`);
    };
    const installed = fixture('npm-installed');
    check('installed-adapted-project-without-managed-state', () => assert.equal(enable(installed), true));
    check('deleted-managed-state-does-not-disable-platform', () => {
      write(path.join(installed, '.expo-harmony/managed-state.json'), { sdk54: { mode: 'sdk54-scoped-packages' } });
      assert.equal(enable(installed), true);
      fs.rmSync(path.join(installed, '.expo-harmony'), { recursive: true });
      assert.equal(enable(installed), true);
    });
    check('state-only-does-not-enable-platform', () => {
      const root = fixture('state-only', { declarationOnly: true });
      write(path.join(root, '.expo-harmony/managed-state.json'), { sdk54: { mode: 'sdk54-scoped-packages' } });
      assert.equal(enable(root), false);
    });
    for (const [id, options] of [
      ['declared-only', { declarationOnly: true }], ['official-expo-with-rnoh', { official: true }],
      ['missing-rnoh', { noRnoh: true }], ['foreign-rnoh-identity', { rnohName: 'foreign-rnoh' }],
      ['wrong-rnoh-version', { rnohVersion: '0.77.71' }],
    ]) check(id, () => assert.equal(enable(fixture(id, options)), false));
    check('pnpm-linked-installed-expo', () => assert.equal(enable(fixture('pnpm-linked', { pnpm: true })), true));
    for (const [id, options] of [
      ['malformed-adapted-manifest', { manifest: '{ invalid' }], ['missing-adapted-manifest', { noManifest: true }],
      ['missing-release-expo-entry', { manifest: { ...release, packages: release.packages.filter((item) => item.installName !== 'expo') } }],
      ['wrong-adapted-expo-version', { expoVersion: '54.0.999' }],
      ['missing-rnoh-catalog-constraint', { manifest: { ...release, catalog: { external: {} } } }],
      ['foreign-release-name', { manifest: { ...release, release: 'not-our-release' } }],
      ['self-consistent-foreign-expo-and-rnoh-versions', { expoVersion: '0.0.1', rnohVersion: '0.0.2', manifest: {
        ...release, catalog: { ...release.catalog, external: { ...release.catalog.external, [rnoh]: '0.0.2' } },
        packages: release.packages.map((item) => item.installName === 'expo' ? { ...item, publishVersion: '0.0.1', installSpec: 'npm:@expo-oh/expo@0.0.1' } : item),
      } }],
      ['changed-expo-install-spec', { manifest: { ...release, packages: release.packages.map((item) => item.installName === 'expo' ? { ...item, installSpec: 'npm:@foreign/expo@54.0.38' } : item) } }],
      ['changed-expo-upstream-version', { manifest: { ...release, packages: release.packages.map((item) => item.installName === 'expo' ? { ...item, upstreamVersion: '0.0.1' } : item) } }],
      ['duplicate-release-expo-entry', { manifest: { ...release, packages: [...release.packages, expo] } }],
    ]) check(id, () => assert.throws(() => enable(fixture(id, options)), /Harmony|HARMONY|manifest|release/i));
    check('does-not-mutate-global-platform-environment', () => {
      delete process.env.EXPO_HARMONY_METRO;
      assert.equal(enable(installed), true);
      assert.equal(process.env.EXPO_HARMONY_METRO, undefined);
      process.env.EXPO_HARMONY_METRO = '1';
      assert.equal(enable(fixture('second-official-project', { official: true })), false);
      assert.equal(process.env.EXPO_HARMONY_METRO, '1');
    });
    const { isHarmonyProject, shouldEnableHarmonyMetro } = loadSource('packages/@expo/metro-config/src/harmonyProject.ts');
    check('direct-config-detection-does-not-require-start', () => assert.equal(isHarmonyProject(installed), true));
    check('metro-ignores-global-env-for-official-project', () => {
      process.env.EXPO_HARMONY_METRO = '1';
      assert.equal(shouldEnableHarmonyMetro(fixture('metro-official', { official: true })), false);
      assert.equal(shouldEnableHarmonyMetro(installed), true);
    });
    check('explicit-harmony-bundle-entry-remains-supported', () => assert.equal(shouldEnableHarmonyMetro(fixture('explicit-official', { official: true }), 'harmony'), true));
    check('checks-installed-files-again-after-change', () => {
      const root = fixture('mutable-installed');
      assert.equal(isHarmonyProject(root), true);
      write(path.join(root, 'node_modules', rnoh, 'package.json'), { name: rnoh, version: '0.77.71' });
      assert.equal(isHarmonyProject(root), false);
    });
    const sources = [
      'packages/@expo/cli/src/start/index.ts', 'packages/@expo/cli/src/harmony/project.ts',
      'packages/@expo/metro-config/src/harmonyProject.ts', 'packages/@expo/metro-config/src/ExpoMetroConfig.ts',
      'docs/releases/sdk54-expo-oh-harmony.1.json',
    ];
    return { schemaVersion: 1, passed: true, scope: 'Real npm/pnpm-layout installed files; original TypeScript functions transpiled without identity mocks. No bundle or device acceptance.',
      sourceInputs: sources.map((file) => ({ path: file, sha256: createHash('sha256').update(fs.readFileSync(path.join(repository, file))).digest('hex') })), cases };
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
    if (previous === undefined) delete process.env.EXPO_HARMONY_METRO;
    else process.env.EXPO_HARMONY_METRO = previous;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = runHarmonyPlatformIdentity();
  if (process.argv[2]) fs.writeFileSync(process.argv[2], `${JSON.stringify(result, null, 2)}\n`);
}
