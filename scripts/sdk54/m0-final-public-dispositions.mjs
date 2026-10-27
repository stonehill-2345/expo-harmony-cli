import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import ts from 'typescript';
import { enumeratePublicEntries } from './m0-public-entries.mjs';
import { projectPublicationFiles } from './m0-publication-policy.mjs';
import { createProjectSourceContext } from './m0-project-context.mjs';
import { createWorkspaceResolver } from './workspace-export-graph.mjs';
import { readDeclarationArchive } from './m0-archive.mjs';
import { parseFixedYarnLock } from './external-sources.mjs';

const revision = '5b42e3d21e0ac5e086752361ca8a5cb4de53bec1';
const tree = '5457e824b21d968e55c8f533cdf1751860160a92';
const fixedSurfaceSha256 = '76e245276c7fbbfd4b7607c033f5406475b35243196d947a1b9f47ba286b7d17';
const fixedSemanticSha256 = 'a9c1bd5892bfb4d5a5e671b0bf6f2092ce3ab4484bb6cafe4bc467c91a0206c3';
const fixedCensusSha256 = '42a1b8b584d042e29952f83a4f1b1c90fe49204a76cd41bfaa62f3658d3653e2';
const virtual = '/__sdk54_project__/';
const hash = value => createHash('sha256').update(value).digest('hex');
const unique = values => [...new Set(values)];
const sorted = values => unique(values).sort();
const logical = file => file.startsWith(virtual) ? file.slice(virtual.length) : file;
const code = file => /\.[cm]?[jt]sx?$/.test(file);
const counts = values => Object.fromEntries(sorted(values).map(value => [value, values.filter(item => item === value).length]));
const canonical = value => JSON.stringify(value, (_, child) => child && !Array.isArray(child) && typeof child === 'object' ? Object.fromEntries(Object.entries(child).sort(([left], [right]) => left.localeCompare(right))) : child);

function firstDifference(actual, expected, location = '$') {
  if (actual === expected) return null;
  if (!actual || !expected || typeof actual !== 'object' || typeof expected !== 'object' || Array.isArray(actual) !== Array.isArray(expected)) return location;
  const keys = Object.keys(expected).sort(), other = Object.keys(actual).sort();
  if (keys.length !== other.length || keys.some((key, index) => key !== other[index])) return location + '.keys';
  for (const key of keys) { const difference = firstDifference(actual[key], expected[key], `${location}.${key}`); if (difference) return difference; }
  return null;
}

const readJson = file => {
  const bytes = fs.readFileSync(file);
  return JSON.parse(file.endsWith('.gz') ? gunzipSync(bytes) : bytes);
};

