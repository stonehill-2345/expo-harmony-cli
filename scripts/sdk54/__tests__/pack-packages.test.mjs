import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

import { extract as extractTar } from 'tar';

import { SDK54_PACKAGES, getDescriptorByName } from '../catalog.mjs';
import { packPackages, compareRounds } from '../pack-packages.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXED_ENV = {
  CI: '1',
  EXPO_NONINTERACTIVE: '1',
  TZ: 'UTC',
  LC_ALL: 'C',
  LANG: 'C',
  SOURCE_DATE_EPOCH: '946684800',
};

function writeFile(filePath, contents, mode) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
  if (mode) fs.chmodSync(filePath, mode);
}

function createFakePnpm(t) {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-fake-pnpm-'));
  const fakePnpm = path.join(binDir, 'pnpm');
  writeFile(fakePnpm, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const stage = args[1];
const manifest = JSON.parse(fs.readFileSync(path.join(stage, 'package.json'), 'utf8'));
const expectedEnv = ${JSON.stringify(FIXED_ENV)};
for (const [key, value] of Object.entries(expectedEnv)) {
  if (process.env[key] !== value) throw new Error(key + '=' + process.env[key]);
}
const expected = manifest.name === '@expo/cli'
  ? ['--dir', stage, 'exec', 'taskr', 'release']
  : ['--dir', stage, 'exec', 'expo-module', 'tsc', '--project', 'tsconfig.json', '--pretty', 'false'];
if (JSON.stringify(args) !== JSON.stringify(expected)) throw new Error('argv=' + JSON.stringify(args));
if (fs.existsSync(path.join(stage, 'FAIL_BUILD'))) process.exit(42);
const write = (relative, value, mode) => {
  const target = path.join(stage, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
  if (mode) fs.chmodSync(target, mode);
};
if (manifest.name === '@expo/cli') {
  write('build/bin/cli', fs.existsSync(path.join(stage, 'BROKEN_RUNTIME')) ? "#!/usr/bin/env node\\n// run:harmony run/harmony/index.js\\nif (process.argv.includes('--version')) console.log('54.0.27'); else process.exit(2);\\n" : "#!/usr/bin/env node\\nif (process.argv.includes('--version')) { console.log('54.0.27'); process.exit(0); }\\nif (process.argv[2] === 'run:harmony' && process.argv.includes('--help')) { console.log('Usage: expo run:harmony'); process.exit(0); }\\nprocess.exit(2);\\n", 0o755);
  write('build/src/run/harmony/index.js', "exports.expoRunHarmony = () => {};\\n");
  write('build/src/run/harmony/runHarmonyAsync.js', "exports.runHarmonyAsync = async () => {};\\n");
  write('build/src/prebuild/harmony/prebuildHarmonyAsync.js', fs.existsSync(path.join(stage, 'BROKEN_PREBUILD_HELPER')) ? "// prebuildHarmonyAsync harmony callable\\nmodule.exports = {};\\n" : "exports.prebuildHarmonyAsync = async () => ({ harmonyRoot: '/mock' });\\n");
  write('build/src/prebuild/index.js', fs.existsSync(path.join(stage, 'BROKEN_PREBUILD_DISPATCH')) ? "// harmony prebuildHarmonyAsync dispatcher\\nexports.expoPrebuild = async () => {};\\n" : "exports.expoPrebuild = async () => require('./harmony/prebuildHarmonyAsync.js').prebuildHarmonyAsync();\\n");
} else if (manifest.name === '@expo/metro-config') {
  write('build/ExpoMetroConfig.js', fs.existsSync(path.join(stage, 'BROKEN_RUNTIME')) ? "// harmony withHarmony\\nmodule.exports = {};\\n" : "require('./withHarmony'); module.exports = {};\\n");
  write('build/ExpoMetroConfig.d.ts', 'export declare function getDefaultConfig(): object;\\n');
  write('build/withHarmony.js', fs.existsSync(path.join(stage, 'BROKEN_RUNTIME')) ? '// exports.withHarmony function\\nmodule.exports = {};\\n' : 'exports.withHarmony = (config) => config;\\n');
  write('build/withHarmony.d.ts', 'export declare function withHarmony(config: object): object;\\n');
} else {
  write('build/index.js', fs.existsSync(path.join(stage, 'BROKEN_RUNTIME')) ? "// harmony require('../platforms/harmony')\\nmodule.exports = async () => { console.error('No linking implementation is available for platform harmony'); process.exitCode = 1; };\\n" : (fs.existsSync(path.join(stage, 'DEV_ONLY_RUNTIME')) ? "require('dev-only-runtime');\\nmodule.exports = async () => console.log(JSON.stringify({ modules: [] }));\\n" : "module.exports = async (args) => { if (args.includes('resolve') && args.includes('harmony')) console.log(JSON.stringify({ modules: [] })); else process.exitCode = 1; };\\n"));
  write('build/index.d.ts', 'declare const main: (args: string[]) => Promise<void>; export = main;\\n');
  write('build/platforms/index.js', "caseHarmony: { platform: 'harmony', load: () => require('../platforms/harmony') };\\n");
  write('build/platforms/harmony/index.js', "module.exports = require('./harmony');\\n");
  write('build/platforms/harmony/harmony.js', 'exports.resolveModulesAsync = async () => [];\\n');
  write('build/platforms/harmony/nativeProject.js', 'exports.generatePackageListAsync = async () => {};\\n');
}
if (fs.existsSync(path.join(stage, 'UNSAFE_MAP'))) write('build/unsafe.js.map', JSON.stringify({ version: 3, sources: [stage + '/src/index.ts'], names: [], mappings: '' }));
if (fs.existsSync(path.join(stage, 'WINDOWS_MAP'))) write('build/windows.js.map', JSON.stringify({ version: 3, sources: ['C:\\\\repo\\src\\index.ts'], names: [], mappings: '' }));
if (fs.existsSync(path.join(stage, 'ASSERT_NO_UNRELATED_DEV')) && fs.existsSync(path.join(stage, 'node_modules/unrelated-dev'))) process.exit(43);
if (fs.existsSync(path.join(stage, 'MUTATE_TOOL'))) { const tool = manifest.name === '@expo/cli' ? 'taskr' : 'expo-module-scripts'; fs.appendFileSync(path.join(fs.realpathSync(path.join(stage, 'node_modules', tool)), 'tool-marker.txt'), 'mutated'); }
`, 0o755);
  const previousPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${previousPath}`;
  t.after(() => {
    process.env.PATH = previousPath;
    fs.rmSync(binDir, { recursive: true, force: true });
  });
}

function createToolingRoot(root) {
  for (const relativePath of [
    'node_modules/.pnpm/node_modules/@tsconfig/node18',
    'packages/@expo/cli/node_modules/@types/node',
    'node_modules/.pnpm/node_modules/typescript',
  ]) {
    fs.mkdirSync(path.join(root, relativePath), { recursive: true });
  }
}

function packageManifest(descriptor) {
  const manifest = {
    name: descriptor.name,
    version: descriptor.version,
    private: true,
    files: ['a.txt', 'nested', 'package.json'],
  };
  if (descriptor.build) manifest.files.push('build', 'bin');
  if (descriptor.name === '@expo/cli') {
    manifest.main = 'build/bin/cli';
    manifest.bin = { 'expo-internal': 'build/bin/cli' };
  } else if (descriptor.name === '@expo/metro-config') {
    manifest.main = 'build/ExpoMetroConfig.js';
    manifest.types = 'build/ExpoMetroConfig.d.ts';
  } else if (descriptor.name === 'expo-modules-autolinking') {
    manifest.main = 'build/index.js';
    manifest.types = 'build/index.d.ts';
    manifest.bin = { 'expo-modules-autolinking': 'bin/expo-modules-autolinking.js' };
  }
  return manifest;
}

function createFakePackage(packageDir, name, binRelative) {
  writeFile(path.join(packageDir, 'package.json'), `${JSON.stringify({ name, version: '1.0.0', ...(binRelative ? { bin: binRelative } : {}) })}\n`);
  writeFile(path.join(packageDir, 'tool-marker.txt'), 'unchanged\n');
  if (binRelative) writeFile(path.join(packageDir, binRelative), '#!/usr/bin/env node\n', 0o755);
}

function addBuildToolFixtures(root, descriptor, packageDir) {
  if (!descriptor.build) return;
  const packageTools = descriptor.name === '@expo/cli'
    ? [['taskr', 'cli.js'], ['@swc/core'], ['getenv'], ['@taskr/clear'], ['@taskr/esnext'], ['@taskr/watch']]
    : [['expo-module-scripts', 'bin/expo-module.js'], ...(descriptor.name === '@expo/metro-config' ? [['@jridgewell/trace-mapping'], ['@types/babel__core'], ['@types/picomatch'], ['dedent'], ['sass']] : [])];
  for (const [name, bin] of packageTools) createFakePackage(path.join(packageDir, 'node_modules', ...name.split('/')), name, bin);
  createFakePackage(path.join(root, 'node_modules/.pnpm/typescript@5.9.3/node_modules/typescript'), 'typescript', 'bin/tsc');
  createFakePackage(path.join(root, 'node_modules/.pnpm/node_modules/@tsconfig/node18'), '@tsconfig/node18');
  createFakePackage(path.join(root, 'packages/@expo/cli/node_modules/@types/node'), '@types/node');
}

function createCatalogRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-pack-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  createToolingRoot(root);
  for (const descriptor of SDK54_PACKAGES) {
    const packageDir = path.join(root, descriptor.relativePath);
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(path.join(packageDir, 'package.json'), `${JSON.stringify(packageManifest(descriptor), null, 2)}\n`);
    fs.writeFileSync(path.join(packageDir, 'a.txt'), `${descriptor.name}\n`);
    fs.mkdirSync(path.join(packageDir, 'nested'));
    fs.writeFileSync(path.join(packageDir, 'nested/z.txt'), `${descriptor.version}\n`);
    if (descriptor.build) { fs.mkdirSync(path.join(packageDir, 'node_modules'), { recursive: true }); addBuildToolFixtures(root, descriptor, packageDir); }
    if (descriptor.name === '@expo/metro-config') fs.writeFileSync(path.join(packageDir, 'tsconfig.json'), '{"compilerOptions":{}}\n');
    if (descriptor.name === '@expo/cli') fs.mkdirSync(path.join(packageDir, 'ts-declarations'), { recursive: true });
    if (descriptor.name === 'expo-modules-autolinking') {
      writeFile(path.join(packageDir, 'bin/expo-modules-autolinking.js'), "require('../build')(process.argv.slice(2));\n", 0o755);
    }
  }
  return root;
}

function normalizeMtimes(root, timestamp) {
  for (const descriptor of SDK54_PACKAGES) {
    const packageDir = path.join(root, descriptor.relativePath);
    for (const relativePath of ['package.json', 'a.txt', 'nested/z.txt']) {
      fs.utimesSync(path.join(packageDir, relativePath), timestamp, timestamp);
    }
  }
}

function fingerprint(root) {
  const entries = [];
  const visit = (current) => {
    for (const name of fs.readdirSync(current).sort()) {
      const absolute = path.join(current, name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      const stat = fs.lstatSync(absolute);
      const entry = {
        path: relative,
        mode: stat.mode & 0o7777,
        mtimeMs: stat.mtimeMs,
        type: stat.isSymbolicLink() ? 'symlink' : stat.isDirectory() ? 'directory' : 'file',
      };
      if (stat.isSymbolicLink()) entry.target = fs.readlinkSync(absolute);
      if (stat.isFile()) entry.sha256 = crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
      entries.push(entry);
      if (stat.isDirectory()) visit(absolute);
    }
  };
  visit(root);
  return entries;
}

function extractPackage(t, outputDir, manifest, packageName) {
  const extractRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-runtime-'));
  t.after(() => fs.rmSync(extractRoot, { recursive: true, force: true }));
  const archive = manifest.packages.find(({ name }) => name === packageName);
  extractTar({ file: path.join(outputDir, archive.file), cwd: extractRoot, sync: true, strict: true });
  return { archive, archivePath: path.join(outputDir, archive.file), packageRoot: path.join(extractRoot, 'package') };
}

function attachAbsoluteDependencies(sourceNodeModules, destinationNodeModules, selfName, selfRoot) {
  fs.mkdirSync(destinationNodeModules, { recursive: true });
  for (const entry of fs.readdirSync(sourceNodeModules, { withFileTypes: true })) {
    if (entry.name === '.bin') continue;
    const source = path.join(sourceNodeModules, entry.name);
    if (entry.name.startsWith('@') && entry.isDirectory()) {
      const scope = path.join(destinationNodeModules, entry.name);
      fs.mkdirSync(scope, { recursive: true });
      for (const child of fs.readdirSync(source)) {
        fs.symlinkSync(fs.realpathSync(path.join(source, child)), path.join(scope, child));
      }
    } else {
      fs.symlinkSync(fs.realpathSync(source), path.join(destinationNodeModules, entry.name));
    }
  }
  if (selfName) {
    const target = path.join(destinationNodeModules, ...selfName.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!fs.existsSync(target)) fs.symlinkSync(selfRoot, target);
  }
}

function assertSafeSourceMaps(packageRoot) {
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.name.endsWith('.map')) {
        const sourceMap = JSON.parse(fs.readFileSync(absolute, 'utf8'));
        for (const source of [sourceMap.sourceRoot, ...(sourceMap.sources ?? [])].filter(Boolean)) {
          assert.equal(path.isAbsolute(source), false, `${absolute}: ${source}`);
          assert.doesNotMatch(source, /^file:/, `${absolute}: ${source}`);
        }
      }
    }
  };
  visit(packageRoot);
}

