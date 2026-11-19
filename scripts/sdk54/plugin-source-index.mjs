import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

import { SDK54_EXPO_COMMIT } from './catalog.mjs';
import { pluginSourceFacts } from './plugin-source-facts.mjs';
import { buildSourceInventory, prefetchSourceBlobs, readSourceBlobs, readSourceTree, serializeInventory } from './source-inventory.mjs';

const sha256 = (content) => createHash('sha256').update(content).digest('hex');
const codeFile = (file) => /\.(?:[cm]?[jt]sx?|json)$/.test(file);
const excluded = (file) => /\/(?:__tests__|__mocks__|fixtures|node_modules|build)\//.test(file);
const appPlugin = /^app\.plugin\.(?:js|cjs|mjs|ts)$/;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function resolveRelative(request, from, entries) {
  const candidate = path.posix.normalize(path.posix.join(path.posix.dirname(from), request));
  if (candidate.startsWith('../') || candidate.startsWith('/')) throw new Error(`Relative reference escapes source: ${from} -> ${request}`);
  const lookup = (base) => {
    if (entries.has(base)) return [base];
    const stem = /\.[cm]?jsx?$/.test(base) ? base.replace(/\.[cm]?jsx?$/, '') : base;
    const files = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json'].map((extension) => stem + extension).filter((file) => entries.has(file));
    if (files.length) return [...new Set(files)];
    if (entries.has(`${stem}.d.ts`)) return [`${stem}.d.ts`];
    return ['index.ts', 'index.tsx', 'index.js', 'index.json'].map((name) => `${base}/${name}`).filter((file) => entries.has(file));
  };
  const direct = lookup(candidate);
  const projection = candidate.replace('/plugin/build/', '/plugin/src/').replace('/build/', '/src/');
  const projected = projection === candidate ? [] : lookup(projection);
  const matches = projected.length ? projected : direct;
  if (matches.length > 1) throw new Error(`Ambiguous source projection at ${from} -> ${request}: ${matches.join(', ')}`);
  if (!matches.length) throw new Error(`Missing relative source at ${from} -> ${request}`);
  return { kind: 'relative', path: matches[0], targetId: `MODULE:${matches[0]}`,
    method: projected.length ? 'build-to-source' : matches[0] === candidate ? 'exact' : 'source-extension-or-index',
    ...(projected.length ? { artifactPaths: direct } : {}) };
}

function manifestPluginExports(value, pointer = '#/exports', pluginPath = false) {
  if (typeof value === 'string') return pluginPath || /(?:^|\/)plugin(?:\/|\.|$)/.test(value) ? [{ pointer, request: value }] : [];
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, entry]) => manifestPluginExports(entry,
    `${pointer}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`, pluginPath || /(?:^|\/)plugin(?:\/|\.|$)/.test(key)));
}

function moduleCategory(file, owner) {
  if (owner?.name === '@expo/config-plugins') return 'config-plugins';
  if (owner?.name === '@expo/prebuild-config') {
    if (file.includes('/plugins/sdk52/')) return 'prebuild-sdk52';
    if (file.includes('/plugins/unversioned/')) return 'prebuild-unversioned';
    return 'prebuild-config';
  }
  return 'package-plugin-or-relative-source';
}

