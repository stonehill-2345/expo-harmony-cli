import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { SDK54_EXPO_COMMIT } from './catalog.mjs';
import { readSourceTree, readSourceBlobs, buildSourceInventory, serializeInventory } from './source-inventory.mjs';
import { readSemanticArtifact } from './m0-semantic-artifact.mjs';
import { readDeclarationArchive } from './m0-archive.mjs';
import { loadCompilerLibraries } from './m0-consolidated.mjs';
import { enumeratePublicEntries } from './m0-public-entries.mjs';
import { projectPublicationFiles } from './m0-publication-policy.mjs';
import { createDeclarationContext } from './m0-source-context.mjs';
import { parseFixedYarnLock } from './external-sources.mjs';
import { loadScopeDecisionInputs, buildScopeDecisions } from './m0-scope-decisions.mjs';
import { buildTypeRootIsolation } from './m0-type-root-isolation.mjs';
import { buildPublicSurface, validatePublicSurface, writePublicSurface, readPublicSurface, summarizePublicSurface } from './m0-public-surface.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const defaults = { readSourceTree, readSourceBlobs, buildSourceInventory, readDeclarationArchive, loadCompilerLibraries, loadScopeDecisionInputs, buildScopeDecisions, buildTypeRootIsolation };

function safePath(file) {
  if (typeof file !== 'string' || !file || file.includes('\\') || file.includes('\0') || path.posix.isAbsolute(file) || path.posix.normalize(file) !== file || file.split('/').some(part => !part || part === '.' || part === '..')) throw new Error(`Unsafe source path: ${file}`);
  return file;
}