test('packs byte-identical build-backed archives without changing source files', async (t) => {
  createFakePnpm(t);
  const root = createCatalogRoot(t);
  const sourceRoots = SDK54_PACKAGES.map(({ relativePath }) => path.join(root, relativePath));
  const before = sourceRoots.map(fingerprint);
  const outputA = path.join(root, 'outputs/a');
  const outputB = path.join(root, 'outputs/b');
  normalizeMtimes(root, new Date('2024-01-01T00:00:00.000Z'));
  const baseline = sourceRoots.map(fingerprint);
  const first = await packPackages({ rootDir: root, outputDir: outputA, round: 'A' });
  assert.deepEqual(sourceRoots.map(fingerprint), baseline);

  for (const descriptor of [...SDK54_PACKAGES].reverse()) {
    const packageDir = path.join(root, descriptor.relativePath);
    const value = fs.readFileSync(path.join(packageDir, 'a.txt'));
    fs.rmSync(path.join(packageDir, 'a.txt'));
    fs.writeFileSync(path.join(packageDir, 'a.txt'), value);
  }
  normalizeMtimes(root, new Date('2026-09-24T12:34:56.000Z'));
  const secondBaseline = sourceRoots.map(fingerprint);
  const second = await packPackages({ rootDir: root, outputDir: outputB, round: 'B' });
  assert.deepEqual(sourceRoots.map(fingerprint), secondBaseline);

  assert.deepEqual(
    second.packages.map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })),
    first.packages.map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })),
  );
  assert.deepEqual(first.failures, []);
  assert.deepEqual(second.failures, []);
  assert.notDeepEqual(before, sourceRoots.map(fingerprint), 'the test must actually vary source mtimes/order between rounds');
  for (const descriptor of SDK54_PACKAGES.filter(({ build }) => build)) {
    for (const { path: requiredPath } of descriptor.runtime.requiredFiles) {
      assert.equal(fs.existsSync(path.join(root, descriptor.relativePath, requiredPath)), false, requiredPath);
    }
  }
});

