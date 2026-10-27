import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { SDK54_EXPO_COMMIT } from './catalog.mjs';
import { readSourceTree, readSourceBlobs } from './source-inventory.mjs';
import { readPublicSurface } from './m0-public-surface.mjs';
import { buildCapabilityMap, validateCapabilityMap, readCapabilityMap, writeCapabilityMap, summarizeCapabilityMap } from './m0-capability-map.mjs';

const fixedTree = '5457e824b21d968e55c8f533cdf1751860160a92';
const expectedHashes = {
  surface: '76e245276c7fbbfd4b7607c033f5406475b35243196d947a1b9f47ba286b7d17',
  seeds: '0d0a160711152a0fd6bcc8db817805c48e28924e014b99cd10967ec90d2aede5',
  pluginContracts: '257f048d28570c06d47b80214552a8eeecc7337d5e2ab5d2d714a62336a8e97c',
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const defaults = { readPublicSurface, readSourceTree, readSourceBlobs, buildCapabilityMap, validateCapabilityMap, readCapabilityMap, writeCapabilityMap, summarizeCapabilityMap, expectedHashes };
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const safeRelative = file => typeof file === 'string' && file.length > 0 && !path.posix.isAbsolute(file) && !file.includes('\\') && !file.includes('\0') && !file.split('/').some(part => ['', '.', '..'].includes(part));
function assertSource(source, label) {
  if (source?.revision !== SDK54_EXPO_COMMIT || source.tree !== fixedTree) throw new Error(`${label} fixed source identity/tree mismatch`);
}

export async function loadCapabilityMapInputs({ surfaceFile, seedFile, pluginContractsFile = null, sharedReviewFile = null, sourceDir = '/tmp/sdk54-expo-source' }, readers = {}) {
  const io = { ...defaults, ...readers }, inputEvidence = [];
  const checked = (file, kind, expected = null) => {
    const bytes = fs.readFileSync(file), digest = sha(bytes);
    if (expected !== null && digest !== expected) throw new Error(`${kind} input hash mismatch: ${file}`);
    inputEvidence.push({ kind, path: path.relative(process.cwd(), path.resolve(file)), sha256: digest });
  };
  checked(surfaceFile, 'surface', io.expectedHashes.surface);
  checked(seedFile, 'seeds', io.expectedHashes.seeds);
  const surface = io.readPublicSurface(surfaceFile), seedFacts = read(seedFile);
  assertSource(surface.source, 'Surface'); assertSource(seedFacts.source, 'Seeds');
  let pluginContracts = null, sharedReview = null;
  if (pluginContractsFile) {
    checked(pluginContractsFile, 'plugin-contracts', io.expectedHashes.pluginContracts);
    pluginContracts = read(pluginContractsFile); assertSource(pluginContracts.source, 'Plugin contracts');
  }
  if (sharedReviewFile) {
    checked(sharedReviewFile, 'shared-use-review');
    sharedReview = read(sharedReviewFile); assertSource(sharedReview.source, 'Shared review');
    const verified = new Map((surface.sourceEvidence?.files ?? []).map(row => [row.path, row.sha256]));
    for (const receipt of sharedReview.inputs ?? []) {
      if (!safeRelative(receipt.path)) throw new Error(`Unsafe shared evidence path: ${receipt.path}`);
      if (!/^[a-f0-9]{64}$/.test(receipt.sha256 ?? '')) throw new Error(`Shared evidence requires a SHA256 hash: ${receipt.path}`);
      checked(receipt.path, 'shared-evidence', receipt.sha256);
      if (verified.has(receipt.path) && verified.get(receipt.path) !== receipt.sha256) throw new Error(`Conflicting shared source reference: ${receipt.path}`);
      verified.set(receipt.path, receipt.sha256);
    }
    const fixed = sharedReview.fixedSourceInputs ?? [];
    if (fixed.length) {
      const tree = io.readSourceTree(sourceDir, SDK54_EXPO_COMMIT);
      if (tree.tree !== fixedTree) throw new Error('Shared fixed source tree mismatch');
      const byPath = new Map(tree.entries.map(row => [row.path, row])), seen = new Set();
      for (const row of fixed) {
        const entry = byPath.get(row.path);
        if (!safeRelative(row.path) || seen.has(row.path) || entry?.type !== 'blob' || entry.mode === '120000' || entry.oid !== row.blob) throw new Error(`Shared source blob mismatch: ${row.path}`);
        seen.add(row.path);
      }
      for (let offset = 0; offset < fixed.length; offset += 100) {
        const batch = fixed.slice(offset, offset + 100), blobs = io.readSourceBlobs(sourceDir, batch.map(row => byPath.get(row.path)));
        for (const row of batch) {
          if (!blobs.has(row.path) || sha(blobs.get(row.path)) !== row.sha256) throw new Error(`Shared source hash mismatch: ${row.path}`);
          if (verified.has(row.path) && verified.get(row.path) !== row.sha256) throw new Error(`Conflicting shared source reference: ${row.path}`);
          verified.set(row.path, row.sha256);
        }
      }
    }
    const verifyReferences = value => {
      if (value === null || typeof value !== 'object') return;
      if (Object.hasOwn(value, 'sourceRefs')) {
        if (!Array.isArray(value.sourceRefs) || !value.sourceRefs.length) throw new Error('Unverified shared source references');
        for (const ref of value.sourceRefs) if (!safeRelative(ref.path) || !/^[a-f0-9]{64}$/.test(ref.sha256 ?? '') || verified.get(ref.path) !== ref.sha256) throw new Error(`Unverified shared source reference: ${ref.path}`);
      }
      for (const child of Object.values(value)) verifyReferences(child);
    };
    for (const pkg of sharedReview.packages ?? []) for (const owner of [pkg, ...(pkg.entryDecisions ?? [])]) if (!owner.sourceRefs?.length) throw new Error(`Unverified shared source references: ${owner.entryId ?? pkg.packageId}`);
    verifyReferences(sharedReview);
  }
  return { surface, seedFacts, pluginContracts, sharedReview, inputEvidence };
}

export async function buildCapabilityMapFromSource(options, readers = {}) {
  const io = { ...defaults, ...readers }, loaded = await loadCapabilityMapInputs(options, readers);
  const result = io.buildCapabilityMap(loaded);
  result.metadata ??= {};
  result.metadata.inputEvidence = loaded.inputEvidence;
  return result;
}

export function parseCapabilityMapArgs(args) {
  const names = new Set(['--source', '--surface', '--seeds', '--plugin-contracts', '--shared-review', '--output', '--check']);
  const result = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index], value = args[index + 1];
    if (!names.has(flag)) throw new Error(`Unknown capability map argument: ${flag}`);
    if (Object.hasOwn(result, flag)) throw new Error(`Duplicate capability map argument: ${flag}`);
    if (!value || value.startsWith('--')) throw new Error(`Usage: missing value for ${flag}`);
    result[flag] = value;
  }
  if (!result['--surface'] || !result['--seeds'] || ['--output', '--check'].filter(flag => result[flag]).length !== 1) throw new Error('Usage: --surface <index> --seeds <facts> (--output <index> | --check <index>) [--plugin-contracts <json>] [--shared-review <json>] [--source <git-dir>]');
  return result;
}