export function indexPluginSources({ packageInventory, entries, loadFiles }) {
  const tree = new Map(entries.filter((entry) => entry.type === 'blob').map((entry) => [entry.path, entry]));
  const queue = new Set();
  const packageRoots = packageInventory.packages.map((pkg) => ({ ...pkg, directory: path.posix.dirname(pkg.sourcePath) }));
  const longestRoots = [...packageRoots].sort((a, b) => b.directory.length - a.directory.length);
  const owners = new Map(entries.map((entry) => [entry.path, longestRoots.find((pkg) => entry.path.startsWith(`${pkg.directory}/`))]));
  const ownedEntries = new Map(packageRoots.map((pkg) => [pkg.id, []]));
  for (const entry of entries) if (entry.type === 'blob' && owners.get(entry.path)) ownedEntries.get(owners.get(entry.path).id).push(entry);
  const ownerOf = (file) => owners.get(file);
  const packages = packageRoots.map((pkg) => {
    const own = ownedEntries.get(pkg.id);
    const wrappers = own.filter((entry) => appPlugin.test(entry.path.slice(pkg.directory.length + 1)));
    const pluginFiles = own.filter((entry) => !excluded(entry.path) && codeFile(entry.path) && (
      entry.path.startsWith(`${pkg.directory}/plugin/`) ||
      (['@expo/config-plugins', '@expo/prebuild-config'].includes(pkg.name) && entry.path.startsWith(`${pkg.directory}/src/`))));
    for (const entry of [...wrappers, ...pluginFiles]) queue.add(entry.path);
    const exports = manifestPluginExports(pkg.entryPoints?.exports).map((entry) => {
      if (!entry.request.startsWith('./') || entry.request.includes('*')) throw new Error(`Unsupported plugin export at ${pkg.sourcePath}${entry.pointer}: ${entry.request}`);
      const resolution = resolveRelative(entry.request, pkg.sourcePath, tree);
      queue.add(resolution.path);
      return { ...entry, source: { path: pkg.sourcePath, pointer: entry.pointer }, resolution };
    });
    return { id: `PACKAGE-PLUGINS:${pkg.name}`, packageId: pkg.id, name: pkg.name, version: pkg.version,
      source: { path: pkg.sourcePath }, appPluginPaths: wrappers.map((entry) => entry.path).sort(), manifestPluginExports: exports,
      scope: pkg.name === 'expo-updates' ? { state: '暂缓', scopeId: 'DEFER-UPDATES' } :
        pkg.name === 'expo-dev-client' ? { state: '暂缓', scopeId: 'DEFER-DEV-CLIENT' } : { state: '未评估', scopeId: null },
      implementation: '未评估', runtimeAcceptance: 'NOT_RUN' };
  }).sort((a, b) => compare(a.id, b.id));
  const modules = new Map();
  while ([...queue].some((file) => !modules.has(file))) {
    const pending = [...queue].filter((file) => !modules.has(file)).sort().map((file) => {
      const entry = tree.get(file);
      if (!entry) throw new Error(`Missing source tree entry ${file}`);
      if (entry.mode === '120000') throw new Error(`Unsupported source symlink: ${file}`);
      return entry;
    });
    const loaded = loadFiles(pending);
    for (const entry of pending) {
      const buffer = loaded.get(entry.path);
      if (buffer === undefined) throw new Error(`Missing source content for ${entry.path}`);
      const content = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
      const actualBlob = createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
      if (actualBlob !== entry.oid) throw new Error(`Source blob integrity mismatch at ${entry.path}`);
      let facts;
      if (entry.path.endsWith('.json')) {
        if (/\/(?:tsconfig|jsconfig)(?:\.[^/]*)?\.json$/.test(entry.path)) {
          const result = ts.parseConfigFileTextToJson(entry.path, content.toString('utf8'));
          if (result.error) throw new Error(`Invalid TypeScript config ${entry.path}: ${ts.flattenDiagnosticMessageText(result.error.messageText, ' ')}`);
        } else {
          try { JSON.parse(content.toString('utf8')); } catch (error) { throw new Error(`Invalid JSON source ${entry.path}: ${error.message}`); }
        }
        facts = { references: [], exports: [], configPlugins: [], compositions: [], stringLists: [], providers: [] };
      } else if (codeFile(entry.path)) facts = pluginSourceFacts(content.toString('utf8'), entry.path);
      else facts = { references: [], exports: [], configPlugins: [], compositions: [], stringLists: [], providers: [] };
      for (const reference of facts.references) {
        reference.resolution = reference.request === null ? { kind: 'dynamic', status: 'UNRESOLVED' } : reference.request.startsWith('.')
          ? resolveRelative(reference.request, entry.path, tree) : { kind: 'bare', request: reference.request, status: 'NOT_RESOLVED' };
        if (reference.resolution.kind === 'relative') queue.add(reference.resolution.path);
      }
      const owner = ownerOf(entry.path);
      modules.set(entry.path, { id: `MODULE:${entry.path}`, packageId: owner?.id ?? null,
        category: moduleCategory(entry.path, owner), source: { path: entry.path, blob: entry.oid, sha256: sha256(content) },
        ...facts, implementation: '未评估', runtimeAcceptance: 'NOT_RUN' });
    }
  }
  return {
    schemaVersion: 1, compilerVersion: ts.version, packageInventorySha256: sha256(serializeInventory(packageInventory)),
    packages, modules: [...modules.values()].sort((a, b) => compare(a.id, b.id)),
    stageClosable: false, fullPluginOptionsComplete: false, fullSdkPublicSurfaceComplete: false,
    limitation: '固定 workspace 插件入口、配置包及静态相对源码关系；bare/dynamic 引用未完整解析，选项与运行行为未完成',
  };
}

