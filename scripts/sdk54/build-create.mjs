import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import packlist from 'npm-packlist';
import { create as createTar } from 'tar';

const NAME = '@expo-oh/create-expo';
const VERSION = '3.5.13';
const FIXED_MTIME = new Date('2000-01-01T00:00:00.000Z');
const hash = (bytes, algorithm, encoding) => crypto.createHash(algorithm).update(bytes).digest(encoding);

export function validateCreatorBuild({ packageDir }) {
  const build = path.join(packageDir, 'build');
  const required = new Set(['index.js']);
  const checked = new Set();
  // NCC splits dynamic imports into numbered chunks. Follow every referenced chunk,
  // including references reachable only while creating or extracting a project.
  while (checked.size < required.size) {
    for (const relative of [...required]) {
      if (checked.has(relative)) continue;
      const file = path.join(build, relative);
      if (!fs.existsSync(file) || !fs.lstatSync(file).isFile()) throw new Error(`Missing creator build resource: ${relative}`);
      const text = fs.readFileSync(file, 'utf8');
      for (const match of text.matchAll(/\.e\((\d+)\)/g)) required.add(`${match[1]}.index.js`);
      checked.add(relative);
    }
  }
  for (const relative of ['gitignore', 'THIRD_PARTY_LICENSES.txt']) {
    const file = path.join(build, relative);
    if (!fs.existsSync(file) || !fs.lstatSync(file).isFile() || fs.statSync(file).size === 0) throw new Error(`Missing creator build resource: ${relative}`);
    required.add(relative);
  }
  if (!fs.readFileSync(path.join(build, 'index.js'), 'utf8').startsWith('#!/usr/bin/env node')) throw new Error('Creator build entry must retain its node shebang');
  return [...required].sort();
}

function candidateReadme() {
  return `# @expo-oh/create-expo\n\nSDK54 Expo Harmony creation candidate, based on Expo create-expo 3.5.11 at 5b42e3d21e0ac5e086752361ca8a5cb4de53bec1.\n\n\`npx @expo-oh/create-expo@3.5.13 my-app --yes\`\n\nThe default template is @expo-oh/expo-template-default@54.0.65. Use \`--template blank-typescript\` for @expo-oh/expo-template-blank-typescript@54.0.49. Explicit template packages, repositories and local .tgz files retain upstream behavior. \`--no-install\` skips dependency installation. npm, pnpm, yarn and bun are selected through npm_config_user_agent; there are no --npm or --pnpm switches. Installation and package-manager configuration failures return a nonzero exit code.\n\nThis tarball includes all NCC runtime chunks and third-party license notices; installation needs no workspace, build tooling, or lifecycle scripts. Creation does not establish Harmony build, runtime, device, HAR or ABI support.\n\nThe upstream package manifest declares BSD-3-Clause; LICENSE provides that text with the upstream Expo copyright notice. The pinned repository root instead contains an MIT license, preserved verbatim in UPSTREAM_LICENSE. This candidate records both source notices without asserting they are equivalent. Bundled dependency notices are in build/THIRD_PARTY_LICENSES.txt.\n`;
}

export async function buildAndPackCreator({ rootDir = process.cwd(), outputDir }) {
  if (!outputDir) throw new Error('Creator candidate outputDir is required');
  rootDir = path.resolve(rootDir);
  outputDir = path.resolve(outputDir);
  const source = path.join(rootDir, 'packages/create-expo');
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
  if (manifest.name !== NAME || manifest.version !== VERSION || manifest.private !== true) throw new Error('Unexpected creator source identity or private guard');
  fs.mkdirSync(outputDir, { recursive: true });
  const file = `expo-oh-create-expo-${VERSION}.tgz`;
  const archivePath = path.join(outputDir, file);
  fs.rmSync(archivePath, { force: true });
  fs.rmSync(path.join(source, 'build'), { recursive: true, force: true });
  const build = spawnSync('pnpm', ['--dir', source, 'run', 'build:prod'], {
    cwd: rootDir, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, shell: false,
  });
  fs.writeFileSync(path.join(outputDir, 'build.log'), `${build.stdout ?? ''}${build.stderr ?? ''}`);
  if (build.error) throw build.error;
  if (build.status !== 0) throw new Error(`Creator build failed with exit ${build.status}; see ${path.join(outputDir, 'build.log')}`);
  const runtimeFiles = validateCreatorBuild({ packageDir: source });
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-create-pack-'));
  const stage = path.join(temporary, 'package');
  try {
    fs.mkdirSync(stage);
    for (const relative of ['build', 'template', 'LICENSE', 'UPSTREAM_LICENSE']) {
      fs.cpSync(path.join(source, relative), path.join(stage, relative), { recursive: true, dereference: false });
    }
    const candidate = { ...manifest, private: false, scripts: {}, files: ['build', 'template', 'LICENSE', 'UPSTREAM_LICENSE', 'README.md'] };
    delete candidate.devDependencies;
    fs.writeFileSync(path.join(stage, 'package.json'), `${JSON.stringify(candidate, null, 2)}\n`);
    fs.writeFileSync(path.join(stage, 'README.md'), candidateReadme());
    fs.chmodSync(path.join(stage, 'build/index.js'), 0o755);
    validateCreatorBuild({ packageDir: stage });
    const files = (await packlist({ path: stage, package: candidate, workspaces: null, isProjectRoot: true, edgesOut: new Map() })).sort();
    for (const relative of files) {
      if (!fs.lstatSync(path.join(stage, relative)).isFile()) throw new Error(`Creator candidate must contain regular files only: ${relative}`);
      if (relative.includes('node_modules') || relative.startsWith('src/')) throw new Error(`Creator candidate contains an unwanted development path: ${relative}`);
    }
    for (const relative of [...runtimeFiles.map((name) => `build/${name}`), 'LICENSE', 'UPSTREAM_LICENSE', 'README.md']) {
      if (!files.includes(relative)) throw new Error(`npm-packlist omitted creator runtime resource: ${relative}`);
    }
    await createTar({ cwd: stage, file: archivePath, gzip: true, portable: true, mtime: FIXED_MTIME, uid: 0, gid: 0, prefix: 'package/' }, files);
    const bytes = fs.readFileSync(archivePath);
    const result = {
      name: NAME, version: VERSION, file, bytes: bytes.length,
      sha256: hash(bytes, 'sha256', 'hex'), integrity: `sha512-${hash(bytes, 'sha512', 'base64')}`,
      sourceRevision: '5b42e3d21e0ac5e086752361ca8a5cb4de53bec1',
      buildCommand: 'pnpm --dir packages/create-expo run build:prod', buildExitCode: build.status,
      runtimeFiles, files,
    };
    fs.writeFileSync(path.join(outputDir, 'creator.json'), `${JSON.stringify(result, null, 2)}\n`);
    return result;
  } catch (error) {
    fs.rmSync(archivePath, { force: true });
    throw error;
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  const index = args.indexOf('--output');
  buildAndPackCreator({ rootDir: process.cwd(), outputDir: index >= 0 ? args[index + 1] : undefined })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
