import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { SDK54_EXPO_COMMIT } from './catalog.mjs';
import { readSourceTree, readSourceBlobs } from './source-inventory.mjs';
import { buildSourceCensus, validateSourceCensus, serializeSourceCensus } from './m0-source-census.mjs';

const fixedTree = '5457e824b21d968e55c8f533cdf1751860160a92';
const expectedHashes = { surface: '76e245276c7fbbfd4b7607c033f5406475b35243196d947a1b9f47ba286b7d17', capabilityMap: '69b4d971e35f0551c02f7910f6d33b13c8e6e9bbd138fde634b530dcb1fadd0d' };
const expectedUseIds = [
  'SHARED-UNRESOLVED:PKG:@expo/home:non-ts-and-shared-imports', 'SHARED-UNRESOLVED:PKG:eas-expo-go:app-install-lifecycle',
  'SHARED-UNRESOLVED:PKG:expo-dev-client-components:remaining-reexports', 'SHARED-UNRESOLVED:PKG:expo-dev-launcher:implicit-and-native',
  'SHARED-UNRESOLVED:PKG:expo-dev-launcher:built-projection', 'SHARED-UNRESOLVED:PKG:expo-dev-menu:native-and-built-targets',
  'SHARED-UNRESOLVED:PKG:expo-dev-menu-interface:ios-and-native-coverage', 'SHARED-UNRESOLVED:PKG:expo-eas-client:other-platform-and-consumers',
  'SHARED-UNRESOLVED:PKG:expo-updates-interface:ios-and-callback-lifecycle',
];
const defaults = { readSourceTree, readSourceBlobs, expectedHashes, expectedUseIds, buildSourceCensus, validateSourceCensus, serializeSourceCensus };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const safe = file => typeof file === 'string' && file.length > 0 && !path.posix.isAbsolute(file) && !file.includes('\\') && !file.includes('\0') && !file.split('/').some(part => ['', '.', '..'].includes(part));
const validHash = value => /^[a-f0-9]{64}$/.test(value ?? '');
const assertSource = (source, label) => { if (source?.revision !== SDK54_EXPO_COMMIT || source.tree !== fixedTree) throw new Error(`${label} fixed source identity/tree mismatch`); };

