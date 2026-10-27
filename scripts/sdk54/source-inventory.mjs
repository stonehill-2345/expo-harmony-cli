import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { SDK54_EXPO_COMMIT } from './catalog.mjs';

const REPOSITORY = 'https://github.com/expo/expo.git';
const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const ENTRY_FIELDS = ['main', 'module', 'types', 'typings', 'source', 'react-native', 'browser', 'exports', 'bin'];

export { readTree as readSourceTree, readBlobs as readSourceBlobs, prefetchManifests as prefetchSourceBlobs };

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

export function serializeInventory(value) {
  return `${JSON.stringify(canonical(value), null, 2)}\n`;
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function git(sourceDir, args, { input, encoding = 'utf8' } = {}) {
  try {
    return execFileSync('git', ['-C', sourceDir, ...args], {
      encoding, input, timeout: 120_000, maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    throw new Error(`Git ${args[0]} failed: ${String(error.stderr || error.message).trim()}`, { cause: error });
  }
}

function readTree(sourceDir, revision) {
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('Source revision must be a full 40-character commit ID');
  let commit;
  try {
    commit = git(sourceDir, ['rev-parse', '--verify', `${revision}^{commit}`]).trim();
  } catch (error) {
    throw new Error(`Source revision ${revision} is unavailable: ${error.message}`);
  }
  if (commit !== revision) throw new Error(`Source revision ${revision} is not a commit`);
  const tree = git(sourceDir, ['rev-parse', `${revision}^{tree}`]).trim();
  const entries = git(sourceDir, ['ls-tree', '-r', '-z', '--full-tree', revision])
    .split('\0').filter(Boolean).map((line) => {
      const tab = line.indexOf('\t');
      const [mode, type, oid] = line.slice(0, tab).split(' ');
      return { path: line.slice(tab + 1), mode, type, oid };
    }).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { tree, entries };
}

function readBlobs(sourceDir, entries) {
  if (!entries.length) return new Map();
  const buffer = git(sourceDir, ['cat-file', '--batch'], {
    input: entries.map(({ oid }) => oid).join('\n') + '\n', encoding: null,
  });
  const blobs = new Map();
  let offset = 0;
  for (const entry of entries) {
    const end = buffer.indexOf(10, offset);
    const header = buffer.subarray(offset, end).toString('utf8');
    const [oid, type, sizeText] = header.split(' ');
    if (end < 0 || oid !== entry.oid || type !== 'blob' || !/^\d+$/.test(sizeText)) {
      throw new Error(`Missing source blob for ${entry.path} (${entry.oid}); fetch fixed objects with --prefetch`);
    }
    const size = Number(sizeText);
    offset = end + 1;
    const content = buffer.subarray(offset, offset + size);
    if (content.length !== size || buffer[offset + size] !== 10) {
      throw new Error(`Truncated source blob for ${entry.path}`);
    }
    const actual = createHash('sha1').update(`blob ${size}\0`).update(content).digest('hex');
    if (actual !== entry.oid) throw new Error(`Source blob integrity mismatch: ${entry.path}`);
    blobs.set(entry.path, content);
    offset += size + 1;
  }
  return blobs;
}

function prefetchManifests(sourceDir, entries) {
  const output = git(sourceDir, ['cat-file', '--batch-check'], {
    input: entries.map(({ oid }) => oid).join('\n') + '\n',
  });
  const missing = output.trim().split('\n').filter((line) => line.endsWith(' missing')).map((line) => line.split(' ')[0]);
  if (missing.length) {
    git(sourceDir, ['-c', 'fetch.negotiationAlgorithm=noop', 'fetch', '--no-tags',
      '--no-write-fetch-head', '--recurse-submodules=no', '--filter=blob:none', '--stdin', REPOSITORY], {
      input: [...new Set(missing)].join('\n') + '\n',
    });
  }
}

function readManifest(blobs, file) {
  const content = blobs.get(file);
  if (!content) throw new Error(`Missing source manifest: ${file}`);
  try {
    const value = JSON.parse(content.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('must be an object');
    return value;
  } catch (error) {
    throw new Error(`Invalid source manifest ${file}: ${error.message}`);
  }
}

function workspacePatterns(manifest) {
  const patterns = Array.isArray(manifest.workspaces) ? manifest.workspaces : manifest.workspaces?.packages;
  if (!Array.isArray(patterns) || !patterns.length) throw new Error('Missing nonempty workspace patterns in package.json');
  for (const pattern of patterns) {
    if (typeof pattern !== 'string' || !pattern || /[{}[\]\\?()|]/.test(pattern) ||
        pattern.startsWith('/') || pattern.split('/').some((part) => part === '..' || part === '.')) {
      throw new Error(`Unsupported workspace pattern: ${String(pattern)}`);
    }
  }
  if (!patterns.some((pattern) => !pattern.startsWith('!'))) throw new Error('Workspace patterns must include a positive pattern');
  return patterns;
}

function matchesPattern(directory, pattern) {
  const parts = pattern.replace(/\/$/, '').split('/');
  const segments = directory.split('/');
  const match = (i, j) => {
    if (i === parts.length) return j === segments.length;
    if (parts[i] === '**') return match(i + 1, j) || (j < segments.length && match(i, j + 1));
    if (j === segments.length) return false;
    const expression = parts[i].split('*').map((piece) => piece.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')).join('.*');
    return new RegExp(`^${expression}$`).test(segments[j]) && match(i + 1, j + 1);
  };
  return match(0, 0);
}

function isWorkspace(directory, patterns) {
  return patterns.some((pattern) => !pattern.startsWith('!') && matchesPattern(directory, pattern)) &&
    !patterns.some((pattern) => pattern.startsWith('!') && matchesPattern(directory, pattern.slice(1)));
}

function describeManifest(entry, manifest, blobs, entries, namespace, names) {
  if (typeof manifest.name !== 'string' || !manifest.name) throw new Error(`Missing package name at ${entry.path}`);
  const directory = path.posix.dirname(entry.path);
  const files = entries.filter((file) => file.path.startsWith(`${directory}/`));
  return {
    id: `${namespace}:${manifest.name}`, name: manifest.name, version: manifest.version ?? null,
    private: manifest.private === true, sourcePath: entry.path, manifestBlob: entry.oid,
    manifestSha256: hash(blobs.get(entry.path)), files: files.length,
    filesHash: hash(serializeInventory(files)),
    entryPoints: Object.fromEntries(ENTRY_FIELDS.filter((field) => field in manifest).map((field) => [field, manifest[field]])),
    scripts: manifest.scripts ?? {},
    dependencies: Object.fromEntries(DEPENDENCY_SECTIONS.filter((section) => manifest[section]).map((section) => [section,
      Object.fromEntries(Object.entries(manifest[section]).map(([name, spec]) => [name, {
        spec,
        // Alias identity needs the package-spec resolver in the later dependency contract.
        targetId: typeof spec === 'string' && !spec.startsWith('npm:') && names.has(name) ? `PKG:${name}` : null,
      }])),
    ])),
    implementation: '未评估',
  };
}

export function buildSourceInventory({ sourceDir, revision = SDK54_EXPO_COMMIT, prefetch = false }) {
  const { tree, entries } = readTree(sourceDir, revision);
  const manifestEntries = entries.filter((entry) => entry.type === 'blob' &&
    (entry.path === 'package.json' || entry.path.endsWith('/package.json')));
  if (prefetch) prefetchManifests(sourceDir, manifestEntries);
  const rootEntry = manifestEntries.find((entry) => entry.path === 'package.json');
  if (!rootEntry) throw new Error('Missing source manifest: package.json');
  if (rootEntry.mode === '120000') throw new Error('Unsupported manifest symlink: package.json');
  const rootBlobs = readBlobs(sourceDir, [rootEntry]);
  const rootManifest = readManifest(rootBlobs, 'package.json');
  const patterns = workspacePatterns(rootManifest);
  const selected = manifestEntries.filter((entry) => entry.path !== 'package.json' &&
    (isWorkspace(path.posix.dirname(entry.path), patterns) || /^templates\/[^/]+\/package.json$/.test(entry.path)));
  for (const entry of selected) {
    if (entry.mode === '120000') throw new Error(`Unsupported manifest symlink: ${entry.path}`);
  }
  const blobs = readBlobs(sourceDir, selected);
  const manifests = new Map(selected.map((entry) => [entry.path, readManifest(blobs, entry.path)]));
  const workspaceEntries = selected.filter((entry) => isWorkspace(path.posix.dirname(entry.path), patterns));
  const names = new Set();
  for (const entry of workspaceEntries) {
    const name = manifests.get(entry.path).name;
    if (names.has(name)) throw new Error(`Duplicate workspace package ${name} at ${entry.path}`);
    names.add(name);
  }
  const describe = (entry, namespace) => describeManifest(entry, manifests.get(entry.path), blobs, entries, namespace, names);
  const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  const packages = workspaceEntries.map((entry) => describe(entry, 'PKG')).sort(byId);
  const templates = selected.filter((entry) => /^templates\/[^/]+\/package.json$/.test(entry.path))
    .map((entry) => describe(entry, 'TEMPLATE')).sort(byId);
  if (new Set(templates.map(({ id }) => id)).size !== templates.length) throw new Error('Duplicate template ID');
  return canonical({
    schemaVersion: 1,
    source: { repository: REPOSITORY, revision, tree, files: entries.length,
      filesHash: hash(serializeInventory(entries)), rootManifestBlob: rootEntry.oid,
      rootManifestSha256: hash(rootBlobs.get('package.json')) },
    workspacePatterns: patterns, packages, templates,
    completeness: { packageIndex: true, publicSurface: false, stageClosable: false },
  });
}

export function validateSourceInventory(inventory, options) {
  const expected = buildSourceInventory(options);
  const failures = [];
  if (!inventory || typeof inventory !== 'object' || Array.isArray(inventory)) {
    return { valid: false, failures: ['Inventory must be an object'] };
  }
  for (const field of ['packages', 'templates']) {
    const actualEntries = inventory[field];
    if (!Array.isArray(actualEntries)) {
      failures.push(`${field}: expected an array`);
      continue;
    }
    const actual = new Map();
    for (const entry of actualEntries) {
      if (!entry || typeof entry.id !== 'string') {
        failures.push(`${field}: entry missing ID`);
        continue;
      }
      if (actual.has(entry.id)) failures.push(`${field}: duplicate ID ${entry.id}`);
      actual.set(entry.id, entry);
    }
    for (const entry of expected[field]) {
      const found = actual.get(entry.id);
      if (!found) failures.push(`${field}: missing ${entry.id} from ${entry.sourcePath}`);
      else if (serializeInventory(found) !== serializeInventory(entry)) failures.push(`${field}: changed ${entry.id} from ${entry.sourcePath}`);
      actual.delete(entry.id);
    }
    for (const [id] of actual) failures.push(`${field}: extra ${id}`);
  }
  const metadata = (value) => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'packages' && key !== 'templates'));
  if (serializeInventory(metadata(inventory)) !== serializeInventory(metadata(expected))) failures.push('Source/schema/completeness metadata differs from fixed source');
  return { valid: failures.length === 0, failures };
}

function main(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (argument === '--prefetch') options.prefetch = true;
    else if (['--source', '--output', '--check'].includes(argument) && argv[i + 1] && !argv[i + 1].startsWith('--')) {
      if (options[argument.slice(2)]) throw new Error(`Duplicate argument ${argument}`);
      options[argument.slice(2)] = argv[++i];
    } else throw new Error(`Unknown or incomplete argument: ${argument}`);
  }
  if (!options.source || Boolean(options.output) === Boolean(options.check)) {
    throw new Error('Usage: source-inventory.mjs --source <git-dir> (--output <json> | --check <json>) [--prefetch]');
  }
  const buildOptions = { sourceDir: path.resolve(options.source), prefetch: options.prefetch === true };
  if (options.check) {
    const inventory = JSON.parse(fs.readFileSync(options.check, 'utf8'));
    const result = validateSourceInventory(inventory, buildOptions);
    console.log(serializeInventory(result).trimEnd());
    if (!result.valid) process.exitCode = 1;
  } else {
    const inventory = buildSourceInventory(buildOptions);
    const content = serializeInventory(inventory);
    fs.mkdirSync(path.dirname(path.resolve(options.output)), { recursive: true });
    fs.writeFileSync(options.output, content);
    console.log(serializeInventory({ revision: inventory.source.revision, tree: inventory.source.tree,
      packages: inventory.packages.length, templates: inventory.templates.length,
      sha256: hash(content), completeness: inventory.completeness }).trimEnd());
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
