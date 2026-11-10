import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { readPublicSurface } from './m0-public-surface.mjs';
import { readSourceTree, readSourceBlobs } from './source-inventory.mjs';
import { buildFinalPluginContracts } from './m0-final-plugin-contracts.mjs';
import { buildPluginContracts, validatePluginContracts } from './m0-plugin-contracts.mjs';
import { collectM4Members, mergeM4Membership, buildM4Inventory, seedM4Decisions, applyM4Decisions,
  compareM4Sources, compareM4PublicSources, collectM4CurrentAdditions, isM4PublicSourcePath } from './m4-scope-inventory.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file));
const save = (file, value, check = false) => {
  const bytes = JSON.stringify(value, null, 2) + '\n';
  if (check) assert.equal(sha(fs.readFileSync(file)), sha(bytes), `Source replay differs: ${file}`);
  else fs.writeFileSync(file, bytes);
};
const receipt = file => ({ path: file, sha256: sha(fs.readFileSync(file)) });
const names = ['expo-asset', 'expo-font', 'expo-linking', 'expo-splash-screen', 'expo-status-bar',
  'expo-system-ui', 'expo-web-browser', 'expo-router', 'expo-modules-core'];
const uniqueIndex = (rows, label) => {
  const map = new Map(rows.map(row => [row.id, row]));
  assert.ok(rows.every(row => row.id) && map.size === rows.length, `Duplicate or missing ${label} identity`);
  return map;
};

// This proves graph reachability only. It does not reconstruct the historical
// capability map, finite declaration supplements, or final public closure.
export function memberReachability(surface, dispositions, candidates) {
  const types = uniqueIndex(surface.types, 'type'), members = uniqueIndex(surface.members, 'member');
  const exports = uniqueIndex(surface.exports, 'export');
  const decisions = uniqueIndex(dispositions.exports, 'export disposition');
  assert.equal(exports.size, decisions.size, 'Export disposition set differs from public surface');
  const edges = new Map(), witnesses = new Map(), queue = [];
  const edge = (from, to, id) => {
    assert.ok(types.has(from) && types.has(to), `Dangling type edge ${id}`);
    if (!edges.has(from)) edges.set(from, []);
    edges.get(from).push({ target: to, id });
  };
  for (const row of surface.typeEdges) edge(row.fromTypeId, row.toTypeId, row.id);
  for (const row of members.values()) {
    assert.ok(types.has(row.ownerTypeId), `Missing member owner ${row.id}`);
    for (const target of [row.typeId, row.returnTypeId, row.keyTypeId, ...(row.typeParameters ?? [])].filter(Boolean)) edge(row.ownerTypeId, target, row.id);
    for (const id of row.parameterIds ?? []) assert.ok(members.has(id), `Missing parameter ${id}`);
  }
  for (const row of types.values()) for (const id of row.memberIds ?? []) assert.equal(members.get(id)?.ownerTypeId, row.id, `Type member mismatch ${id}`);
  for (const row of exports.values()) {
    const decision = decisions.get(row.id);
    assert.ok(decision, `Missing export disposition ${row.id}`);
    assert.equal(decision.typeId, row.typeId, `Changed export type ${row.id}`);
    assert.equal(decision.instanceTypeId, row.instanceTypeId, `Changed export instance ${row.id}`);
    if (decision.disposition !== 'PUBLIC_MODULE_EXPORT' && !decision.effectiveEntryIds?.length) continue;
    for (const id of [row.typeId, row.instanceTypeId].filter(Boolean)) {
      assert.ok(types.has(id), `Dangling public root ${row.id}/${id}`);
      if (!witnesses.has(id)) { witnesses.set(id, { exportId: row.id, parentTypeId: null, relationId: null }); queue.push(id); }
    }
  }
  for (let i = 0; i < queue.length; i++) for (const { target, id } of edges.get(queue[i]) ?? []) {
    if (witnesses.has(target)) continue;
    witnesses.set(target, { exportId: witnesses.get(queue[i]).exportId, parentTypeId: queue[i], relationId: id }); queue.push(target);
  }
  uniqueIndex(candidates, 'candidate');
  const records = candidates.map(row => {
    const member = members.get(row.id);
    assert.ok(member && member.ownerTypeId === row.ownerTypeId, `Missing or changed candidate ${row.id}`);
    return { id: `A-M4-REACHABILITY:${row.id}`, table: 'members', recordId: row.id,
      classification: witnesses.has(row.ownerTypeId) ? 'PUBLIC_REACHABLE' : 'IMPLEMENTATION_TYPE_CONTEXT',
      capabilityIds: [], ownerTypeId: row.ownerTypeId, publicWitness: witnesses.get(row.ownerTypeId) ?? null,
      recordSha256: sha(JSON.stringify(member)), acceptance: 'GRAPH_RELATION_ONLY' };
  });
  return { format: 'a-m4-member-reachability-v1', records, reachableTypes: witnesses.size,
    witnesses: Object.fromEntries(witnesses), complete: false, stageClosable: false,
    limitations: ['Historical capability assignments and final public closure are not reconstructed',
      'Non-reachability is relative to this finite source graph; unresolved types may hide public members'] };
}