test('changes the package hash when packed content changes', async (t) => {
  createFakePnpm(t);
  const root = createCatalogRoot(t);
  const first = await packPackages({ rootDir: root, outputDir: path.join(root, 'outputs/a'), round: 'A' });
  fs.writeFileSync(path.join(root, 'packages/expo-asset/a.txt'), 'changed\n');
  const second = await packPackages({ rootDir: root, outputDir: path.join(root, 'outputs/b'), round: 'B' });
  const hash = (manifest) => manifest.packages.find(({ name }) => name === 'expo-asset').sha256;
  assert.notEqual(hash(first), hash(second));
});

test('keeps source unchanged when an allowlisted build fails', async (t) => {
  createFakePnpm(t);
  const root = createCatalogRoot(t);
  fs.writeFileSync(path.join(root, 'packages/@expo/cli/FAIL_BUILD'), 'fail\n');
  const sourceRoots = SDK54_PACKAGES.map(({ relativePath }) => path.join(root, relativePath));
  const before = sourceRoots.map(fingerprint);
  const manifest = await packPackages({ rootDir: root, outputDir: path.join(root, 'outputs/failure'), round: 'failure' });
  assert.ok(manifest.failures.some((failure) => failure.includes('@expo/cli') && failure.includes('42')), manifest.failures.join('\n'));
  assert.equal(manifest.packages.some(({ name }) => name === '@expo/cli'), false);
  assert.deepEqual(sourceRoots.map(fingerprint), before);
});

