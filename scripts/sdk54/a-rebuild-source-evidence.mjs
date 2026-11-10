import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { SDK54_EXPO_COMMIT } from './catalog.mjs';
import { readSourceTree, readSourceBlobs, buildSourceInventory } from './source-inventory.mjs';
import { parseFixedYarnLock } from './external-sources.mjs';
import { buildWorkspaceSurface } from './workspace-surface.mjs';
import { buildPluginSourceIndex } from './plugin-source-index.mjs';
import { loadProjectSourceInputs, createProjectSourceContext } from './m0-project-context.mjs';
import { planDeclarationArchives, planDeclaredTypeArchives, createDeclarationContext } from './m0-source-context.mjs';
import { readDeclarationArchive } from './m0-archive.mjs';
import { acquireTransitiveDeclarationArchive, planTransitiveDeclarationArchives, loadTransitiveOwnerManifests } from './m0-transitive-sources.mjs';
import { indexSemanticSurface, buildClosureStatus } from './m0-consolidated.mjs';
import { writeSemanticArtifact, readSemanticArtifact } from './m0-semantic-artifact.mjs';
import { buildPublicSurfaceFromSource } from './m0-public-surface-source.mjs';
import { writePublicSurface, readPublicSurface, summarizePublicSurface, validatePublicSurface } from './m0-public-surface.mjs';
import { buildSourceCensus, serializeSourceCensus, validateSourceCensus } from './m0-source-census.mjs';
import { buildFinalPublicDispositions } from './m0-final-public-dispositions.mjs';
import { verifyArchiveIntegrity } from './metro-type-source.mjs';

const fixedTree = '5457e824b21d968e55c8f533cdf1751860160a92';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file));
const save = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const progress = message => console.log(`${new Date().toISOString()} ${message}`);

// A new evidence run, not restoration of the old hashes or scope decisions.
export function verifyFixedSource(sourceDir) {
  const tree = readSourceTree(sourceDir, SDK54_EXPO_COMMIT);
  assert.equal(tree.tree, fixedTree, 'SDK54 fixed tree identity');
  return tree;
}

async function acquireLargeArchive(plan, directory) {
  const probe = await fetch(plan.downloadUrl, { headers: { Range: 'bytes=0-0' }, signal: AbortSignal.timeout(30000) });
  const match = /^bytes 0-0\/(\d+)$/.exec(probe.headers.get('content-range') ?? '');
  assert.ok(probe.status === 206 && match, 'Official registry must support verified byte ranges');
  await probe.arrayBuffer();
  const size = Number(match[1]), chunk = 1024 * 1024;
  assert.ok(size > 0 && size <= 256 * 1024 * 1024, 'Large archive download limit');
  const chunks = Array(Math.ceil(size / chunk));
  let cursor = 0;
  await Promise.all(Array.from({ length: 16 }, async () => {
    while (cursor < chunks.length) {
      const index = cursor++, start = index * chunk, end = Math.min(size - 1, start + chunk - 1);
      const response = await fetch(plan.downloadUrl, { headers: { Range: `bytes=${start}-${end}` }, signal: AbortSignal.timeout(90000) });
      assert.equal(response.status, 206);
      assert.equal(response.headers.get('content-range'), `bytes ${start}-${end}/${size}`);
      chunks[index] = Buffer.from(await response.arrayBuffer());
      assert.equal(chunks[index].length, end - start + 1, 'Truncated registry range');
    }
  }));
  const bytes = Buffer.concat(chunks);
  const verified = verifyArchiveIntegrity(bytes, plan.identity);
  fs.writeFileSync(path.join(directory, plan.filename), bytes, { flag: 'wx' });
  save(path.join(directory, plan.filename + '.range-download.json'), { url: plan.downloadUrl, size, method: 'VERIFIED_HTTP_BYTE_RANGES', ...verified });
}

