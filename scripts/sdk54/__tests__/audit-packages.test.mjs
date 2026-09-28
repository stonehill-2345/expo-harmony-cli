import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { create as createTar, extract as extractTar } from 'tar';

import { EXPECTED_INTERNAL_EDGES, SDK54_PACKAGES, getDescriptorByName } from '../catalog.mjs';
import { auditPackages } from '../audit-packages.mjs';
import { packPackages } from '../pack-packages.mjs';

const FIXED_ENV = {
  CI: '1', EXPO_NONINTERACTIVE: '1', TZ: 'UTC', LC_ALL: 'C', LANG: 'C', SOURCE_DATE_EPOCH: '946684800',
};

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function writeFile(filePath, contents, mode) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
  if (mode) fs.chmodSync(filePath, mode);
}

function createFakePnpm(t) {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-audit-pnpm-'));
  const fakePnpm = path.join(binDir, 'pnpm');
  writeFile(fakePnpm, `#!/usr/bin/env node
const fs=require('node:fs'), path=require('node:path');
const args=process.argv.slice(2), stage=args[1], p=require(path.join(stage,'package.json'));
for (const [k,v] of Object.entries(${JSON.stringify(FIXED_ENV)})) if (process.env[k]!==v) throw new Error(k);
const write=(f,c,m)=>{f=path.join(stage,f);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,c);if(m)fs.chmodSync(f,m)};
if(p.name==='@expo/cli'){
 write('build/bin/cli',"#!/usr/bin/env node\\nif(process.argv.includes('--version')){console.log('54.0.27');process.exit(0)}if(process.argv[2]==='run:harmony'&&process.argv.includes('--help')){console.log('Usage: expo run:harmony');process.exit(0)}process.exit(2);\\n",0o755);
 write('build/src/run/harmony/index.js','exports.expoRunHarmony=()=>{};\\n');
 write('build/src/run/harmony/runHarmonyAsync.js','exports.runHarmonyAsync=async()=>{};\\n');
 write('build/src/prebuild/harmony/prebuildHarmonyAsync.js','exports.prebuildHarmonyAsync=async()=>({harmonyRoot:"/mock"});\\n');
 write('build/src/prebuild/index.js','exports.expoPrebuild=async()=>require("./harmony/prebuildHarmonyAsync.js").prebuildHarmonyAsync();\\n');
}else if(p.name==='@expo/metro-config'){
 write('build/ExpoMetroConfig.js',"require('./withHarmony');module.exports={};\\n");
 write('build/ExpoMetroConfig.d.ts','export declare function getDefaultConfig(): object;\\n');
 write('build/withHarmony.js','exports.withHarmony=(config)=>config;\\n');
}else{
 write('build/index.js',"module.exports=async(args)=>{if(args.includes('resolve')&&args.includes('harmony'))console.log(JSON.stringify({modules:[]}));else process.exitCode=1};\\n");
 write('build/index.d.ts','declare const main: Function; export = main;\\n');
 write('build/platforms/index.js','module.exports={};\\n');
 write('build/platforms/harmony/index.js',"module.exports=require('./harmony');\\n");
 write('build/platforms/harmony/harmony.js','exports.resolveModulesAsync=async()=>[];\\n');
 write('build/platforms/harmony/nativeProject.js','exports.generatePackageListAsync=async()=>{};\\n');
}
`, 0o755);
  const previousPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${previousPath}`;
  t.after(() => {
    process.env.PATH = previousPath;
    fs.rmSync(binDir, { recursive: true, force: true });
  });
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
  createFakePackage(path.join(root, 'node_modules/.pnpm/node_modules/@types/node'), '@types/node');
}

function createGraphRoot(t) {
  createFakePnpm(t);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-audit-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const relativePath of [
    'node_modules/.pnpm/node_modules/@tsconfig/node18',
    'node_modules/.pnpm/node_modules/@types/node',
    'node_modules/.pnpm/node_modules/typescript',
  ]) fs.mkdirSync(path.join(root, relativePath), { recursive: true });

  const manifests = new Map(SDK54_PACKAGES.map((descriptor) => [descriptor.name, {
    name: descriptor.name,
    version: descriptor.version,
    private: true,
    files: ['index.js', 'index.d.ts', 'module.js', 'feature.js', 'bin', 'package.json'],
    main: 'index.js',
    types: 'index.d.ts',
    dependencies: {},
    peerDependencies: {},
    devDependencies: {},
  }]));
  EXPECTED_INTERNAL_EDGES.forEach((edge, index) => {
    const target = getDescriptorByName(edge.to);
    const ranges = [target.version, `~${target.version}`, `^${target.version}`, '*'];
    manifests.get(edge.from)[edge.section][edge.to] = ranges[index % ranges.length];
  });
  manifests.get('@expo/cli').devDependencies['expo-asset'] = '^999.0.0';
  Object.assign(manifests.get('@expo/cli'), {
    files: ['build', 'package.json'], main: 'build/bin/cli', types: undefined,
    bin: { 'expo-internal': 'build/bin/cli' },
  });
  Object.assign(manifests.get('@expo/metro-config'), {
    files: ['build', 'package.json'], main: 'build/ExpoMetroConfig.js', types: 'build/ExpoMetroConfig.d.ts',
  });
  Object.assign(manifests.get('expo-modules-autolinking'), {
    files: ['build', 'bin', 'package.json'], main: 'build/index.js', types: 'build/index.d.ts',
    bin: { 'expo-modules-autolinking': 'bin/expo-modules-autolinking.js' },
  });
  Object.assign(manifests.get('expo-asset'), {
    module: 'module.js',
    exports: { '.': './index.js', './feature': './feature.js', './pattern/*': './*.js' },
  });
  manifests.get('expo-status-bar').bin = { status: 'bin/status.js' };

  for (const descriptor of SDK54_PACKAGES) {
    const packageDir = path.join(root, descriptor.relativePath);
    fs.mkdirSync(packageDir, { recursive: true });
    const manifest = Object.fromEntries(Object.entries(manifests.get(descriptor.name)).filter(([, value]) => value !== undefined));
    fs.writeFileSync(path.join(packageDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    writeFile(path.join(packageDir, 'index.js'), `module.exports = ${JSON.stringify(descriptor.name)};\n`);
    writeFile(path.join(packageDir, 'index.d.ts'), 'declare const value: string; export = value;\n');
    writeFile(path.join(packageDir, 'module.js'), 'export default {};\n');
    writeFile(path.join(packageDir, 'feature.js'), 'module.exports = {};\n');
    if (descriptor.build) { fs.mkdirSync(path.join(packageDir, 'node_modules'), { recursive: true }); addBuildToolFixtures(root, descriptor, packageDir); }
    if (descriptor.name === '@expo/metro-config') fs.writeFileSync(path.join(packageDir, 'tsconfig.json'), '{"compilerOptions":{}}\n');
    if (descriptor.name === '@expo/cli') fs.mkdirSync(path.join(packageDir, 'ts-declarations'), { recursive: true });
    if (descriptor.name === 'expo-modules-autolinking') writeFile(path.join(packageDir, 'bin/expo-modules-autolinking.js'), "require('../build')(process.argv.slice(2));\n", 0o755);
    if (descriptor.name === 'expo-status-bar') writeFile(path.join(packageDir, 'bin/status.js'), '#!/usr/bin/env node\n', 0o755);
  }
  for (const descriptor of SDK54_PACKAGES) {
    const packageDir = path.join(root, descriptor.relativePath);
    const manifest = manifests.get(descriptor.name);
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      const target = SDK54_PACKAGES.find(({ name }) => name === dependency);
      if (!target) continue;
      const link = path.join(packageDir, 'node_modules', ...dependency.split('/'));
      fs.mkdirSync(path.dirname(link), { recursive: true });
      if (!fs.existsSync(link)) fs.symlinkSync(path.join(root, target.relativePath), link);
    }
  }
  return root;
}

async function rewriteArchive(outputDir, packageName, mutate) {
  const manifestPath = path.join(outputDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const archive = manifest.packages.find(({ name }) => name === packageName);
  const archivePath = path.join(outputDir, archive.file);
  const extractRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-audit-rewrite-'));
  try {
    extractTar({ file: archivePath, cwd: extractRoot, sync: true, strict: true });
    await mutate(path.join(extractRoot, 'package'));
    await createTar({ cwd: extractRoot, file: archivePath, gzip: true, portable: true }, ['package']);
    archive.bytes = fs.statSync(archivePath).size;
    archive.sha256 = sha256(archivePath);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    fs.rmSync(extractRoot, { recursive: true, force: true });
  }
}

test('counts only catalog dependency and peerDependency edges with compatible ranges', async (t) => {
  const root = createGraphRoot(t);
  fs.mkdirSync(path.join(root, '.git'));
  const fixture = path.join(root, 'packages/expo-asset/src/__tests__/fixture.ts');
  fs.mkdirSync(path.dirname(fixture), { recursive: true });
  fs.writeFileSync(fixture, "// /Users/example file:/tmp/value 192.168.1.8\nconst key = '-----BEGIN PRIVATE KEY-----';\n");
  const installed = path.join(root, 'packages/expo-asset/node_modules/cache/index.js');
  fs.mkdirSync(path.dirname(installed), { recursive: true });
  fs.writeFileSync(installed, 'installed dependency\n');
  const outputDir = path.join(root, 'outputs');
  await packPackages({ rootDir: root, outputDir, round: 'A' });
  const report = auditPackages({ rootDir: root, manifestPath: path.join(outputDir, 'manifest.json') });
  assert.deepEqual(report, { packages: 14, internalEdges: 22, failures: [] });
});

test('reports an internal dependency range that excludes the catalog version', async (t) => {
  const root = createGraphRoot(t);
  const manifestPath = path.join(root, 'packages/expo/package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.dependencies['expo-asset'] = '^99.0.0';
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const outputDir = path.join(root, 'outputs');
  await packPackages({ rootDir: root, outputDir, round: 'A' });
  const report = auditPackages({ rootDir: root, manifestPath: path.join(outputDir, 'manifest.json') });
  assert.ok(report.failures.some((failure) => failure.includes('expo -> expo-asset') && failure.includes('^99.0.0')), JSON.stringify(report, null, 2));
});

test('rejects missing declared main, module, types, bin, and concrete exports', async (t) => {
  const root = createGraphRoot(t);
  const outputDir = path.join(root, 'outputs');
  await packPackages({ rootDir: root, outputDir, round: 'A' });
  await rewriteArchive(outputDir, 'expo-asset', async (packageRoot) => {
    for (const relativePath of ['index.js', 'index.d.ts', 'module.js', 'feature.js']) fs.rmSync(path.join(packageRoot, relativePath));
  });
  await rewriteArchive(outputDir, 'expo-status-bar', async (packageRoot) => fs.rmSync(path.join(packageRoot, 'bin/status.js')));
  const report = auditPackages({ rootDir: root, manifestPath: path.join(outputDir, 'manifest.json') });
  for (const expected of ['expo-asset: main', 'expo-asset: module', 'expo-asset: types', 'expo-asset: exports[./feature]', 'expo-status-bar: bin.status']) {
    assert.ok(report.failures.some((failure) => failure.includes(expected)), `${expected}: ${JSON.stringify(report, null, 2)}`);
  }
  assert.equal(report.failures.some((failure) => failure.includes('exports[./pattern/*]')), false);
});

test('rejects missing package-specific runtime outputs and stale Harmony dispatch', async (t) => {
  const root = createGraphRoot(t);
  const outputDir = path.join(root, 'outputs');
  await packPackages({ rootDir: root, outputDir, round: 'A' });
  await rewriteArchive(outputDir, 'expo-modules-autolinking', async (packageRoot) => {
    fs.rmSync(path.join(packageRoot, 'build/platforms/harmony/nativeProject.js'), { force: true });
    writeFile(path.join(packageRoot, 'build/platforms/index.js'), 'module.exports = {};\n');
  });
  await rewriteArchive(outputDir, '@expo/metro-config', async (packageRoot) => {
    writeFile(path.join(packageRoot, 'build/ExpoMetroConfig.js'), 'module.exports = {};\n');
  });
  const report = auditPackages({ rootDir: root, manifestPath: path.join(outputDir, 'manifest.json') });
  assert.ok(report.failures.some((failure) => failure.includes('expo-modules-autolinking') && failure.includes('nativeProject.js')), JSON.stringify(report, null, 2));
  assert.ok(report.failures.some((failure) => failure.includes('@expo/metro-config') && failure.includes('runtime probe')), JSON.stringify(report, null, 2));
});

test('rejects absolute paths in archived source maps', async (t) => {
  const root = createGraphRoot(t);
  const outputDir = path.join(root, 'outputs');
  await packPackages({ rootDir: root, outputDir, round: 'A' });
  await rewriteArchive(outputDir, '@expo/metro-config', async (packageRoot) => {
    writeFile(path.join(packageRoot, 'build/withHarmony.js.map'), JSON.stringify({ version: 3, sources: ['/private/tmp/stage/src/withHarmony.ts'], names: [], mappings: '' }));
  });
  const report = auditPackages({ rootDir: root, manifestPath: path.join(outputDir, 'manifest.json') });
  assert.ok(report.failures.some((failure) => failure.includes('source map') && failure.includes('/private/tmp')), JSON.stringify(report, null, 2));
});

test('rejects forbidden archive entries and sensitive archive text', async (t) => {
  const root = createGraphRoot(t);
  const outputDir = path.join(root, 'outputs');
  fs.mkdirSync(outputDir, { recursive: true });
  const stage = path.join(root, 'stage/package');
  fs.mkdirSync(path.join(stage, 'node_modules/cache'), { recursive: true });
  fs.writeFileSync(path.join(stage, 'output.hap'), 'native');
  fs.writeFileSync(path.join(stage, 'module.har'), 'native');
  fs.writeFileSync(path.join(stage, 'nested.tgz'), 'archive');
  fs.writeFileSync(path.join(stage, 'node_modules/cache/index.js'), 'cache');
  fs.writeFileSync(path.join(stage, 'secrets.txt'), '-----BEGIN PRIVATE KEY-----\n/Users/example\n/private/tmp/value\nfile:/tmp/pkg\n192.168.1.8\n');
  const archivePath = path.join(outputDir, 'malicious.tgz');
  await createTar({ cwd: path.dirname(stage), file: archivePath, gzip: true, portable: true }, ['package']);
  const manifest = { packages: [{ name: 'expo', version: '54.0.37', file: 'malicious.tgz', bytes: fs.statSync(archivePath).size, sha256: 'unused' }], internalEdges: [], failures: [] };
  const manifestPath = path.join(outputDir, 'manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const report = auditPackages({ rootDir: root, manifestPath });
  for (const expected of ['output.hap', 'module.har', 'nested.tgz', 'node_modules', 'PRIVATE KEY', '/Users/', '/private/tmp', 'file:/', '192.168.1.8']) {
    assert.ok(report.failures.some((failure) => failure.includes(expected)), `${expected}: ${JSON.stringify(report, null, 2)}`);
  }
});

test('fails closed on pack manifest failures and an inexact catalog package set', async (t) => {
  const root = createGraphRoot(t);
  const outputDir = path.join(root, 'outputs');
  await packPackages({ rootDir: root, outputDir, round: 'A' });
  const manifestPath = path.join(outputDir, 'manifest.json');
  const original = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const cases = [
    ['failed pack with 13 packages', { ...original, packages: original.packages.slice(0, 13), failures: ['@expo/cli: build failed'] }, ['Pack manifest failure', 'Missing catalog package']],
    ['duplicate package', { ...original, packages: [...original.packages.slice(0, 13), original.packages[0]], failures: [] }, ['Duplicate manifest package', 'Missing catalog package']],
    ['unknown package', { ...original, packages: [...original.packages.slice(0, 13), { ...original.packages[13], name: 'unknown-package' }], failures: [] }, ['Unknown manifest package', 'Missing catalog package']],
    ['wrong manifest version', { ...original, packages: original.packages.map((entry, index) => index === 0 ? { ...entry, version: '0.0.0' } : entry), failures: [] }, ['Manifest version mismatch']],
  ];
  for (const [name, manifest, expected] of cases) {
    await t.test(name, () => {
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      const report = auditPackages({ rootDir: root, manifestPath });
      for (const text of expected) assert.ok(report.failures.some((failure) => failure.includes(text)), `${text}: ${JSON.stringify(report, null, 2)}`);
    });
  }
});

test('rejects archives with no package root or a wrong package version', async (t) => {
  const root = createGraphRoot(t);
  const outputDir = path.join(root, 'outputs');
  await packPackages({ rootDir: root, outputDir, round: 'A' });
  const manifestPath = path.join(outputDir, 'manifest.json');
  let manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const expo = manifest.packages.find(({ name }) => name === 'expo');
  const archivePath = path.join(outputDir, expo.file);
  const rootless = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-rootless-'));
  t.after(() => fs.rmSync(rootless, { recursive: true, force: true }));
  fs.writeFileSync(path.join(rootless, 'payload.txt'), 'rootless\n');
  await createTar({ cwd: rootless, file: archivePath, gzip: true, portable: true }, ['payload.txt']);
  expo.bytes = fs.statSync(archivePath).size; expo.sha256 = sha256(archivePath);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  let report = auditPackages({ rootDir: root, manifestPath });
  assert.ok(report.failures.some((failure) => failure.includes('package/ root is missing')), JSON.stringify(report, null, 2));

  await packPackages({ rootDir: root, outputDir, round: 'B' });
  await rewriteArchive(outputDir, 'expo', async (packageRoot) => {
    const packageJson = path.join(packageRoot, 'package.json');
    const value = JSON.parse(fs.readFileSync(packageJson, 'utf8')); value.version = '0.0.0';
    fs.writeFileSync(packageJson, `${JSON.stringify(value, null, 2)}\n`);
  });
  report = auditPackages({ rootDir: root, manifestPath });
  assert.ok(report.failures.some((failure) => failure.includes('archive package version mismatch')), JSON.stringify(report, null, 2));
});

test('bin and exports targets require exact files without extension fallback', async (t) => {
  const root = createGraphRoot(t);
  const packageDir = path.join(root, 'packages/expo-asset');
  const manifestPath = path.join(packageDir, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.bin = { asset: 'bin/missing' };
  manifest.exports['./fallback'] = './fallback';
  manifest.files.push('fallback.js');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFile(path.join(packageDir, 'bin/missing.js'), '#!/usr/bin/env node\n', 0o755);
  writeFile(path.join(packageDir, 'fallback.js'), 'module.exports = {};\n');
  const outputDir = path.join(root, 'outputs');
  await packPackages({ rootDir: root, outputDir, round: 'A' });
  const report = auditPackages({ rootDir: root, manifestPath: path.join(outputDir, 'manifest.json') });
  assert.ok(report.failures.some((failure) => failure.includes('bin.asset')), JSON.stringify(report, null, 2));
  assert.ok(report.failures.some((failure) => failure.includes('exports[./fallback]')), JSON.stringify(report, null, 2));
});

test('runtime probes reject comment-only or dead Harmony markers', async (t) => {
  const root = createGraphRoot(t);
  const outputDir = path.join(root, 'outputs');
  await packPackages({ rootDir: root, outputDir, round: 'A' });
  for (const name of ['@expo/cli', '@expo/metro-config', 'expo-modules-autolinking']) {
    await rewriteArchive(outputDir, name, async (packageRoot) => {
      if (name === '@expo/cli') writeFile(path.join(packageRoot, 'build/bin/cli'), "#!/usr/bin/env node\n// run:harmony run/harmony/index.js\nif (process.argv.includes('--version')) console.log('54.0.27'); else process.exit(2);\n", 0o755);
      if (name === '@expo/metro-config') {
        writeFile(path.join(packageRoot, 'build/withHarmony.js'), '// withHarmony function\nmodule.exports = {};\n');
        writeFile(path.join(packageRoot, 'build/ExpoMetroConfig.js'), '// harmony withHarmony\nmodule.exports = {};\n');
      }
      if (name === 'expo-modules-autolinking') writeFile(path.join(packageRoot, 'build/index.js'), "// harmony require('../platforms/harmony')\nmodule.exports = async () => { console.error('No linking implementation is available for platform harmony'); process.exitCode = 1; };\n");
    });
  }
  const report = auditPackages({ rootDir: root, manifestPath: path.join(outputDir, 'manifest.json') });
  for (const name of ['@expo/cli', '@expo/metro-config', 'expo-modules-autolinking']) assert.ok(report.failures.some((failure) => failure.includes(name) && failure.includes('runtime probe')), `${name}: ${JSON.stringify(report, null, 2)}`);
});

test('CLI archive probe rejects comment-only prebuild helper and dispatcher', async (t) => {
  for (const broken of ['helper', 'dispatcher']) {
    await t.test(broken, async (t) => {
      const root = createGraphRoot(t);
      const outputDir = path.join(root, 'outputs');
      await packPackages({ rootDir: root, outputDir, round: 'A' });
      await rewriteArchive(outputDir, '@expo/cli', async (packageRoot) => {
        if (broken === 'helper') writeFile(path.join(packageRoot, 'build/src/prebuild/harmony/prebuildHarmonyAsync.js'), '// prebuildHarmonyAsync harmony callable\nmodule.exports = {};\n');
        else writeFile(path.join(packageRoot, 'build/src/prebuild/index.js'), '// harmony prebuildHarmonyAsync dispatcher\nexports.expoPrebuild = async () => {};\n');
      });
      const report = auditPackages({ rootDir: root, manifestPath: path.join(outputDir, 'manifest.json') });
      assert.ok(report.failures.some((failure) => failure.includes('@expo/cli') && failure.includes('prebuild')), JSON.stringify(report, null, 2));
    });
  }
});

test('rejects invalid exports structures and unsafe targets fail-closed', async (t) => {
  const cases = [
    ['number target', 42],
    ['boolean target', true],
    ['unsafe relative target', '../outside.js'],
    ['absolute target', '/tmp/outside.js'],
    ['backslash target', '.\\outside.js'],
    ['node_modules target', './node_modules/pkg/index.js'],
    ['incoherent wildcard', { './feature/*': './feature.js' }],
    ['target-only wildcard', { './feature': './feature/*.js' }],
    ['multiple wildcards', { './feature/**': './feature/**.js' }],
    ['mixed subpath and conditions', { '.': './index.js', import: './module.js' }],
    ['target encoded dot lowercase', { '.': './%2e/index.js' }],
    ['target encoded dot uppercase', { '.': './%2E/index.js' }],
    ['target encoded dotdot lowercase', { '.': './%2e%2e/index.js' }],
    ['target encoded dotdot mixed case', { '.': './%2E%2e/index.js' }],
    ['target encoded slash', { '.': './safe%2Fescape.js' }],
    ['target encoded backslash', { '.': './safe%5cescape.js' }],
    ['target malformed percent', { '.': './bad%2/index.js' }],
    ['target uppercase node_modules', { '.': './NODE_MODULES/pkg.js' }],
    ['target mixed-case node_modules', { '.': './Node_Modules/pkg.js' }],
    ['subpath encoded dot', { './%2e/feature': './feature.js' }],
    ['subpath encoded dotdot mixed case', { './%2E%2e/feature': './feature.js' }],
    ['subpath encoded slash', { './safe%2Fescape': './feature.js' }],
    ['subpath encoded backslash', { './safe%5Cescape': './feature.js' }],
    ['subpath malformed percent', { './bad%2': './feature.js' }],
    ['subpath uppercase node_modules', { './NODE_MODULES/feature': './feature.js' }],
    ['subpath mixed-case node_modules', { './Node_Modules/feature': './feature.js' }],
    ['top-level numeric condition zero', { '0': './index.js' }],
    ['top-level numeric condition one', { '1': './index.js' }],
    ['nested numeric condition', { '.': { '2': './index.js' } }],
  ];
  for (const [name, exportsValue] of cases) {
    await t.test(name, async (t) => {
      const root = createGraphRoot(t);
      const packageJson = path.join(root, 'packages/expo-asset/package.json');
      const manifest = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
      manifest.exports = exportsValue;
      fs.writeFileSync(packageJson, `${JSON.stringify(manifest, null, 2)}\n`);
      const outputDir = path.join(root, 'outputs');
      await packPackages({ rootDir: root, outputDir, round: 'A' });
      const report = auditPackages({ rootDir: root, manifestPath: path.join(outputDir, 'manifest.json') });
      assert.ok(report.failures.some((failure) => failure.includes('expo-asset: invalid exports')), `${name}: ${JSON.stringify(report, null, 2)}`);
    });
  }
});

test('accepts valid exports null blockers, conditions, arrays, and coherent patterns', async (t) => {
  const root = createGraphRoot(t);
  const packageJson = path.join(root, 'packages/expo-asset/package.json');
  const manifest = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
  manifest.exports = {
    '.': { import: ['./module.js', null], default: './index.js' },
    './blocked': null,
    './feature/*': './*.js',
  };
  fs.writeFileSync(packageJson, `${JSON.stringify(manifest, null, 2)}\n`);
  const outputDir = path.join(root, 'outputs');
  await packPackages({ rootDir: root, outputDir, round: 'A' });
  const report = auditPackages({ rootDir: root, manifestPath: path.join(outputDir, 'manifest.json') });
  assert.equal(report.failures.some((failure) => failure.includes('expo-asset: invalid exports')), false, JSON.stringify(report, null, 2));
});