function verifiedInputs(base) {
  const manifest = read(path.join(base, 'reconstruction-manifest.json'));
  for (const name of ['public-surface.json', 'source-census.json', 'public-dispositions.json']) {
    const expected = manifest.files.find(row => row.path === name);
    assert.ok(expected, `Missing reconstruction receipt ${name}`);
    assert.equal(sha(fs.readFileSync(path.join(base, name))), expected.sha256, `Changed reconstruction input ${name}`);
  }
  const surface = readPublicSurface(path.join(base, 'public-surface.json'));
  const dispositions = read(path.join(base, 'public-dispositions.json'));
  assert.deepEqual(surface.source, dispositions.source);
  assert.equal(dispositions.evidence.inputs.find(row => row.path.endsWith('/public-surface.json'))?.sha256,
    sha(fs.readFileSync(path.join(base, 'public-surface.json'))), 'Disposition public source binding changed');
  return { surface, dispositions };
}

export function pluginLinkage(surface, dispositions, candidates) {
  const declarations = uniqueIndex(surface.declarations, 'declaration');
  const modules = uniqueIndex(dispositions.modules, 'module');
  return candidates.map(candidate => {
    const module = modules.get(`MODULE:${candidate.sourcePath}`);
    const direct = dispositions.exports.filter(row => row.disposition === 'PUBLIC_MODULE_EXPORT' && row.name === candidate.symbol &&
      row.declarationIds.some(id => { const declaration = declarations.get(id); return declaration?.path === candidate.sourcePath && declaration.start === candidate.start; }));
    return { id: candidate.id, sourcePath: candidate.sourcePath, name: candidate.symbol,
      directPublicExportIds: direct.map(row => row.id), directEntryIds: [...new Set(direct.flatMap(row => row.effectiveEntryIds ?? []))],
      moduleEntryIds: module?.explicitEntryIds ?? [],
      sourceTreePublicationPackageIds: module?.publication?.allowedPublishedPaths?.length ? [module.packageId] : [],
      conservativeExportIds: module?.exportIds ?? [], evidenceModuleId: module?.id ?? null };
  });
}

async function plugins(base, output, check = false) {
  const { surface, dispositions } = verifiedInputs(base);
  const typeFile = path.join(output, 'plugin-type-contracts.json'), typeContracts = read(typeFile);
  assert.deepEqual(typeContracts.source, surface.source);
  const typeReplay = validatePluginContracts(typeContracts, buildPluginContracts({
    sourceDir: path.resolve(base, 'expo-official.git'), typeContracts: true,
  }));
  assert.ok(typeReplay.valid, `Type contract source replay failed: ${typeReplay.failures.join('; ')}`);
  const census = read(path.join(base, 'source-census.json'));
  const tree = readSourceTree(path.join(base, 'expo-official.git'), surface.source.revision);
  assert.equal(tree.tree, surface.source.tree);
  const receipts = new Map(census.metadata.fixedSourceInputs.map(row => [row.path, row]));
  const requested = new Set(typeContracts.inputs.map(row => row.path));
  for (const row of tree.entries) if (row.type === 'blob' && row.mode !== '120000' && /\/(?:build|plugin\/build)\/.*\.(?:js|d\.ts|js\.map)$/.test(row.path)) requested.add(row.path);
  const files = new Map();
  const selected = tree.entries.filter(row => requested.has(row.path));
  assert.equal(selected.length, requested.size, 'Missing plugin source input');
  for (let i = 0; i < selected.length; i += 100) for (const [file, bytes] of readSourceBlobs(path.join(base, 'expo-official.git'), selected.slice(i, i + 100))) {
    assert.equal(sha(bytes), receipts.get(file)?.sha256, `Plugin source mismatch ${file}`);
    files.set(file, bytes.toString());
  }
  for (const row of typeContracts.inputs) assert.equal(sha(files.get(row.path)), row.sha256, `Type contract input changed ${row.path}`);
  const linkage = pluginLinkage(surface, dispositions, typeContracts.batch.plugins);
  const index = read('docs/releases/sdk54-plugin-source-index.json');
  const result = buildFinalPluginContracts({ files, candidates: typeContracts.batch.plugins, linkage, typeContracts,
    modulePaths: index.modules.map(row => row.source.path) });
  result.inputs = [path.join(base, 'public-surface.json'), path.join(base, 'public-dispositions.json'), path.join(base, 'source-census.json'), typeFile, 'docs/releases/sdk54-plugin-source-index.json'].map(receipt);
  result.linkagePolicy = 'Rebuilt from fixed-source dispositions and exact declaration locations; source mapping is not Harmony execution';
  save(path.join(output, 'plugin-linkage.json'), { linkage, inputs: result.inputs }, check);
  save(path.join(output, 'plugin-contracts.json'), result, check);
  console.log(JSON.stringify(result.summary));
}

