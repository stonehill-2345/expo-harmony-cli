import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import ts from 'typescript';
import { SDK54_EXPO_COMMIT } from './catalog.mjs';
import { buildSourceInventory, readSourceTree, readSourceBlobs, prefetchSourceBlobs, serializeInventory } from './source-inventory.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const code = file => /\.[cm]?[jt]sx?$/.test(file);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const pointer = name => String(name).replaceAll('~', '~0').replaceAll('/', '~1');
const modifier = (node, kind) => ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some(m => m.kind === kind);
const literal = node => node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
const commonjsTarget = node => {
  if (ts.isIdentifier(node)) return node.text === 'exports';
  if (ts.isPropertyAccessExpression(node)) return node.expression.getText() === 'module' && node.name.text === 'exports' || commonjsTarget(node.expression);
  if (ts.isElementAccessExpression(node)) return node.expression.getText() === 'module' && literal(node.argumentExpression) === 'exports' || commonjsTarget(node.expression);
  return false;
};
export const serializeWorkspaceSurface = value => serializeInventory(value).replaceAll('/', '\\/');

function role(file) {
  if (/\/(?:__tests__|__mocks__|fixtures|__fixtures__|test|tests)\//.test(file) || /\.(?:test|spec|stories)\.[cm]?[jt]sx?$/.test(file)) return 'test';
  if (/\/(?:build|node_modules)\//.test(file)) return 'generated-or-vendored';
  if (file.endsWith('/package.json')) return 'manifest';
  return code(file) ? 'production-code' : 'native-or-resource';
}

function rootsFor(inventory) {
  return [...inventory.packages, ...(inventory.templates ?? [])].map(pkg => ({ ...pkg, directory: path.posix.dirname(pkg.sourcePath) }))
    .sort((a, b) => b.directory.length - a.directory.length || compare(a.id, b.id));
}

export function selectWorkspaceSources(entries, inventory) {
  const roots = rootsFor(inventory);
  return entries.filter(entry => roots.some(root => entry.path.startsWith(`${root.directory}/`)) && ['manifest', 'production-code'].includes(role(entry.path)))
    .map(entry => { if (entry.type !== 'blob' || entry.mode === '120000') throw new Error(`Unsupported source/symlink ${entry.path}`); return entry; });
}

function assignment(pkg) {
  const name = pkg.name;
  const deferred = /^(?:expo-updates(?:-interface)?|expo-dev-(?:client|launcher|menu|menu-interface)|expo-eas-client|eas-expo-go)$/.test(name);
  const scope = deferred ? { state: '关联暂缓待逐项核验', reason: /updates/.test(name) ? 'DEFER-UPDATES' : /expo-go/.test(name) ? 'DEFER-GO' : /eas/.test(name) ? 'DEFER-EAS-SERVICES' : 'DEFER-DEV-CLIENT', sharedUseRequiresReview: true }
    : { state: '本轮必评', reason: pkg.private ? '内部包与消费/验证关系仍须评估' : '固定 workspace 来源，不以缺 Harmony 分支判不适用' };
  let batch = 'M7.1';
  if (/^expo-(?:asset|font|file-system|sqlite|secure-store|clipboard|blob|crypto|standard-web-crypto|json-utils|structured-headers)$/.test(name)) batch = 'M7.2';
  else if (/^expo-(?:application|age-range|battery|brightness|calendar|cellular|contacts|device|document-picker|haptics|intent-launcher|keep-awake|linking|local-authentication|localization|location|mail-composer|network(?:-addons)?|notifications|screen-capture|screen-orientation|sensors|sharing|sms|speech|status-bar|store-review|system-ui|task-manager|background-fetch|background-task)$/.test(name)) batch = 'M7.3';
  else if (name === '@expo/ui' || /^expo-(?:audio|av|blur|camera|checkbox|gl|glass-effect|image(?:-.*)?|linear-gradient|live-photo|maps|media-library|mesh-gradient|splash-screen|symbols|video(?:-.*)?)$/.test(name)) batch = 'M7.4';
  else if (/^expo-(?:dev-|updates|eas-client|insights)/.test(name) || name === '@expo/devtools' || name === 'eas-expo-go') batch = 'M7.5';
  else if (/^expo-(?:apple-authentication|build-properties|navigation-bar|processing|tracking-transparency|web-browser)$/.test(name)) batch = 'M7.6';
  return { batch, scope };
}

export function indexWorkspaceSurface({ entries: treeEntries, inventory, files, source }) {
  const roots = rootsFor(inventory), tree = new Map(treeEntries.map(e => [e.path, e]));
  const owner = file => roots.find(root => file.startsWith(`${root.directory}/`));
  const owned = treeEntries.filter(e => owner(e.path));
  const selected = selectWorkspaceSources(treeEntries, inventory);
  const inputs = selected.map(entry => {
    const value = files.get(entry.path); if (value === undefined) throw new Error(`Missing source ${entry.path}`);
    const bytes = Buffer.from(value);
    const actual = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (actual !== entry.oid) throw new Error(`Source integrity mismatch ${entry.path}`);
    return { path: entry.path, blob: entry.oid, sha256: hash(bytes), bytes: bytes.length };
  });
  const result = { schemaVersion: 1, compilerVersion: ts.version, source, inventorySha256: hash(serializeInventory(inventory)),
    publicSurfaceComplete: false, stageClosable: false,
    boundary: 'Whole workspace source syntax census; inferred/external/native API semantics require explicit gap resolution. Source projections are not published artifact checks.',
    inputs, packages: [], files: [], modules: [], entries: [], exports: [], declarations: [], members: [], references: [], gaps: [] };
  const metadata = pkg => ({ packageId: pkg.id, ...assignment(pkg) });
  const gap = (kind, id, source, details, pkg) => result.gaps.push({ id: `GAP:${id}:${kind}`, kind, source, details, ...metadata(pkg) });
  for (const entry of owned) result.files.push({ id: `FILE:${entry.path}`, path: entry.path, blob: entry.oid, mode: entry.mode, role: role(entry.path), ...metadata(owner(entry.path)) });

  // Projection is a source relationship only; all candidates are retained instead of picking a host-specific platform.
  function targetsFor(request, from, allowWildcard = false) {
    if (allowWildcard && !request.startsWith('.')) {
      const workspace = roots.find(root => request === root.name || request.startsWith(root.name + '/'));
      if (workspace) {
        const subpath = request.slice(workspace.name.length + 1);
        const manifest = JSON.parse(String(files.get(workspace.sourcePath)));
        const nested = subpath || manifest.source || manifest.main || 'index';
        if (nested !== request) return { ...targetsFor('./' + nested, workspace.sourcePath, true), bareWorkspaceId: workspace.id };
      }
    }
    const joined = path.posix.normalize(path.posix.join(path.posix.dirname(from), request));
    if (joined.startsWith('../') || joined.startsWith('/')) return { status: 'outside-source', targets: [] };
    const projected = joined.replace(/\/build(?=\/|$)/, '/src').replace(/\/src\/(?:cjs|mjs|src)(?=\/|$)/, '/src').replace(/\.d$/, '');
    const matches = base => {
      if (allowWildcard && base.includes('*')) {
        const pattern = new RegExp('^' + base.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.+)') + '$');
        const stemPattern = new RegExp('^' + base.replace(/(?:\.d)?\.[cm]?[jt]sx?$/, '').split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.+)') + '\\.(?:[cm]?[jt]sx?|d\\.ts)$');
        return [...tree.keys()].filter(file => pattern.test(file) || stemPattern.test(file));
      }
      if (tree.has(base)) return [base];
      const stem = base.replace(/(?:\.d)?\.[cm]?[jt]sx?$/, '');
      const candidates = [stem, ...['.ts', '.tsx', '.mts', '.cts', '.d.ts', '.js', '.jsx', '.mjs', '.cjs', '.json'].map(ext => stem + ext),
        ...['index.ts', 'index.tsx', 'index.js', 'index.json'].map(name => `${base}/${name}`)];
      const exact = candidates.find(file => tree.has(file));
      if (exact) return [exact];
      return ['native', 'ios', 'android', 'web', 'server'].flatMap(platform => ['.ts', '.tsx', '.js', '.jsx'].map(ext => `${stem}.${platform}${ext}`)).filter(file => tree.has(file));
    };
    let projectedMatches = projected !== joined ? matches(projected) : [];
    if (!projectedMatches.length && /\/build\/bin\//.test(joined)) projectedMatches = matches(joined.replace('/build/bin/', '/bin/'));
    const direct = matches(joined), matchesFound = projectedMatches.length ? projectedMatches : direct;
    const platformOnly = matchesFound.length && matchesFound.every(file => /\.(?:native|ios|android|web|server)\.[jt]sx?$/.test(file)) && !/\.(?:native|ios|android|web|server)(?:\.[jt]sx?)?$/.test(projected);
    return { status: matchesFound.length ? allowWildcard && joined.includes('*') ? 'pattern' : platformOnly ? 'platform-dependent' : matchesFound.length === 1 ? 'source' : 'ambiguous' : 'missing',
      method: projectedMatches.length ? 'build-to-source' : 'direct',
      targets: matchesFound.sort().map(file => ({ path: file, blob: tree.get(file).oid, fileId: owner(file) ? `FILE:${file}` : null, packageId: owner(file)?.id ?? null })) };
  }

  const manifests = new Map(roots.map(pkg => [pkg.id, JSON.parse(String(files.get(pkg.sourcePath)))]));
  for (const pkg of roots) {
    const manifest = manifests.get(pkg.id), deps = [];
    for (const section of ['dependencies', 'peerDependencies', 'devDependencies', 'optionalDependencies']) for (const [name, spec] of Object.entries(manifest[section] ?? {})) {
      const workspace = roots.find(root => root.name === name && !String(spec).startsWith('npm:'));
      deps.push({ name, spec, section, packageId: workspace?.id ?? null, boundary: workspace ? 'workspace' : 'external-or-alias' });
    }
    result.packages.push({ id: pkg.id, name: pkg.name, source: { path: pkg.sourcePath, blob: tree.get(pkg.sourcePath)?.oid }, dependencies: deps, ...assignment(pkg) });
    const visitEntry = (value, key) => {
      if (typeof value === 'string') {
        const resolution = targetsFor(value, pkg.sourcePath, true);
        const record = { id: `ENTRY:${pkg.id}${key}`, source: { path: pkg.sourcePath, pointer: key }, request: value, ...resolution, ...metadata(pkg) };
        result.entries.push(record);
        if (!['source', 'pattern'].includes(resolution.status)) gap('entry-' + resolution.status, record.id, record.source, value, pkg);
      } else if (value && typeof value === 'object') for (const [name, child] of Object.entries(value)) visitEntry(child, `${key}/${pointer(name)}`);
      else if (value !== undefined) result.entries.push({ id: `ENTRY:${pkg.id}${key}`, source: { path: pkg.sourcePath, pointer: key }, request: value, status: value === false || value === null ? 'disabled' : 'unsupported', targets: [], ...metadata(pkg) });
    };
    for (const key of ['main', 'module', 'types', 'typings', 'source', 'react-native', 'browser', 'exports', 'bin']) visitEntry(manifest[key], `/${key}`);
  }

  const declarationKinds = new Set(['VariableDeclaration', 'FunctionDeclaration', 'ClassDeclaration', 'InterfaceDeclaration', 'TypeAliasDeclaration', 'EnumDeclaration', 'ModuleDeclaration', 'ImportEqualsDeclaration']);
  const memberKinds = new Set(['PropertySignature', 'MethodSignature', 'PropertyDeclaration', 'MethodDeclaration', 'GetAccessor', 'SetAccessor', 'Constructor', 'CallSignature', 'ConstructSignature', 'IndexSignature', 'EnumMember', 'Parameter', 'TypeParameter', 'NamedTupleMember', 'PropertyAssignment', 'ShorthandPropertyAssignment', 'SpreadAssignment', 'MappedType']);
  for (const input of inputs.filter(input => role(input.path) === 'production-code')) {
    const pkg = owner(input.path), text = String(files.get(input.path));
    const bindings = [];
    const projectedText = text.replace(/<%[-=]\s*project\.([A-Za-z_]\w*)\s*%>/g, (token, name, start) => {
      const replacement = `Template_${name}`.padEnd(token.length, '_');
      if (replacement.length !== token.length) throw new Error(`Unsupported short template token ${input.path}:${start}`);
      bindings.push({ expression: token, replacement, start, end: start + token.length });
      return replacement;
    });
    const parsed = ts.createSourceFile(input.path, projectedText, ts.ScriptTarget.Latest, true);
    const spelling = node => text.slice(node.getStart(parsed), node.end);
    const sourceLiteral = node => {
      const value = literal(node);
      return value === null ? null : bindings.reduce((current, binding) => current.replaceAll(binding.replacement, binding.expression), value);
    };
    const loc = node => { const position = parsed.getLineAndCharacterOfPosition(node.getStart(parsed)); return { path: input.path, line: position.line + 1, column: position.character + 1, start: node.getStart(parsed), end: node.end, blob: input.blob }; };
    const moduleId = `MODULE:${input.path}`, counts = new Map();
    const unique = key => { const count = (counts.get(key) ?? 0) + 1; counts.set(key, count); return `${key}:${count}`; };
    const idOf = (kind, name) => unique(`${kind}:${input.path}#${pointer(name)}`);
    result.modules.push({ id: moduleId, source: { path: input.path, blob: input.blob, sha256: input.sha256 }, templateProjection: bindings.length ? { kind: 'syntax-only-fixed-width', bindings } : null, parseDiagnostics: parsed.parseDiagnostics.map(d => ({ code: d.code, start: d.start, message: ts.flattenDiagnosticMessageText(d.messageText, ' ') })), ...metadata(pkg) });
    if (bindings.length) gap('uninstantiated-template', moduleId, { path: input.path, blob: input.blob, start: bindings[0].start }, '固定宽度标识符仅供语法枚举；真实模板渲染和生成类型尚未验收', pkg);
    for (const diagnostic of parsed.parseDiagnostics) gap('unsupported-syntax', `${moduleId}:${diagnostic.start}`, { path: input.path, start: diagnostic.start, blob: input.blob }, ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '), pkg);
    const refs = [];
    const reference = (node, requestNode, kind) => {
      const request = sourceLiteral(requestNode), id = idOf('REF', `${kind}:${request ?? '<dynamic>'}`);
      let resolution;
      if (request === null) resolution = { kind: 'dynamic', status: 'unresolved', targets: [] };
      else if (request.startsWith('.')) resolution = { kind: 'relative', ...targetsFor(request, input.path) };
      else {
        const name = request.startsWith('@') ? request.split('/').slice(0, 2).join('/') : request.split('/')[0];
        const workspace = roots.find(root => root.name === name);
        resolution = { kind: workspace ? 'workspace' : 'external', packageId: workspace?.id ?? null, name, request, status: workspace ? 'package-known' : 'boundary', targets: [] };
      }
      const record = { id, moduleId, kind, request, expression: requestNode ? spelling(requestNode) : null, resolution, source: loc(node), ...metadata(pkg) };
      result.references.push(record); refs.push(id);
      if (resolution.kind === 'relative' && !['source', 'pattern'].includes(resolution.status) || resolution.kind === 'dynamic') gap('reference-' + resolution.status, id, record.source, record.expression, pkg);
      if (kind === 'export-star' && resolution.kind === 'external') gap('external-star', id, record.source, request, pkg);
      if (kind === 'export-star' && resolution.kind === 'workspace') gap('workspace-star', id, record.source, '跨包 star 的导出符号尚未展开: ' + request, pkg);
      if (resolution.targets.some(target => !target.packageId)) gap('outside-workspace-reference', id, record.source, request, pkg);
    };
    const exported = (node, name, kind, target = null) => result.exports.push({ id: idOf('EXPORT', `${kind}:${name}`), name, kind, moduleId, target, source: loc(node), dependencies: refs, ...metadata(pkg) });
    const walkRefs = node => {
      if (ts.isImportDeclaration(node)) reference(node, node.moduleSpecifier, 'import');
      if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) reference(node, node.moduleReference.expression, 'import-equals');
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) reference(node, node.argument.literal, 'import-type');
      if (ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier) reference(node, node.moduleSpecifier, node.exportClause ? 'reexport' : 'export-star');
        if (!node.exportClause) exported(node, '*', 'star', literal(node.moduleSpecifier));
        else if (ts.isNamedExports(node.exportClause)) for (const item of node.exportClause.elements) exported(item, item.name.text, node.isTypeOnly || item.isTypeOnly ? 'type-reexport' : 'named-reexport', item.propertyName?.text ?? item.name.text);
        else exported(node, node.exportClause.name.text, 'namespace-reexport', literal(node.moduleSpecifier));
      }
      if (ts.isExportAssignment(node)) exported(node, node.isExportEquals ? 'export=' : 'default', 'assignment', node.expression.getText(parsed));
      if (modifier(node, ts.SyntaxKind.ExportKeyword) && !ts.isExportDeclaration(node)) {
        if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) exported(declaration, spelling(declaration.name), 'declaration');
        else exported(node, modifier(node, ts.SyntaxKind.DefaultKeyword) ? 'default' : node.name ? spelling(node.name) : '<anonymous>', 'declaration');
      }
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const left = node.left.getText(parsed);
        if (commonjsTarget(node.left)) {
          exported(node, left, 'commonjs', node.right.getText(parsed));
          if (!(ts.isObjectLiteralExpression(node.right) || ts.isIdentifier(node.right) || ts.isFunctionExpression(node.right) || ts.isArrowFunction(node.right) || ts.isClassExpression(node.right) || ts.isCallExpression(node.right) && node.right.expression.getText(parsed) === 'require' && literal(node.right.arguments[0]) !== null)) gap('dynamic-commonjs', idOf('CJS', left), loc(node), node.right.getText(parsed), pkg);
        }
      }
      if (ts.isCallExpression(node)) {
        const callee = node.expression.getText(parsed);
        if (['require', 'require.resolve'].includes(callee) || node.expression.kind === ts.SyntaxKind.ImportKeyword) reference(node, node.arguments[0], callee);
        if (['Object.defineProperty', 'Object.defineProperties', 'Object.assign'].includes(callee) && node.arguments[0] && commonjsTarget(node.arguments[0])) {
          const name = callee === 'Object.defineProperty' ? literal(node.arguments[1]) : null;
          if (name !== null) exported(node, name, 'commonjs-property-definition');
          else exported(node, `${callee}:<dynamic>`, 'commonjs-mutation');
          gap('dynamic-export-mutation', idOf('CJS-CALL', callee), loc(node), node.getText(parsed), pkg);
        }
      }
      ts.forEachChild(node, walkRefs);
    };
    walkRefs(parsed);
    const collectDeclaration = (node, namespace = '') => {
      if (ts.isVariableStatement(node)) { for (const declaration of node.declarationList.declarations) collectDeclaration(declaration, namespace); return; }
      if (ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression) && node.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken && commonjsTarget(node.expression.left)) return collectDeclaration(node.expression, namespace);
      const commonjs = ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken;
      if (!commonjs && !ts.isExportAssignment(node) && !declarationKinds.has(ts.SyntaxKind[node.kind])) return;
      const name = commonjs ? spelling(node.left) : ts.isExportAssignment(node) ? node.isExportEquals ? 'export=' : 'default' : node.name ? spelling(node.name) : '<anonymous>', id = idOf('DECL', `${namespace}${ts.SyntaxKind[node.kind]}:${name}`);
      const signatureEnd = node.body && ts.isBlock(node.body) ? node.body.getStart(parsed) : node.initializer ? node.initializer.getStart(parsed) : node.end;
      const record = { id, moduleId, name, kind: ts.SyntaxKind[node.kind], source: loc(node), signature: text.slice(node.getStart(parsed), signatureEnd).trim(), dependencies: [...refs], typeReferences: [], ...metadata(pkg) };
      result.declarations.push(record);
      if (ts.isVariableDeclaration(node) && !node.type || ts.isFunctionDeclaration(node) && !node.type || ts.isClassDeclaration(node) && node.heritageClauses?.length) gap('inferred-type', id, record.source, '语法索引保留源声明；推断结果/外部继承尚未展开', pkg);
      const walkMembers = (current, memberPath) => {
        if (modifier(current, ts.SyntaxKind.PrivateKeyword) || modifier(current, ts.SyntaxKind.ProtectedKeyword) || current.name && ts.isPrivateIdentifier(current.name)) return;
        if (current !== node && memberKinds.has(ts.SyntaxKind[current.kind])) {
          const memberName = current.name ? spelling(current.name) : `$${ts.SyntaxKind[current.kind]}`;
          memberPath += '/' + pointer(memberName);
          const memberId = unique(`${id}/MEMBER:${memberPath}:${ts.SyntaxKind[current.kind]}`);
          const end = current.body && ts.isBlock(current.body) ? current.body.getStart(parsed) : current.initializer ? current.initializer.getStart(parsed) : current.end;
          result.members.push({ id: memberId, declarationId: id, name: memberName, memberPath, kind: ts.SyntaxKind[current.kind], source: loc(current), optional: Boolean(current.questionToken), signature: text.slice(current.getStart(parsed), end).trim(), dependencies: [...refs], ...metadata(pkg) });
        }
        if (ts.isTypeReferenceNode(current) || ts.isExpressionWithTypeArguments(current) || ts.isTypeQueryNode(current)) record.typeReferences.push({ name: (current.typeName ?? current.expression ?? current.exprName).getText(parsed), source: loc(current) });
        ts.forEachChild(current, child => { if (!ts.isBlock(child)) walkMembers(child, memberPath); });
      };
      walkMembers(node, pointer(name));
      if (ts.isModuleDeclaration(node) && node.body && ts.isModuleBlock(node.body)) for (const statement of node.body.statements) collectDeclaration(statement, `${namespace}${name}.`);
    };
    for (const statement of parsed.statements) collectDeclaration(statement);
  }
  for (const key of ['packages', 'files', 'modules', 'entries', 'exports', 'declarations', 'members', 'references', 'gaps']) {
    result[key].sort((a, b) => compare(a.id, b.id));
    const seen = new Set(); for (const item of result[key]) { if (seen.has(item.id)) throw new Error(`Duplicate ${key} ID ${item.id}`); seen.add(item.id); }
  }
  return result;
}

