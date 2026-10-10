import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import zlib from 'node:zlib';

import packlist from 'npm-packlist';
import { create as createTar } from 'tar';

import { EXPECTED_INTERNAL_EDGES, SDK54_PACKAGES } from './catalog.mjs';

const FIXED_MTIME = new Date('2000-01-01T00:00:00.000Z');
const SOURCE_MAP_EXTENSIONS = new Set(['.map']);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function writeStableJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(stableValue(value), null, 2)}\n`);
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function archiveName(descriptor) {
  return descriptor.patchFile.replace(/\.patch$/, '.tgz');
}

function portable(filePath) {
  return filePath.split(path.sep).join('/');
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function copyTree(source, destination, filter) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, {
    recursive: true,
    dereference: false,
    preserveTimestamps: true,
    verbatimSymlinks: true,
    filter,
  });
}

function copyPackageToStage({ sourcePackageDir, stagePackageDir, removeBuild }) {
  copyTree(sourcePackageDir, stagePackageDir, (sourcePath) => {
    const relativePath = portable(path.relative(sourcePackageDir, sourcePath));
    if (!relativePath) return true;
    if (relativePath === 'node_modules' || relativePath.startsWith('node_modules/')) return false;
    if (removeBuild && (relativePath === 'build' || relativePath.startsWith('build/'))) return false;
    return true;
  });
}

function symlinkExisting(source, destination) {
  if (!fs.existsSync(source)) throw new Error(`required pinned build tooling is missing: ${source}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.symlinkSync(fs.realpathSync(source), destination);
}

function packagePath(root, name) {
  return path.join(root, ...name.split('/'));
}

function fingerprintTree(rootDir) {
  const entries = [];
  const visit = (currentDir) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = portable(path.relative(rootDir, absolutePath));
      const stat = fs.lstatSync(absolutePath);
      const value = { path: relativePath, mode: stat.mode & 0o7777, mtimeMs: stat.mtimeMs };
      if (stat.isSymbolicLink()) value.link = fs.readlinkSync(absolutePath);
      else if (stat.isFile()) value.sha256 = crypto.createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex');
      entries.push(value);
      if (stat.isDirectory()) visit(absolutePath);
    }
  };
  visit(rootDir);
  return JSON.stringify(entries);
}

function resolveToolSource({ rootDir, sourcePackageDir, link }) {
  return link.source === 'root'
    ? path.join(rootDir, link.path)
    : packagePath(path.join(sourcePackageDir, 'node_modules'), link.name);
}

function attachBuildTooling({ rootDir, sourcePackageDir, stageRoot, stagePackageDir, manifest, recipe }) {
  const targets = new Map();
  fs.mkdirSync(path.join(stagePackageDir, 'node_modules/.bin'), { recursive: true });
  const links = [...recipe.toolLinks];
  if (recipe.linkProductionDependencies) {
    for (const name of [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.optionalDependencies ?? {})]) {
      links.push({ name, source: 'package' });
    }
  }
  for (const link of links) {
    const source = resolveToolSource({ rootDir, sourcePackageDir, link });
    const realSource = fs.realpathSync(source);
    symlinkExisting(realSource, packagePath(path.join(stagePackageDir, 'node_modules'), link.name));
    if (recipe.toolLinks.some(({ name }) => name === link.name) && !targets.has(realSource)) {
      targets.set(realSource, fingerprintTree(realSource));
    }
  }
  for (const bin of recipe.binLinks) {
    const linkedPackage = packagePath(path.join(stagePackageDir, 'node_modules'), bin.package);
    symlinkExisting(path.join(fs.realpathSync(linkedPackage), bin.path), path.join(stagePackageDir, 'node_modules/.bin', bin.name));
  }
  for (const copy of recipe.supportCopies ?? []) {
    const source = path.join(rootDir, copy.from);
    if (!fs.existsSync(source)) throw new Error(`required build support is missing: ${source}`);
    copyTree(source, path.join(stageRoot, copy.to));
  }
  for (const link of recipe.supportLinks ?? []) symlinkExisting(path.join(rootDir, link.from), path.join(stageRoot, link.to));
  if (recipe.tsconfigCompilerOptions) {
    const tsconfigPath = path.join(stagePackageDir, 'tsconfig.json');
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
    tsconfig.compilerOptions = { ...(tsconfig.compilerOptions ?? {}), ...recipe.tsconfigCompilerOptions };
    writeStableJson(tsconfigPath, tsconfig);
  }
  return targets;
}