export async function loadSourceCensusInputs({ surfaceFile, capabilityMapFile, sharedFollowupFile = null, sourceDir = '/tmp/sdk54-expo-source' }, readers = {}) {
  const io = { ...defaults, ...readers }, inputEvidence = [];
  const checked = (file, kind, expected = null) => {
    const bytes = fs.readFileSync(file), sha256 = hash(bytes);
    if (!validHash(expected)) throw new Error(`${kind} requires an explicit hash: ${file}`);
    if (sha256 !== expected) throw new Error(`${kind} input hash mismatch: ${file}`);
    inputEvidence.push({ kind, path: path.relative(process.cwd(), path.resolve(file)), sha256 });
    return bytes;
  };
  const surface = JSON.parse(checked(surfaceFile, 'surface', io.expectedHashes.surface));
  const capabilityMap = JSON.parse(checked(capabilityMapFile, 'capability-map', io.expectedHashes.capabilityMap));
  assertSource(surface.metadata?.source, 'Surface'); assertSource(capabilityMap.metadata?.source, 'Capability map');
  function table(file, index, format, name) {
    if (index.schemaVersion !== 1 || index.format !== format) throw new Error(`Invalid ${name} source index`);
    const descriptor = index.tables?.[name], rows = [], seen = new Set(), shardPaths = new Set();
    if (!descriptor || !Number.isSafeInteger(descriptor.count) || descriptor.count < 0 || !Array.isArray(descriptor.shards)) throw new Error(`Invalid source table: ${name}`);
    if (!fs.lstatSync(file + '.parts').isDirectory()) throw new Error(`Invalid source shard directory: ${name}`);
    for (const shard of descriptor.shards) {
      if (!/^[a-f0-9]{64}\.json\.gz$/.test(shard.path) || shard.path !== shard.sha256 + '.json.gz' || shardPaths.has(shard.path)) throw new Error(`Invalid source shard path: ${name}`);
      shardPaths.add(shard.path); const shardFile = path.join(file + '.parts', shard.path);
      if (!fs.lstatSync(shardFile).isFile()) throw new Error(`Invalid source shard file: ${shardFile}`);
      const selected = JSON.parse(gunzipSync(checked(shardFile, `${name}-shard`, shard.sha256)));
      if (!Array.isArray(selected) || !selected.length || selected.length !== shard.count || selected[0]?.id !== shard.firstId || selected.at(-1)?.id !== shard.lastId) throw new Error(`Source shard count/order mismatch: ${name}`);
      for (const row of selected) { if (!row.id || seen.has(row.id)) throw new Error(`Duplicate source table ID: ${name}/${row.id}`); seen.add(row.id); rows.push(row); }
    }
    if (rows.length !== descriptor.count) throw new Error(`Source table count mismatch: ${name}`);
    return rows;
  }
  const publicPackages = table(surfaceFile, surface, 'sdk54-public-surface-shards-v1', 'packages');
  const inputRows = table(surfaceFile, surface, 'sdk54-public-surface-shards-v1', 'inputs');
  const capabilities = table(capabilityMapFile, capabilityMap, 'sdk54-capability-map-shards-v1', 'capabilities');
  const tree = io.readSourceTree(sourceDir, SDK54_EXPO_COMMIT);
  if (tree.tree !== fixedTree) throw new Error('Source tree mismatch');
  const byPath = new Map(tree.entries.map(row => [row.path, row]));
  const proof = new Map(), verified = new Map(), bytesByPath = new Map();
  const requireBlob = row => {
    const entry = byPath.get(row.path);
    if (!safe(row.path) || entry?.type !== 'blob' || entry.mode === '120000' || (row.blob && entry.oid !== row.blob)) throw new Error(`Fixed source blob mismatch: ${row.path}`);
    if (row.sha256 !== undefined && !validHash(row.sha256)) throw new Error(`Fixed source requires a hash: ${row.path}`);
    const before = proof.get(row.path);
    if (before?.sha256 && row.sha256 && before.sha256 !== row.sha256) throw new Error(`Conflicting fixed source hash: ${row.path}`);
    proof.set(row.path, { ...before, ...row, blob: entry.oid, sha256: row.sha256 ?? before?.sha256 });
  };
  const verifyProofs = () => {
    const pending = [...proof.values()].filter(row => !bytesByPath.has(row.path));
    for (let at = 0; at < pending.length; at += 100) {
      const batch = pending.slice(at, at + 100), blobs = io.readSourceBlobs(sourceDir, batch.map(row => byPath.get(row.path)));
      for (const row of batch) {
        const bytes = blobs.get(row.path);
        if (!Buffer.isBuffer(bytes)) throw new Error(`Missing fixed source blob: ${row.path}`);
        const actual = hash(bytes);
        if (row.sha256 && row.sha256 !== actual) throw new Error(`Fixed source content hash mismatch: ${row.path}`);
        bytesByPath.set(row.path, bytes); verified.set(row.path, actual); proof.set(row.path, { ...row, sha256: actual });
      }
    }
    for (const row of proof.values()) if (verified.get(row.path) !== row.sha256) throw new Error(`Conflicting fixed source hash: ${row.path}`);
  };
  requireBlob({ path: 'package.json' }); verifyProofs();
  const root = JSON.parse(bytesByPath.get('package.json').toString('utf8'));
  const patterns = Array.isArray(root.workspaces) ? root.workspaces : root.workspaces?.packages;
  if (!Array.isArray(patterns) || !patterns.length || patterns.some(value => typeof value !== 'string' || !value)) throw new Error('Invalid workspace patterns');
  const negative = pattern => pattern.startsWith('!') && !pattern.startsWith('!(');
  const matches = directory => patterns.some(pattern => !negative(pattern) && path.posix.matchesGlob(directory, pattern)) && !patterns.some(pattern => negative(pattern) && path.posix.matchesGlob(directory, pattern.slice(1)));
  const manifestEntries = tree.entries.filter(row => row.path.endsWith('/package.json') && (matches(path.posix.dirname(row.path)) || /^templates\/[^/]+\/package\.json$/.test(row.path)));
  for (const row of manifestEntries) requireBlob({ path: row.path, blob: row.oid });
  const evidenceRows = surface.metadata.sourceEvidence?.files ?? inputRows;
  const provenance = new Map(evidenceRows.map(row => [row.path, row]));
  const coveredInputs = [];
  for (const row of inputRows) {
    const origin = provenance.get(row.path);
    if (!origin || origin.sha256 !== row.sha256) throw new Error(`Input source provenance mismatch: ${row.path}`);
    if (origin.origin !== 'fixed-git-blob') continue;
    if (!/^[a-f0-9]{40}$/.test(origin.blob ?? '')) throw new Error(`Input source blob identity missing: ${row.path}`);
    const input = { ...row, ...origin, id: row.id }; requireBlob(input); coveredInputs.push(input);
  }
  let sharedFollowup = null;
  if (sharedFollowupFile) {
    const bytes = fs.readFileSync(sharedFollowupFile);
    checked(sharedFollowupFile, 'shared-followup', hash(bytes)); sharedFollowup = JSON.parse(bytes);
    assertSource(sharedFollowup.source, 'Shared followup');
    const actualIds = sharedFollowup.uses?.map(row => row.id).sort();
    if (JSON.stringify(actualIds) !== JSON.stringify([...io.expectedUseIds].sort())) throw new Error('Shared use identity/ID set mismatch');
    const localReferences = new Map();
    for (const row of sharedFollowup.inputs ?? []) {
      if (!safe(row.path)) throw new Error(`Unsafe followup evidence path: ${row.path}`);
      checked(row.path, 'followup-evidence', row.sha256);
      if (byPath.has(row.path)) requireBlob(row);
      if (localReferences.has(row.path) && localReferences.get(row.path) !== row.sha256) throw new Error(`Conflicting local source hash: ${row.path}`);
      localReferences.set(row.path, row.sha256);
    }
    for (const row of sharedFollowup.fixedSourceInputs ?? []) {
      if (!validHash(row.sha256) || !/^[a-f0-9]{40}$/.test(row.blob ?? '')) throw new Error(`Followup fixed source requires blob/hash: ${row.path}`);
      requireBlob(row);
    }
    const verifyReferences = value => {
      if (!value || typeof value !== 'object') return;
      if (Object.hasOwn(value, 'sourceRefs')) {
        if (!Array.isArray(value.sourceRefs) || !value.sourceRefs.length) throw new Error('Unverified followup source reference');
        for (const ref of value.sourceRefs) {
          if (!safe(ref.path) || !validHash(ref.sha256)) throw new Error(`Unverified followup source reference: ${ref.path}`);
          if (byPath.has(ref.path)) requireBlob(ref);
          else if (localReferences.get(ref.path) !== ref.sha256) throw new Error(`Unverified followup source reference: ${ref.path}`);
        }
      }
      for (const nested of Object.values(value)) verifyReferences(nested);
    };
    for (const use of sharedFollowup.uses) if (!use.sourceRefs?.length) throw new Error(`Unverified followup source reference: ${use.id}`);
    verifyReferences(sharedFollowup);
  }
  for (const row of tree.entries) if (row.type === 'blob' && ['100644', '100755'].includes(row.mode)) requireBlob({ path: row.path, blob: row.oid });
  verifyProofs();
  const manifests = ['package.json', ...manifestEntries.map(row => row.path)].map(file => ({ path: file, blob: byPath.get(file).oid, sha256: verified.get(file), value: JSON.parse(bytesByPath.get(file).toString('utf8')) }));
  const knownPaths = new Set(coveredInputs.map(row => row.path));
  // Supplemental blobs are real reads, distinct from coverage by the original public analysis inputs.
  const supplementalReads = [...proof.values()].filter(row => !knownPaths.has(row.path) && !manifests.some(manifest => manifest.path === row.path));
  return { source: { revision: SDK54_EXPO_COMMIT, tree: fixedTree }, treeEntries: tree.entries, manifests, coveredInputs, publicPackages, capabilities, inputEvidence,
    sourceEvidence: [...proof.values()].map(row => ({ path: row.path, blob: row.blob, sha256: row.sha256, origin: 'fixed-git-blob' })), supplementalReads,
    sharedFollowup, inputSummary: { totalPublicInputs: inputRows.length, fixedGitInputs: coveredInputs.length, nonGitContextInputs: inputRows.length - coveredInputs.length } };
}