test('rejects source maps containing disposable absolute paths without changing source', async (t) => {
  createFakePnpm(t);
  const root = createCatalogRoot(t);
  fs.writeFileSync(path.join(root, 'packages/@expo/metro-config/UNSAFE_MAP'), 'unsafe\n');
  const sourceRoots = SDK54_PACKAGES.map(({ relativePath }) => path.join(root, relativePath));
  const before = sourceRoots.map(fingerprint);
  const manifest = await packPackages({ rootDir: root, outputDir: path.join(root, 'outputs/unsafe'), round: 'unsafe' });
  assert.ok(manifest.failures.some((failure) => failure.includes('@expo/metro-config') && failure.includes('source map')), manifest.failures.join('\n'));
  assert.deepEqual(sourceRoots.map(fingerprint), before);
});

test('fresh repository archives contain executable and semantically usable Harmony runtimes', { timeout: 120_000 }, async (t) => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-real-pack-'));
  t.after(() => fs.rmSync(outputDir, { recursive: true, force: true }));
  const sourceRoots = SDK54_PACKAGES.filter(({ build }) => build).map(({ relativePath }) => path.join(ROOT_DIR, relativePath));
  const before = sourceRoots.map(fingerprint);
  const manifest = await packPackages({ rootDir: ROOT_DIR, outputDir, round: 'runtime-test' });
  assert.deepEqual(manifest.failures, []);
  assert.deepEqual(sourceRoots.map(fingerprint), before);

  const cli = extractPackage(t, outputDir, manifest, '@expo/cli');
  for (const required of getDescriptorByName('@expo/cli').runtime.requiredFiles) {
    assert.equal(fs.existsSync(path.join(cli.packageRoot, required.path)), true, required.path);
  }
  assert.notEqual(fs.statSync(path.join(cli.packageRoot, 'build/bin/cli')).mode & 0o111, 0);
  attachAbsoluteDependencies(path.join(ROOT_DIR, 'packages/@expo/cli/node_modules'), path.join(cli.packageRoot, 'node_modules'));
  assert.equal(execFileSync(process.execPath, [path.join(cli.packageRoot, 'build/bin/cli'), '--version'], { encoding: 'utf8' }).trim(), '54.0.27');

  const metro = extractPackage(t, outputDir, manifest, '@expo/metro-config');
  attachAbsoluteDependencies(path.join(ROOT_DIR, 'packages/@expo/metro-config/node_modules'), path.join(metro.packageRoot, 'node_modules'));
  assert.equal(typeof (await import(pathToFileUrl(path.join(metro.packageRoot, 'build/withHarmony.js')))).withHarmony, 'function');

  const autolinking = extractPackage(t, outputDir, manifest, 'expo-modules-autolinking');
  attachAbsoluteDependencies(
    path.join(ROOT_DIR, 'packages/expo-modules-autolinking/node_modules'),
    path.join(autolinking.packageRoot, 'node_modules'),
    'expo-modules-autolinking',
    autolinking.packageRoot,
  );
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-autolinking-project-'));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  fs.writeFileSync(path.join(projectRoot, 'package.json'), '{"name":"runtime-probe","private":true}\n');
  const { NO_COLOR: _ignoredNoColor, ...runtimeEnv } = process.env;
  const resolveOutput = execFileSync(process.execPath, [
    path.join(autolinking.packageRoot, 'bin/expo-modules-autolinking.js'),
    'resolve', '--platform', 'harmony', '--project-root', projectRoot, '--json',
  ], { cwd: projectRoot, encoding: 'utf8', env: { ...runtimeEnv, FORCE_COLOR: '0' } });
  assert.doesNotThrow(() => JSON.parse(resolveOutput));

  for (const runtime of [cli, metro, autolinking]) {
    assertSafeSourceMaps(runtime.packageRoot);
    const rawTar = zlib.gunzipSync(fs.readFileSync(runtime.archivePath)).toString('utf8');
    assert.equal(rawTar.includes(ROOT_DIR), false, runtime.archive.file);
    assert.equal(rawTar.includes('sdk54-pack-stage-'), false, runtime.archive.file);
  }
});

