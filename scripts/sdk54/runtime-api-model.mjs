import { createHash } from 'node:crypto';
import path from 'node:path';
import ts from 'typescript';
import { pluginSourceFacts } from './plugin-source-facts.mjs';
import { serializeInventory } from './source-inventory.mjs';

const virtual = '/__sdk54_runtime__/';
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const excluded = file => /\/(?:__tests__|__mocks__|fixtures|node_modules|build)\//.test(file);
const isCode = file => /\.[cm]?[jt]sx?$/.test(file);
const pointerKey = key => key.replace(/~/g, '~0').replace(/\//g, '~1');
const hasModifier = (node, kind) => ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some(m => m.kind === kind);

// JSON slash escapes preserve source excerpts without treating their URI examples as configuration.
export const serializeRuntimeApi = value => serializeInventory(value).replaceAll('/', '\\/');

function resolveSource(request, from, files) {
  const joined = path.posix.normalize(path.posix.join(path.posix.dirname(from), request));
  if (joined.startsWith('../') || joined.startsWith('/')) throw new Error(`Relative source escapes tree: ${from}: ${request}`);
  const projected = joined.replace(/\/build(?=\/|$)/, '/src');
  const stem = projected.replace(/(?:\.d)?\.[cm]?[jt]sx?$/, '');
  const exactSource = projected === joined && files.has(joined) ? [joined] : [];
  const matches = exactSource.length ? exactSource : [...new Set([
    ...['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.d.ts'].map(ext => stem + ext),
    ...['index.ts', 'index.tsx', 'index.js'].map(name => `${stem}/${name}`),
    projected,
  ].filter(file => files.has(file)))];
  if (matches.length > 1) throw new Error(`Ambiguous source projection ${from}: ${request}: ${matches.join(', ')}`);
  if (!matches.length) throw new Error(`Missing relative source ${from}: ${request}`);
  return { path: matches[0], method: projected !== joined ? 'build-to-source' : matches[0] === joined ? 'exact' : 'extension-or-index', artifactFreshness: 'NOT_VERIFIED' };
}

function manifestEntries(manifest) {
  const entries = [];
  for (const key of ['main', 'types', 'typings', 'module', 'source']) if (typeof manifest[key] === 'string') entries.push({ pointer: `/${key}`, request: manifest[key] });
  const visit = (value, pointer) => {
    if (typeof value === 'string') entries.push({ pointer, request: value });
    else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) visit(child, `${pointer}/${pointerKey(key)}`);
  };
  visit(manifest.exports, '/exports');
  return entries;
}