function currentSources() {
  const files = new Map();
  const visit = file => {
    if (!fs.existsSync(file)) return;
    const stat = fs.lstatSync(file);
    if (stat.isDirectory()) for (const name of fs.readdirSync(file).sort()) visit(`${file}/${name}`);
    else if (stat.isFile() && isM4PublicSourcePath(file)) files.set(file, sha(fs.readFileSync(file)));
  };
  for (const name of names) {
    const root = `packages/${name}`;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) if (entry.isFile()) visit(`${root}/${entry.name}`);
    for (const dir of ['src', 'plugin', ...(name === 'expo-router' ? ['link', 'node', 'rsc', 'types'] : [])]) visit(`${root}/${dir}`);
  }
  return files;
}

async function scope(base, output, check = false) {
  const { surface, dispositions } = verifiedInputs(base);
  const pluginFile = path.join(output, 'plugin-contracts.json'), pluginContracts = read(pluginFile);
  for (const row of pluginContracts.inputs) assert.equal(sha(fs.readFileSync(row.path)), row.sha256, `Changed plugin contract input ${row.path}`);
  const candidates = collectM4Members(surface.declarations, surface.members);
  const reachability = memberReachability(surface, dispositions, candidates);
  reachability.inputs = [path.join(base, 'public-surface.json'), path.join(base, 'public-dispositions.json')].map(receipt);
  save(path.join(output, 'member-reachability.json'), reachability, check);
  const runtimeFile = 'docs/releases/sdk54-first-runtime-api.json', pluginsFile = 'docs/releases/sdk54-first-plugin-surface.json';
  const runtime = read(runtimeFile), current = currentSources();
  const sourceComparison = compareM4PublicSources(surface.inputs.filter(row => isM4PublicSourcePath(row.path)), current);
  const additions = collectM4CurrentAdditions(new Map(sourceComparison.filter(row => row.status === 'ADDED').map(row => [row.path, fs.readFileSync(row.path)])));
  const initial = buildM4Inventory({ runtime, plugins: read(pluginsFile), publicSurface: dispositions, pluginContracts,
    publicMembers: mergeM4Membership(candidates, reachability.records), currentAdditions: additions });
  const inventory = applyM4Decisions(initial, seedM4Decisions(initial));
  inventory.inputs = [runtimeFile, pluginsFile, path.join(base, 'public-surface.json'), path.join(base, 'public-dispositions.json'), pluginFile, path.join(output, 'member-reachability.json')].map(receipt);
  inventory.currentSources = compareM4Sources(runtime.inputs, file => fs.existsSync(file) ? sha(fs.readFileSync(file)) : null);
  inventory.currentPublicSources = sourceComparison;
  inventory.reconstruction = { historicDecisionsRestored: false, membershipKind: reachability.format,
    limitation: 'Seeded decisions require review against original milestone requirements; this is not final public closure or complete current candidate coverage' };
  save(path.join(output, 'scope-seeded.json'), inventory, check);
  const count = (rows, key) => rows.reduce((map, row) => (map[row[key]] = (map[row[key]] ?? 0) + 1, map), {});
  const summary = { records: inventory.rows.length, scopes: count(inventory.rows, 'scope'), kinds: count(inventory.rows, 'kind'),
    members: count(reachability.records, 'classification'), currentSources: count(sourceComparison, 'status'),
    undecided: inventory.rows.filter(row => row.scope === 'UNDECIDED'), ready: false, complete: false };
  save(path.join(output, 'scope-summary.json'), summary, check);
  console.log(JSON.stringify({ ...summary, undecided: summary.undecided.length }));
}

export async function main(args) {
  const [stage, base, output] = args;
  assert.ok(args.length === 3 && ['plugins', 'scope', 'check'].includes(stage), 'Usage: plugins|scope|check <reconstruction-directory> <new-output-directory>');
  assert.notEqual(path.resolve(base), path.resolve(output), 'Preserve reconstructed input directory');
  if (stage === 'check') {
    await plugins(base, output, true);
    return scope(base, output, true);
  }
  fs.mkdirSync(output, { recursive: true });
  return stage === 'plugins' ? plugins(base, output) : scope(base, output);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main(process.argv.slice(2));