function verifyToolTargets(targets) {
  for (const [target, before] of targets) {
    if (fingerprintTree(target) !== before) throw new Error(`build tool target changed: ${target}`);
  }
}

function buildEnvironment(fixedEnvironment) {
  const inherited = {};
  for (const name of ['HOME', 'PATH', 'PNPM_HOME', 'USER']) {
    if (process.env[name]) inherited[name] = process.env[name];
  }
  return { ...inherited, ...fixedEnvironment };
}

function runAllowlistedBuild({ descriptor, stagePackageDir }) {
  const argv = descriptor.build.argv.map((value) =>
    value === '{packageDir}' ? stagePackageDir : value,
  );
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd: stagePackageDir,
    env: buildEnvironment(descriptor.build.env),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    shell: descriptor.build.shell,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(`build failed with exit code ${String(result.status)}${detail ? `: ${detail}` : ''}`);
  }
}

function validateRuntimeOutputs(packageDir, descriptor) {
  for (const required of descriptor.runtime?.requiredFiles ?? []) {
    const outputPath = path.join(packageDir, required.path);
    let stat;
    try { stat = fs.statSync(outputPath); } catch { throw new Error(`required runtime output is missing: ${required.path}`); }
    if (!stat.isFile()) throw new Error(`required runtime output is not a file: ${required.path}`);
    if (required.executable && (stat.mode & 0o111) === 0) throw new Error(`required runtime output is not executable: ${required.path}`);
  }
}

function linkConsumerPackage(nodeModulesDir, name, source) {
  symlinkExisting(source, packagePath(nodeModulesDir, name));
}

function runtimeEnvironment(nodeModulesDir) {
  return { ...buildEnvironment({ CI: '1', EXPO_NONINTERACTIVE: '1' }), NODE_PATH: nodeModulesDir, FORCE_COLOR: '0' };
}