async function acquire(plans, directory, previous = []) {
  const records = new Map(previous.map(row => [row.identity.name + '@' + row.identity.version, row]));
  const pending = plans.filter(row => !records.has(row.identity.name + '@' + row.identity.version));
  for (let offset = 0; offset < pending.length; offset += 4) {
    const settled = await Promise.allSettled(pending.slice(offset, offset + 4).map(async row => {
      try { return await acquireTransitiveDeclarationArchive(row, { directory, network: true }); }
      catch (error) {
        if (error.message !== 'Archive GET size limit') throw error;
        await acquireLargeArchive(row, directory);
        return acquireTransitiveDeclarationArchive(row, { directory, network: false });
      }
    }));
    const failures = [];
    for (const result of settled) {
      if (result.status === 'rejected') failures.push(result.reason);
      else records.set(result.value.identity.name + '@' + result.value.identity.version, result.value);
    }
    save(path.join(directory, 'acquisition.json'), [...records.values()]);
    if (failures.length) throw new AggregateError(failures, 'Archive acquisition failed; verified downloads are reusable');
    progress(`archives ${Math.min(offset + 4, pending.length)}/${pending.length}`);
  }
  return [...records.values()].sort((a, b) => a.file.localeCompare(b.file));
}

function loadArchives(records) {
  return records.filter(row => row.status === 'VERIFIED_FIXED_LOCK_ARCHIVE').map(row => {
    assert.equal(sha(fs.readFileSync(row.file)), row.integrityVerification.sha256, 'Acquired archive changed');
    return readDeclarationArchive(row.file, row.identity);
  });
}

async function prepare(sourceDir, output) {
  const { entries } = verifyFixedSource(sourceDir);
  const lockEntry = entries.find(row => row.path === 'yarn.lock');
  const lock = readSourceBlobs(sourceDir, [lockEntry]).get('yarn.lock');
  const locks = parseFixedYarnLock(lock.toString());
  const configPlan = planDeclarationArchives({ locks, selectors: ['@tsconfig/node18@^18.2.2', '@tsconfig/node20@^20.1.2'] });
  await acquire(configPlan.archives, path.join(output, 'config-archives'));
  const inventory = buildSourceInventory({ sourceDir });
  const packages = [...inventory.packages, ...inventory.templates];
  const manifestPaths = new Set(packages.map(row => row.sourcePath));
  const workspaceFiles = readSourceBlobs(sourceDir, entries.filter(row => manifestPaths.has(row.path)));
  const priorFile = 'docs/releases/sdk54-m0-source-context-complete-summary.json';
  const prior = read(priorFile);
  const selectors = prior.archiveAvailability.map(row => {
    const identity = locks.find(item => item.name === row.name && item.version === row.version);
    assert.ok(identity, `Missing fixed lock identity ${row.name}@${row.version}`);
    return identity.selector;
  });
  const basePlan = planDeclarationArchives({ locks, selectors });
  const directory = path.join(output, 'archives');
  let records = await acquire(basePlan.archives, directory);
  for (const expected of prior.archiveAvailability) {
    const actual = records.find(row => row.identity.name === expected.name && row.identity.version === expected.version);
    assert.equal(actual.integrityVerification.sha256, expected.sha256, 'Historical archive bytes differ');
  }
  const declaredPlan = planDeclaredTypeArchives({ archives: loadArchives(records), workspaceFiles, packages, locks });
  records = await acquire(declaredPlan.archives, directory, records);
  save(path.join(output, 'archive-plan.json'), { basePlan, declaredPlan, historicalSummary: { path: priorFile, sha256: sha(fs.readFileSync(priorFile)) }, lock: { blob: lockEntry.oid, sha256: sha(lock) } });
  save(path.join(output, 'archives.json'), records);
  progress(`prepared ${records.length} archive identities`);
}

