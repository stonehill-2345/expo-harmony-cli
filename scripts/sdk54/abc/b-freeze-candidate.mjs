import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { extract, list } from 'tar';

import { RELEASE_ID, RELEASE_PACKAGES } from '../release-catalog.mjs';

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const sha512 = (bytes) => `sha512-${crypto.createHash('sha512').update(bytes).digest('base64')}`;

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function git(sourceRoot, args) {
  return execFileSync('git', ['-C', sourceRoot, ...args], { encoding: 'utf8' }).trim();
}

function safeOutput(output) {
  const resolved = path.resolve(output);
  if (fs.existsSync(resolved)) throw new Error(`output already exists: ${resolved}`);
  return resolved;
}

function walk(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walk(file));
    else if (entry.isFile()) files.push(file);
  }
  return files.sort();
}

async function inspectArchive(file) {
  const members = [];
  await list({
    file,
    strict: true,
    onentry(entry) {
      if (!['File', 'Directory'].includes(entry.type)) throw new Error(`unsupported archive member type: ${entry.path}`);
      if (!entry.path.startsWith('package/') || entry.path.includes('\\') || entry.path.split('/').includes('..')) {
        throw new Error(`unsafe archive member: ${entry.path}`);
      }
      if (entry.type === 'File') members.push(entry.path);
    },
  });
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-freeze-archive-'));
  try {
    await extract({ file, cwd: temporary, strict: true });
    const packageRoot = path.join(temporary, 'package');
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
    const configFile = path.join(packageRoot, 'expo-module.config.json');
    const platforms = fs.existsSync(configFile)
      ? JSON.parse(fs.readFileSync(configFile, 'utf8')).platforms ?? []
      : [];
    return { manifest, members: members.sort(), platforms };
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function pluginAudit(sourceRoot, descriptor, members) {
  if (!descriptor.relativePath) return { sources: [], missingBuild: [] };
  const pluginRoot = path.join(sourceRoot, descriptor.relativePath, 'plugin/src');
  const sources = walk(pluginRoot)
    .filter((file) => /\.[cm]?tsx?$/.test(file) && !file.split(path.sep).includes('__tests__'))
    .map((file) => path.relative(path.join(sourceRoot, descriptor.relativePath), file).split(path.sep).join('/'));
  const memberSet = new Set(members);
  const missingBuild = [];
  for (const source of sources) {
    const stem = source.replace(/^plugin\/src\//, 'plugin/build/').replace(/\.[cm]?tsx?$/, '');
    for (const expected of [`package/${source}`, `package/${stem}.js`, `package/${stem}.d.ts`]) {
      if (!memberSet.has(expected)) missingBuild.push(expected.replace(/^package\//, ''));
    }
  }
  return { sources, missingBuild };
}

export async function freezeCandidate({ directory, sourceRoot, output }) {
  const input = fs.realpathSync(path.resolve(directory));
  const source = fs.realpathSync(path.resolve(sourceRoot));
  const destination = safeOutput(output);
  const releaseFile = path.join(input, 'release.json');
  const release = JSON.parse(fs.readFileSync(releaseFile, 'utf8'));
  if (release.release !== RELEASE_ID || !Array.isArray(release.packages)
    || release.packages.length !== RELEASE_PACKAGES.length || !Array.isArray(release.failures)
    || release.failures.length) throw new Error('release must contain the complete successful fifteen-package set');

  const expected = new Map(RELEASE_PACKAGES.map((item) => [item.installName, item]));
  const runtimePackages = [];
  const usedFiles = new Set(['release.json']);
  for (const row of release.packages) {
    const descriptor = expected.get(row.installName);
    if (!descriptor || row.name !== descriptor.publishName || row.version !== descriptor.publishVersion
      || typeof row.file !== 'string' || path.basename(row.file) !== row.file || usedFiles.has(row.file)) {
      throw new Error(`invalid release package identity: ${row.installName ?? '<missing>'}`);
    }
    usedFiles.add(row.file);
    const archive = path.join(input, row.file);
    const bytes = fs.readFileSync(archive);
    if (sha512(bytes) !== row.integrity) throw new Error(`integrity mismatch: ${row.file}`);
    const inspected = await inspectArchive(archive);
    if (inspected.manifest.name !== row.name || inspected.manifest.version !== row.version) {
      throw new Error(`archive manifest mismatch: ${row.file}`);
    }
    const audit = pluginAudit(source, descriptor, inspected.members);
    if (audit.missingBuild.length) throw new Error(`missing plugin build outputs: ${audit.missingBuild.join(', ')}`);
    runtimePackages.push({
      installName: row.installName,
      name: row.name,
      version: row.version,
      file: row.file,
      bytes: bytes.length,
      sha256: sha256(bytes),
      integrity: row.integrity,
      platforms: inspected.platforms,
      members: inspected.members,
      pluginAudit: audit,
      dependencies: inspected.manifest.dependencies ?? {},
      optionalDependencies: inspected.manifest.optionalDependencies ?? {},
    });
  }
  if (runtimePackages.length !== expected.size || new Set(runtimePackages.map(({ installName }) => installName)).size !== expected.size) {
    throw new Error('release package set differs from catalog');
  }

  const extraArchives = fs.readdirSync(input).filter((name) => name.endsWith('.tgz') && !usedFiles.has(name));
  if (extraArchives.length !== 1) throw new Error('candidate directory must contain exactly one independent CLI archive');
  const cliFile = extraArchives[0];
  const cliBytes = fs.readFileSync(path.join(input, cliFile));
  const cliInspection = await inspectArchive(path.join(input, cliFile));
  if (cliInspection.manifest.name !== 'expo-harmony-cli') throw new Error('independent CLI archive has the wrong package name');
  const cli = {
    name: cliInspection.manifest.name,
    version: cliInspection.manifest.version,
    file: cliFile,
    bytes: cliBytes.length,
    sha256: sha256(cliBytes),
    members: cliInspection.members,
  };

  const sourceStatus = git(source, ['status', '--porcelain=v1', '--untracked-files=all']);
  const sourceRecord = {
    revision: git(source, ['rev-parse', 'HEAD']),
    dirty: Boolean(sourceStatus),
    changes: sourceStatus ? sourceStatus.split(/\r?\n/) : [],
  };
  const temporary = `${destination}.tmp-${process.pid}`;
  fs.mkdirSync(temporary, { recursive: false });
  try {
    fs.copyFileSync(releaseFile, path.join(temporary, 'release.json'));
    for (const file of [...runtimePackages.map(({ file }) => file), cliFile]) {
      fs.copyFileSync(path.join(input, file), path.join(temporary, file));
    }
    const candidate = {
      schemaVersion: 1,
      release: RELEASE_ID,
      packages: runtimePackages.map(({ name, version, file, bytes, sha256: hash }) => ({ name, version, file, bytes, sha256: hash })),
      failures: [],
    };
    const result = {
      schemaVersion: 1,
      source: sourceRecord,
      input: {
        path: input,
        releaseSha256: sha256(fs.readFileSync(releaseFile)),
        compatibility: (release.compatibility?.artifacts ?? []).map(({ packageName, packageVersion, inputSHA256, outputSHA256 }) => ({
          packageName, packageVersion, inputSHA256, outputSHA256,
        })),
      },
      runtimePackages,
      cli,
      consumptionGraph: runtimePackages.map(({ name, dependencies, optionalDependencies }) => ({ name, dependencies, optionalDependencies })),
      failures: [],
    };
    writeJson(path.join(temporary, 'candidate.json'), candidate);
    writeJson(path.join(temporary, 'b-candidate.json'), result);
    fs.renameSync(temporary, destination);
    return result;
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`Missing ${name}`);
  return args[index + 1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    const result = await freezeCandidate({
      directory: option(args, '--directory'),
      sourceRoot: option(args, '--source-root'),
      output: option(args, '--output'),
    });
    process.stdout.write(`${JSON.stringify({ runtimePackages: result.runtimePackages.length, cli: result.cli, source: result.source }, null, 2)}\n`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