function runProbeCommand(command, args, options, label) {
  const result = spawnSync(command, args, { ...options, encoding: 'utf8', shell: false, maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    const detail = [result.error?.message, result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(`runtime probe ${label} failed${detail ? `: ${detail}` : ''}`);
  }
  return result.stdout;
}

export function probePackageRuntime({ packageDir, sourcePackageDir, rootDir, descriptor }) {
  if (!descriptor.runtime?.probe) return;
  const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
  const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-runtime-probe-'));
  try {
    const nodeModulesDir = path.join(probeRoot, 'node_modules');
    fs.mkdirSync(nodeModulesDir, { recursive: true });
    linkConsumerPackage(nodeModulesDir, descriptor.name, packageDir);
    for (const name of [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.optionalDependencies ?? {})]) {
      const source = packagePath(path.join(sourcePackageDir, 'node_modules'), name);
      if (!fs.existsSync(source)) throw new Error(`runtime probe dependency is missing: ${name}`);
      linkConsumerPackage(nodeModulesDir, name, source);
    }
    for (const name of descriptor.runtime.probe.peerProviders) {
      const provider = SDK54_PACKAGES.find((candidate) => candidate.name === name);
      if (!provider) throw new Error(`runtime probe peer provider is not cataloged: ${name}`);
      linkConsumerPackage(nodeModulesDir, name, path.join(rootDir, provider.relativePath));
    }
    const consumerDir = path.join(probeRoot, 'consumer');
    fs.mkdirSync(consumerDir, { recursive: true });
    fs.writeFileSync(path.join(consumerDir, 'package.json'), '{"name":"sdk54-runtime-probe","private":true}\n');
    const env = runtimeEnvironment(nodeModulesDir);
    const probe = descriptor.runtime.probe;
    if (probe.type === 'cli') {
      const cli = path.join(packageDir, 'build/bin/cli');
      const version = runProbeCommand(process.execPath, [cli, '--version'], { cwd: consumerDir, env }, 'CLI version').trim();
      if (version !== probe.version) throw new Error(`runtime probe CLI version mismatch: ${version}`);
      const help = runProbeCommand(process.execPath, [cli, 'run:harmony', '--help'], { cwd: consumerDir, env }, 'CLI run:harmony');
      if (!help.includes('run:harmony')) throw new Error('runtime probe CLI run:harmony help is invalid');
      const prebuildScript = `
const Module=require('module');
const p=${JSON.stringify(packageDir)};
const helperPath=p+'/build/src/prebuild/harmony/prebuildHarmonyAsync.js';
const dispatcherPath=p+'/build/src/prebuild/index.js';
const helper=require(helperPath);
if(typeof helper.prebuildHarmonyAsync!=='function'){console.error('prebuild helper export is not callable');process.exit(2)}
let called=false;
const original=Module._load;
Module._load=function(request,parent,isMain){
  if(request==='../utils/args') return {assertArgs:()=>({'--platform':'harmony','--no-install':true}),getProjectRoot:()=>'/controlled-project',printHelp:()=>{}};
  if(request==='./prebuildAsync.js') return {prebuildAsync:()=>{throw new Error('ordinary prebuild selected')}};
  if(request==='./resolveOptions.js') return {resolvePlatformOption:()=>{throw new Error('ordinary platform resolver used')},resolvePackageManagerOptions:()=>({}),resolveSkipDependencyUpdate:()=>[]};
  if(request==='../utils/errors.js') return {logCmdError:(error)=>{throw error}};
  if(request==='./harmony/prebuildHarmonyAsync.js') return {prebuildHarmonyAsync:async()=>{called=true;return {harmonyRoot:'/controlled'}}};
  return original.apply(this,arguments);
};
const dispatcher=require(dispatcherPath);
if(typeof dispatcher.expoPrebuild!=='function'){console.error('prebuild dispatcher export is not callable');process.exit(3)}
Promise.resolve(dispatcher.expoPrebuild(['--platform','harmony','--no-install'])).then(()=>{if(!called){console.error('Harmony prebuild helper was not selected');process.exit(4)}}).catch((error)=>{console.error(error);process.exit(5)});
`;
      runProbeCommand(process.execPath, ['-e', prebuildScript], { cwd: consumerDir, env }, 'CLI Harmony prebuild');
    } else if (probe.type === 'metro') {
      const script = `const p=${JSON.stringify(packageDir)};const w=require(p+'/build/withHarmony.js');if(typeof w.withHarmony!=='function')process.exit(2);const f=require.resolve(p+'/build/withHarmony.js');delete require.cache[f];require(p+'/build/ExpoMetroConfig.js');if(!require.cache[f])process.exit(3);`;
      runProbeCommand(process.execPath, ['-e', script], { cwd: consumerDir, env }, 'Metro Harmony module');
    } else if (probe.type === 'autolinking') {
      const stdout = runProbeCommand(process.execPath, [path.join(packageDir, 'bin/expo-modules-autolinking.js'), 'resolve', '--platform', 'harmony', '--project-root', consumerDir, '--json'], { cwd: consumerDir, env }, 'Autolinking harmony resolve');
      try { JSON.parse(stdout); } catch { throw new Error('runtime probe Autolinking returned invalid JSON'); }
      if (/No linking implementation is available/i.test(stdout)) throw new Error('runtime probe Autolinking reported unsupported platform');
    }
  } finally {
    fs.rmSync(probeRoot, { recursive: true, force: true });
  }
}

function walkFiles(rootDir) {
  const files = [];
  const visit = (currentDir) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile()) files.push(absolutePath);
    }
  };
  visit(rootDir);
  return files;
}