export function validateWorkspaceSurface(actual, expected) {
  const failures = [];
  const inputPaths = new Set();
  const inputMap = new Map();
  for (const input of actual?.inputs ?? []) {
    if (inputPaths.has(input.path)) failures.push(`Duplicate input ${input.path}`);
    inputPaths.add(input.path); inputMap.set(input.path, input);
  }
  for (const input of expected.inputs) {
    const value = inputMap.get(input.path);
    if (!value || serializeInventory(value) !== serializeInventory(input)) failures.push(`${!value ? 'Missing' : 'Changed'} input source ${input.path}`);
    inputMap.delete(input.path);
  }
  for (const file of inputMap.keys()) failures.push(`Unexpected input source ${file}`);
  for (const key of ['packages', 'files', 'modules', 'entries', 'exports', 'declarations', 'members', 'references', 'gaps']) {
    const seen = new Set(), values = new Map();
    for (const record of actual?.[key] ?? []) { if (seen.has(record.id)) failures.push(`Duplicate ${key} ${record.id}`); seen.add(record.id); values.set(record.id, record); }
    for (const record of expected[key]) {
      const value = values.get(record.id);
      if (!value || serializeInventory(value) !== serializeInventory(record)) failures.push(`${!value ? 'Missing' : 'Changed'} ${key} ${record.id} at ${record.source?.path ?? record.path ?? record.id}:${record.source?.line ?? record.source?.pointer ?? ''}`);
      values.delete(record.id);
    }
    for (const id of values.keys()) failures.push(`Unexpected ${key} ${id}`);
  }
  if (serializeInventory(actual) !== serializeInventory(expected)) failures.push('Workspace surface differs from fixed source reconstruction');
  return { valid: !failures.length, failures };
}