function semantic(sourceDir, output) {
  verifyFixedSource(sourceDir);
  const project = loadProjectSourceInputs({ sourceDir, configArchiveDirectory: path.join(output, 'config-archives'), sourceProvenance: true });
  const syntax = buildWorkspaceSurface({ sourceDir });
  const plugins = buildPluginSourceIndex({ sourceDir });
  const records = read(path.join(output, 'archives.json'));
  const files = new Map(project.selected.map(row => [row.path, project.files.get(row.path)]));
  const externalContext = createDeclarationContext({ archives: loadArchives(records), workspaceFiles: project.files, packages: project.packages,
    locks: project.locks, sourceProvenance: true, declaredTypes: true, projectSources: project, transitiveSourceProvenance: true });
  const projectContext = createProjectSourceContext({ files, packages: project.packages, entries: project.entries,
    configArchives: project.configArchives, locks: project.locks, sourceProvenance: true });
  progress(`analyzing ${project.files.size} workspace inputs and ${records.length} archives`);
  const graph = indexSemanticSurface({ files, packages: project.packages, externalContext, projectContext,
    inferredCandidates: syntax.gaps.filter(row => row.kind === 'inferred-type'), pluginCandidates: plugins.modules.flatMap(row => row.configPlugins),
    maxTypes: 250000, symbolicGenerics: true, declarationInstanceLimit: 16, structuralTypeOperations: true });
  graph.source = project.source;
  const byPath = new Map(project.entries.map(row => [row.path, row]));
  for (const row of graph.inputs) row.blob = byPath.get(row.path).oid;
  graph.externalContext.fixedInputs = project.evidenceInputs.map(row => ({ path: row.path, blob: row.oid, sha256: sha(project.files.get(row.path)) }));
  graph.externalContext.availability = records.map(row => ({ identity: row.identity, status: row.status, file: row.file }));
  graph.reconstruction = { policy: 'NEW_SOURCE_RECONSTRUCTION', oldSemanticHashReproduced: false, historicalScopeDecisionsRestored: false };
  graph.closure = buildClosureStatus(graph);
  writeSemanticArtifact(path.join(output, 'semantic.json.gz'), graph, { sharded: true });
  save(path.join(output, 'semantic-summary.json'), { source: graph.source, types: graph.types.length, modules: graph.modules.length, closure: graph.closure });
  progress(`semantic emitted: ${graph.types.length} types, ${graph.modules.length} modules`);
}

async function transitive(sourceDir, output) {
  const graph = readSemanticArtifact(path.join(output, 'semantic.json.gz'));
  const { entries } = verifyFixedSource(sourceDir);
  const lockEntry = entries.find(row => row.path === 'yarn.lock');
  const locks = parseFixedYarnLock(readSourceBlobs(sourceDir, [lockEntry]).get('yarn.lock').toString());
  const plan = planTransitiveDeclarationArchives({ graph, locks, owners: loadTransitiveOwnerManifests({ graph, sourceDir }) });
  const before = read(path.join(output, 'archives.json'));
  const after = await acquire(plan.archives, path.join(output, 'archives'), before);
  save(path.join(output, `transitive-${before.length}.json`), plan);
  save(path.join(output, 'archives.json'), after);
  save(path.join(output, 'transitive-status.json'), { before: before.length, after: after.length, added: after.length - before.length, blockedRelations: plan.blockers.length });
  progress(`transitive archives added: ${after.length - before.length}`);
}

function surfaceOptions(sourceDir, output) {
  return { sourceDir, semanticFile: path.join(output, 'semantic.json.gz'), templateProjection: true,
    referenceResolution: 'node-self', entryPatterns: 'fixed-v1', typeRootIsolation: 'consumer-v2' };
}

async function publicSurface(sourceDir, output, check) {
  const expected = await buildPublicSurfaceFromSource(surfaceOptions(sourceDir, output));
  expected.reconstruction = { policy: 'NEW_SOURCE_RECONSTRUCTION', historicalScopeDecisionsRestored: false,
    note: 'Source graph rebuilt in this run; sourceEvidence.semanticRebuilt=false describes only the subsequent public-ledger pass.' };
  const file = path.join(output, 'public-surface.json');
  if (check) {
    const result = validatePublicSurface(readPublicSurface(file), expected);
    assert.equal(result.valid, true, result.failures.slice(0, 20).join('\n'));
    save(path.join(output, 'public-source-check.json'), result);
  } else {
    writePublicSurface(file, expected);
    // Read all shards back through the existing validating reader.
    const result = validatePublicSurface(readPublicSurface(file), expected);
    assert.equal(result.valid, true, result.failures.slice(0, 20).join('\n'));
    save(path.join(output, 'public-summary.json'), summarizePublicSurface(expected));
  }
  progress(`public surface ${check ? 'source-checked' : 'emitted and read back'}`);
}