function validateSourceMaps({ packageDir, forbiddenRoots }) {
  const normalizedForbidden = forbiddenRoots.map((root) => portable(path.resolve(root)));
  for (const filePath of walkFiles(packageDir)) {
    if (!SOURCE_MAP_EXTENSIONS.has(path.extname(filePath))) continue;
    const text = fs.readFileSync(filePath, 'utf8');
    const relativePath = portable(path.relative(packageDir, filePath));
    for (const forbidden of normalizedForbidden) {
      if (portable(text).includes(forbidden)) {
        throw new Error(`source map contains an absolute build path: ${relativePath}`);
      }
    }
    let sourceMap;
    try {
      sourceMap = JSON.parse(text);
    } catch (error) {
      throw new Error(`invalid source map ${relativePath}: ${error.message}`);
    }
    for (const source of [sourceMap.sourceRoot, ...(sourceMap.sources ?? [])].filter(Boolean)) {
      if (path.posix.isAbsolute(source) || path.win32.isAbsolute(source) || /^file:/i.test(source)) {
        throw new Error(`source map contains an absolute source path in ${relativePath}: ${source}`);
      }
    }
  }
}

function validateRawArchive(archivePath, forbiddenRoots) {
  const rawTar = zlib.gunzipSync(fs.readFileSync(archivePath));
  const text = rawTar.toString('utf8');
  for (const root of forbiddenRoots) {
    const normalized = portable(path.resolve(root));
    if (text.includes(normalized)) throw new Error(`archive contains absolute path: ${normalized}`);
  }
  if (text.includes('sdk54-pack-stage-')) {
    throw new Error('archive contains a disposable build path');
  }
}

async function packageFiles(packageDir, manifest) {
  const tree = {
    path: packageDir,
    package: manifest,
    workspaces: null,
    isProjectRoot: true,
    edgesOut: new Map(),
  };
  return [...await packlist(tree)].sort((left, right) => left.localeCompare(right, 'en'));
}

export async function stageBuildAndPack({ rootDir, outputDir, descriptor, transform, archiveFile }) {
  const sourcePackageDir = path.join(rootDir, descriptor.relativePath);
  const sourceManifest = JSON.parse(fs.readFileSync(path.join(sourcePackageDir, 'package.json'), 'utf8'));
  if (sourceManifest.name !== descriptor.name || sourceManifest.version !== descriptor.version) {
    throw new Error(
      `expected ${descriptor.name}@${descriptor.version}, found ${String(sourceManifest.name)}@${String(sourceManifest.version)}`,
    );
  }
  const shouldBuild = Boolean(descriptor.build);
  const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-pack-stage-'));
  const stagePackageDir = path.join(stageRoot, descriptor.relativePath);
  const file = archiveFile ?? archiveName(descriptor);
  const archivePath = path.join(outputDir, file);
  try {
    copyPackageToStage({
      sourcePackageDir,
      stagePackageDir,
      removeBuild: shouldBuild,
    });
    if (shouldBuild) {
      const toolTargets = attachBuildTooling({ rootDir, sourcePackageDir, stageRoot, stagePackageDir, manifest: sourceManifest, recipe: descriptor.build });
      let buildError;
      try { runAllowlistedBuild({ descriptor, stagePackageDir }); } catch (error) { buildError = error; }
      verifyToolTargets(toolTargets);
      if (buildError) throw buildError;
      fs.rmSync(path.join(stagePackageDir, 'node_modules'), { recursive: true, force: true });
      validateRuntimeOutputs(stagePackageDir, descriptor);
      probePackageRuntime({ packageDir: stagePackageDir, sourcePackageDir, rootDir, descriptor });
      validateSourceMaps({ packageDir: stagePackageDir, forbiddenRoots: [rootDir, stageRoot] });
    }

    const manifestPath = path.join(stagePackageDir, 'package.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.name !== descriptor.name || manifest.version !== descriptor.version) {
      throw new Error(
        `expected ${descriptor.name}@${descriptor.version}, found ${String(manifest.name)}@${String(manifest.version)}`,
      );
    }
    if (transform) await transform(stagePackageDir, manifest);
    const finalManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const files = await packageFiles(stagePackageDir, finalManifest);
    if (files.length === 0) throw new Error('npm-packlist selected no files');
    fs.rmSync(archivePath, { force: true });
    await createTar(
      {
        cwd: stagePackageDir,
        file: archivePath,
        gzip: true,
        portable: true,
        mtime: FIXED_MTIME,
        uid: 0,
        gid: 0,
        prefix: 'package/',
        noMtime: false,
      },
      files,
    );
    validateRawArchive(archivePath, [rootDir, stageRoot]);
    return {
      name: descriptor.name,
      version: descriptor.version,
      file,
      bytes: fs.statSync(archivePath).size,
      sha256: sha256(archivePath),
    };
  } catch (error) {
    fs.rmSync(archivePath, { force: true });
    throw error;
  } finally {
    if (isInside(os.tmpdir(), stageRoot)) fs.rmSync(stageRoot, { recursive: true, force: true });
  }
}