export async function buildFinalPublicDispositions({ surface, files, treeEntries, projectContext = { configs: [] }, configArchives = [], locks = [] }) {
  assert(files instanceof Map, 'Fixed files map required');
  for (const table of ['entries', 'modules', 'candidateDispositions', 'exports', 'packages']) assert.equal(new Set(surface[table].map(row => row.id)).size, surface[table].length, `Duplicate original ${table} ID`);
  const byModule = new Map(surface.modules.map(row => [row.id, row]));
  const byPath = new Map(surface.modules.map(row => [row.source.path, row]));
  const roots = surface.packages.map(pkg => ({ ...pkg, directory: path.posix.dirname(pkg.sourcePath), manifest: JSON.parse(files.get(pkg.sourcePath)) })).sort((left, right) => right.directory.length - left.directory.length || left.id.localeCompare(right.id));
  const ownerFor = file => roots.find(pkg => file.startsWith(pkg.directory + '/'));
  const workspaceFiles = new Map([...files].filter(([file]) => !file.startsWith('__sdk54_config__/')));
  const project = createProjectSourceContext({ files: workspaceFiles, packages: surface.packages, entries: treeEntries, configArchives, locks, sourceProvenance: true });
  const configPaths = sorted([...(projectContext.configs ?? []).map(row => row.path), ...[...files.keys()].filter(file => path.posix.basename(file) === 'tsconfig.json')]);
  for (const file of configPaths) project.resolve('__m0_config_probe_missing__', path.posix.join(path.posix.dirname(file), '__m0_config_probe__.ts'));
  const parsedProjects = project.snapshot().configs;
  for (const config of projectContext.configs ?? []) for (const input of config.inputs ?? []) assert.equal(files.has(input.path) ? hash(files.get(input.path)) : null, input.sha256, `Project config input ${input.path}`);
  const parsedByPath = new Map(parsedProjects.map(config => [config.path, config]));
  const consumerConfigs = (surface.consumerTypeContexts?.contexts ?? []).map(context => {
    const config = context.config, parsed = parsedByPath.get(config.path);
    assert(config.inputs?.length && config.inputs.some(input => input.path === config.path), `Missing consumer config provenance ${config.path}`);
    assert(parsed && !parsed.errors.length, `Consumer config parse ${config.path}`);
    for (const input of config.inputs) assert.equal(files.has(input.path) ? hash(files.get(input.path)) : null, input.sha256, `Consumer config provenance ${input.path}`);
    const declaredInputs = new Map(config.inputs.map(input => [input.path, input.sha256]));
    for (const input of parsed.inputs) assert.equal(declaredInputs.get(input.path), input.sha256, `Consumer config inheritance provenance ${input.path}`);
    assert.equal(canonical(parsed.options), canonical(config.options), `Consumer config options ${config.path}`);
    return { id: context.id, path: config.path, inputs: config.inputs, parsedInputs: parsed.inputs, options: parsed.options, fileNames: parsed.fileNames, conclusion: 'FIXED_CONFIG_AND_INHERITANCE_REBUILT' };
  });
  const buildProjections = [], projectBoundaries = [];
  for (const config of parsedProjects) {
    if (config.errors.length || config.options.noEmit) {
      projectBoundaries.push({ path: config.path, kind: config.errors.length ? 'SOURCE_CONFIG_DIAGNOSTICS' : 'NO_EMIT_CONFIG', errors: config.errors });
      continue;
    }
    for (const absolute of config.fileNames) {
      const sourcePath = logical(absolute);
      if (!files.has(sourcePath) || !code(sourcePath) || /\.d\.[cm]?ts$/.test(sourcePath)) continue;
      const owner = ownerFor(sourcePath);
      if (!owner || owner.id !== ownerFor(config.path)?.id) continue;
      for (const emitted of ts.getOutputFileNames(config, absolute, false)) {
        const outputPath = logical(emitted);
        if (outputPath === sourcePath || !outputPath.startsWith(owner.directory + '/')) continue;
        buildProjections.push({ sourcePath, sourceSha256: hash(files.get(sourcePath)), outputPath, packageId: owner.id, config: config.path, configInputs: config.inputs, configOptions: config.options, method: 'TYPESCRIPT_GET_OUTPUT_FILE_NAMES', buildExecuted: false });
      }
    }
  }
  for (const [mapPath, mapText] of files) {
    if (!/\.[cm]?[jt]sx?\.map$/.test(mapPath)) continue;
    const outputPath = mapPath.slice(0, -4);
    if (!files.has(outputPath) || !code(outputPath)) continue;
    let map;
    try { map = JSON.parse(mapText); } catch { projectBoundaries.push({ path: mapPath, kind: 'INVALID_FIXED_SOURCE_MAP' }); continue; }
    if (map.version !== 3 || map.sources?.length !== 1 || typeof map.sources[0] !== 'string') {
      projectBoundaries.push({ path: mapPath, kind: 'BUNDLED_OR_UNSUPPORTED_SOURCE_MAP_NOT_A_PUBLIC_MODULE_PROJECTION' });
      continue;
    }
    const sourceRoot = map.sourceRoot ?? '', request = map.sources[0];
    if (typeof sourceRoot !== 'string' || [sourceRoot, request].some(value => /^(?:[A-Za-z][A-Za-z\d+.-]*:|\/)/.test(value))) {
      projectBoundaries.push({ path: mapPath, kind: 'SOURCE_MAP_URL_OR_ABSOLUTE_SOURCE_CONTEXT' }); continue;
    }
    const sourcePath = path.posix.normalize(path.posix.join(path.posix.dirname(mapPath), sourceRoot, request));
    const owner = ownerFor(sourcePath);
    if (!byPath.has(sourcePath) || !files.has(sourcePath) || !owner || owner.id !== ownerFor(outputPath)?.id) continue;
    const embedded = typeof map.sourcesContent?.[0] === 'string';
    if (embedded && map.sourcesContent[0] !== files.get(sourcePath)) {
      projectBoundaries.push({ path: mapPath, sourcePath, kind: 'FIXED_SOURCE_MAP_EMBEDDED_SOURCE_MISMATCH' }); continue;
    }
    if (typeof map.file === 'string' && path.posix.basename(map.file) !== path.posix.basename(outputPath)) {
      projectBoundaries.push({ path: mapPath, kind: 'FIXED_SOURCE_MAP_OUTPUT_NAME_MISMATCH' }); continue;
    }
    buildProjections.push({ sourcePath, sourceSha256: hash(files.get(sourcePath)), outputPath, outputSha256: hash(files.get(outputPath)), packageId: owner.id, method: 'ACTUAL_FIXED_ONE_SOURCE_MAP', mapPath, mapSha256: hash(mapText), embeddedSourceAccepted: embedded, buildExecuted: false, runtimeEquivalenceAccepted: false });
  }
  const rebuilt = enumeratePublicEntries({ packages: surface.packages, treeEntries, modules: surface.modules, files, projectContext: { configs: parsedProjects }, patternCoverage: true });
  const publication = await projectPublicationFiles({ packages: surface.packages, treeEntries, files });
  const publishedByPackage = new Map(publication.map(row => [row.packageId, new Set(row.files)]));
  const publicationByPackage = new Map(publication.map(row => [row.packageId, row]));
  const entriesById = new Map(rebuilt.entries.map(row => [row.id, row]));
  const entryModuleIds = entry => sorted([entry.target.moduleId, ...(entry.target.projectionCandidates ?? []).map(row => row.moduleId)].filter(Boolean));
  const entriesByModule = new Map(), allowedPaths = new Map();
  for (const entry of rebuilt.entries) {
    if (entry.target.status === 'BLOCKED') continue;
    for (const id of entryModuleIds(entry)) {
      if (!entriesByModule.has(id)) entriesByModule.set(id, []);
      entriesByModule.get(id).push(entry.id);
    }
    if (entry.exportKey !== null && entry.exportKey !== undefined && entry.target.requestedPath) {
      if (!allowedPaths.has(entry.packageId)) allowedPaths.set(entry.packageId, new Set());
      allowedPaths.get(entry.packageId).add(entry.target.requestedPath);
    }
  }
  const projectionBySource = new Map();
  for (const projection of buildProjections) {
    if (!projectionBySource.has(projection.sourcePath)) projectionBySource.set(projection.sourcePath, []);
    projectionBySource.get(projection.sourcePath).push(projection);
  }
  const exportsByModule = new Map();
  for (const row of surface.exports) {
    assert(byModule.has(row.moduleId), `Export module ${row.id}`);
    if (!exportsByModule.has(row.moduleId)) exportsByModule.set(row.moduleId, []);
    exportsByModule.get(row.moduleId).push(row.id);
  }
  const sourceFacts = [], dependencies = [];
  const workspace = createWorkspaceResolver({ files, packages: surface.packages });
  for (const module of surface.modules) {
    const file = module.source.path, text = files.get(file);
    assert.equal(typeof text, 'string', `Module source unavailable ${file}`);
    assert.equal(hash(text), module.source.sha256, `Module source sha256 ${file}`);
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true), imports = [], exportSyntax = [], dynamicDependencyBoundaries = [];
    const fact = node => ({ start: node.getStart(ast), end: node.end, line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1, text: node.getText(ast), sha256: hash(node.getText(ast)) });
    function visit(node) {
      const importNode = ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) ? node.argument.literal
        : (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ? node.moduleSpecifier
        : ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) ? node.moduleReference.expression
          : ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require') ? node.arguments[0] : null;
      if (importNode && ts.isStringLiteralLike(importNode)) imports.push({ request: importNode.text, kind: ts.SyntaxKind[node.kind], typeOnly: ts.isImportTypeNode(node) || !!node.isTypeOnly || !!node.importClause?.isTypeOnly, source: fact(node) });
      else if (importNode) dynamicDependencyBoundaries.push({ kind: 'NON_LITERAL_MODULE_REQUEST', source: fact(node) });
      if (ts.isExportDeclaration(node) || ts.isExportAssignment(node) || node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) exportSyntax.push({ kind: ts.SyntaxKind[node.kind], source: fact(node) });
      ts.forEachChild(node, visit);
    }
    visit(ast);
    for (const [index, imported] of imports.entries()) {
      const projected = project.resolve(imported.request, file), raw = projected.status === 'unresolved' ? workspace(imported.request, file) : projected;
      const witnesses = [];
      for (const candidate of [raw, ...(raw.alternatives ?? []), ...(raw.candidates ?? [])]) {
        const target = candidate.path && byPath.get(candidate.path);
        if (!target || candidate.unsafe || candidate.status && !['source', 'source-resource', 'project-platform-boundary'].includes(candidate.status)) continue;
        let buildProjectionWitnesses = [];
        if (candidate.method === 'build-to-source') {
          const owner = roots.find(pkg => pkg.id === raw.packageId) ?? ownerFor(candidate.path), request = candidate.request ?? raw.request ?? imported.request;
          if (owner && typeof request === 'string') {
            const output = imported.request.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(file), imported.request)) : path.posix.join(owner.directory, request);
            const possibleOutputs = new Set([output, output + '.js', output + '.d.ts', output + '/index.js', output + '/index.d.ts']);
            buildProjectionWitnesses = (projectionBySource.get(candidate.path) ?? []).filter(row => possibleOutputs.has(row.outputPath)).map(row => ({ method: row.method, ...(row.config ? { config: row.config } : { mapPath: row.mapPath }), outputPath: row.outputPath }));
          }
          if (!buildProjectionWitnesses.length) continue;
        }
        witnesses.push({ moduleId: target.id, sourcePath: candidate.path, method: candidate.method ?? candidate.selection ?? raw.selection ?? null, condition: candidate.condition ?? null, buildProjectionWitnesses });
      }
      const targetModuleIds = sorted(witnesses.map(witness => witness.moduleId));
      const unverifiedGuess = raw.method === 'build-to-source' && !targetModuleIds.length;
      const result = unverifiedGuess ? { ...raw, status: 'UNVERIFIED_BUILD_TO_SOURCE_GUESS', candidatePath: raw.path, path: null, boundary: 'Legacy directory projection has no parsed TypeScript output witness; retain source context without a consumption edge' } : raw;
      dependencies.push({ id: `PUBLIC-DEPENDENCY:${encodeURIComponent(module.id)}:${index}`, fromModuleId: module.id, toModuleId: targetModuleIds[0] ?? null, targetModuleIds, fixedSourceTargetWitnesses: witnesses, runtimeSelectionAccepted: false, request: imported.request, typeOnly: imported.typeOnly, source: { path: file, ...imported.source }, resolution: result, conclusion: targetModuleIds.length ? 'FIXED_WORKSPACE_SOURCE_CONSUMPTION_CANDIDATES' : 'EXTERNAL_OR_RESOURCE_OR_UNRESOLVED_CONTEXT_RETAINED' });
    }
    sourceFacts.push({ id: 'PUBLIC-SOURCE-FACT:' + encodeURIComponent(module.id), moduleId: module.id, path: file, sha256: hash(text), imports, exportSyntax, dynamicDependencyBoundaries, parseDiagnostics: ast.parseDiagnostics.map(diagnostic => ({ code: diagnostic.code, start: diagnostic.start, message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n') })), originalBoundaries: module.boundaries, originalDiagnostics: module.diagnostics });
  }
  const modules = surface.modules.map(module => {
    const owner = ownerFor(module.source.path), policy = owner && publicationByPackage.get(owner.id), published = owner && publishedByPackage.get(owner.id);
    const explicitEntryIds = sorted(entriesByModule.get(module.id) ?? []);
    const projections = projectionBySource.get(module.source.path) ?? [];
    const publishedPaths = sorted([...(published?.has(module.source.path) ? [module.source.path] : []), ...projections.filter(row => code(row.outputPath) && published?.has(row.outputPath)).map(row => row.outputPath)]);
    const allowedPublishedPaths = publishedPaths.filter(file => !Object.hasOwn(owner.manifest, 'exports') || allowedPaths.get(owner.id)?.has(file));
    const disposition = explicitEntryIds.length ? 'PUBLIC_EXPLICIT_ENTRY_SOURCE'
      : allowedPublishedPaths.includes(module.source.path) ? 'PUBLIC_PUBLISHED_DEEP_IMPORT_SOURCE'
        : allowedPublishedPaths.length ? 'PUBLIC_BUILD_SOURCE_PROJECTION'
          : publishedPaths.length && Object.hasOwn(owner.manifest, 'exports') ? 'EXPORTS_ENCAPSULATED_IMPLEMENTATION_CONTEXT'
            : owner ? 'UNPUBLISHED_IMPLEMENTATION_CONTEXT' : 'OUTSIDE_WORKSPACE_IMPLEMENTATION_CONTEXT';
    return { id: module.id, source: module.source, sourceFactId: 'PUBLIC-SOURCE-FACT:' + encodeURIComponent(module.id), packageId: owner?.id ?? null, disposition, explicitEntryIds, exportIds: sorted(exportsByModule.get(module.id) ?? []),
      publication: { manifestPath: owner?.sourcePath ?? null, manifestSha256: owner ? hash(files.get(owner.sourcePath)) : null, privateManifest: !!owner?.manifest.private, hasExports: !!owner && Object.hasOwn(owner.manifest, 'exports'), exportsRule: owner?.manifest.exports ?? null, policyInputs: policy?.policyInputs ?? [], policyBoundaries: policy?.boundaries ?? [], publishedPaths, allowedPublishedPaths, buildProjections: projections },
      publicConsumerModuleIds: [], harmonySupportAccepted: false };
  });
  const publicModules = new Set(modules.filter(row => row.disposition.startsWith('PUBLIC_')).map(row => row.id));
  const outgoing = new Map();
  for (const dependency of dependencies) if (dependency.targetModuleIds.length) {
    if (!outgoing.has(dependency.fromModuleId)) outgoing.set(dependency.fromModuleId, []);
    outgoing.get(dependency.fromModuleId).push(...dependency.targetModuleIds);
  }
  const publicConsumers = new Map();
  for (const root of publicModules) {
    const seen = new Set([root]), queue = [root];
    for (let cursor = 0; cursor < queue.length; cursor++) for (const target of outgoing.get(queue[cursor]) ?? []) if (!seen.has(target)) {
      seen.add(target); queue.push(target);
      if (!publicConsumers.has(target)) publicConsumers.set(target, []);
      publicConsumers.get(target).push(root);
    }
  }
  for (const module of modules) module.publicConsumerModuleIds = sorted(publicConsumers.get(module.id) ?? []);
  const finalByModule = new Map(modules.map(row => [row.id, row]));
  const entries = surface.entries.map(original => {
    const entry = entriesById.get(original.id);
    assert(entry, `Original public entry absent from source rebuild ${original.id}`);
    const policy = publicationByPackage.get(entry.packageId), published = publishedByPackage.get(entry.packageId);
    const finiteChildren = entry.patternFamily ? rebuilt.entries.filter(child => !child.patternFamily && child.packageId === entry.packageId && child.exportKey === entry.exportKey && child.condition === entry.condition).map(child => child.id).sort() : [];
    const disposition = entry.target.status === 'DISABLED' ? 'EXPLICIT_EXPORT_DENIAL_RULE'
      : entry.patternFamily ? 'FINITE_EXPORT_PATTERN_RULE'
      : entry.target.status === 'BLOCKED' ? 'FIXED_DECLARED_ENTRY_SOURCE_DEFECT'
        : published?.has(entry.target.requestedPath) || published?.has(entry.target.path) ? 'FIXED_SOURCE_ENTRY_PACKLISTED'
          : 'DECLARED_ENTRY_SOURCE_PROJECTION_NOT_PRESENT_IN_FIXED_PACKLIST';
    const requested = entry.target.requestedPath, root = roots.find(pkg => pkg.id === entry.packageId);
    const targetAbsence = disposition === 'FIXED_DECLARED_ENTRY_SOURCE_DEFECT' ? {
      requestedPath: requested, requestedPathPresent: treeEntries.some(row => row.path === requested),
      fixedPackageRootFiles: treeEntries.filter(row => path.posix.dirname(row.path) === root.directory).map(row => ({ path: row.path, mode: row.mode, blob: row.oid ?? null })),
      conclusion: 'FIXED_TREE_AND_REAL_ENTRY_RESOLVER_CONFIRM_TARGET_ABSENT',
    } : null;
    return { id: original.id, packageId: original.packageId, request: original.request, original, rebuilt: entry, disposition, moduleIds: entryModuleIds(entry), finiteChildEntryIds: finiteChildren, policyInputs: policy?.policyInputs ?? [], targetAbsence,
      followup: ['FIXED_DECLARED_ENTRY_SOURCE_DEFECT', 'DECLARED_ENTRY_SOURCE_PROJECTION_NOT_PRESENT_IN_FIXED_PACKLIST'].includes(disposition) ? { phase: 'M1/M7', issue: `Resolve and build declared package entry ${entry.request}: ${entry.target.reason ?? 'declared source mapping is not a fixed-tree publication artifact'}`, sourceInvestigationAccepted: true, runtimeAccepted: false } : null, harmonySupportAccepted: false };
  });
  const candidateDispositions = surface.candidateDispositions.map(candidate => {
    const module = finalByModule.get(candidate.moduleId);
    assert(module, `Original candidate module missing ${candidate.id}`);
    assert.equal(candidate.source.path, module.source.path);
    assert.equal(candidate.source.sha256, module.source.sha256);
    return { ...candidate, originalDisposition: candidate.disposition, disposition: module.disposition, moduleDispositionId: module.id, entryIds: module.explicitEntryIds, exportIds: module.exportIds, sourceInvestigationAccepted: true, harmonySupportAccepted: false };
  });
  const declarationById = new Map((surface.declarations ?? []).map(row => [row.id, row]));
  const exportDeclarationIds = new Set(surface.exports.flatMap(row => row.declarationIds));
  const exportDeclarationSources = [...exportDeclarationIds].sort().map(id => {
    const declaration = declarationById.get(id);
    assert(declaration, `Export declaration source ${id}`);
    const text = files.get(declaration.path);
    assert.equal(typeof text, 'string', `Export declaration text ${id}`);
    assert.equal(hash(text), declaration.sha256, `Export declaration file ${id}`);
    assert.equal(hash(text.slice(declaration.start, declaration.end)), declaration.sliceSha256, `Export declaration slice ${id}`);
    return { ...declaration, text: text.slice(declaration.start, declaration.end) };
  });
  const exports = surface.exports.map(original => {
    const module = finalByModule.get(original.moduleId);
    return { ...original, originalDisposition: original.disposition, disposition: publicModules.has(original.moduleId) ? 'PUBLIC_MODULE_EXPORT' : 'IMPLEMENTATION_MODULE_EXPORT',
      moduleDispositionId: module.id, sourceFactId: module.sourceFactId, source: module.source, effectiveEntryIds: sorted([...module.explicitEntryIds, ...(original.entryIds ?? [])]),
      declarationSourceIds: original.declarationIds, sourceInvestigationAccepted: true, harmonySupportAccepted: false };
  });
  return { schemaVersion: 1, source: { revision, tree }, policy: 'Every original ID retained; actual npm-packlist, exports selection, parsed TypeScript output paths and fixed import consumption determine source scope. Private flags and directory names do not exclude public modules. Source projections do not accept built, published, installed or Harmony runtime behavior.',
    entries, additionalEntries: rebuilt.entries.filter(row => !surface.entries.some(original => original.id === row.id)), modules, candidateDispositions, exports, exportDeclarationSources, sourceFacts, dependencies, publication, projectConfigs: parsedProjects, projectBoundaries, consumerConfigs,
    summary: { entries: entries.length, modules: modules.length, candidateDispositions: candidateDispositions.length, exports: exports.length, sourceFacts: sourceFacts.length, exportDeclarations: exportDeclarationSources.length, dependencies: dependencies.length, entryDispositions: counts(entries.map(row => row.disposition)), moduleDispositions: counts(modules.map(row => row.disposition)), exportDispositions: counts(exports.map(row => row.disposition)), sourceInvestigationAccepted: true, harmonySupportAccepted: false },
    independentReviewAccepted: false, stageClosable: false };
}

export async function validateFinalPublicDispositions(actual, input) {
  const expected = await buildFinalPublicDispositions(input), difference = firstDifference(actual, expected);
  return difference ? { valid: false, diagnostic: `Fixed-source public disposition mismatch at ${difference}` } : { valid: true };
}

function readTable(file, index, name) {
  const table = index.tables[name], result = [], shards = new Set();
  for (const shard of table.shards) {
    assert(/^[a-f0-9]{64}\.json\.gz$/.test(shard.path) && shard.path === shard.sha256 + '.json.gz' && !shards.has(shard.path), `Table shard identity ${name}`);
    shards.add(shard.path);
    const bytes = fs.readFileSync(path.join(file + '.parts', shard.path));
    assert.equal(hash(bytes), shard.sha256, `Table shard sha256 ${name}`);
    const rows = JSON.parse(gunzipSync(bytes));
    assert.equal(rows.length, shard.count); assert.equal(rows[0]?.id, shard.firstId); assert.equal(rows.at(-1)?.id, shard.lastId);
    result.push(...rows);
  }
  assert.equal(result.length, table.count); assert.equal(new Set(result.map(row => row.id)).size, result.length);
  return result;
}

function readFixedGit(sourceDir, selected) {
  const git = (args, options = {}) => execFileSync('git', ['-C', sourceDir, ...args], { env: { ...process.env, GIT_NO_LAZY_FETCH: '1' }, maxBuffer: 128 * 1024 * 1024, ...options });
  assert.equal(git(['rev-parse', `${revision}^{tree}`]).toString().trim(), tree);
  const treeEntries = git(['ls-tree', '-r', '-z', '--full-tree', revision]).toString().split('\0').filter(Boolean).map(row => {
    const split = row.indexOf('\t'), [mode, type, oid] = row.slice(0, split).split(' ');
    return { path: row.slice(split + 1), mode, type, oid };
  });
  const actual = new Map(treeEntries.map(entry => [entry.path, entry]));
  const files = new Map(), receipts = [];
  for (let offset = 0; offset < selected.length; offset += 100) {
    const batch = selected.slice(offset, offset + 100);
    for (const row of batch) { assert.equal(actual.get(row.path)?.oid, row.blob, `Fixed Git blob ${row.path}`); assert.notEqual(actual.get(row.path)?.mode, '120000'); }
    const bytes = git(['cat-file', '--batch'], { input: batch.map(row => row.blob).join('\n') + '\n' });
    let cursor = 0;
    for (const row of batch) {
      const newline = bytes.indexOf(10, cursor), [oid, kind, sizeText] = bytes.subarray(cursor, newline).toString().split(' '), size = Number(sizeText);
      assert.equal(oid, row.blob); assert.equal(kind, 'blob'); assert(Number.isSafeInteger(size));
      cursor = newline + 1; const content = bytes.subarray(cursor, cursor + size);
      assert.equal(hash(content), row.sha256, `Fixed Git bytes ${row.path}`); assert.equal(bytes[cursor + size], 10);
      files.set(row.path, content.toString()); receipts.push(row); cursor += size + 1;
    }
    assert.equal(cursor, bytes.length);
  }
  return { files, treeEntries, receipts };
}

export function loadFinalPublicDispositionInputs({ repo, sourceDir = '/tmp/sdk54-expo-source' }) {
  const surfacePath = path.join(repo, 'outputs/sdk54/ai-e2e/20261027-m0-consumer-sources/public-surface.json'), surfaceBytes = fs.readFileSync(surfacePath), index = JSON.parse(surfaceBytes);
  assert.equal(hash(surfaceBytes), fixedSurfaceSha256, 'Original public-surface census identity');
  const surface = { ...index.metadata };
  for (const table of ['entries', 'modules', 'candidateDispositions', 'exports', 'packages']) surface[table] = readTable(surfacePath, index, table);
  const declarationIds = new Set(surface.exports.flatMap(row => row.declarationIds));
  surface.declarations = readTable(surfacePath, index, 'declarations').filter(row => declarationIds.has(row.id));
  const semanticPath = index.metadata.sourceEvidence.semanticArtifact.path, semanticBytes = fs.readFileSync(semanticPath);
  assert.equal(hash(semanticBytes), fixedSemanticSha256, 'Original semantic identity');
  assert.equal(hash(semanticBytes), index.metadata.sourceEvidence.semanticArtifact.sha256);
  const semantic = JSON.parse(semanticPath.endsWith('.gz') ? gunzipSync(semanticBytes) : semanticBytes), projectContext = semantic.graph.projectContext;
  assert.equal(semantic.graph.source.revision, revision); assert.equal(semantic.graph.source.tree, tree);
  const censusPath = path.join(repo, 'outputs/sdk54/ai-e2e/20261027-m0-source-census/source-census.json'), census = JSON.parse(fs.readFileSync(censusPath));
  assert.equal(hash(fs.readFileSync(censusPath)), fixedCensusSha256, 'Original fixed-tree census identity');
  const selected = census.metadata.fixedSourceInputs.filter(row => code(row.path) || row.path.endsWith('.json') || /\.[cm]?[jt]sx?\.map$/.test(row.path) || /(?:^|\/)(?:\.npmignore|\.gitignore|yarn\.lock)$/.test(row.path));
  const loaded = readFixedGit(sourceDir, selected), archives = [], configArchives = [];
  const configInputs = [...projectContext.configs.flatMap(config => config.inputs ?? []), ...(surface.consumerTypeContexts?.contexts ?? []).flatMap(context => context.config.inputs)];
  const archiveRequests = new Map();
  for (const input of configInputs) if (input.archive) archiveRequests.set(input.archive.path, { ...input, config: true });
  for (const declaration of surface.declarations) if (!loaded.files.has(declaration.path)) {
    const archive = (semantic.graph.externalContext?.archives ?? []).find(record => declaration.path.startsWith(`__sdk54_external__/${record.identity.name.replaceAll('/', '+')}@${record.identity.version}/`));
    assert(archive, `External export source archive ${declaration.path}`);
    if (!archiveRequests.has(archive.archive.path)) archiveRequests.set(archive.archive.path, { ...archive, config: false });
  }
  for (const record of archiveRequests.values()) {
    const archivePath = path.resolve(repo, record.archive.path), archive = readDeclarationArchive(archivePath, record.identity, { includeConfigJson: !!record.config });
    assert.equal(archive.archive.sha256, record.archive.sha256, `Fixed archive bytes ${record.archive.path}`);
    const prefix = `${record.config ? '__sdk54_config__' : '__sdk54_external__'}/${record.identity.name.replaceAll('/', '+')}@${record.identity.version}/`;
    for (const [file, text] of archive.files) loaded.files.set(prefix + file, text);
    archives.push({ identity: record.identity, path: record.archive.path, sha256: archive.archive.sha256 });
    if (record.config) configArchives.push({ ...archive, archive: { ...archive.archive, path: record.archive.path } });
  }
  return { surface, files: loaded.files, treeEntries: loaded.treeEntries, projectContext, configArchives, locks: parseFixedYarnLock(loaded.files.get('yarn.lock')),
    evidence: { inputs: [{ path: path.relative(repo, surfacePath), sha256: hash(fs.readFileSync(surfacePath)) }, { path: path.relative(repo, semanticPath), sha256: hash(semanticBytes) }, { path: path.relative(repo, censusPath), sha256: hash(fs.readFileSync(censusPath)) }], sourceReceipts: loaded.receipts, archives } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), output = path.join(repo, 'outputs/sdk54/ai-e2e/20261027-m0-final-closure');
  const args = process.argv.slice(2), options = {};
  for (let index = 0; index < args.length; index += 2) { assert(['--source', '--check'].includes(args[index]) && args[index + 1], 'Expected --source/--check value'); options[args[index]] = args[index + 1]; }
  const input = loadFinalPublicDispositionInputs({ repo, sourceDir: options['--source'] });
  const report = await buildFinalPublicDispositions(input);
  report.evidence = input.evidence;
  if (options['--check']) {
    const difference = firstDifference(readJson(options['--check']), report);
    console.log(JSON.stringify(difference ? { valid: false, diagnostic: `Fixed-source public disposition mismatch at ${difference}` } : { valid: true }));
    process.exit(difference ? 1 : 0);
  }
  const bytes = JSON.stringify(report, null, 2) + '\n';
  fs.writeFileSync(path.join(output, 'public-dispositions.json'), bytes);
  const lines = ['# M0 公开范围逐 ID 来源裁决', '', `原入口 ${report.summary.entries}，模块/候选 ${report.summary.modules}/${report.summary.candidateDispositions}，导出 ${report.summary.exports}；全部原 ID 保留。`, '', '按固定源码实际 npm-packlist、exports 优先级、真实 TypeScript 构建配置和源码消费关系裁决。未发行源码保留实现上下文；private 标志及目录名不作为排除条件；来源裁决不等于 Harmony、真实构建、发行包或设备验收。', '', '| 模块结论 | 数量 |', '| --- | ---: |', ...Object.entries(report.summary.moduleDispositions).map(([kind, count]) => `| ${kind} | ${count} |`), '', '具体入口、模块、候选、导出、参数来源和后续任务见同名 JSON。M0 总关闭待独立终审。'];
  fs.writeFileSync(path.join(output, 'public-dispositions.md'), lines.join('\n') + '\n');
  console.log(JSON.stringify({ ...report.summary, sha256: hash(bytes) }));
}