export async function runCapabilityMapCli(args, readers = {}) {
  const flags = parseCapabilityMapArgs(args), io = { ...defaults, ...readers };
  const inputFiles = ['--surface', '--seeds', '--plugin-contracts', '--shared-review'].map(flag => flags[flag]).filter(Boolean).map(file => path.resolve(file));
  const realTarget = file => {
    try { return fs.realpathSync(file); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return path.join(realTarget(path.dirname(file)), path.basename(file));
    }
  };
  const protectInputs = files => {
    if (!flags['--output']) return;
    const output = realTarget(path.resolve(flags['--output']));
    const outputStat = fs.existsSync(output) ? fs.statSync(output) : null;
    if (files.some(file => {
      const input = realTarget(path.resolve(file));
      const inputStat = outputStat && fs.existsSync(input) ? fs.statSync(input) : null;
      return input === output || output.startsWith(realTarget(input + '.parts') + path.sep) ||
        (inputStat && outputStat.dev === inputStat.dev && outputStat.ino === inputStat.ino);
    })) throw new Error('Cannot overwrite a capability map input');
  };
  protectInputs(inputFiles);
  const expected = await buildCapabilityMapFromSource({ surfaceFile: flags['--surface'], seedFile: flags['--seeds'], pluginContractsFile: flags['--plugin-contracts'], sharedReviewFile: flags['--shared-review'], sourceDir: flags['--source'] }, readers);
  protectInputs(expected.metadata.inputEvidence.map(row => row.path));
  if (flags['--check']) {
    const validation = io.validateCapabilityMap(io.readCapabilityMap(flags['--check']), expected);
    if (!validation.valid) throw new Error(`Capability map validation failed:\n${validation.failures.join('\n')}`);
    return { validation };
  }
  io.writeCapabilityMap(flags['--output'], expected);
  return { output: flags['--output'], summary: io.summarizeCapabilityMap(expected) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await runCapabilityMapCli(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