async function census(sourceDir, output, check) {
  const tree = verifyFixedSource(sourceDir);
  const surfaceFile = path.join(output, 'public-surface.json');
  const index = read(surfaceFile);
  const surface = readPublicSurface(surfaceFile);
  const inputPaths = new Set(surface.inputs.map(row => row.path));
  const coveredInputs = index.metadata.sourceEvidence.files.filter(row => row.origin === 'fixed-git-blob' && inputPaths.has(row.path)).map(row => ({ ...row, id: `INPUT:${row.path}` }));
  const manifests = [], receipts = [];
  const inventory = buildSourceInventory({ sourceDir });
  const manifestPaths = new Set(['package.json', ...inventory.packages.map(row => row.sourcePath), ...inventory.templates.map(row => row.sourcePath)]);
  const ordinary = tree.entries.filter(row => row.type === 'blob' && ['100644', '100755'].includes(row.mode));
  for (let offset = 0; offset < ordinary.length; offset += 100) {
    const batch = ordinary.slice(offset, offset + 100), blobs = readSourceBlobs(sourceDir, batch);
    for (const row of batch) {
      const bytes = blobs.get(row.path);
      const receipt = { path: row.path, blob: row.oid, sha256: sha(bytes), origin: 'fixed-git-blob' };
      receipts.push(receipt);
      if (manifestPaths.has(row.path)) manifests.push({ ...receipt, value: JSON.parse(bytes.toString()) });
    }
  }
  const verified = new Map(receipts.map(row => [row.path, row]));
  for (const row of coveredInputs) {
    assert.equal(verified.get(row.path)?.sha256, row.sha256, `Public input mismatch ${row.path}`);
    assert.equal(verified.get(row.path)?.blob, row.blob, `Public blob mismatch ${row.path}`);
  }
  const covered = new Set(coveredInputs.map(row => row.path));
  const supplementalReads = receipts.filter(row => !covered.has(row.path) && !manifests.some(item => item.path === row.path));
  const result = buildSourceCensus({ source: surface.source, treeEntries: tree.entries, manifests, coveredInputs,
    publicPackages: surface.packages, capabilities: [], supplementalReads });
  result.metadata = { ...result.metadata, inputEvidence: [{ kind: 'surface', path: surfaceFile, sha256: sha(fs.readFileSync(surfaceFile)) }],
    inputSummary: { totalPublicInputs: surface.inputs.length, fixedGitInputs: coveredInputs.length, nonGitContextInputs: surface.inputs.length - coveredInputs.length },
    fixedSourceInputs: receipts, supplementalReads, sharedFollowupUseIds: [],
    reconstruction: { policy: 'NEW_SOURCE_RECONSTRUCTION', capabilityMap: 'NOT_RECONSTRUCTED', sharedFollowup: 'NOT_RECONSTRUCTED',
      note: 'Complete fixed-tree content census; historical capability assignments and shared-use decisions are not inferred.' } };
  const file = path.join(output, 'source-census.json');
  if (check) {
    const validation = validateSourceCensus(read(file), result);
    assert.equal(validation.valid, true, validation.failures.slice(0, 20).join('\n'));
    save(path.join(output, 'census-source-check.json'), validation);
  } else fs.writeFileSync(file, serializeSourceCensus(result));
  progress(`census ${check ? 'source-checked' : 'emitted'}: ${result.files.length} files, ${result.owners.length} owners`);
}

