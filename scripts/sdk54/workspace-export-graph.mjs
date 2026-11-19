import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import ts from 'typescript';
import { SDK54_EXPO_COMMIT } from './catalog.mjs';
import { buildSourceInventory, readSourceTree, readSourceBlobs, serializeInventory } from './source-inventory.mjs';
import { selectWorkspaceSources } from './workspace-surface.mjs';

const virtual = '/__sdk54_exports__/';
const hash = data => createHash('sha256').update(data).digest('hex');
const code = file => /\.[cm]?[jt]sx?$/.test(file);
const key = value => String(value).replaceAll('~', '~0').replaceAll('/', '~1');
const literal = node => node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
const commonjsTarget = node => {
  if (ts.isIdentifier(node)) return node.text === 'exports';
  if (ts.isPropertyAccessExpression(node)) return node.expression.getText() === 'module' && node.name.text === 'exports' || commonjsTarget(node.expression);
  if (ts.isElementAccessExpression(node)) return node.expression.getText() === 'module' && literal(node.argumentExpression) === 'exports' || commonjsTarget(node.expression);
  return false;
};
export const serializeExportGraph = value => serializeInventory(value).replaceAll('/', '\\/');

export function createWorkspaceResolver({ files, packages }) {
  const roots = packages.map(pkg => ({ ...pkg, directory: path.posix.dirname(pkg.sourcePath), manifest: JSON.parse(String(files.get(pkg.sourcePath))) })).sort((a, b) => b.directory.length - a.directory.length);
  const owner = file => roots.find(pkg => file.startsWith(pkg.directory + '/'));
  const lookup = value => {
    if (files.has(value)) return { status: 'source', path: value, method: 'exact' };
    const stem = value.replace(/(?:\.d)?\.[cm]?[jt]sx?$/, '').replace(/\.d$/, '');
    for (const candidate of [...['.ts', '.tsx', '.mts', '.cts', '.d.ts', '.js', '.jsx', '.mjs', '.cjs', '.json'].map(ext => stem + ext), ...['index.ts', 'index.tsx', 'index.d.ts', 'index.js'].map(name => value + '/' + name)]) if (files.has(candidate)) return { status: 'source', path: candidate, method: 'source-extension-or-index' };
    const candidates = ['native', 'ios', 'android', 'web', 'server'].flatMap(platform => ['.ts', '.tsx', '.js', '.jsx'].map(ext => `${stem}.${platform}${ext}`)).filter(file => files.has(file));
    return candidates.length ? { status: 'platform-dependent', candidates } : { status: 'missing' };
  };
  const local = (request, from) => {
    const value = path.posix.normalize(path.posix.join(path.posix.dirname(from), request));
    if (value.startsWith('../') || value.startsWith('/')) return { status: 'outside-source' };
    const projected = value.replace(/\/build(?=\/|$)/, '/src').replace(/\/src\/(?:src|mjs|cjs)(?=\/|$)/, '/src');
    const result = projected !== value ? lookup(projected) : null;
    if (result?.status === 'source') return { ...result, method: 'build-to-source' };
    if (/\/build\/bin\//.test(value)) { const bin = lookup(value.replace('/build/bin/', '/bin/')); if (bin.status === 'source') return { ...bin, method: 'build-bin-to-source' }; }
    const direct = lookup(value);
    return direct.status === 'missing' && result ? result : direct;
  };
  const leaves = (value, pointer = '', wildcard = '') => {
    if (typeof value === 'string') return [{ request: value.replaceAll('*', wildcard), condition: pointer }];
    if (value === null || value === false || value === undefined) return [];
    if (Array.isArray(value)) return value.flatMap((child, index) => leaves(child, `${pointer}/${index}`, wildcard));
    return Object.entries(value).sort(([a], [b]) => {
      const order = ['types', 'source', 'default', 'import', 'require', 'react-native', 'browser'];
      const rank = x => order.includes(x) ? order.indexOf(x) : order.length;
      return rank(a) - rank(b) || a.localeCompare(b);
    }).flatMap(([condition, child]) => leaves(child, `${pointer}/${condition}`, wildcard));
  };
  const resolveRaw = (request, from) => {
    if (request.startsWith('.')) return { kind: 'relative', ...local(request, from) };
    if (request.startsWith('/') || request.includes('\\')) return { kind: 'invalid', status: 'outside-source' };
    const name = request.startsWith('@') ? request.split('/').slice(0, 2).join('/') : request.split('/')[0];
    const pkg = roots.find(root => root.name === name);
    if (!pkg) return { kind: 'external', status: 'external', name, request };
    if (request.slice(name.length).split('/').some(segment => segment === '.' || segment === '..')) return { kind: 'workspace', status: 'invalid-subpath', packageId: pkg.id };
    const consumer = owner(from), specs = ['dependencies', 'peerDependencies', 'devDependencies', 'optionalDependencies'].map(section => consumer?.manifest[section]?.[name]).filter(spec => spec !== undefined);
    if (specs.some(spec => String(spec).startsWith('npm:'))) return { kind: 'workspace', status: 'alias-boundary', packageId: pkg.id, specs };
    const subpath = request.slice(name.length).replace(/^\//, ''), exportKey = subpath ? './' + subpath : '.';
    let candidates = [], manifestPointer;
    if (pkg.manifest.exports !== undefined) {
      const exports = pkg.manifest.exports;
      const entries = typeof exports === 'object' && exports !== null && !Array.isArray(exports) && Object.keys(exports).some(k => k.startsWith('.')) ? exports : { '.': exports };
      if (Object.hasOwn(entries, exportKey)) { candidates = leaves(entries[exportKey]); manifestPointer = `/exports/${key(exportKey)}`; }
      else {
        const patterns = Object.keys(entries).filter(pattern => pattern.includes('*')).filter(pattern => {
          const [prefix, suffix] = pattern.split('*'); return exportKey.startsWith(prefix) && exportKey.endsWith(suffix) && exportKey.length >= prefix.length + suffix.length;
        }).sort((a, b) => b.indexOf('*') - a.indexOf('*') || b.length - a.length || a.localeCompare(b));
        if (patterns.length) { const pattern = patterns[0], [prefix, suffix] = pattern.split('*'); candidates = leaves(entries[pattern], '', exportKey.slice(prefix.length, suffix.length ? -suffix.length : undefined)); manifestPointer = `/exports/${key(pattern)}`; }
      }
      if (!candidates.length) return { kind: 'workspace', status: 'not-exported', packageId: pkg.id, exportKey };
    } else if (subpath) { candidates = [{ request: './' + subpath, condition: '/deep-source' }]; manifestPointer = '/implicit-deep-source'; }
    else {
      for (const field of ['types', 'typings', 'source', 'main', 'module']) if (typeof pkg.manifest[field] === 'string') candidates.push({ request: pkg.manifest[field], condition: '/' + field });
      if (!candidates.length) candidates = [{ request: './index', condition: '/implicit-index' }];
      manifestPointer = '/entry-fields';
    }
    const alternatives = candidates.map(candidate => ({ ...candidate, ...(pkg.manifest.exports !== undefined && (!candidate.request.startsWith('./') || candidate.request.split('/').slice(1).some(segment => ['..', '.', 'node_modules'].includes(segment))) ? { status: 'invalid-export-target' } : local(candidate.request.startsWith('.') ? candidate.request : './' + candidate.request, pkg.sourcePath)) }));
    const selected = alternatives.find(candidate => candidate.status === 'source') ?? alternatives[0];
    return { kind: 'workspace', packageId: pkg.id, ...selected, manifest: { path: pkg.sourcePath, pointer: manifestPointer }, alternatives,
      policy: 'fixed-source-types-projection', requestedSpecs: specs, versionCompatibility: 'NOT_VERIFIED' };
  };
  const wrapperCache = new Map(), resolutionCache = new Map();
  function pureWrapper(file) {
    if (wrapperCache.has(file)) return wrapperCache.get(file);
    let request = null;
    if (/\.[cm]?js$/.test(file)) {
      const source = ts.createSourceFile(file, String(files.get(file)), ts.ScriptTarget.Latest, true);
      const expression = source.statements.length === 1 && ts.isExpressionStatement(source.statements[0]) ? source.statements[0].expression : null;
      if (!source.parseDiagnostics.length && expression && ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.EqualsToken && expression.left.getText(source) === 'module.exports' && ts.isCallExpression(expression.right) && expression.right.expression.getText(source) === 'require' && expression.right.arguments.length === 1) request = literal(expression.right.arguments[0]);
    }
    wrapperCache.set(file, request); return request;
  }
  return (request, from) => {
    const cacheKey = `${from}\0${request}`;
    if (resolutionCache.has(cacheKey)) return resolutionCache.get(cacheKey);
    let result = resolveRaw(request, from);
    const visited = new Set(), sourceWrappers = [];
    while (result.status === 'source' && result.path) {
      if (visited.has(result.path)) { result = { ...result, status: 'wrapper-cycle' }; break; }
      visited.add(result.path);
      const forwarded = pureWrapper(result.path); if (forwarded === null) break;
      const wrapper = result.path, next = resolveRaw(forwarded, wrapper);
      sourceWrappers.push({ path: wrapper, request: forwarded, targetPath: next.path ?? null, targetStatus: next.status });
      result = { ...next, requestedPackageId: result.packageId ?? result.requestedPackageId ?? null };
    }
    const final = sourceWrappers.length ? { ...result, sourceWrappers, method: 'pure-commonjs-source-projection', runtimeEquivalence: 'NOT_VERIFIED' } : result;
    resolutionCache.set(cacheKey, final); return final;
  };
}

export function indexWorkspaceExports({ files, packages }) {
  const resolve = createWorkspaceResolver({ files, packages });
  const sources = new Map(), templateFiles = new Set();
  for (const [file, buffer] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    if (!code(file) && !file.endsWith('.json')) continue;
    const text = String(buffer), projected = text.replace(/<%[-=]\s*project\.([A-Za-z_]\w*)\s*%>/g, (token, name) => { templateFiles.add(file); return `Template_${name}`.padEnd(token.length, '_'); });
    if (projected.length !== text.length) throw new Error(`Template projection changed positions ${file}`);
    sources.set(virtual + file, ts.createSourceFile(virtual + file, projected, ts.ScriptTarget.Latest, true, file.endsWith('.json') ? ts.ScriptKind.JSON : undefined));
  }
  const loc = node => {
    const source = node.getSourceFile(), start = node.getStart(source), position = source.getLineAndCharacterOfPosition(start);
    return { path: source.fileName.slice(virtual.length), line: position.line + 1, column: position.character + 1, start, end: node.end };
  };
  const edges = [], moduleMap = new Map();
  const exportKinds = new Set(['star', 'named', 'namespace', 'commonjs-forward']);
  for (const [absolute, source] of sources) {
    const file = absolute.slice(virtual.length); if (!code(file)) continue;
    const moduleId = `MODULE:${file}`, counts = new Map(), commonjsMutations = [];
    const edge = (node, request, kind) => {
      const stem = `${kind}:${request ?? '<dynamic>'}`, ordinal = (counts.get(stem) ?? 0) + 1; counts.set(stem, ordinal);
      const resolution = request === null ? { kind: 'dynamic', status: 'unresolved' } : resolve(request, file);
      edges.push({ id: `EDGE:${file}#${key(stem)}:${ordinal}`, moduleId, kind, request, typeOnlySyntax: ts.isExportDeclaration(node) ? node.isTypeOnly : ts.isImportDeclaration(node) ? Boolean(node.importClause?.isTypeOnly) : false, source: loc(node), resolution });
    };
    const visit = node => {
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && commonjsTarget(node.left)) commonjsMutations.push(loc(node));
      if (ts.isCallExpression(node) && ['Object.assign', 'Object.defineProperty', 'Object.defineProperties'].includes(node.expression.getText(source)) && node.arguments[0] && commonjsTarget(node.arguments[0])) commonjsMutations.push(loc(node));
      if (ts.isImportDeclaration(node)) edge(node, literal(node.moduleSpecifier), 'import');
      if (ts.isExportDeclaration(node) && node.moduleSpecifier) edge(node, literal(node.moduleSpecifier), !node.exportClause ? 'star' : ts.isNamespaceExport(node.exportClause) ? 'namespace' : 'named');
      if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) edge(node, literal(node.moduleReference.expression), 'import-equals');
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) edge(node, literal(node.argument.literal), 'import-type');
      if (ts.isCallExpression(node) && ['require', 'require.resolve'].includes(node.expression.getText(source))) {
        const forward = ts.isBinaryExpression(node.parent) && node.parent.right === node && node.parent.left.getText(source) === 'module.exports';
        edge(node, literal(node.arguments[0]), forward ? 'commonjs-forward' : 'require');
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    moduleMap.set(moduleId, { id: moduleId, source: { path: file, sha256: hash(String(files.get(file))) }, parseDiagnostics: source.parseDiagnostics.map(d => ({ code: d.code, start: d.start, message: ts.flattenDiagnosticMessageText(d.messageText, ' ') })),
      templateProjection: templateFiles.has(file), isExternalModule: ts.isExternalModule(source), commonjsMutations, hasExportErrors: false, unresolvedExportEdges: [] });
  }
  const options = { noLib: true, noEmit: true, types: [], allowJs: true, checkJs: false, strict: true, skipLibCheck: false, resolveJsonModule: true, jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.Latest, module: ts.ModuleKind.CommonJS };
  const host = {
    getSourceFile: file => sources.get(file), getDefaultLibFileName: () => '', writeFile() {}, getCurrentDirectory: () => virtual,
    getDirectories: () => [], fileExists: file => sources.has(file), readFile: file => file.startsWith(virtual) ? sources.get(file)?.text : undefined,
    getCanonicalFileName: file => file, useCaseSensitiveFileNames: () => true, getNewLine: () => '\n',
    resolveModuleNames: (requests, containing) => requests.map(request => {
      const result = resolve(request, containing.slice(virtual.length));
      if (result.status !== 'source' || !sources.has(virtual + result.path)) return undefined;
      const extension = result.path.endsWith('.d.ts') ? ts.Extension.Dts : result.path.endsWith('.tsx') ? ts.Extension.Tsx : result.path.endsWith('.jsx') ? ts.Extension.Jsx : result.path.endsWith('.json') ? ts.Extension.Json : /\.[cm]?js$/.test(result.path) ? ts.Extension.Js : ts.Extension.Ts;
      return { resolvedFileName: virtual + result.path, extension };
    }),
  };
  const program = ts.createProgram([...sources.keys()].filter(file => code(file)), options, host), checker = program.getTypeChecker();
  const allDiagnostics = program.getSemanticDiagnostics();
  const exportCodes = new Set([2308, 2305, 2309, 2459, 2498, 2614, 2724, 1192, 2613, 2306]);
  const diagnostics = allDiagnostics.filter(d => exportCodes.has(d.code) && d.file && d.start !== undefined).map(d => {
    const position = d.file.getLineAndCharacterOfPosition(d.start), file = d.file.fileName.slice(virtual.length);
    const statement = d.file.statements.find(statement => statement.pos <= d.start && d.start < statement.end);
    const scope = statement && (ts.isImportDeclaration(statement) || ts.isImportEqualsDeclaration(statement)) ? 'import-boundary' : 'export';
    if (scope === 'export') moduleMap.get(`MODULE:${file}`).hasExportErrors = true;
    return { id: `DIAGNOSTIC:${file}:${d.code}:${d.start}`, code: d.code, scope, source: { path: file, line: position.line + 1, column: position.character + 1, start: d.start }, message: ts.flattenDiagnosticMessageText(d.messageText, ' ').replaceAll(virtual, '') };
  });
  const symbols = new Map(), exports = [];
  for (const module of moduleMap.values()) {
    const source = sources.get(virtual + module.source.path), moduleSymbol = checker.getSymbolAtLocation(source) ?? source.symbol;
    for (const binding of moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : []) {
      const target = binding.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(binding) : binding;
      const declarations = (target?.declarations ?? []).filter(d => d.getSourceFile().fileName.startsWith(virtual)).map(d => ({ ...loc(d), kind: ts.SyntaxKind[d.kind] })).sort((a, b) => a.path.localeCompare(b.path) || a.start - b.start);
      const namespace = target?.declarations?.find(ts.isSourceFile);
      const symbolId = declarations.length ? `SYMBOL:${declarations[0].path}#${key(namespace ? '<namespace>' : target.getName())}:${declarations[0].start}` : null;
      if (symbolId) {
        const value = { id: symbolId, name: namespace ? '<namespace>' : target.getName(), declarations };
        if (symbols.has(symbolId) && serializeInventory(symbols.get(symbolId)) !== serializeInventory(value)) throw new Error(`Symbol identity collision ${symbolId}`);
        symbols.set(symbolId, value);
      }
      exports.push({ id: `EXPORT:${module.source.path}#${key(binding.getName())}`, moduleId: module.id, name: binding.getName(), symbolId,
        source: binding.declarations?.[0] ? loc(binding.declarations[0]) : { path: module.source.path, line: 1, start: 0 },
        spaces: { type: Boolean(target?.flags & ts.SymbolFlags.Type), value: Boolean(target?.flags & ts.SymbolFlags.Value) },
        spacesMeaning: 'origin-symbol flags; not a guarantee of value availability through every type-only re-export path',
        typeOnlySyntax: binding.declarations?.some(d => ts.isExportSpecifier(d) && (d.isTypeOnly || d.parent.parent.isTypeOnly)) ?? false,
        namespaceTarget: namespace ? `MODULE:${namespace.fileName.slice(virtual.length)}` : null, status: symbolId ? 'source' : 'unresolved-or-external' });
    }
  }
  const boundaries = new Map([...moduleMap].map(([id, module]) => [id, new Set([
    ...edges.filter(e => e.moduleId === id && exportKinds.has(e.kind) && e.resolution.status !== 'source').map(e => e.id),
    ...exports.filter(e => e.moduleId === id && !e.symbolId).map(e => e.id),
    ...(module.parseDiagnostics.length || module.templateProjection || module.hasExportErrors ? [id] : []),
    ...(module.commonjsMutations.length ? [`${id}:commonjs-semantics`] : []),
  ])]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges.filter(e => exportKinds.has(e.kind) && e.resolution.status === 'source')) {
      const target = boundaries.get(`MODULE:${edge.resolution.path}`);
      if (!target) { if (!boundaries.get(edge.moduleId).has(edge.id)) { boundaries.get(edge.moduleId).add(edge.id); changed = true; } continue; }
      for (const id of target) if (!boundaries.get(edge.moduleId).has(id)) { boundaries.get(edge.moduleId).add(id); changed = true; }
    }
  }
  for (const [id, module] of moduleMap) module.unresolvedExportEdges = [...boundaries.get(id)].sort();
  const sort = values => values.sort((a, b) => a.id.localeCompare(b.id));
  return { schemaVersion: 1, compilerVersion: ts.version, compilerOptions: { noLib: true, types: [], allowJs: true, strict: true, jsx: 'preserve', module: 'commonjs', note: 'isolated analysis program; not a project type-check' }, policy: 'fixed-source-types-projection; no host libraries, no external expansion, no inferred member expansion or runtime resolution guarantee',
    publicSurfaceComplete: false, stageClosable: false,
    inputs: [...files].sort(([a], [b]) => a.localeCompare(b)).map(([file, text]) => ({ path: file, sha256: hash(String(text)) })),
    packages: [...packages].sort((a, b) => a.id.localeCompare(b.id)), modules: sort([...moduleMap.values()]), edges: sort(edges), symbols: sort([...symbols.values()]), exports: sort(exports), diagnostics: sort(diagnostics),
    diagnosticCounts: Object.fromEntries([...new Set(allDiagnostics.map(d => d.code))].sort((a, b) => a - b).map(code => [code, allDiagnostics.filter(d => d.code === code).length])) };
}

export function validateWorkspaceExports(actual, expected) {
  const failures = [];
  for (const field of ['inputs', 'packages', 'modules', 'edges', 'symbols', 'exports', 'diagnostics', 'reviews']) {
    const seen = new Map();
    for (const record of actual?.[field] ?? []) { const id = record.id ?? record.path; if (seen.has(id)) failures.push(`Duplicate ${field} ${id}`); seen.set(id, record); }
    for (const record of expected[field] ?? []) {
      const id = record.id ?? record.path, value = seen.get(id);
      if (!value || serializeInventory(value) !== serializeInventory(record)) failures.push(`${!value ? 'Missing' : 'Changed'} ${field} ${id} at ${record.source?.path ?? record.declarations?.[0]?.path ?? record.path ?? ''}:${record.source?.line ?? ''}`);
      seen.delete(id);
    }
    for (const id of seen.keys()) failures.push(`Unexpected ${field} ${id}`);
  }
  if (serializeInventory(actual) !== serializeInventory(expected)) failures.push('Export graph differs from fixed source reconstruction');
  return { valid: !failures.length, failures };
}

export function buildWorkspaceExportGraph({ sourceDir }) {
  const inventory = buildSourceInventory({ sourceDir }), { tree, entries } = readSourceTree(sourceDir, SDK54_EXPO_COMMIT);
  if (tree !== inventory.source.tree) throw new Error('Fixed source tree mismatch');
  const selected = selectWorkspaceSources(entries, inventory), files = new Map();
  for (let i = 0; i < selected.length; i += 200) for (const [file, buffer] of readSourceBlobs(sourceDir, selected.slice(i, i + 200))) files.set(file, buffer.toString('utf8'));
  const result = indexWorkspaceExports({ files, packages: [...inventory.packages, ...inventory.templates] });
  result.source = { revision: SDK54_EXPO_COMMIT, tree };
  for (const input of result.inputs) input.blob = selected.find(entry => entry.path === input.path).oid;
  const previousPath = 'docs/releases/sdk54-workspace-surface-summary.json', previousBuffer = fs.readFileSync(previousPath), previous = JSON.parse(previousBuffer);
  result.previous = { path: previousPath, sha256: hash(previousBuffer) };
  result.reviews = reviewWorkspaceGaps(result, previous);
  return result;
}

export function reviewWorkspaceGaps(result, previous) {
  return previous.nonInferredGaps.filter(g => ['workspace-star', 'external-star', 'entry-missing'].includes(g.kind)).map(gap => {
    const edge = result.edges.find(edge => edge.source.path === gap.source.path && edge.source.start === gap.source.start && edge.kind === 'star');
    const target = edge?.resolution.path ? result.modules.find(module => module.source.path === edge.resolution.path) : null;
    const consumer = edge ? result.modules.find(module => module.id === edge.moduleId) : null;
    const namedExports = target ? result.exports.filter(e => e.moduleId === target.id && !['default', 'export='].includes(e.name)).map(e => e.id).sort() : [];
    const status = !edge ? 'UNRESOLVED_ENTRY' : edge.resolution.status !== 'source' ? 'UNRESOLVED_SOURCE' : !target || target.unresolvedExportEdges.length || consumer?.unresolvedExportEdges.length ? 'PARTIAL_SOURCE' : namedExports.length ? 'EXPANDED_SOURCE' : 'EXPANDED_EMPTY_SOURCE';
    return { id: `REVIEW:${gap.id}`, previousGapId: gap.id, kind: gap.kind, source: gap.source, edgeId: edge?.id ?? null, targetModuleId: target?.id ?? null, namedExports, status, boundaries: [...new Set([...(target?.unresolvedExportEdges ?? []), ...(consumer?.unresolvedExportEdges ?? [])])].sort(),
      meaning: 'source export topology only; not inferred properties, compatibility, publication or Harmony behavior acceptance' };
  });
}

export function summarizeWorkspaceExportGraph(result, artifact) {
  return { schemaVersion: 1, source: result.source, previous: result.previous, artifact,
    counts: Object.fromEntries(['inputs', 'packages', 'modules', 'edges', 'symbols', 'exports', 'diagnostics'].map(field => [field, result[field].length])),
    reviewCounts: Object.fromEntries([...new Set(result.reviews.map(r => r.status))].sort().map(status => [status, result.reviews.filter(r => r.status === status).length])),
    reviews: result.reviews, diagnosticCounts: result.diagnosticCounts, publicSurfaceComplete: false, stageClosable: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2), options = {};
    for (let i = 0; i < args.length; i += 2) { if (!['--source', '--output', '--check', '--summary'].includes(args[i]) || !args[i + 1] || options[args[i]]) throw new Error('Invalid arguments'); options[args[i]] = args[i + 1]; }
    if (!options['--source'] || Boolean(options['--output']) === Boolean(options['--check']) || options['--summary'] && !options['--output']) throw new Error('Usage: --source <dir> --output|--check <json[.gz]> [--summary <json>]');
    const result = buildWorkspaceExportGraph({ sourceDir: options['--source'] });
    if (options['--check']) {
      const file = options['--check'], buffer = fs.readFileSync(file), actual = JSON.parse((file.endsWith('.gz') ? gunzipSync(buffer) : buffer).toString('utf8'));
      const checked = validateWorkspaceExports(actual, result); console.log(JSON.stringify(checked)); if (!checked.valid) process.exitCode = 1;
    } else {
      const file = options['--output'], serialized = serializeExportGraph(result); fs.writeFileSync(file, file.endsWith('.gz') ? gzipSync(serialized) : serialized);
      const summary = summarizeWorkspaceExportGraph(result, { path: file, sha256: hash(fs.readFileSync(file)) });
      if (options['--summary']) fs.writeFileSync(options['--summary'], serializeExportGraph(summary));
      console.log(JSON.stringify({ ...summary.counts, reviews: summary.reviewCounts, publicSurfaceComplete: false, stageClosable: false }));
    }
  } catch (error) { console.error(error.stack); process.exitCode = 1; }
}
