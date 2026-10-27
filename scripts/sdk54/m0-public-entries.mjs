import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { createWorkspaceResolver } from './workspace-export-graph.mjs';
import { extractTaskrBuildRecipes } from './m0-build-recipes.mjs';

const virtual = '/__sdk54_project__/';
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const code = file => /\.[cm]?[jt]sx?$/.test(file);
const pointer = value => String(value).replaceAll('~', '~0').replaceAll('/', '~1');
const identity = (...values) => values.map(value => encodeURIComponent(String(value))).join(':');
const logical = value => typeof value === 'string' ? value.startsWith(virtual) ? value.slice(virtual.length).replace(/\/$/, '') : value.startsWith('/') ? null : path.posix.normalize(value).replace(/\/$/, '') : null;
const safeTarget = value => typeof value === 'string' && value.startsWith('./') && !value.includes('\\') && !/%(?:2f|5c|2e)/i.test(value) && !value.slice(2).split('/').some(part => ['..', '.', 'node_modules'].includes(part));
const testOrTool = file => /(?:^|\/)(?:__tests__|__mocks__|__rsc_tests__|__typetests__|__e2e__|fixtures|__fixtures__|tests?|mocks|e2e)(?:\/|$)/.test(file)
  || /(?:\.(?:test|spec|stories)|-(?:test|spec))(?:\.[^/]+)?\.[cm]?[jt]sx?$/.test(file)
  || /(?:^|\/)(?:\.[^/]+|(?:babel|jest|eslint|metro)\.config\.[^/]+)$/.test(file);

function leaves(value, condition = '', conditionOrder = []) {
  if (typeof value === 'string' || value === null || value === false) return [{ value, condition, conditionOrder }];
  if (Array.isArray(value)) return value.flatMap((child, index) => leaves(child, `${condition}/${index}`, [...conditionOrder, index]));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([name, child], index) => leaves(child, `${condition}/${pointer(name)}`, [...conditionOrder, index]));
  return [{ value, condition, conditionOrder, unsupported: true }];
}

function exportMap(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).some(key => key.startsWith('.'))) return value;
  return { '.': value };
}

function matchPattern(pattern, request) {
  const [head, tail] = pattern.split('*');
  return request.startsWith(head) && request.endsWith(tail) && request.length >= head.length + tail.length
    ? request.slice(head.length, tail.length ? -tail.length : undefined) : null;
}

function selectedExport(map, request) {
  if (Object.hasOwn(map, request)) return request;
  return Object.keys(map).filter(key => key.split('*').length === 2 && matchPattern(key, request) !== null)
    .sort((a, b) => b.indexOf('*') - a.indexOf('*') || b.length - a.length || compare(a, b))[0] ?? null;
}

function fixedRequestIssue(request) {
  if (request.endsWith('/')) return 'trailing-request-separator';
  if (request.includes('\\') || /%(?:2f|5c)/i.test(request)) return 'invalid-request-separator';
  let decoded;
  try { decoded = decodeURIComponent(request); } catch { return 'invalid-request-encoding'; }
  if (decoded.slice(2).split('/').some(part => /^(?:\.{1,2}|node_modules)$/i.test(part))) return 'invalid-request-segment';
  return null;
}

function fixedSafeTarget(value) {
  return typeof value === 'string' && value.startsWith('./') && !fixedRequestIssue(value);
}

function fixedSelectedExport(map, request) {
  if (Object.hasOwn(map, request) && !request.includes('*') && !request.endsWith('/')) return request;
  if (request.endsWith('/')) return null;
  return Object.keys(map).filter(key => key.split('*').length === 2 && request.length >= key.length && matchPattern(key, request) !== null)
    .sort((a, b) => b.indexOf('*') - a.indexOf('*') || b.length - a.length || compare(a, b))[0] ?? null;
}

const fixedTargetPath = (directory, value) => decodeURIComponent(new URL(value, pathToFileURL('/' + directory + '/')).pathname).slice(1);

function invertPattern(pattern, candidate, fixed = false) {
  let capture = false;
  const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = (Array.isArray(pattern) ? pattern : pattern.split('*')).map((part, index) => {
    if (!index) return escape(part);
    const token = capture ? fixed ? '\\k<wildcard>' : '\\1' : fixed ? '(?<wildcard>.*)' : '(.*)'; capture = true;
    return token + escape(part);
  }).join('');
  return new RegExp('^' + expression + '$').exec(candidate)?.[1] ?? null;
}