async function dispositions(sourceDir, output) {
  const tree = verifyFixedSource(sourceDir);
  const surfaceFile = path.join(output, 'public-surface.json');
  const censusFile = path.join(output, 'source-census.json');
  const semanticFile = path.join(output, 'semantic.json.gz');
  const surface = readPublicSurface(surfaceFile), sourceCensus = read(censusFile);
  const graph = JSON.parse(gunzipSync(fs.readFileSync(semanticFile))).graph;
  assert.equal(surface.sourceEvidence.semanticArtifact.sha256, sha(fs.readFileSync(semanticFile)));
  assert.equal(sourceCensus.metadata.inputEvidence[0].sha256, sha(fs.readFileSync(surfaceFile)));
  const receipts = new Map(sourceCensus.metadata.fixedSourceInputs.map(row => [row.path, row]));
  const files = new Map();
  const selected = tree.entries.filter(row => receipts.has(row.path) && (/\.[cm]?[jt]sx?$/.test(row.path) || row.path.endsWith('.json') || /\.[cm]?[jt]sx?\.map$/.test(row.path) || /(?:^|\/)(?:\.npmignore|\.gitignore|yarn\.lock)$/.test(row.path)));
  for (let offset = 0; offset < selected.length; offset += 100) {
    for (const [file, bytes] of readSourceBlobs(sourceDir, selected.slice(offset, offset + 100))) {
      assert.equal(sha(bytes), receipts.get(file).sha256, `Census source changed ${file}`);
      files.set(file, bytes.toString());
    }
  }
  const configArchives = [];
  for (const record of surface.sourceEvidence.archives) {
    const loaded = readDeclarationArchive(record.path, record.identity, { includeConfigJson: record.kind === 'config-archive' });
    assert.equal(loaded.archive.sha256, record.sha256, 'Public archive source changed');
    for (const [file, text] of loaded.files) files.set(record.prefix + file, text);
    if (record.kind === 'config-archive') configArchives.push(loaded);
  }
  const result = await buildFinalPublicDispositions({ surface, files, treeEntries: tree.entries,
    projectContext: graph.projectContext, configArchives, locks: parseFixedYarnLock(files.get('yarn.lock')) });
  result.evidence = { policy: 'NEW_RECONSTRUCTION_INPUTS_NOT_HISTORICAL_HASHES', inputs: [surfaceFile, censusFile, semanticFile].map(file => ({ path: file, sha256: sha(fs.readFileSync(file)) })) };
  save(path.join(output, 'public-dispositions.json'), result);
  save(path.join(output, 'downstream-check.json'), { valid: true, consumer: 'buildFinalPublicDispositions', summary: result.summary, inputs: result.evidence.inputs,
    legacyCliCompatible: false, reason: 'Legacy CLI retains historical absolute input paths and pinned old hashes; use these explicit reconstructed inputs.' });
  progress('downstream public disposition builder accepted reconstructed inputs');
}

export async function main(args) {
  const [stage, sourceDir, output] = args;
  assert.equal(args.length, 3, 'Usage: <prepare|semantic|transitive|surface|census|dispositions|check-surface|check-census> <fixed-git> <new-output-dir>');
  assert.ok(['prepare', 'semantic', 'transitive', 'surface', 'census', 'dispositions', 'check-surface', 'check-census'].includes(stage), 'Unknown stage');
  assert.ok(!path.resolve(output).startsWith(path.resolve(sourceDir) + path.sep) && path.resolve(output) !== path.resolve(sourceDir), 'Output must not overwrite source');
  fs.mkdirSync(output, { recursive: true });
  if (stage === 'prepare') return prepare(sourceDir, output);
  if (stage === 'semantic') return semantic(sourceDir, output);
  if (stage === 'transitive') return transitive(sourceDir, output);
  if (stage === 'dispositions') return dispositions(sourceDir, output);
  if (stage.endsWith('surface')) return publicSurface(sourceDir, output, stage.startsWith('check-'));
  return census(sourceDir, output, stage.startsWith('check-'));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main(process.argv.slice(2));
}