export function buildPluginSourceIndex({ sourceDir, prefetch = false }) {
  const packageInventory = buildSourceInventory({ sourceDir, prefetch });
  const { tree, entries } = readSourceTree(sourceDir, SDK54_EXPO_COMMIT);
  const result = indexPluginSources({ packageInventory, entries, loadFiles: (requested) => {
    if (prefetch) prefetchSourceBlobs(sourceDir, requested);
    return readSourceBlobs(sourceDir, requested);
  } });
  return { ...result, sourceRevision: SDK54_EXPO_COMMIT, sourceTree: tree };
}

export function validatePluginSourceIndex(actual, expected) {
  const failures = [];
  const collect = (value, records, label) => {
    if (Array.isArray(value)) { for (const entry of value) collect(entry, records, label); return; }
    if (!value || typeof value !== 'object') return;
    if (Object.hasOwn(value, 'id')) {
      if (typeof value.id !== 'string' || records.has(value.id)) failures.push(`${label}: invalid/duplicate ID ${value.id}`);
      else records.set(value.id, value);
    }
    for (const entry of Object.values(value)) collect(entry, records, label);
  };
  const current = new Map();
  const source = new Map();
  collect(actual, current, 'inventory');
  collect(expected, source, 'source');
  for (const [id, record] of source) if (!current.has(id)) failures.push(`Missing ${id} at ${JSON.stringify(record.source ?? {})}`);
  if (serializeInventory(actual) !== serializeInventory(expected)) failures.push('Plugin entry/source/facts or completion metadata differs from fixed source');
  return { valid: failures.length === 0, failures };
}

function main(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (argument === '--prefetch' && !options.prefetch) options.prefetch = true;
    else if (['--source', '--output', '--check'].includes(argument) && argv[i + 1] && !argv[i + 1].startsWith('--') && !options[argument.slice(2)]) options[argument.slice(2)] = argv[++i];
    else throw new Error(`Unknown or incomplete argument ${argument}`);
  }
  if (!options.source || Boolean(options.output) === Boolean(options.check)) throw new Error('Usage: plugin-source-index.mjs --source <git-dir> (--output <json> | --check <json>) [--prefetch]');
  const expected = buildPluginSourceIndex({ sourceDir: path.resolve(options.source), prefetch: options.prefetch });
  if (options.check) {
    const result = validatePluginSourceIndex(JSON.parse(fs.readFileSync(options.check, 'utf8')), expected);
    console.log(serializeInventory(result).trimEnd());
    if (!result.valid) process.exitCode = 1;
  } else {
    const content = serializeInventory(expected);
    fs.mkdirSync(path.dirname(path.resolve(options.output)), { recursive: true });
    fs.writeFileSync(options.output, content);
    console.log(serializeInventory({ sourceRevision: expected.sourceRevision, workspaces: expected.packages.length,
      appPluginEntries: expected.packages.reduce((count, pkg) => count + pkg.appPluginPaths.length, 0),
      modules: expected.modules.length, sha256: sha256(content), stageClosable: false }).trimEnd());
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
