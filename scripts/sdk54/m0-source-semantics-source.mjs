import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { readSourceTree, readSourceBlobs } from './source-inventory.mjs';
import { analyzeScriptSource, validateSourceSemantics } from './m0-source-semantics.mjs';

const revision = '5b42e3d21e0ac5e086752361ca8a5cb4de53bec1';
const fixedTree = '5457e824b21d968e55c8f533cdf1751860160a92';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => JSON.stringify(value, (_key, row) => row && typeof row === 'object' && !Array.isArray(row)
  ? Object.fromEntries(Object.entries(row).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : row);
const realTarget = file => {
  try { return fs.realpathSync(file); }
  catch (error) { if (error.code !== 'ENOENT') throw error; return path.join(realTarget(path.dirname(path.resolve(file))), path.basename(file)); }
};
const sameFile = (a, b) => fs.existsSync(a) && fs.existsSync(b) && fs.statSync(a).dev === fs.statSync(b).dev && fs.statSync(a).ino === fs.statSync(b).ino;
function protect({ outputFile, censusFile, sourceDir }) {
  const targets = [realTarget(path.resolve(outputFile)), realTarget(path.resolve(outputFile + '.parts'))];
  const sources = [sourceDir, censusFile, censusFile && censusFile + '.parts'].filter(Boolean).map(file => realTarget(path.resolve(file)));
  if (targets.some(target => sources.some(source => target === source || target.startsWith(source + path.sep) || sameFile(target, source)))) {
    throw new Error('Cannot overwrite source semantics input');
  }
}
function* sources(options, readers) {
  const { census, sourceDir = '/tmp/sdk54-expo-source' } = options;
  if (census?.source?.revision !== revision || census.source.tree !== fixedTree) throw new Error('Fixed census source identity mismatch');
  const tree = (readers.readSourceTree ?? readSourceTree)(sourceDir, revision);
  if (tree.tree !== fixedTree) throw new Error('Fixed source tree mismatch');
  const entries = new Map(tree.entries.map(row => [row.path, row])), seen = new Set();
  const selected = [];
  for (const row of census.files) {
    if (seen.has(row.path)) throw new Error(`Duplicate census path: ${row.path}`);
    seen.add(row.path);
    const entry = entries.get(row.path);
    if (!entry || entry.oid !== row.oid || entry.type !== row.type || entry.mode !== row.mode) throw new Error(`Census tree identity mismatch: ${row.path}`);
    if (row.type === 'blob' && ['100644', '100755'].includes(row.mode) && /\.(?:[cm]?[jt]sx?|js\.flow)$/.test(row.path)) selected.push(row);
  }
  if (seen.size !== entries.size) throw new Error('Census tree path set mismatch');
  selected.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  for (let offset = 0; offset < selected.length; offset += 50) {
    const batch = selected.slice(offset, offset + 50);
    const bytes = (readers.readSourceBlobs ?? readSourceBlobs)(sourceDir, batch.map(row => entries.get(row.path)));
    for (const row of batch) {
      const content = bytes.get(row.path);
      if (!Buffer.isBuffer(content)) throw new Error(`Missing source content: ${row.path}`);
      if (hash(content) !== row.sha256) throw new Error(`Source hash mismatch: ${row.path}`);
      const oid = createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
      if (oid !== row.oid) throw new Error(`Source Git blob hash mismatch: ${row.path}`);
      yield { row, artifact: analyzeScriptSource({ path: row.path, content: content.toString('utf8') }) };
    }
  }
}
function createIndex(census) {
  return { schemaVersion: 1, format: 'sdk54-source-semantics-shards-v1', source: census.source, censusSha256: hash(canonical(census)),
    files: [], summary: { scriptFiles: 0, parsedFiles: 0, blockedFiles: 0, facts: 0, boundaries: 0 } };
}
function append(index, row, artifact, sha256) {
  index.files.push({ path: row.path, sourceSha256: row.sha256, oid: row.oid, shard: sha256 + '.json.gz', sha256,
    factCount: artifact.facts.length, boundaryCount: artifact.boundaries.length, coverage: artifact.coverage });
  index.summary.scriptFiles++;
  index.summary[artifact.coverage === 'SOURCE_ENUMERATION_BLOCKED' ? 'blockedFiles' : 'parsedFiles']++;
  index.summary.facts += artifact.facts.length; index.summary.boundaries += artifact.boundaries.length;
}
export function writeSourceSemantics(options, readers = {}) {
  protect(options);
  const index = createIndex(options.census), parts = options.outputFile + '.parts';
  fs.mkdirSync(parts, { recursive: true });
  for (const { row, artifact } of sources(options, readers)) {
    const bytes = gzipSync(JSON.stringify(artifact)), sha256 = hash(bytes);
    const target = path.join(parts, sha256 + '.json.gz');
    if (fs.existsSync(target) && (!fs.lstatSync(target).isFile() || hash(fs.readFileSync(target)) !== sha256)) throw new Error(`Unsafe source shard: ${target}`);
    if (!fs.existsSync(target)) fs.writeFileSync(target, bytes, { flag: 'wx' });
    append(index, row, artifact, sha256);
  }
  fs.writeFileSync(options.outputFile, JSON.stringify(index, null, 2) + '\n');
  return index;
}
export function checkSourceSemantics(options, readers = {}) {
  const actual = JSON.parse(fs.readFileSync(options.indexFile)), expected = createIndex(options.census), failures = [];
  const descriptors = new Map();
  for (const row of actual.files ?? []) {
    if (descriptors.has(row.path)) failures.push(`Duplicate source descriptor: ${row.path}`);
    descriptors.set(row.path, row);
  }
  for (const { row, artifact } of sources(options, readers)) {
    const bytes = gzipSync(JSON.stringify(artifact)); append(expected, row, artifact, hash(bytes));
    const descriptor = descriptors.get(row.path); descriptors.delete(row.path);
    if (!descriptor) { failures.push(`Missing semantic source: ${row.path}`); continue; }
    try {
      if (!/^[a-f0-9]{64}\.json\.gz$/.test(descriptor.shard) || descriptor.shard !== descriptor.sha256 + '.json.gz') throw new Error('Invalid shard path/hash');
      const file = path.join(options.indexFile + '.parts', descriptor.shard);
      if (!fs.lstatSync(file).isFile()) throw new Error('Invalid shard file');
      const stored = fs.readFileSync(file);
      if (hash(stored) !== descriptor.sha256) throw new Error('Shard content hash mismatch');
      const result = validateSourceSemantics(JSON.parse(gunzipSync(stored)), artifact);
      failures.push(...result.failures);
    } catch (error) { failures.push(`${row.path}: ${error.message}`); }
  }
  for (const file of descriptors.keys()) failures.push(`Unexpected semantic source: ${file}`);
  if (canonical(actual) !== canonical(expected)) failures.push('Source semantics index metadata/descriptor mismatch');
  return { valid: failures.length === 0, failures, summary: expected.summary };
}
export function runSourceSemanticsCli(args) {
  const flags = {}, allowed = new Set(['--census', '--source', '--output', '--check']);
  for (let at = 0; at < args.length; at += 2) {
    const key = args[at], value = args[at + 1];
    if (!allowed.has(key) || Object.hasOwn(flags, key) || !value || value.startsWith('--')) throw new Error(`Invalid source semantics argument: ${key}`);
    flags[key] = value;
  }
  if (!flags['--census'] || Boolean(flags['--output']) === Boolean(flags['--check'])) throw new Error('Usage: --census <json> (--output <json>|--check <json>) [--source <git-dir>]');
  const options = { census: JSON.parse(fs.readFileSync(flags['--census'])), censusFile: flags['--census'], sourceDir: flags['--source'] ?? '/tmp/sdk54-expo-source' };
  if (flags['--output']) { const result = writeSourceSemantics({ ...options, outputFile: flags['--output'] }); return { output: flags['--output'], summary: result.summary }; }
  const result = checkSourceSemantics({ ...options, indexFile: flags['--check'] });
  if (!result.valid) throw new Error(result.failures.join('\n'));
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(runSourceSemanticsCli(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