function semanticEvidence(file) {
  const bytes = fs.readFileSync(file);
  const index = JSON.parse((file.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString());
  return { path: path.resolve(file), sha256: hash(bytes), format: index.format ?? 'legacy-semantic-document',
    typeShards: (index.typeShards ?? []).map(shard => ({ path: path.resolve(file + '.parts', shard.path), sha256: shard.sha256, count: shard.count })),
    integrity: 'VERIFIED_BY_READ_SEMANTIC_ARTIFACT' };
}

export async function loadPublicSurfaceSources({ sourceDir, semanticFile, referenceResolution = null, entryPatterns = null, scopeDecisions = null, typeRootIsolation = null }, readers = {}) {
  if (entryPatterns !== null && entryPatterns !== 'fixed-v1') throw new Error('Unsupported entry pattern rule');
  if (scopeDecisions !== null && scopeDecisions !== 'fixed-v1') throw new Error('Unsupported scope decision rule');
  if (typeRootIsolation !== null && !['consumer-v1', 'consumer-v2'].includes(typeRootIsolation)) throw new Error('Unsupported type root isolation rule');
  const io = { ...defaults, ...readers };
  const graph = readSemanticArtifact(semanticFile);
  if (graph.source?.revision !== SDK54_EXPO_COMMIT) throw new Error('Semantic source revision is not the fixed SDK54 commit');
  const { tree, entries: treeEntries } = io.readSourceTree(sourceDir, SDK54_EXPO_COMMIT);
  if (graph.source.tree !== tree) throw new Error('Semantic fixed source tree mismatch');
  const treeByPath = new Map();
  for (const entry of treeEntries) {
    safePath(entry.path);
    if (treeByPath.has(entry.path)) throw new Error(`Duplicate source tree path: ${entry.path}`);
    treeByPath.set(entry.path, entry);
  }
  const inventory = io.buildSourceInventory({ sourceDir });
  if (inventory.source.revision !== SDK54_EXPO_COMMIT || inventory.source.tree !== tree) throw new Error('Inventory fixed source tree mismatch');
  const identity = rows => rows.map(({ id, name, sourcePath }) => ({ id, name, sourcePath })).sort((a, b) => compare(a.id, b.id));
  if (serializeInventory(identity(graph.packages)) !== serializeInventory(identity([...inventory.packages, ...inventory.templates]))) throw new Error('Semantic package inventory differs from the fixed source inventory');
  if (graph.compilerVersion !== ts.version || graph.compilerLibraries?.version !== ts.version) throw new Error('Semantic compiler version mismatch');
  const files = new Map(), origins = new Map(), archiveEvidence = new Map(), nodeArchives = [], declarationArchives = [], configArchives = [];
  const add = (file, text, origin) => {
    safePath(file);
    if (typeof text !== 'string') throw new Error(`Missing source text: ${file}`);
    if (files.has(file) && (files.get(file) !== text || origins.get(file).origin !== origin.origin)) throw new Error(`Conflicting source input: ${file}`);
    files.set(file, text);
    origins.set(file, { path: file, sha256: hash(text), ...origin });
  };
  const libraries = io.loadCompilerLibraries();
  const libraryPaths = new Set();
  for (const input of graph.compilerLibraries.files) {
    safePath(input.path);
    if (libraryPaths.has(input.path)) throw new Error(`Duplicate compiler library input: ${input.path}`);
    libraryPaths.add(input.path);
  }
  const missingLibraries = [...libraries.keys()].filter(file => !libraryPaths.has(file));
  const unexpectedLibraries = [...libraryPaths].filter(file => !libraries.has(file));
  if (missingLibraries.length || unexpectedLibraries.length) throw new Error(`Compiler library input set mismatch: missing=${missingLibraries.join(',')} unexpected=${unexpectedLibraries.join(',')}`);
  for (const input of graph.compilerLibraries.files) {
    const text = libraries.get(input.path);
    if (typeof text !== 'string' || hash(text) !== input.sha256) throw new Error(`Compiler library hash mismatch: ${input.path}`);
    add(input.path, text, { origin: 'compiler-library', package: 'typescript', version: ts.version });
  }
  const loadArchive = (record, kind) => {
    const { identity: archiveIdentity, archive } = record;
    if (!archiveIdentity || !/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(archiveIdentity.name) || !/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?(?:\+[a-z0-9.-]+)?$/i.test(archiveIdentity.version)) throw new Error('Unsafe archive package identity');
    if (typeof archive?.path !== 'string' || !archive.path || archive.path.includes('\0') || !/^[a-f0-9]{64}$/.test(archive.sha256 ?? '')) throw new Error('Invalid archive path or sha256');
    const key = `${kind}\0${archive.path}\0${archive.sha256}`;
    if (archiveEvidence.has(key)) {
      if (serializeInventory(archiveEvidence.get(key).identity) !== serializeInventory(archiveIdentity)) throw new Error(`Conflicting archive identity: ${archive.path}`);
      return;
    }
    const loaded = io.readDeclarationArchive(archive.path, archiveIdentity, { includeConfigJson: kind === 'config-archive' });
    if (loaded.archive.sha256 !== archive.sha256) throw new Error(`Archive sha256 hash mismatch: ${archive.path}`);
    if (kind === 'external-declaration-archive' && archiveIdentity.name === '@types/node') nodeArchives.push(loaded);
    if (kind === 'external-declaration-archive') declarationArchives.push(loaded);
    if (kind === 'config-archive') configArchives.push(loaded);
    const prefix = `${kind === 'config-archive' ? '__sdk54_config__' : '__sdk54_external__'}/${archiveIdentity.name.replaceAll('/', '+')}@${archiveIdentity.version}/`;
    for (const [file, text] of loaded.files) {
      safePath(file);
      add(prefix + file, text, { origin: kind, identity: archiveIdentity, archivePath: archive.path, archiveSha256: archive.sha256 });
    }
    archiveEvidence.set(key, { kind, identity: archiveIdentity, path: archive.path, sha256: archive.sha256, prefix });
  };
  for (const record of graph.externalContext?.archives ?? []) loadArchive(record, 'external-declaration-archive');
  const projectInputs = (graph.projectContext?.configs ?? []).flatMap(config => config.inputs ?? []);
  for (const input of projectInputs) if (input.path.startsWith('__sdk54_config__/')) loadArchive(input, 'config-archive');
  const expectedInputs = [...graph.inputs, ...(graph.externalContext?.fixedInputs ?? []), ...(graph.externalContext?.files ?? []), ...projectInputs];
  const requested = new Set();
  const requestGit = file => {
    safePath(file);
    const entry = treeByPath.get(file);
    if (!entry || entry.type !== 'blob' || entry.mode === '120000') throw new Error(`Missing or unsafe fixed source blob: ${file}`);
    requested.add(file);
  };
  for (const input of expectedInputs) {
    safePath(input.path);
    if (!files.has(input.path)) requestGit(input.path);
  }
  const scopeInputs = scopeDecisions ? io.loadScopeDecisionInputs({ sourceDir }) : null;
  for (const file of scopeInputs?.gitFiles ?? []) requestGit(file);
  const roots = graph.packages.map(descriptor => {
    requestGit(descriptor.sourcePath);
    return path.posix.dirname(descriptor.sourcePath) + '/';
  });
  for (const entry of treeEntries) {
    if (!roots.some(root => entry.path.startsWith(root))) continue;
    if (/^(?:package\.json|\.npmignore|\.gitignore|tsconfig[^/]*\.json|taskfile(?:-[A-Za-z0-9_-]+)?\.[cm]?js|app\.plugin\.[cm]?[jt]s)$/.test(path.posix.basename(entry.path))) requestGit(entry.path);
  }
  const readRequested = () => {
    const selected = [...requested].filter(file => !files.has(file)).sort(compare).map(file => treeByPath.get(file));
    for (let position = 0; position < selected.length; position += 100) {
      const batch = selected.slice(position, position + 100);
      const blobs = io.readSourceBlobs(sourceDir, batch);
      for (const entry of batch) {
        if (!blobs.has(entry.path)) throw new Error(`Missing source blob text: ${entry.path}`);
        add(entry.path, blobs.get(entry.path).toString('utf8'), { origin: 'fixed-git-blob', revision: SDK54_EXPO_COMMIT, blob: entry.oid });
      }
    }
  };
  readRequested();
  for (const descriptor of graph.packages) {
    const manifestText = files.get(descriptor.sourcePath);
    if (descriptor.manifestSha256 && hash(manifestText) !== descriptor.manifestSha256) throw new Error(`Package manifest hash mismatch: ${descriptor.sourcePath}`);
    if (descriptor.manifestBlob && descriptor.manifestBlob !== treeByPath.get(descriptor.sourcePath).oid) throw new Error(`Package manifest blob mismatch: ${descriptor.sourcePath}`);
    const manifest = JSON.parse(manifestText);
    const bins = typeof manifest.bin === 'string' ? [manifest.bin] : Object.values(manifest.bin ?? {});
    for (const bin of bins) {
      if (typeof bin !== 'string' || bin.includes('\\') || bin.includes('\0') || path.posix.isAbsolute(bin) || bin.split('/').includes('..')) throw new Error(`Unsafe manifest bin path: ${descriptor.sourcePath}`);
      const target = path.posix.join(path.posix.dirname(descriptor.sourcePath), bin);
      if (treeByPath.has(target)) requestGit(target);
    }
  }
  readRequested();
  for (const input of expectedInputs) {
    if (typeof input.sha256 !== 'string' || !files.has(input.path) || hash(files.get(input.path)) !== input.sha256) throw new Error(`Source input hash mismatch: ${input.path}`);
    if (input.blob && treeByPath.get(input.path)?.oid !== input.blob) throw new Error(`Source input blob mismatch: ${input.path}`);
  }
  const initialEntries = enumeratePublicEntries({ packages: graph.packages, treeEntries, modules: graph.modules, files, projectContext: graph.projectContext, patternCoverage: entryPatterns === 'fixed-v1' });
  for (const entry of initialEntries.entries) {
    if (/^\/(?:types|typings)$/.test(entry.condition) && typeof entry.declaredTarget === 'string' && !path.posix.extname(entry.declaredTarget)
      && entry.target.path && /\.d\.[cm]?ts$/.test(entry.target.path) && !files.has(entry.target.path)) requestGit(entry.target.path);
  }
  readRequested();
  const orderedFiles = new Map([...files].sort(([left], [right]) => compare(left, right)));
  const entryLedger = enumeratePublicEntries({ packages: graph.packages, treeEntries, modules: graph.modules, files: orderedFiles, projectContext: graph.projectContext, patternCoverage: entryPatterns === 'fixed-v1' });
  const scopeDecisionAudit = scopeInputs ? io.buildScopeDecisions({ source: graph.source, treeEntries, files: orderedFiles, entryLedger, inputs: scopeInputs }) : null;
  const publication = await projectPublicationFiles({ packages: graph.packages, treeEntries, files: orderedFiles });
  const sourceEvidence = { semanticArtifact: semanticEvidence(semanticFile), semanticRebuilt: false,
    policy: 'existing semantic graph and its shards verified; public ledger rebuilt from fixed Git blobs, verified archives and compiler libraries; upstream semantic analysis not rerun',
    source: { revision: SDK54_EXPO_COMMIT, tree }, archives: [...archiveEvidence.values()].sort((a, b) => compare(a.prefix, b.prefix)),
    files: [...origins.values()].sort((a, b) => compare(a.path, b.path)), ...(entryPatterns ? { entryPatterns } : {}),
    ...(scopeDecisions ? { scopeDecisions, scopeDecisionInputs: scopeInputs.evidence } : {}) };
  const nodeContext = referenceResolution === 'node-self' ? createDeclarationContext({ archives: nodeArchives, workspaceFiles: new Map(), packages: [] }) : null;
  let consumerSourceContext = null;
  if (typeRootIsolation === 'consumer-v2') {
    const lock = origins.get('yarn.lock');
    if (lock?.origin !== 'fixed-git-blob' || !expectedInputs.some(input => input.path === 'yarn.lock' && input.sha256 === lock.sha256)) throw new Error('Consumer sources require fixed lock provenance');
    const workspaceFiles = new Map([...orderedFiles].filter(([file]) => origins.get(file).origin === 'fixed-git-blob'));
    consumerSourceContext = createDeclarationContext({ archives: declarationArchives, workspaceFiles, packages: graph.packages,
      locks: parseFixedYarnLock(orderedFiles.get('yarn.lock')), sourceProvenance: true, declaredTypes: true, transitiveSourceProvenance: true,
      projectSources: { entries: treeEntries, configArchives } });
  }
  return { graph, treeEntries, files: orderedFiles, entryLedger, publication, sourceEvidence, nodeSelfReferenceResolver: nodeContext?.resolve,
    ...(scopeDecisionAudit ? { scopeDecisionAudit } : {}), ...(consumerSourceContext ? { consumerSourceContext } : {}) };
}

export async function buildPublicSurfaceFromSource(options, readers = {}) {
  const loaded = await loadPublicSurfaceSources(options, readers);
  const result = buildPublicSurface({ ...loaded, templateProjection: options.templateProjection ?? false, referenceResolution: options.referenceResolution ?? null });
  result.sourceEvidence = loaded.sourceEvidence;
  if (loaded.scopeDecisionAudit) result.scopeDecisions = loaded.scopeDecisionAudit;
  if (options.typeRootIsolation) {
    result.sourceEvidence.typeRootIsolation = options.typeRootIsolation;
    result.consumerTypeContexts = (readers.buildTypeRootIsolation ?? buildTypeRootIsolation)({ surface: result, files: loaded.files, projectContext: loaded.graph.projectContext,
      policy: options.typeRootIsolation, sourceContext: loaded.consumerSourceContext ?? null });
  }
  return result;
}

export function parsePublicSurfaceArgs(args) {
  const options = {};
  for (let position = 0; position < args.length; position++) {
    const flag = args[position];
    if (!['--source', '--semantic', '--output', '--check', '--summary', '--template-projection', '--reference-resolution', '--entry-patterns', '--scope-decisions', '--type-root-isolation'].includes(flag) || options[flag] || !args[position + 1] || args[position + 1].startsWith('--')) throw new Error(`Invalid or duplicate argument: ${flag}`);
    options[flag] = args[++position];
  }
  if (options['--template-projection'] && options['--template-projection'] !== 'project-v1') throw new Error('Unsupported template projection rule');
  if (options['--reference-resolution'] && options['--reference-resolution'] !== 'node-self') throw new Error('Unsupported reference resolution rule');
  if (options['--entry-patterns'] && options['--entry-patterns'] !== 'fixed-v1') throw new Error('Unsupported entry pattern rule');
  if (options['--scope-decisions'] && options['--scope-decisions'] !== 'fixed-v1') throw new Error('Unsupported scope decision rule');
  if (options['--type-root-isolation'] && !['consumer-v1', 'consumer-v2'].includes(options['--type-root-isolation'])) throw new Error('Unsupported type root isolation rule');
  if (!options['--source'] || !options['--semantic'] || Boolean(options['--output']) === Boolean(options['--check'])) throw new Error('Usage: --source <git> --semantic <graph> --output|--check <artifact> [--summary <json>]');
  return options;
}

export async function runPublicSurfaceCli(args, readers = {}) {
  const options = parsePublicSurfaceArgs(args);
  const expected = await buildPublicSurfaceFromSource({ sourceDir: options['--source'], semanticFile: options['--semantic'], templateProjection: options['--template-projection'] === 'project-v1', referenceResolution: options['--reference-resolution'] ?? null, entryPatterns: options['--entry-patterns'] ?? null, scopeDecisions: options['--scope-decisions'] ?? null, typeRootIsolation: options['--type-root-isolation'] ?? null }, readers);
  let validation = null;
  if (options['--check']) {
    validation = validatePublicSurface(readPublicSurface(options['--check']), expected);
    if (!validation.valid) throw new Error(`Public surface validation failed:\n${validation.failures.join('\n')}`);
  } else {
    fs.mkdirSync(path.dirname(path.resolve(options['--output'])), { recursive: true });
    writePublicSurface(options['--output'], expected);
  }
  const summary = { ...summarizePublicSurface(expected), sourceEvidence: { semanticArtifact: expected.sourceEvidence.semanticArtifact, semanticRebuilt: false, inputCount: expected.sourceEvidence.files.length, archiveCount: expected.sourceEvidence.archives.length }, ...(validation ? { validation } : {}) };
  if (options['--summary']) {
    fs.mkdirSync(path.dirname(path.resolve(options['--summary'])), { recursive: true });
    fs.writeFileSync(options['--summary'], serializeInventory(summary));
  }
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runPublicSurfaceCli(process.argv.slice(2)).then(summary => process.stdout.write(serializeInventory(summary))).catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