function pathToFileUrl(filePath) {
  return new URL(`file://${filePath}`).href;
}

test('always executes an allowlisted build even when its manifest omits entrypoint fields', async (t) => {
  createFakePnpm(t);
  const root = createCatalogRoot(t);
  const manifestPath = path.join(root, 'packages/@expo/cli/package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  delete manifest.main;
  delete manifest.bin;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const outputDir = path.join(root, 'outputs/unconditional');
  const packed = await packPackages({ rootDir: root, outputDir, round: 'unconditional' });
  assert.deepEqual(packed.failures, []);
  const cli = extractPackage(t, outputDir, packed, '@expo/cli');
  assert.equal(fs.existsSync(path.join(cli.packageRoot, 'build/bin/cli')), true);
});

test('runtime probes reject dead-text Harmony markers', async (t) => {
  createFakePnpm(t);
  const root = createCatalogRoot(t);
  fs.writeFileSync(path.join(root, 'packages/@expo/cli/BROKEN_RUNTIME'), 'broken\n');
  const packed = await packPackages({ rootDir: root, outputDir: path.join(root, 'outputs/broken'), round: 'broken' });
  assert.ok(packed.failures.some((failure) => failure.includes('@expo/cli') && failure.includes('runtime probe')), packed.failures.join('\n'));
});

test('consumer probe excludes devDependencies', async (t) => {
  createFakePnpm(t);
  const root = createCatalogRoot(t);
  const packageDir = path.join(root, 'packages/expo-modules-autolinking');
  const manifestPath = path.join(packageDir, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.devDependencies = { 'dev-only-runtime': '1.0.0' };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFile(path.join(packageDir, 'node_modules/dev-only-runtime/package.json'), '{"name":"dev-only-runtime","version":"1.0.0","main":"index.js"}\n');
  writeFile(path.join(packageDir, 'node_modules/dev-only-runtime/index.js'), 'module.exports = {};\n');
  fs.writeFileSync(path.join(packageDir, 'DEV_ONLY_RUNTIME'), 'broken\n');
  const packed = await packPackages({ rootDir: root, outputDir: path.join(root, 'outputs/dev-only'), round: 'dev-only' });
  assert.ok(packed.failures.some((failure) => failure.includes('expo-modules-autolinking') && failure.includes('runtime probe')), packed.failures.join('\n'));
});

test('build staging excludes unrelated dev dependencies and detects tool mutation', async (t) => {
  createFakePnpm(t);
  const root = createCatalogRoot(t);
  const cli = path.join(root, 'packages/@expo/cli');
  writeFile(path.join(cli, 'node_modules/unrelated-dev/package.json'), '{"name":"unrelated-dev","version":"1.0.0"}\n');
  fs.writeFileSync(path.join(cli, 'ASSERT_NO_UNRELATED_DEV'), 'check\n');
  const clean = await packPackages({ rootDir: root, outputDir: path.join(root, 'outputs/isolated'), round: 'isolated' });
  assert.deepEqual(clean.failures, []);

  fs.rmSync(path.join(cli, 'ASSERT_NO_UNRELATED_DEV'));
  fs.writeFileSync(path.join(cli, 'MUTATE_TOOL'), 'mutate\n');
  const mutated = await packPackages({ rootDir: root, outputDir: path.join(root, 'outputs/mutated'), round: 'mutated' });
  assert.ok(mutated.failures.some((failure) => failure.includes('@expo/cli') && failure.includes('tool target changed')), mutated.failures.join('\n'));
});

test('rejects Windows absolute source-map paths', async (t) => {
  createFakePnpm(t);
  const root = createCatalogRoot(t);
  fs.writeFileSync(path.join(root, 'packages/@expo/metro-config/WINDOWS_MAP'), 'unsafe\n');
  const packed = await packPackages({ rootDir: root, outputDir: path.join(root, 'outputs/windows-map'), round: 'windows-map' });
  assert.ok(packed.failures.some((failure) => failure.includes('@expo/metro-config') && failure.includes('absolute')), packed.failures.join('\n'));
});

test('CLI prebuild probe rejects broken helper export and broken Harmony dispatcher', async (t) => {
  for (const marker of ['BROKEN_PREBUILD_HELPER', 'BROKEN_PREBUILD_DISPATCH']) {
    await t.test(marker, async (t) => {
      createFakePnpm(t);
      const root = createCatalogRoot(t);
      fs.writeFileSync(path.join(root, 'packages/@expo/cli', marker), 'broken\n');
      const packed = await packPackages({ rootDir: root, outputDir: path.join(root, `outputs/${marker}`), round: marker });
      assert.ok(packed.failures.some((failure) => failure.includes('@expo/cli') && failure.includes('prebuild')), packed.failures.join('\n'));
    });
  }
});


test('round comparison preserves sibling release artifacts', async t => {
  createFakePnpm(t);
  const root = createCatalogRoot(t);
  const marker = path.join(root, 'outputs/sdk54/npm-release/release.json');
  writeFile(marker, 'candidate');
  await compareRounds(root);
  assert.equal(fs.readFileSync(marker, 'utf8'), 'candidate');
});