export function buildWorkspaceSurface({ sourceDir, prefetch = false }) {
  const inventory = buildSourceInventory({ sourceDir, prefetch });
  const { tree, entries } = readSourceTree(sourceDir, SDK54_EXPO_COMMIT);
  if (tree !== inventory.source.tree) throw new Error('Fixed source tree mismatch');
  const selected = selectWorkspaceSources(entries, inventory);
  if (prefetch) prefetchSourceBlobs(sourceDir, selected);
  // Chunk reads stay below the fixed Git reader maxBuffer for large workspaces.
  const files = new Map();
  for (let start = 0; start < selected.length; start += 200) for (const [file, value] of readSourceBlobs(sourceDir, selected.slice(start, start + 200))) files.set(file, value.toString('utf8'));
  return indexWorkspaceSurface({ entries, inventory, files, source: { revision: SDK54_EXPO_COMMIT, tree } });
}

export function summarizeWorkspaceSurface(result, artifact) {
  const count = (records, key) => Object.fromEntries([...new Set(records.map(r => r[key]))].sort().map(value => [value, records.filter(r => r[key] === value).length]));
  return { schemaVersion: 1, source: result.source, artifact,
    counts: Object.fromEntries(['inputs', 'packages', 'files', 'modules', 'entries', 'exports', 'declarations', 'members', 'references', 'gaps'].map(key => [key, result[key].length])),
    fileRoles: count(result.files, 'role'), gapKinds: count(result.gaps, 'kind'),
    packages: result.packages.map(pkg => ({ id: pkg.id, name: pkg.name, source: pkg.source, batch: pkg.batch, scope: pkg.scope,
      modules: result.modules.filter(m => m.packageId === pkg.id).length,
      gapKinds: count(result.gaps.filter(g => g.packageId === pkg.id), 'kind') })),
    nonInferredGaps: result.gaps.filter(g => g.kind !== 'inferred-type'),
    assessment: '批次为按包职责的预分配，暂缓关联仍需逐条审阅；语法扫描不接受为全量公开面完成。',
    publicSurfaceComplete: false, stageClosable: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2), sourceIndex = args.indexOf('--source');
    if (sourceIndex < 0 || !args[sourceIndex + 1]) throw new Error('Required --source <fixed-git-dir>');
    const sourceDir = args.splice(sourceIndex, 2)[1], prefetch = args.includes('--prefetch');
    if (prefetch) args.splice(args.indexOf('--prefetch'), 1);
    const summaryIndex = args.indexOf('--summary');
    const summaryPath = summaryIndex >= 0 ? args.splice(summaryIndex, 2)[1] : null;
    if (summaryIndex >= 0 && (!summaryPath || !args.includes('--output'))) throw new Error('--summary requires --output and a destination');
    if (args.length !== 2 || !['--check', '--output'].includes(args[0])) throw new Error('Usage: --source <dir> [--prefetch] --output|--check <json>');
    const expected = buildWorkspaceSurface({ sourceDir, prefetch });
    if (args[0] === '--check') {
      const buffer = fs.readFileSync(args[1]);
      const checked = validateWorkspaceSurface(JSON.parse((args[1].endsWith('.gz') ? gunzipSync(buffer) : buffer).toString('utf8')), expected);
      console.log(JSON.stringify(checked)); if (!checked.valid) process.exitCode = 1;
    } else {
      const serialized = serializeWorkspaceSurface(expected);
      fs.writeFileSync(args[1], args[1].endsWith('.gz') ? gzipSync(serialized) : serialized);
      if (summaryPath) fs.writeFileSync(summaryPath, serializeWorkspaceSurface(summarizeWorkspaceSurface(expected, { path: args[1], sha256: hash(fs.readFileSync(args[1])) })));
      console.log(JSON.stringify({ ...Object.fromEntries(['inputs', 'packages', 'files', 'modules', 'entries', 'exports', 'declarations', 'members', 'references', 'gaps'].map(k => [k, expected[k].length])), publicSurfaceComplete: expected.publicSurfaceComplete, stageClosable: false }));
    }
  } catch (error) { console.error(error.stack); process.exitCode = 1; }
}