export function enumeratePublicEntries({ packages, treeEntries, modules, files, projectContext = null, patternCoverage = false }) {
  if (!(files instanceof Map)) throw new Error('Public entries require a fixed source Map');
  const tree = new Map(), moduleByPath = new Map(), moduleIds = new Set(), packageIds = new Set(), packageNames = new Set();
  for (const record of treeEntries) {
    if (tree.has(record.path)) throw new Error(`Duplicate tree path ${record.path}`);
    tree.set(record.path, record);
  }
  for (const module of modules) {
    if (moduleByPath.has(module.source.path) || moduleIds.has(module.id)) throw new Error(`Duplicate module ${module.id} ${module.source.path}`);
    moduleIds.add(module.id);
    moduleByPath.set(module.source.path, module);
  }
  const roots = packages.map(pkg => {
    if (packageIds.has(pkg.id) || packageNames.has(pkg.name)) throw new Error(`Duplicate package ${pkg.id}`);
    packageIds.add(pkg.id); packageNames.add(pkg.name);
    if (!files.has(pkg.sourcePath)) throw new Error(`Missing fixed manifest ${pkg.sourcePath}`);
    const record = tree.get(pkg.sourcePath);
    if (!record || record.type !== 'blob' || record.mode === '120000') throw new Error(`Unsafe fixed manifest ${pkg.sourcePath}`);
    const manifest = JSON.parse(String(files.get(pkg.sourcePath)));
    if (manifest.name !== pkg.name) throw new Error(`Package manifest identity mismatch ${pkg.sourcePath}`);
    return { ...pkg, manifest, directory: path.posix.dirname(pkg.sourcePath) };
  }).sort((a, b) => b.directory.length - a.directory.length || compare(a.id, b.id));
  const owner = file => roots.find(root => file.startsWith(root.directory + '/'));
  const resolver = createWorkspaceResolver({ files, packages });
  const snapshot = typeof projectContext?.snapshot === 'function' ? projectContext.snapshot() : projectContext;
  const configs = snapshot?.configs ?? [], emitted = new Map(), configIssues = [];
  const safe = file => tree.get(file)?.type === 'blob' && tree.get(file)?.mode !== '120000';

  // Reuse the fixed TypeScript input set and its common-source-directory calculation.
  for (const config of [...configs].sort((a, b) => compare(a.path, b.path))) {
    const options = config.options ?? {}, outDir = logical(options.outDir), declarationRoot = logical(options.declarationDir) ?? outDir;
    const declarationEnabled = options.declaration || options.composite || options.emitDeclarationOnly;
    if ((!outDir && !(declarationEnabled && declarationRoot)) || options.noEmit || config.errors?.length) {
      configIssues.push({ path: config.path, reason: config.errors?.length ? 'project-config-errors' : options.noEmit ? 'project-no-emit' : 'project-output-not-declared' });
      continue;
    }
    const sourceNames = (config.fileNames ?? []).map(logical).filter(file => file && code(file) && !/\.d\.[cm]?ts$/.test(file));
    let emitRoot = logical(config.emitRoot ?? options.rootDir);
    if (!emitRoot && sourceNames.length && sourceNames.every(file => files.has(file))) {
      const program = ts.createProgram(sourceNames.map(file => virtual + file), { ...options, noResolve: true, noLib: true, noEmit: true }, {
        getSourceFile: file => files.has(logical(file)) ? ts.createSourceFile(file, String(files.get(logical(file))), ts.ScriptTarget.Latest, true) : undefined,
        getDefaultLibFileName: () => '', writeFile() {}, getCurrentDirectory: () => virtual, getDirectories: () => [],
        fileExists: file => files.has(logical(file)), readFile: file => files.get(logical(file)),
        getCanonicalFileName: file => file, useCaseSensitiveFileNames: () => true, getNewLine: () => '\n',
      });
      emitRoot = logical(program.getCommonSourceDirectory());
    }
    if (!emitRoot) { configIssues.push({ path: config.path, reason: 'project-emit-root-unavailable' }); continue; }
    for (const file of sourceNames) {
      const pkg = owner(file), configOwner = owner(config.path), relative = path.posix.relative(emitRoot, file);
      if (!pkg || pkg.id !== configOwner?.id || !safe(file) || relative.startsWith('../')) continue;
      const stem = relative.replace(/\.[cm]?[jt]sx?$/, '');
      const jsExt = /\.mts$/.test(file) ? '.mjs' : /\.cts$/.test(file) ? '.cjs' : /\.[jt]sx$/.test(file) && [ts.JsxEmit.Preserve, ts.JsxEmit.ReactNative].includes(options.jsx) ? '.jsx' : '.js';
      const declarationExt = /\.mts$/.test(file) ? '.d.mts' : /\.cts$/.test(file) ? '.d.cts' : '.d.ts';
      const outputs = [...(outDir && !options.emitDeclarationOnly ? [outDir + '/' + stem + jsExt] : []),
        ...(declarationEnabled && declarationRoot ? [declarationRoot + '/' + stem + declarationExt] : [])];
      for (const output of outputs) {
        if (!emitted.has(output)) emitted.set(output, []);
        emitted.get(output).push({ path: file, config: config.path, emitRoot });
      }
    }
  }

  // This accepts a deliberately small, static command language; shell syntax is never evaluated.
  for (const pkg of roots) {
    const command = pkg.manifest.scripts?.build;
    if (typeof command !== 'string') continue;
    const match = /^ncc build (\.?\/?[A-Za-z0-9_./-]+\.[cm]?[jt]sx?) -o (\.?\/?[A-Za-z0-9_./-]+\/?)(?: --(?:minify|no-cache|no-source-map-register))*$/.exec(command);
    if (!match) continue;
    const [input, directory] = match.slice(1);
    if ([input, directory].some(value => value.startsWith('/') || value.startsWith('-') || value.split('/').includes('..'))) continue;
    const sourcePath = path.posix.join(pkg.directory, input), output = path.posix.join(pkg.directory, directory, 'index.js');
    if (!safe(sourcePath) || owner(sourcePath)?.id !== pkg.id || !output.startsWith(pkg.directory + '/')) continue;
    const recipe = { kind: 'NCC_SINGLE_BUNDLE_ENTRY', command, source: { path: pkg.sourcePath, pointer: '/scripts/build', ...(tree.get(pkg.sourcePath)?.oid ? { blob: tree.get(pkg.sourcePath).oid } : {}) },
      bundlingAcceptance: 'NOT_VERIFIED', runtimeAcceptance: 'NOT_VERIFIED' };
    if (!emitted.has(output)) emitted.set(output, []);
    emitted.get(output).push({ path: sourcePath, method: 'fixed-ncc-entry-recipe', recipe });
  }
  const taskr = extractTaskrBuildRecipes({ packages, treeEntries, files });
  for (const mapping of taskr.mappings) {
    if (!emitted.has(mapping.outputPath)) emitted.set(mapping.outputPath, []);
    emitted.get(mapping.outputPath).push({ path: mapping.sourcePath, method: 'fixed-taskr-entry-recipe', recipe: mapping });
  }

  const result = { schemaVersion: 1, packages: [], entries: [], candidateDispositions: [], boundaries: [],
    publicSurfaceComplete: false, stageClosable: false,
    policy: 'fixed-source-entry-candidates; project emit projection is not a built, published, installed or platform-selected artifact' };
  const addBoundary = (pkg, kind, source, entryId = null, details = null) => {
    const record = { id: 'PUBLIC-BOUNDARY:' + identity(pkg?.id ?? '<outside>', kind, entryId ?? source.path, source.pointer ?? '', details === null ? '' : JSON.stringify(details)),
      packageId: pkg?.id ?? null, kind, source, entryId, details, status: 'NOT_VERIFIED' };
    if (!result.boundaries.some(existing => existing.id === record.id)) result.boundaries.push(record);
  };
  const targetRecord = (file, requestedPath, method, extra = {}) => ({ requestedPath, path: file, moduleId: moduleByPath.get(file)?.id ?? null,
    status: moduleByPath.has(file) ? 'SOURCE' : code(file) ? 'SOURCE_WITH_BOUNDARY' : 'RESOURCE', method, ...extra });
  const blocked = (requestedPath, reason, extra = {}) => ({ requestedPath, path: null, moduleId: null, status: 'BLOCKED', method: null, reason, ...extra });
  const lookupTarget = (requestedPath, allowExtension, declarationEntry = false) => {
    if (tree.has(requestedPath) && !safe(requestedPath)) return blocked(requestedPath, 'unsafe-target');
    const projections = [...new Map((emitted.get(requestedPath) ?? []).map(row => [row.path, row])).values()];
    if (safe(requestedPath)) return targetRecord(requestedPath, requestedPath, 'fixed-tree', projections.length
      ? { projectionCandidates: projections.map(row => ({ ...row, moduleId: moduleByPath.get(row.path)?.id ?? null })) } : {});
    if (projections.length === 1) {
      const { path: sourcePath, method = 'fixed-project-emit', ...evidence } = projections[0];
      return targetRecord(sourcePath, requestedPath, method, evidence);
    }
    if (projections.length > 1) return blocked(requestedPath, 'ambiguous-project-emit-mapping', { sourceCandidates: projections });
    if (allowExtension && !path.posix.extname(requestedPath)) {
      if (declarationEntry) {
        const suffixes = ['.d.ts', '.d.mts', '.d.cts', '/index.d.ts', '/index.d.mts', '/index.d.cts'];
        const fixed = suffixes.find(suffix => tree.has(requestedPath + suffix));
        if (fixed) {
          const target = lookupTarget(requestedPath + fixed, false, true);
          const alternatives = suffixes.filter(suffix => suffix !== fixed).flatMap(suffix => (emitted.get(requestedPath + suffix) ?? [])
            .map(row => ({ ...row, moduleId: moduleByPath.get(row.path)?.id ?? null, requestedPath: requestedPath + suffix })));
          return { ...target, requestedPath, ...(alternatives.length && target.path ? {
            projectionCandidates: [...(target.projectionCandidates ?? []), ...alternatives], resolutionBoundary: 'projected-declaration-path-precedence-unverified',
          } : {}) };
        }
        for (const suffix of suffixes) {
          if (emitted.has(requestedPath + suffix)) return { ...lookupTarget(requestedPath + suffix, false, true), requestedPath };
        }
        return blocked(requestedPath, 'missing-declaration-entry');
      }
      for (const suffix of ['.js', '.jsx', '.mjs', '.cjs', '/index.js', '/index.jsx', '/index.mjs', '/index.cjs']) {
        if (emitted.has(requestedPath + suffix)) return { ...lookupTarget(requestedPath + suffix, false), requestedPath };
      }
      for (const suffix of ['.js', '.json', '.node', '.jsx', '.mjs', '.cjs', '/index.js', '/index.json', '/index.jsx']) {
        if (tree.has(requestedPath + suffix)) return { ...lookupTarget(requestedPath + suffix, false), requestedPath };
      }
      const resolved = resolver('./' + path.posix.basename(requestedPath), path.posix.dirname(requestedPath) + '/__public_entry__.ts');
      if (resolved.status === 'wrapper-cycle') return blocked(requestedPath, 'wrapper-cycle');
      if (resolved.status === 'source' && ['exact', 'source-extension-or-index'].includes(resolved.method) && safe(resolved.path)) return targetRecord(resolved.path, requestedPath, 'fixed-source-extension-or-index');
      if (resolved.status === 'platform-dependent') return blocked(requestedPath, 'platform-selection-unverified', { sourceCandidates: resolved.candidates });
    }
    return blocked(requestedPath, /\/build(?:\/|$)/.test(requestedPath) ? 'missing-project-emit-mapping' : 'missing-entry-target');
  };
  const followWrapper = (target, visited = new Set()) => {
    if (!target.path || !/\.[cm]?js$/.test(target.path) || !files.has(target.path)) return target;
    if (visited.has(target.path)) return blocked(target.requestedPath, 'wrapper-cycle', { sourceWrappers: target.sourceWrappers ?? [] });
    visited.add(target.path);
    const resolved = resolver('./' + path.posix.basename(target.path), path.posix.dirname(target.path) + '/__public_entry__.ts');
    const first = resolved.sourceWrappers?.find(row => row.path === target.path);
    if (!first) return target;
    let next;
    if (first.request.startsWith('.')) next = lookupTarget(path.posix.normalize(path.posix.join(path.posix.dirname(target.path), first.request)), true);
    else if (resolved.status === 'source' && safe(resolved.path)) next = targetRecord(resolved.path, first.request, 'workspace-wrapper-source-candidate');
    else next = blocked(first.request, 'workspace-wrapper-target-unverified');
    const continued = followWrapper(next, visited);
    return { ...continued, requestedPath: target.requestedPath, sourceWrappers: [{ path: target.path, request: first.request, targetPath: next.path }, ...(continued.sourceWrappers ?? [])] };
  };
  const resolveTarget = (pkg, value, strict, declarationEntry) => {
    if (strict && !(patternCoverage ? fixedSafeTarget(value) : safeTarget(value))) return blocked(value, 'invalid-export-target');
    if (typeof value !== 'string' || value.startsWith('/') || value.includes('\\') || value.split('/').some(part => part === '..')) return blocked(value, 'invalid-entry-target');
    if (!strict && !value.startsWith('.') && !tree.has(pkg.directory + '/' + value) && !value.startsWith('build/') && !value.startsWith('src/') && roots.some(root => value === root.name || value.startsWith(root.name + '/'))) {
      const resolved = resolver(value, pkg.sourcePath);
      if (resolved.status === 'source' && safe(resolved.path)) return targetRecord(resolved.path, value, 'workspace-source-candidate', { resolutionBoundary: 'workspace-entry-runtime-unverified' });
      return blocked(value, resolved.status === 'external' ? 'external-entry-unverified' : 'workspace-entry-unverified');
    }
    let requestedPath;
    try { requestedPath = strict && patternCoverage ? fixedTargetPath(pkg.directory, value) : path.posix.normalize(path.posix.join(pkg.directory, value)); }
    catch { return blocked(value, 'invalid-export-target'); }
    if (!requestedPath.startsWith(pkg.directory + '/')) return blocked(requestedPath, 'entry-outside-package');
    return followWrapper(lookupTarget(requestedPath, !strict, declarationEntry));
  };
  const commonjsCache = new Map();
  const commonjsTarget = node => ts.isIdentifier(node) ? node.text === 'exports'
    : ts.isPropertyAccessExpression(node) ? node.expression.getText() === 'module' && node.name.text === 'exports' || commonjsTarget(node.expression)
    : ts.isElementAccessExpression(node) ? node.expression.getText() === 'module' && ts.isStringLiteral(node.argumentExpression) && node.argumentExpression.text === 'exports' || commonjsTarget(node.expression) : false;
  const hasCommonjs = file => {
    if (commonjsCache.has(file)) return commonjsCache.get(file);
    let found = Boolean(moduleByPath.get(file)?.boundaries?.some(value => value.includes('commonjs')));
    if (!found && /\.[cm]?js$/.test(file) && files.has(file)) {
      const source = ts.createSourceFile(file, String(files.get(file)), ts.ScriptTarget.Latest, true);
      const visit = node => {
        if (ts.isBinaryExpression(node) && commonjsTarget(node.left) || ts.isCallExpression(node) && ['Object.assign', 'Object.defineProperty', 'Object.defineProperties'].includes(node.expression.getText(source)) && node.arguments[0] && commonjsTarget(node.arguments[0])) found = true;
        if (!found) ts.forEachChild(node, visit);
      };
      visit(source);
    }
    commonjsCache.set(file, found); return found;
  };
  const addEntry = (pkg, { kind, request, exportKey = null, condition = '', conditionOrder = [], value, source, patternFamily = false, strict = false }) => {
    const id = 'PUBLIC-ENTRY:' + identity(pkg.id, kind, source.pointer ?? source.path, request, condition);
    const target = value === null || value === false ? { requestedPath: null, path: null, moduleId: null, status: 'DISABLED', method: null }
      : patternFamily && typeof value === 'string' && value.includes('*') ? blocked(value, 'unexpanded-export-pattern')
      : typeof value === 'string' ? resolveTarget(pkg, value, strict, /^\/(?:types|typings)$/.test(condition)) : blocked(null, 'unsupported-entry-value');
    const record = { id, packageId: pkg.id, kind, request, exportKey, condition, conditionOrder, source, declaredTarget: value ?? null,
      patternFamily, target, publicationAcceptance: 'NOT_VERIFIED', runtimeAcceptance: 'NOT_VERIFIED' };
    result.entries.push(record);
    if (target.reason) addBoundary(pkg, target.reason, source, id, target.sourceCandidates ?? null);
    if (target.path && !target.moduleId && (code(target.path) || kind === 'bin')) addBoundary(pkg, 'target-has-no-semantic-module', { path: target.path }, id);
    if (target.sourceWrappers?.length) addBoundary(pkg, 'runtime-wrapper-equivalence-unverified', source, id);
    if (target.projectionCandidates?.length) addBoundary(pkg, 'source-build-projection-equivalence-unverified', source, id, target.projectionCandidates);
    if (target.path && hasCommonjs(target.path)) addBoundary(pkg, 'commonjs-runtime-semantics-unverified', { path: target.path }, id);
    if (target.path) {
      const targetOwner = owner(target.path), relative = targetOwner ? target.path.slice(targetOwner.directory.length + 1) : target.path;
      if (testOrTool(relative)) addBoundary(pkg, 'test-or-tooling-entry-target', { path: target.path }, id);
      if (code(target.path) && !/\.(?:native|ios|android|web|server)\.[cm]?[jt]sx?$/.test(target.path)) {
        const stem = target.path.replace(/(?:\.d)?\.[cm]?[jt]sx?$/, '');
        const variants = ['native', 'ios', 'android', 'web', 'server'].flatMap(platform => ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'].map(ext => `${stem}.${platform}${ext}`))
          .filter(file => tree.has(file)).sort(compare).map(file => ({ path: file, moduleId: moduleByPath.get(file)?.id ?? null, unsafe: !safe(file), ...(tree.get(file)?.oid ? { blob: tree.get(file).oid } : {}) }));
        if (variants.length) addBoundary(pkg, 'platform-selection-unverified', { path: target.path }, id, variants);
      }
    }
    if (target.resolutionBoundary) addBoundary(pkg, target.resolutionBoundary, source, id);
    if (patternFamily && typeof value === 'string' && !value.includes('*')) addBoundary(pkg, 'infinite-export-pattern-family', source, id);
    if (target.config) addBoundary(pkg, 'project-emit-not-build-verified', { path: target.config }, id);
    if (target.recipe?.kind === 'NCC_SINGLE_BUNDLE_ENTRY') addBoundary(pkg, 'bundle-build-not-verified', target.recipe.source, id, target.recipe);
    if (target.recipe?.recipe === 'taskr-swc-bin') addBoundary(pkg, 'taskr-build-not-verified', source, id, target.recipe);
    return record;
  };
  const manifestSource = (pkg, suffix) => ({ path: pkg.sourcePath, pointer: suffix, ...(tree.get(pkg.sourcePath)?.oid ? { blob: tree.get(pkg.sourcePath).oid } : {}) });

  for (const pkg of [...roots].sort((a, b) => compare(a.id, b.id))) {
    const manifest = pkg.manifest;
    const { manifest: ignoredManifest, directory: ignoredDirectory, ...packageMetadata } = pkg;
    result.packages.push({ ...packageMetadata, source: manifestSource(pkg, ''), hasExports: Object.hasOwn(manifest, 'exports'),
      private: manifest.private === true, sourcePublicationAcceptance: 'NOT_VERIFIED' });
    addBoundary(pkg, 'publication-scope-unverified', manifestSource(pkg, '/files'));
    if (Object.hasOwn(manifest, 'exports')) {
      const map = exportMap(manifest.exports), keys = Object.keys(map);
      if (!Object.hasOwn(map, '.')) addBoundary(pkg, 'exports-root-not-declared', manifestSource(pkg, '/exports'));
      if (keys.some(key => key !== '.' && !key.startsWith('./'))) addBoundary(pkg, 'invalid-export-map', manifestSource(pkg, '/exports'));
      for (const exportKey of keys.sort(compare)) {
        if (exportKey !== '.' && !exportKey.startsWith('./')) continue;
        const source = manifestSource(pkg, `/exports/${pointer(exportKey)}`), branches = leaves(map[exportKey]);
        if (!exportKey.includes('*')) {
          for (const branch of branches) addEntry(pkg, { kind: 'export', request: exportKey === '.' ? pkg.name : pkg.name + exportKey.slice(1), exportKey,
            ...branch, value: branch.value, source: { ...source, pointer: source.pointer + branch.condition }, strict: true });
          continue;
        }
        if (exportKey.split('*').length !== 2) { addBoundary(pkg, 'unsupported-export-pattern', source); continue; }
        if (patternCoverage) {
          const families = new Map(), requests = new Set();
          for (const branch of branches) {
            const family = addEntry(pkg, { kind: 'export-pattern', request: pkg.name + exportKey.slice(1), exportKey, ...branch,
              source: typeof branch.value === 'string' && branch.value.includes('*') && !safeTarget(branch.value) ? source : { ...source, pointer: source.pointer + branch.condition },
              patternFamily: true, strict: true });
            families.set(branch, family);
            family.patternCoverage = { policy: 'fixed-v1', requestDomain: branch.value === null || branch.value === false ? 'DISABLED'
              : typeof branch.value === 'string' && !branch.value.includes('*') ? 'INFINITE_CONSTANT_TARGET' : 'FINITE_FIXED_SOURCE_PROJECTION', candidates: [], childEntryIds: [] };
            if (typeof branch.value !== 'string' || !branch.value.includes('*')) continue;
            // Encoded literal stars must stay distinct from export substitution markers.
            // A unique initial @ prevents self-overlap across insertion boundaries, even after appending _.
            let captureToken = '@SDK54_FIXED_CAPTURE!';
            const literalPaths = [pkg.directory, branch.value];
            try { literalPaths.push(fixedTargetPath(pkg.directory, branch.value)); } catch {}
            while (literalPaths.some(value => value.includes(captureToken))) captureToken += '_';
            const template = branch.value.replaceAll('*', captureToken);
            const targetPatterns = [path.posix.normalize(path.posix.join(pkg.directory, template)).split(captureToken)];
            try { targetPatterns.unshift(fixedTargetPath(pkg.directory, template).split(captureToken)); } catch {}
            for (const file of [...new Set([...tree.keys(), ...emitted.keys()])].sort(compare)) {
              const wildcard = targetPatterns.map(pattern => invertPattern(pattern, file, true)).find(value => value !== null) ?? null;
              if (wildcard === null) continue;
              const request = exportKey.replace('*', wildcard), selectedExportKey = fixedSelectedExport(map, request);
              const candidate = { targetPath: file, wildcard, request: pkg.name + request.slice(1), selectedExportKey, disposition: 'INCLUDED' };
              if (tree.has(file)) {
                const record = tree.get(file);
                candidate.source = { path: file, ...(record.oid ? { blob: record.oid } : {}), mode: record.mode, type: record.type };
              }
              if (emitted.has(file)) candidate.projectionCandidates = emitted.get(file).map(row => ({ ...row }));
              const issue = wildcard.length ? fixedRequestIssue(request) : 'empty-pattern-capture';
              const targetValue = branch.value.replaceAll('*', wildcard);
              let targetUrlPath = null;
              try { targetUrlPath = fixedTargetPath(pkg.directory, targetValue); } catch {}
              if (issue) Object.assign(candidate, { disposition: 'INVALID_REQUEST', reason: issue });
              else if (!fixedSafeTarget(targetValue) || !file.startsWith(pkg.directory + '/')) Object.assign(candidate, { disposition: 'UNSAFE_TARGET', reason: 'invalid-export-target' });
              else if (targetUrlPath !== file) Object.assign(candidate, { disposition: 'INVALID_REQUEST', reason: 'request-target-url-mismatch' });
              else if (selectedExportKey !== exportKey) Object.assign(candidate, { disposition: 'SHADOWED', reason: 'more-specific-export' });
              else {
                const target = resolveTarget(pkg, targetValue, true, false);
                if (target.status === 'BLOCKED') Object.assign(candidate, { disposition: target.reason === 'unsafe-target' ? 'UNSAFE_TARGET' : 'BLOCKED_TARGET', reason: target.reason });
                requests.add(request);
              }
              family.patternCoverage.candidates.push(candidate);
            }
          }
          // Every discovered request is evaluated under every declared condition branch.
          for (const request of [...requests].sort(compare)) {
            const wildcard = matchPattern(exportKey, request);
            for (const branch of branches) {
              const family = families.get(branch);
              const child = addEntry(pkg, { kind: 'export', request: pkg.name + request.slice(1), exportKey,
                condition: branch.condition, conditionOrder: branch.conditionOrder,
                value: typeof branch.value === 'string' ? branch.value.replaceAll('*', wildcard) : branch.value,
                source: { ...source, pointer: source.pointer + branch.condition }, strict: true });
              child.patternOrigin = { familyEntryId: family.id, wildcard };
              family.patternCoverage.childEntryIds.push(child.id);
            }
          }
          for (const family of families.values()) family.patternCoverage.childEntryIds.sort(compare);
          addBoundary(pkg, 'export-pattern-build-range-unverified', source);
          continue;
        }
        const requests = new Set();
        for (const branch of branches) {
          if (typeof branch.value !== 'string' || !branch.value.includes('*')) {
            addEntry(pkg, { kind: 'export-pattern', request: pkg.name + exportKey.slice(1), exportKey, ...branch,
              source: { ...source, pointer: source.pointer + branch.condition }, patternFamily: true, strict: true });
            continue;
          }
          if (!safeTarget(branch.value)) { addEntry(pkg, { kind: 'export-pattern', request: pkg.name + exportKey.slice(1), exportKey, ...branch, source, patternFamily: true, strict: true }); continue; }
          addEntry(pkg, { kind: 'export-pattern', request: pkg.name + exportKey.slice(1), exportKey, ...branch,
            source: { ...source, pointer: source.pointer + branch.condition }, patternFamily: true, strict: true });
          const targetPattern = pkg.directory + '/' + branch.value.slice(2);
          for (const file of new Set([...tree.keys(), ...emitted.keys()])) {
            if (!file.startsWith(pkg.directory + '/')) continue;
            const wildcard = invertPattern(targetPattern, file);
            if (wildcard === null) continue;
            const request = exportKey.replace('*', wildcard);
            if (selectedExport(map, request) === exportKey) requests.add(request);
          }
        }
        for (const request of [...requests].sort(compare)) {
          const wildcard = matchPattern(exportKey, request);
          for (const branch of branches) addEntry(pkg, { kind: 'export', request: pkg.name + request.slice(1), exportKey,
            condition: branch.condition, conditionOrder: branch.conditionOrder, value: typeof branch.value === 'string' ? branch.value.replaceAll('*', wildcard) : branch.value,
            source: { ...source, pointer: source.pointer + branch.condition }, strict: true });
        }
        addBoundary(pkg, 'export-pattern-build-range-unverified', source);
      }
    } else {
      let declaredRoot = false;
      for (const field of ['types', 'typings', 'source', 'main', 'module', 'react-native', 'browser']) {
        if (typeof manifest[field] === 'string') {
          declaredRoot = true; addEntry(pkg, { kind: 'default', request: pkg.name, value: manifest[field], source: manifestSource(pkg, '/' + field), condition: '/' + field });
        } else if (manifest[field] && typeof manifest[field] === 'object') {
          for (const branch of leaves(manifest[field])) addEntry(pkg, { kind: 'resolver-hint', request: pkg.name, ...branch,
            source: manifestSource(pkg, '/' + field + branch.condition) });
          addBoundary(pkg, 'manifest-replacement-map-runtime-unverified', manifestSource(pkg, '/' + field));
        }
      }
      if (!declaredRoot) addEntry(pkg, { kind: 'default', request: pkg.name, value: './index', condition: '/implicit-index', source: manifestSource(pkg, '/implicit-index') });
      addBoundary(pkg, 'implicit-deep-import-publication-unverified', manifestSource(pkg, '/files'));
    }
    const bins = typeof manifest.bin === 'string' ? [[pkg.name.split('/').at(-1), manifest.bin]] : Object.entries(manifest.bin ?? {});
    for (const [command, value] of bins) addEntry(pkg, { kind: 'bin', request: command, value, source: manifestSource(pkg, typeof manifest.bin === 'string' ? '/bin' : '/bin/' + pointer(command)) });
    for (const suffix of ['js', 'cjs', 'mjs', 'ts']) {
      const plugin = pkg.directory + '/app.plugin.' + suffix;
      if (!tree.has(plugin)) continue;
      const pluginEntry = addEntry(pkg, { kind: 'app-plugin', request: pkg.name + '/app.plugin.' + suffix, value: './app.plugin.' + suffix,
        source: { path: plugin, ...(tree.get(plugin)?.oid ? { blob: tree.get(plugin).oid } : {}) } });
      if (Object.hasOwn(manifest, 'exports')) {
        const map = exportMap(manifest.exports), key = selectedExport(map, './app.plugin.' + suffix);
        if (!key || leaves(map[key]).every(branch => branch.value === null || branch.value === false)) addBoundary(pkg, 'plugin-discovery-not-package-subpath', pluginEntry.source, pluginEntry.id);
      }
    }
  }
  for (const module of [...modules].sort((a, b) => compare(a.id, b.id))) {
    const pkg = owner(module.source.path), relative = pkg ? module.source.path.slice(pkg.directory.length + 1) : module.source.path;
    const directEntryIds = result.entries.filter(entry => entry.target.moduleId === module.id || entry.target.sourceWrappers?.some(wrapper => wrapper.path === module.source.path)).map(entry => entry.id);
    const projectedEntryIds = result.entries.filter(entry => entry.target.projectionCandidates?.some(candidate => candidate.moduleId === module.id)).map(entry => entry.id);
    const entryIds = [...new Set([...directEntryIds, ...projectedEntryIds])].sort(compare);
    const application = pkg && /^(?:apps|templates)\//.test(pkg.directory);
    const disposition = !pkg ? 'OUTSIDE_WORKSPACE_BOUNDARY' : directEntryIds.length ? 'EXPLICIT_ENTRY_TARGET' : projectedEntryIds.length ? 'SOURCE_PROJECTION_CANDIDATE' : application ? 'APPLICATION_SOURCE_CANDIDATE'
      : testOrTool(relative) ? 'TEST_OR_TOOLING_CANDIDATE' : Object.hasOwn(pkg.manifest, 'exports') ? 'EXPORTS_ENCAPSULATED' : 'IMPLICIT_DEEP_IMPORT_CANDIDATE';
    result.candidateDispositions.push({ id: 'PUBLIC-CANDIDATE:' + identity(module.id), packageId: pkg?.id ?? null, moduleId: module.id,
      source: { ...module.source }, disposition, entryIds, publicationAcceptance: 'NOT_VERIFIED' });
    if (!pkg) addBoundary(null, 'module-outside-workspace', module.source);
  }
  for (const issue of configIssues) {
    const pkg = owner(issue.path);
    if (pkg) addBoundary(pkg, issue.reason, { path: issue.path });
  }
  for (const issue of taskr.boundaries) addBoundary(roots.find(pkg => pkg.id === issue.packageId), issue.kind, issue.source, null, { reason: issue.reason });
  for (const field of ['packages', 'entries', 'candidateDispositions', 'boundaries']) result[field].sort((a, b) => compare(a.id, b.id));
  return result;
}