export async function packPackages({ rootDir, outputDir, round }) {
  const packages = [];
  const failures = [];
  fs.mkdirSync(outputDir, { recursive: true });

  for (const descriptor of SDK54_PACKAGES) {
    try {
      packages.push(await stageBuildAndPack({ rootDir, outputDir, descriptor, round }));
    } catch (error) {
      failures.push(`${descriptor.name}: ${error.message}`);
    }
  }

  packages.sort((left, right) => left.name.localeCompare(right.name, 'en'));
  const internalEdges = [...EXPECTED_INTERNAL_EDGES].sort((left, right) =>
    `${left.from}\0${left.section}\0${left.to}`.localeCompare(
      `${right.from}\0${right.section}\0${right.to}`,
      'en',
    ),
  );
  const manifest = { packages, internalEdges, failures };
  writeStableJson(path.join(outputDir, 'manifest.json'), manifest);
  return manifest;
}

function argumentValue(args, name, fallback) {
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

export async function compareRounds(rootDir) {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-compare-'));
  const outputA = path.join(baseDir, 'pack-a');
  const outputB = path.join(baseDir, 'pack-b');
  try {
    const first = await packPackages({ rootDir, outputDir: outputA, round: 'A' });
    const second = await packPackages({ rootDir, outputDir: outputB, round: 'B' });
    const failures = [...first.failures, ...second.failures];
    const secondByName = new Map(second.packages.map((entry) => [entry.name, entry]));
    for (const entry of first.packages) {
      const comparison = secondByName.get(entry.name);
      if (!comparison || comparison.sha256 !== entry.sha256 || comparison.bytes !== entry.bytes) {
        failures.push(`Non-deterministic package archive: ${entry.name}`);
      }
    }
    const report = {
      packages: first.packages.length,
      internalEdges: first.internalEdges.length,
      deterministic: failures.length === 0,
      failures,
    };
    process.stdout.write(`${JSON.stringify(stableValue(report), null, 2)}\n`);
    if (failures.length > 0) process.exitCode = 1;
  } finally {
    fs.rmSync(baseDir, { recursive: true, force: true });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const rootDir = process.cwd();
  if (args.includes('--compare-rounds')) {
    await compareRounds(rootDir);
    return;
  }
  const round = argumentValue(args, '--round', 'A');
  const output = argumentValue(args, '--output', 'outputs/sdk54/pack-a');
  const manifest = await packPackages({ rootDir, outputDir: path.resolve(rootDir, output), round });
  process.stdout.write(`${JSON.stringify(stableValue(manifest), null, 2)}\n`);
  if (manifest.failures.length > 0) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