export function indexRuntimeApi({ files: input, packageNames }) {
  const files = new Map([...input].filter(([file]) => !excluded(file)).sort(([a], [b]) => compare(a, b)));
  const sourceFiles = new Map([...files].filter(([file]) => isCode(file)).map(([file, text]) => {
    const source = ts.createSourceFile(virtual + file, String(text), ts.ScriptTarget.Latest, true);
    if (source.parseDiagnostics.length) throw new Error(`Invalid source syntax: ${file}: ${ts.flattenDiagnosticMessageText(source.parseDiagnostics[0].messageText, ' ')}`);
    return [file, source];
  }));
  const modules = [...sourceFiles].map(([file, source]) => {
    const facts = pluginSourceFacts(String(files.get(file)), file);
    return { id: `MODULE:${file}`, source: { path: file }, exports: facts.exports,
      unresolvedExportStars: source.statements.filter(node => ts.isExportDeclaration(node) && !node.exportClause
        && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && !node.moduleSpecifier.text.startsWith('.')).map(node => ({
        request: node.moduleSpecifier.text, source: { path: file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 }, status: 'NOT_EXPANDED' })),
      references: facts.references.map(ref => ({ ...ref, resolution: ref.request === null ? { kind: 'dynamic', status: 'UNRESOLVED' }
        : ref.request.startsWith('.') ? { kind: 'source', ...resolveSource(ref.request, file, files) }
          : { kind: 'external', request: ref.request, status: 'NOT_RESOLVED' } })) };
  });
  // The host deliberately exposes only the fixed source inputs, never local node_modules.
  const options = { noLib: true, noEmit: true, strict: true, allowJs: true, target: ts.ScriptTarget.Latest, module: ts.ModuleKind.CommonJS };
  const host = {
    getSourceFile: file => sourceFiles.get(file.slice(virtual.length)), getDefaultLibFileName: () => '',
    writeFile() {}, getCurrentDirectory: () => virtual, getDirectories: () => [],
    fileExists: file => file.startsWith(virtual) && files.has(file.slice(virtual.length)),
    readFile: file => file.startsWith(virtual) ? files.get(file.slice(virtual.length)) : undefined,
    getCanonicalFileName: file => file, useCaseSensitiveFileNames: () => true, getNewLine: () => '\n',
    resolveModuleNames: (requests, containing) => requests.map(request => {
      if (!request.startsWith('.')) return undefined;
      const resolved = resolveSource(request, containing.slice(virtual.length), files).path;
      return isCode(resolved) ? { resolvedFileName: virtual + resolved, extension: resolved.endsWith('.tsx') ? ts.Extension.Tsx : resolved.endsWith('.d.ts') ? ts.Extension.Dts : resolved.endsWith('.js') ? ts.Extension.Js : ts.Extension.Ts } : undefined;
    }),
  };
  const program = ts.createProgram([...sourceFiles.keys()].map(file => virtual + file), options, host);
  const checker = program.getTypeChecker();
  const diagnostics = program.getSemanticDiagnostics();
  const conflict = diagnostics.find(d => d.code === 2308);
  if (conflict) throw new Error(`Export conflict 2308: ${conflict.file?.fileName}: ${ts.flattenDiagnosticMessageText(conflict.messageText, ' ')}`);
  const missingRelativeSymbol = diagnostics.find(d => {
    if (![2305, 2459, 2724, 1192, 2613, 2306].includes(d.code) || !d.file || d.start === undefined) return false;
    const statement = d.file.statements.find(node => node.pos <= d.start && d.start < node.end);
    return statement && (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))
      && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text.startsWith('.');
  });
  if (missingRelativeSymbol) throw new Error(`Missing relative export/import symbol ${missingRelativeSymbol.code}: ${missingRelativeSymbol.file.fileName}: ${ts.flattenDiagnosticMessageText(missingRelativeSymbol.messageText, ' ')}`);
  const location = node => {
    const source = node.getSourceFile();
    const position = source.getLineAndCharacterOfPosition(node.getStart(source));
    return { path: source.fileName.slice(virtual.length), line: position.line + 1, column: position.character + 1 };
  };
  const nodeIds = new Map();
  const declarations = [];
  for (const [file, source] of sourceFiles) {
    const counts = new Map();
    for (const statement of source.statements) {
      const nodes = ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : [statement];
      for (const node of nodes) {
        if (!(ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)
          || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node) || ts.isExportAssignment(node) || ts.isModuleDeclaration(node))) continue;
        const name = node.name?.getText(source) ?? (ts.isExportAssignment(node) || hasModifier(node, ts.SyntaxKind.DefaultKeyword) ? 'default' : '<anonymous>');
        const key = `${ts.SyntaxKind[node.kind]}:${name}`;
        const ordinal = (counts.get(key) ?? 0) + 1; counts.set(key, ordinal);
        const id = `DECL:${file}#${key}:${ordinal}`;
        nodeIds.set(node, id);
        declarations.push({ id, name, kind: ts.SyntaxKind[node.kind], source: location(node), node });
      }
    }
  }
  const declarationOf = node => {
    for (let current = node; current && !ts.isSourceFile(current); current = current.parent) if (nodeIds.has(current)) return nodeIds.get(current);
    return null;
  };
  const unalias = symbol => symbol && (symbol.flags & ts.SymbolFlags.Alias) ? checker.getAliasedSymbol(symbol) : symbol;
  const members = [];
  const memberKinds = new Set(['PropertySignature', 'MethodSignature', 'PropertyDeclaration', 'MethodDeclaration', 'GetAccessor', 'SetAccessor',
    'Constructor', 'CallSignature', 'ConstructSignature', 'IndexSignature', 'EnumMember', 'Parameter', 'TypeParameter']);
  const signature = node => {
    const source = node.getSourceFile();
    return source.text.slice(node.getStart(source), node.body && ts.isBlock(node.body) ? node.body.getStart(source) : node.end).trim();
  };
  for (const record of declarations) {
    const { node } = record;
    const counts = new Map();
    const typeReferences = [];
    const walk = (current, prefix) => {
      if (hasModifier(current, ts.SyntaxKind.PrivateKeyword) || hasModifier(current, ts.SyntaxKind.ProtectedKeyword) || (current.name && ts.isPrivateIdentifier(current.name))) return;
      const kind = ts.SyntaxKind[current.kind];
      if (current !== node && memberKinds.has(kind)) {
        const name = current.name?.getText() ?? `$${kind}`;
        prefix = `${prefix}.${name}`;
        const ordinal = (counts.get(prefix) ?? 0) + 1; counts.set(prefix, ordinal);
        members.push({ id: `${record.id}/MEMBER:${prefix}:${ordinal}`, declarationId: record.id, memberPath: prefix, kind,
          optional: Boolean(current.questionToken), readonly: hasModifier(current, ts.SyntaxKind.ReadonlyKeyword), source: location(current), signature: signature(current) });
      }
      const entity = ts.isTypeReferenceNode(current) ? current.typeName : ts.isExpressionWithTypeArguments(current) ? current.expression
        : ts.isTypeQueryNode(current) ? current.exprName : null;
      if (entity || ts.isImportTypeNode(current)) {
        const symbol = entity ? unalias(checker.getSymbolAtLocation(entity)) : undefined;
        const targets = [...new Set((symbol?.declarations ?? []).map(declarationOf).filter(Boolean))].sort();
        const generic = symbol?.declarations?.some(ts.isTypeParameterDeclaration);
        typeReferences.push({ id: `${record.id}/TYPE:${typeReferences.length + 1}`, name: entity?.getText() ?? current.getText(),
          source: location(current), declarationIds: targets, resolution: generic ? 'type-parameter' : targets.length ? 'source' : 'unresolved-or-external' });
      }
      ts.forEachChild(current, child => {
        if (ts.isBlock(child)) return;
        if (child === current.initializer && !(ts.isArrowFunction(child) || ts.isFunctionExpression(child) || ts.isAsExpression(child)
          || ts.isTypeAssertionExpression(child) || ts.isSatisfiesExpression(child))) return;
        walk(child, prefix);
      });
    };
    walk(node, record.name);
    record.signature = signature(node);
    record.typeReferences = typeReferences;
    record.documentation = ts.getJSDocTags(node).map(tag => ({ name: tag.tagName.text, text: tag.getText(), source: location(tag) }));
    delete record.node;
  }
  const packages = [];
  const entries = [];
  for (const name of packageNames) {
    const manifestPath = `packages/${name}/package.json`;
    if (!files.has(manifestPath)) throw new Error(`Missing package manifest: ${manifestPath}`);
    const manifest = JSON.parse(String(files.get(manifestPath)));
    if (manifest.name !== name) throw new Error(`Package name mismatch: ${manifestPath}`);
    const outsideScopeEntries = [];
    const pkg = { id: `PKG:${name}`, name, version: manifest.version, source: { path: manifestPath }, outsideScopeEntries,
      dependencies: Object.fromEntries(['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies'].filter(key => manifest[key]).map(key => [key, manifest[key]])),
      scope: '未评估', implementation: '未评估', milestones: name === 'expo-asset' || name === 'expo-font' ? ['M4', 'M7.2'] : name === 'expo-splash-screen' ? ['M4', 'M7.4'] : ['M7.3'], runtimeAcceptance: 'NOT_RUN' };
    for (const entry of manifestEntries(manifest)) {
      const candidate = path.posix.normalize(path.posix.join(path.posix.dirname(manifestPath), entry.request)).replace(/\/build(?=\/|$)/, '/src');
      if (!candidate.startsWith(`packages/${name}/src/`) && candidate !== `packages/${name}/src`) { outsideScopeEntries.push(entry); continue; }
      const resolved = resolveSource(entry.request, manifestPath, files);
      const add = (sourcePath, platformVariant) => entries.push({ id: `ENTRY:${encodeURIComponent(name)}#${encodeURIComponent(entry.pointer)}:${platformVariant ?? 'base'}`,
        packageId: pkg.id, ...entry, source: { path: sourcePath }, projection: resolved.method, artifactFreshness: 'NOT_VERIFIED', platformVariant });
      add(resolved.path, null);
      const stem = resolved.path.replace(/\.[cm]?[jt]sx?$/, '');
      if (!/\.(?:server|android|ios|native|web)$/.test(stem)) for (const platform of ['android', 'ios', 'native', 'web']) {
        const variants = ['.ts', '.tsx', '.js'].map(ext => `${stem}.${platform}${ext}`).filter(file => files.has(file));
        if (variants.length > 1) throw new Error(`Ambiguous platform source: ${stem}.${platform}`);
        if (variants.length) add(variants[0], platform);
      }
    }
    if (!entries.some(entry => entry.packageId === pkg.id)) throw new Error(`Missing runtime entry for ${name}`);
    packages.push(pkg);
  }
  const apis = [];
  for (const entry of entries) {
    const source = sourceFiles.get(entry.source.path);
    const symbol = checker.getSymbolAtLocation(source);
    if (!symbol) throw new Error(`Runtime entry is not a module: ${entry.source.path}`);
    const expand = (moduleSymbol, prefix, visited) => {
      for (const exported of checker.getExportsOfModule(moduleSymbol).sort((a, b) => compare(a.name, b.name))) {
        const target = unalias(exported);
        const nodes = target?.declarations ?? [];
        const exportPath = [...prefix, exported.name];
        const name = exportPath.join('.');
        const declarationIds = [...new Set(nodes.map(declarationOf).filter(Boolean))].sort();
        const namespace = nodes.find(ts.isSourceFile);
        apis.push({ id: `API:${entry.id}#/${exportPath.map(pointerKey).join('/')}`, entryId: entry.id, packageId: entry.packageId, name, exportPath,
          source: location(exported.declarations?.[0] ?? source), declarationIds,
          resolution: namespace ? 'namespace' : declarationIds.length ? 'source' : 'unresolved-or-external',
          targetModuleId: namespace ? `MODULE:${namespace.fileName.slice(virtual.length)}` : null,
          symbolSpaces: { type: Boolean(target?.flags & ts.SymbolFlags.Type), value: Boolean(target?.flags & ts.SymbolFlags.Value) },
          typeOnlySyntax: exported.declarations?.some(node => ts.isExportSpecifier(node) && (node.isTypeOnly || node.parent.parent.isTypeOnly)) ?? false });
        if (namespace && !visited.has(target)) expand(target, exportPath, new Set(visited).add(target));
      }
    };
    expand(symbol, [], new Set([symbol]));
  }
  const declarationsById = new Map(declarations.map(record => [record.id, record]));
  const reachable = new Map(declarations.map(record => [record.id, new Set()]));
  for (const entry of entries) {
    const queue = new Set(apis.filter(api => api.entryId === entry.id).flatMap(api => api.declarationIds));
    for (const id of queue) {
      const declaration = declarationsById.get(id);
      reachable.get(id).add(entry.id);
      for (const reference of declaration.typeReferences) for (const target of reference.declarationIds) queue.add(target);
    }
  }
  for (const declaration of declarations) declaration.syntacticPublicEntryIds = [...reachable.get(declaration.id)].sort();
  for (const member of members) member.syntacticPublicEntryIds = [...reachable.get(member.declarationId)].sort();
  for (const records of [packages, entries, modules, apis, declarations, members]) {
    const ids = new Set();
    for (const record of records) {
      if (ids.has(record.id)) throw new Error(`Duplicate generated ID: ${record.id}`);
      ids.add(record.id);
    }
  }
  const sort = records => records.sort((a, b) => compare(a.id, b.id));
  return { schemaVersion: 1, compilerVersion: ts.version, fullPublicSurfaceComplete: false, stageClosable: false,
    limitation: 'Syntax declaration/member index for explicit runtime source entries. No inferred type expansion, external library expansion, Metro platform selection or runtime acceptance.',
    inputs: [...files].map(([file, text]) => ({ path: file, sha256: sha256(text) })), packages: sort(packages), entries: sort(entries),
    modules: sort(modules), apis: sort(apis), declarations: sort(declarations), members: sort(members) };
}

export function validateRuntimeApi(actual, expected) {
  const failures = [];
  for (const field of ['inputs', 'packages', 'entries', 'modules', 'apis', 'declarations', 'members']) {
    const seen = new Set();
    const values = actual?.[field] ?? [];
    for (const record of values) {
      const id = field === 'inputs' ? record.path : record.id;
      if (seen.has(id)) failures.push(`Duplicate ${field}: ${id}`);
      seen.add(id);
    }
    for (const record of expected[field]) {
      const id = field === 'inputs' ? record.path : record.id;
      const value = values.find(entry => (field === 'inputs' ? entry.path : entry.id) === id);
      if (!value || serializeInventory(value) !== serializeInventory(record)) failures.push(`${!value ? 'Missing' : 'Changed'} ${field} ${id} at ${record.source?.path ?? record.path ?? ''}`);
    }
  }
  if (serializeInventory(actual) !== serializeInventory(expected)) failures.push('Runtime API index differs from rebuilt fixed source');
  return { valid: !failures.length, failures };
}