export async function buildSourceCensusFromSource(options, readers = {}) {
  const io = { ...defaults, ...readers }, loaded = await loadSourceCensusInputs(options, readers);
  const result = io.buildSourceCensus(loaded); result.metadata ??= {};
  Object.assign(result.metadata, { inputEvidence: loaded.inputEvidence, inputSummary: loaded.inputSummary, fixedSourceInputs: loaded.sourceEvidence,
    supplementalReads: loaded.supplementalReads, sharedFollowupUseIds: loaded.sharedFollowup?.uses.map(row => row.id).sort() ?? [] });
  return result;
}

export function parseSourceCensusArgs(args) {
  const allowed = new Set(['--source', '--surface', '--capability-map', '--shared-followup', '--output', '--check']), flags = {};
  for (let at = 0; at < args.length; at += 2) {
    const flag = args[at], value = args[at + 1];
    if (!allowed.has(flag)) throw new Error(`Unknown source census argument: ${flag}`);
    if (Object.hasOwn(flags, flag)) throw new Error(`Duplicate source census argument: ${flag}`);
    if (!value || value.startsWith('--')) throw new Error(`Usage: missing value for ${flag}`); flags[flag] = value;
  }
  if (!flags['--surface'] || !flags['--capability-map'] || ['--output', '--check'].filter(flag => flags[flag]).length !== 1) throw new Error('Usage: --surface <index> --capability-map <index> (--output <json>|--check <json>) [--shared-followup <json>] [--source <git-dir>]');
  return flags;
}
export async function runSourceCensusCli(args, readers = {}) {
  const flags = parseSourceCensusArgs(args), io = { ...defaults, ...readers };
  const realTarget = file => { try { return fs.realpathSync(file); } catch (error) { if (error.code !== 'ENOENT') throw error; return path.join(realTarget(path.dirname(file)), path.basename(file)); } };
  const protect = files => {
    if (!flags['--output']) return;
    const output = realTarget(path.resolve(flags['--output'])), outputStat = fs.existsSync(output) ? fs.statSync(output) : null;
    const sourceDir = realTarget(path.resolve(flags['--source'] ?? '/tmp/sdk54-expo-source'));
    if (output === sourceDir || output.startsWith(sourceDir + path.sep) || files.some(file => {
      const input = realTarget(path.resolve(file)), parts = realTarget(path.resolve(file) + '.parts');
      const inputStat = outputStat && fs.existsSync(input) ? fs.statSync(input) : null;
      return output === input || output === parts || output.startsWith(parts + path.sep) || (inputStat && inputStat.dev === outputStat.dev && inputStat.ino === outputStat.ino);
    })) throw new Error('Cannot overwrite a source census input');
  };
  protect(['--surface', '--capability-map', '--shared-followup'].map(flag => flags[flag]).filter(Boolean));
  const expected = await buildSourceCensusFromSource({ surfaceFile: flags['--surface'], capabilityMapFile: flags['--capability-map'], sharedFollowupFile: flags['--shared-followup'], sourceDir: flags['--source'] }, readers);
  protect(expected.metadata.inputEvidence.map(row => row.path));
  if (flags['--check']) {
    const validation = io.validateSourceCensus(JSON.parse(fs.readFileSync(flags['--check'])), expected);
    if (!validation.valid) throw new Error(`Source census validation failed:\n${validation.failures.join('\n')}`);
    return { validation };
  }
  fs.mkdirSync(path.dirname(flags['--output']), { recursive: true }); fs.writeFileSync(flags['--output'], io.serializeSourceCensus(expected));
  return { output: flags['--output'], counts: { owners: expected.owners.length, files: expected.files.length, categoryGaps: expected.categoryGaps.length }, inputSummary: expected.metadata.inputSummary };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await runSourceCensusCli(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
