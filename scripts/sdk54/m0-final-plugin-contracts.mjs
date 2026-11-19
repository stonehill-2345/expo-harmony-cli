import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const digest = value => createHash('sha256').update(value).digest('hex');
const revision = '5b42e3d21e0ac5e086752361ca8a5cb4de53bec1';
const tree = '5457e824b21d968e55c8f533cdf1751860160a92';
const unique = values => [...new Set(values)];
const normal = value => value.replaceAll('\\', '/').replace(/^\//, '');
const named = node => ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node) || ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node);
const flatten = (node, operator, ast) => ts.isBinaryExpression(node) && node.operatorToken.kind === operator
  ? [...flatten(node.left, operator, ast), ...flatten(node.right, operator, ast)] : [node.getText(ast)];
function functionValue(node) {
  let value = ts.isVariableDeclaration(node) ? node.initializer : node;
  while (value && (ts.isParenthesizedExpression(value) || ts.isAsExpression(value) || ts.isSatisfiesExpression(value))) value = value.expression;
  return value && ts.isFunctionLike(value) ? value : null;
}

export function buildFinalPluginContracts({ files, candidates, linkage = [], typeContracts = null, modulePaths = null }) {
  assert(files instanceof Map, 'Fixed files map required');
  assert.equal(new Set(candidates.map(row => row.id)).size, candidates.length, 'Duplicate plugin candidate');
  const packageRoots = new Map();
  for (const [file, text] of files) if (file.endsWith('/package.json')) {
    const manifest = JSON.parse(text);
    if (manifest.name) packageRoots.set(manifest.name, { root: path.posix.dirname(file), manifest });
  }
  function resolve(request, from) {
    const candidateBases = [];
    if (request.startsWith('.')) candidateBases.push(path.posix.normalize(path.posix.join(path.posix.dirname(from), request)));
    else {
      const parts = request.split('/'), name = parts[0].startsWith('@') ? parts.splice(0, 2).join('/') : parts.shift();
      const owner = packageRoots.get(name), subpath = parts.join('/');
      if (owner) {
        if (subpath) candidateBases.push(`${owner.root}/${subpath}`);
        else for (const entry of [owner.manifest.types, owner.manifest.typings, owner.manifest.main, 'src/index', 'index']) if (typeof entry === 'string') candidateBases.push(path.posix.join(owner.root, entry));
      }
    }
    for (const base of candidateBases) {
      const projected = [base.replace('/build/', '/src/').replace(/\.js$/, '.ts'), base.replace('/build/', '/src/'), base.replace(/\.js$/, '.ts'), base];
      for (const stem of unique(projected)) for (const suffix of ['', '.ts', '.tsx', '.js', '.jsx', '.d.ts', '/index.ts', '/index.tsx', '/index.js', '/index.d.ts']) if (files.has(stem + suffix)) return stem + suffix;
    }
    return null;
  }
  const sourceCache = new Map();
  const rootNames = (modulePaths ?? [...files.keys()]).filter(file => /\.[cm]?[jt]sx?$/.test(file) && files.has(file));
  const compilerOptions = { allowJs: true, checkJs: false, noLib: true, noEmit: true, target: ts.ScriptTarget.Latest, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.Preserve, skipLibCheck: true, resolveJsonModule: false };
  const host = {
    getSourceFile(file, languageVersion) {
      file = normal(file);
      if (!files.has(file) || file.endsWith('.json')) return undefined;
      if (!sourceCache.has(file)) sourceCache.set(file, ts.createSourceFile(file, files.get(file), languageVersion, true));
      return sourceCache.get(file);
    },
    fileExists: file => files.has(normal(file)), readFile: file => files.get(normal(file)),
    getDefaultLibFileName: () => 'lib.d.ts', writeFile: () => {}, getCurrentDirectory: () => '',
    getDirectories: () => [], directoryExists: () => true, getCanonicalFileName: file => file,
    useCaseSensitiveFileNames: () => true, getNewLine: () => '\n',
    resolveModuleNames: (requests, from) => requests.map(request => {
      const resolvedFileName = resolve(request, normal(from));
      return resolvedFileName ? { resolvedFileName, isExternalLibraryImport: false } : undefined;
    }),
  };
  const program = ts.createProgram(rootNames, compilerOptions, host), checker = program.getTypeChecker();
  const nodeRows = new Map(), idRows = new Map(), modules = [], sourceRows = [];
  function source(node, ast) {
    const start = node.getStart(ast), end = node.end, location = ast.getLineAndCharacterOfPosition(start);
    const text = ast.text.slice(start, end);
    return { path: ast.fileName, start, end, line: location.line + 1, column: location.character + 1, sha256: digest(text), fileSha256: digest(ast.text), text };
  }
  function add(node, ast, name, kind) {
    const id = `PLUGIN-DECL:${ast.fileName}:${node.getStart(ast)}`;
    const value = functionValue(node);
    const row = { id, name, kind, source: source(node, ast), parameters: value?.parameters.map(parameter => parameter.getText(ast)) ?? [], typeParameters: value?.typeParameters?.map(parameter => parameter.getText(ast)) ?? [], referenceDeclarationIds: [], runtimeReferenceDeclarationIds: [], typeReferenceDeclarationIds: [], containedDeclarationIds: [], rules: [] };
    nodeRows.set(node, row); idRows.set(id, { row, node, ast });
    return row;
  }
  for (const ast of program.getSourceFiles()) {
    sourceRows.push({ path: ast.fileName, sha256: digest(ast.text), parseDiagnostics: ast.parseDiagnostics.map(diagnostic => ({ start: diagnostic.start, code: diagnostic.code, message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n') })) });
    function collect(node) {
      if (named(node) && node.name) add(node, ast, node.name.getText(ast), ts.SyntaxKind[node.kind]);
      if (ts.isExportAssignment(node)) add(node, ast, node.isExportEquals ? 'export=' : 'default', 'ExportAssignment');
      ts.forEachChild(node, collect);
    }
    collect(ast);
    modules.push({ ast, exports: [] });
  }
  function referenced(node) {
    let symbol = checker.getSymbolAtLocation(node);
    if (symbol?.flags & ts.SymbolFlags.Alias) {
      try { symbol = checker.getAliasedSymbol(symbol); } catch { return []; }
    }
    return unique((symbol?.declarations ?? []).flatMap(declaration => {
      const direct = nodeRows.get(declaration);
      if (direct) return [direct.id];
      return nodeRows.has(declaration.parent) ? [nodeRows.get(declaration.parent).id] : [];
    }));
  }
  for (const { row, node } of idRows.values()) {
    for (let parent = node.parent; parent; parent = parent.parent) if (nodeRows.has(parent)) { nodeRows.get(parent).containedDeclarationIds.push(row.id); break; }
  }
  function inTypePosition(node, root) {
    for (let parent = node.parent; parent && parent !== root; parent = parent.parent) if (ts.isTypeNode(parent)) return true;
    return ts.isTypeAliasDeclaration(root) || ts.isInterfaceDeclaration(root);
  }
  function guardChain(node, root, ast) {
    const guards = [];
    let child = node;
    for (let parent = node.parent; parent && child !== root; child = parent, parent = parent.parent) {
      if (ts.isIfStatement(parent)) guards.push({ expression: parent.expression.getText(ast), branch: child === parent.thenStatement ? 'then' : child === parent.elseStatement ? 'else' : 'condition', sourceStart: parent.getStart(ast) });
      if (ts.isConditionalExpression(parent)) guards.push({ expression: parent.condition.getText(ast), branch: child === parent.whenTrue ? 'true' : child === parent.whenFalse ? 'false' : 'condition', sourceStart: parent.getStart(ast) });
      if (ts.isCaseClause(parent)) guards.push({ expression: parent.expression.getText(ast), branch: 'case', sourceStart: parent.getStart(ast) });
      if (ts.isForStatement(parent) || ts.isForOfStatement(parent) || ts.isForInStatement(parent) || ts.isWhileStatement(parent) || ts.isDoStatement(parent)) guards.push({ expression: (parent.condition ?? parent.expression)?.getText(ast) ?? parent.getText(ast), branch: 'loop', sourceStart: parent.getStart(ast) });
    }
    return guards.reverse();
  }
  for (const { row, node: root, ast } of idRows.values()) {
    const references = [], runtimeReferences = [], typeReferences = [], rules = [];
    function rule(node, kind, extra = {}) {
      const location = source(node, ast);
      rules.push({ id: `PLUGIN-RULE:${ast.fileName}:${location.start}:${kind}`, kind, expression: location.text, sourceStart: location.start, sourceEnd: location.end, sourceLine: location.line, guards: guardChain(node, root, ast), ...extra });
    }
    function walk(node) {
      // 独立具名声明有自己的规则；外层通过实际引用保留绑定，内联回调仍留在所属规则中。
      if (node !== root && nodeRows.has(node)) return;
      if (ts.isIdentifier(node)) {
        const targets = referenced(node); references.push(...targets);
        (inTypePosition(node, root) ? typeReferences : runtimeReferences).push(...targets);
      }
      if ((ts.isParameter(node) || ts.isBindingElement(node)) && node.initializer) rule(node, 'DEFAULT');
      if (ts.isVariableDeclaration(node) && node.initializer) rule(node, 'BIND', { binding: node.name.getText(ast), value: node.initializer.getText(ast) });
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) rule(node, 'READ');
      if (ts.isBinaryExpression(node) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(node.operatorToken.kind)) rule(node, 'PRIORITY', { operator: node.operatorToken.getText(ast), operands: flatten(node, node.operatorToken.kind, ast) });
      if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) rule(node, 'WRITE', { target: node.left.getText(ast), value: node.right.getText(ast), operator: node.operatorToken.getText(ast) });
      if (ts.isDeleteExpression(node)) rule(node, 'DELETE', { target: node.expression.getText(ast) });
      if (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) if ([ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)) rule(node, 'WRITE', { target: node.operand.getText(ast), operator: ts.tokenToString(node.operator) });
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const callee = node.expression, symbolNode = ts.isPropertyAccessExpression(callee) ? callee.name : callee;
        const targets = referenced(symbolNode);
        rule(node, 'CALL', { callee: callee.getText(ast), arguments: (node.arguments ?? []).map(argument => argument.getText(ast)), typeArguments: node.typeArguments?.map(argument => argument.getText(ast)) ?? [], resolvedDeclarationIds: targets, inputBindings: targets.map(id => ({ declarationId: id, parameters: idRows.get(id).row.parameters, arguments: (node.arguments ?? []).map(argument => argument.getText(ast)) })) });
      }
      if (ts.isIfStatement(node) || ts.isSwitchStatement(node) || ts.isConditionalExpression(node)) rule(node, 'GUARD', { condition: (node.expression ?? node.condition).getText(ast) });
      if (ts.isTryStatement(node)) rule(node, 'ERROR_BOUNDARY');
      if (ts.isReturnStatement(node)) rule(node, 'RETURN', { value: node.expression?.getText(ast) ?? null });
      if (ts.isThrowStatement(node)) rule(node, 'THROW');
      if (ts.isUnionTypeNode(node) && node.types.some(type => ts.isLiteralTypeNode(type))) rule(node, 'ENUM', { values: node.types.map(type => type.getText(ast)) });
      ts.forEachChild(node, walk);
    }
    walk(root);
    row.referenceDeclarationIds = unique(references).filter(id => id !== row.id).sort();
    row.runtimeReferenceDeclarationIds = unique(runtimeReferences).filter(id => id !== row.id).sort();
    row.typeReferenceDeclarationIds = unique(typeReferences).filter(id => id !== row.id).sort();
    row.rules = rules;
    function flow(node) {
      if (!node) return null;
      if (node !== root && nodeRows.has(node)) return { kind: 'DeclarationBinding', declarationId: nodeRows.get(node).id };
      if (ts.isBlock(node) || ts.isSourceFile(node)) return { kind: 'Sequence', steps: node.statements.map(flow) };
      if (ts.isIfStatement(node)) return { kind: 'Branch', condition: node.expression.getText(ast), whenTrue: flow(node.thenStatement), whenFalse: flow(node.elseStatement) };
      if (ts.isSwitchStatement(node)) return { kind: 'Switch', expression: node.expression.getText(ast), cases: node.caseBlock.clauses.map(clause => ({ condition: clause.expression?.getText(ast) ?? 'default', steps: clause.statements.map(flow) })) };
      if (ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node) || ts.isWhileStatement(node) || ts.isDoStatement(node)) return { kind: 'Loop', syntaxKind: ts.SyntaxKind[node.kind], head: node.getText(ast).slice(0, node.statement.getStart(ast) - node.getStart(ast)), body: flow(node.statement) };
      if (ts.isTryStatement(node)) return { kind: 'Try', body: flow(node.tryBlock), catchBinding: node.catchClause?.variableDeclaration?.getText(ast) ?? null, onError: flow(node.catchClause?.block), finally: flow(node.finallyBlock) };
      if (ts.isFunctionLike(node) && node.body) return { kind: 'Callback', parameters: node.parameters.map(parameter => parameter.getText(ast)), async: !!node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword), body: flow(node.body) };
      const start = node.getStart(ast), end = node.end;
      const callbacks = [];
      function nested(child) {
        if (child !== node && (nodeRows.has(child) || (ts.isFunctionLike(child) && child.body))) { callbacks.push(flow(child)); return; }
        ts.forEachChild(child, nested);
      }
      nested(node);
      return { kind: ts.SyntaxKind[node.kind], code: node.getText(ast), sourceStart: start, sourceEnd: end, operationRuleIds: rules.filter(rule => rule.sourceStart >= start && rule.sourceEnd <= end).map(rule => rule.id), callbacks };
    }
    const executable = functionValue(root) ?? (ts.isVariableDeclaration(root) ? root.initializer : root);
    row.executionOrder = executable && ts.isFunctionLike(executable) && executable.body ? flow(executable.body) : flow(executable);
  }
  const exportRoots = [];
  for (const { ast } of modules) {
    const moduleSymbol = checker.getSymbolAtLocation(ast);
    if (moduleSymbol) for (const symbol of checker.getExportsOfModule(moduleSymbol)) {
      let target = symbol;
      if (target.flags & ts.SymbolFlags.Alias) { try { target = checker.getAliasedSymbol(target); } catch {} }
      for (const declaration of target.declarations ?? []) {
        const row = nodeRows.get(declaration) ?? nodeRows.get(declaration.parent);
        if (row) exportRoots.push({ name: symbol.name, declarationId: row.id, sourcePath: ast.fileName, kind: row.kind });
      }
    }
    for (const node of ast.statements) if (ts.isExportAssignment(node) && nodeRows.has(node)) exportRoots.push({ name: 'default', declarationId: nodeRows.get(node).id, sourcePath: ast.fileName, kind: 'ExportAssignment' });
  }
  function reachable(initial, runtimeOnly = false) {
    const seen = new Set(), queue = [...initial];
    while (queue.length) {
      const id = queue.shift(); if (seen.has(id) || !idRows.has(id)) continue;
      seen.add(id);
      const row = idRows.get(id).row;
      queue.push(...(runtimeOnly ? row.runtimeReferenceDeclarationIds : row.referenceDeclarationIds), ...row.containedDeclarationIds);
    }
    return [...seen].sort();
  }
  const roots = unique(exportRoots.map(root => root.declarationId));
  const rootReachability = new Map(roots.map(id => [id, new Set(reachable([id], true))]));
  const ownershipCache = new Map();
  function ownership(ownerId, candidateId) {
    let closure = ownershipCache.get(ownerId);
    if (!closure) {
      const runtimeDeclarationIds = reachable([ownerId], true);
      closure = { runtimeDeclarationIds, reachableDeclarationIds: reachable([ownerId]), edges: runtimeDeclarationIds.flatMap(id => {
        const row = idRows.get(id).row;
        return unique([...row.runtimeReferenceDeclarationIds, ...row.containedDeclarationIds]).map(target => ({
          fromDeclarationId: id, toDeclarationId: target,
          kinds: [row.runtimeReferenceDeclarationIds.includes(target) ? 'RUNTIME_REFERENCE' : null, row.containedDeclarationIds.includes(target) ? 'LEXICAL_CONTAINMENT' : null].filter(Boolean),
          callRuleIds: row.rules.filter(rule => rule.kind === 'CALL' && rule.resolvedDeclarationIds.includes(target)).map(rule => rule.id),
        }));
      }) };
      ownershipCache.set(ownerId, closure);
    }
    // 反向追踪保留所有公开 owner 到候选的路径，不只保留一个最短调用链。
    const ancestors = new Set([candidateId]), reverse = new Map();
    for (const edge of closure.edges) {
      if (!reverse.has(edge.toDeclarationId)) reverse.set(edge.toDeclarationId, []);
      reverse.get(edge.toDeclarationId).push(edge.fromDeclarationId);
    }
    const queue = [candidateId];
    for (let cursor = 0; cursor < queue.length; cursor++) for (const id of reverse.get(queue[cursor]) ?? []) if (!ancestors.has(id)) { ancestors.add(id); queue.push(id); }
    return {
      declarationId: ownerId, reachableDeclarationIds: closure.reachableDeclarationIds,
      runtimeDeclarationIds: closure.runtimeDeclarationIds,
      candidatePathDeclarationIds: closure.runtimeDeclarationIds.filter(id => ancestors.has(id)),
      candidatePathEdges: closure.edges.filter(edge => ancestors.has(edge.fromDeclarationId) && ancestors.has(edge.toDeclarationId)),
    };
  }
  const previous = new Map((typeContracts?.batch?.plugins ?? []).map(plugin => [plugin.id, plugin]));
  const typePlugins = new Map((typeContracts?.pluginTypeContracts?.graph?.plugins ?? []).map(plugin => [plugin.id, plugin]));
  const links = new Map(linkage.map(link => [link.id, link]));
  const publicBasis = new Map();
  for (const link of linkage) {
    const entryIds = unique([...(link.directEntryIds ?? []), ...(link.moduleEntryIds ?? []), ...(link.sourceModuleCandidates ?? []).flatMap(row => row.entryIds ?? [])]);
    const publicationPackageIds = link.sourceTreePublicationPackageIds ?? [];
    if (!entryIds.length && !publicationPackageIds.length) continue;
    const prior = publicBasis.get(link.sourcePath) ?? { entryIds: [], publicationPackageIds: [], linkageIds: [] };
    publicBasis.set(link.sourcePath, { entryIds: unique([...prior.entryIds, ...entryIds]).sort(), publicationPackageIds: unique([...prior.publicationPackageIds, ...publicationPackageIds]).sort(), linkageIds: [...prior.linkageIds, link.id] });
  }
  for (const link of linkage) {
    if (publicBasis.has(link.sourcePath)) continue;
    const owner = [...packageRoots.values()].filter(owner => link.sourcePath.startsWith(owner.root + '/src/')).sort((a, b) => b.root.length - a.root.length)[0];
    if (!owner || owner.manifest.exports) continue;
    const runtimePath = link.sourcePath.replace(owner.root + '/src/', owner.root + '/build/').replace(/\.tsx?$/, '.js');
    const declarationPath = runtimePath.replace(/\.js$/, '.d.ts'), mapPath = runtimePath + '.map';
    const relativePath = runtimePath.slice(owner.root.length + 1);
    if (!owner.manifest.files?.some(entry => relativePath === entry || relativePath.startsWith(entry.replace(/\/$/, '') + '/'))) continue;
    if (![runtimePath, declarationPath, mapPath].every(file => files.has(file))) continue;
    const sourcemap = JSON.parse(files.get(mapPath));
    if (!sourcemap.sourcesContent?.includes(files.get(link.sourcePath))) continue;
    const runtime = ts.createSourceFile(runtimePath, files.get(runtimePath), ts.ScriptTarget.Latest, true);
    const declaration = ts.createSourceFile(declarationPath, files.get(declarationPath), ts.ScriptTarget.Latest, true);
    const runtimeExportNames = [], declarationExportNames = [];
    function visitRuntime(node) {
      if (ts.isBinaryExpression(node) && ts.isPropertyAccessExpression(node.left) && node.left.expression.getText(runtime) === 'exports') runtimeExportNames.push(node.left.name.text);
      ts.forEachChild(node, visitRuntime);
    }
    function visitDeclaration(node) {
      if ((ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) {
        const statement = ts.isVariableDeclaration(node) ? node.parent?.parent : node;
        if (statement?.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) declarationExportNames.push(node.name.getText(declaration));
      }
      if (ts.isExportAssignment(node)) declarationExportNames.push('default');
      ts.forEachChild(node, visitDeclaration);
    }
    visitRuntime(runtime); visitDeclaration(declaration);
    const exportedSymbols = unique(runtimeExportNames).filter(name => declarationExportNames.includes(name));
    if (exportedSymbols.length) publicBasis.set(link.sourcePath, {
      entryIds: [], publicationPackageIds: [owner.manifest.name], linkageIds: [link.id],
      projection: { packageManifestPath: owner.root + '/package.json', packageManifestSha256: digest(files.get(owner.root + '/package.json')), publicRule: 'files includes build; no exports restriction; actual runtime and declaration export agree; source map embeds exact source', sourcePath: link.sourcePath, sourceSha256: digest(files.get(link.sourcePath)), runtimePath, runtimeSha256: digest(files.get(runtimePath)), declarationPath, declarationSha256: digest(files.get(declarationPath)), mapPath, mapSha256: digest(files.get(mapPath)), exportedSymbols },
    });
  }
  const usedDeclarations = new Set(), usedSources = new Set();
  const plugins = candidates.map(candidate => {
    const sourcePath = candidate.sourcePath ?? candidate.source.path, name = candidate.symbol ?? candidate.name;
    const start = candidate.start ?? Number(candidate.id.slice(candidate.id.lastIndexOf(':') + 1));
    const declaration = idRows.get(`PLUGIN-DECL:${sourcePath}:${start}`);
    const link = links.get(candidate.id) ?? {};
    if (!declaration) return { id: candidate.id, name, sourcePath, status: 'BLOCKED_SOURCE_OR_OWNERSHIP', reasons: ['Fixed candidate declaration not found'], disposition: { kind: 'UNRESOLVED', owners: [] }, reachableDeclarationIds: [], entryIds: [] };
    const owners = exportRoots.filter(root => {
      const basis = publicBasis.get(root.sourcePath);
      return basis && (!basis.projection || basis.projection.exportedSymbols.includes(root.name)) && rootReachability.get(root.declarationId).has(declaration.row.id);
    }).map(root => ({ ...root, publicBasis: publicBasis.get(root.sourcePath) }));
    let factory = null;
    for (let parent = declaration.node.parent; parent && !ts.isSourceFile(parent); parent = parent.parent) if (ts.isFunctionDeclaration(parent) || ts.isFunctionExpression(parent) || ts.isArrowFunction(parent)) {
      factory = nodeRows.get(parent) ?? (ts.isVariableDeclaration(parent.parent) ? nodeRows.get(parent.parent) : null);
      if (factory) break;
    }
    const factoryOwners = factory ? owners.filter(owner => rootReachability.get(owner.declarationId).has(factory.id)) : [];
    const wrapperOwners = owners.filter(owner => owner.kind === 'ExportAssignment' && owner.sourcePath === sourcePath);
    const direct = (link.directPublicExportIds ?? []).length > 0;
    const kind = factory && factoryOwners.length ? 'PUBLIC_FACTORY_RETURNED_PLUGIN' : wrapperOwners.length ? 'PUBLIC_WRAPPER_EXPOSED_PLUGIN' : direct ? 'PUBLIC_ENTRY_PLUGIN' : owners.length ? 'PUBLIC_EXPORTED_OR_COMPOSED_PLUGIN' : 'UNRESOLVED';
    const factoryBindings = factory ? [...idRows.values()].flatMap(({ row }) => row.rules.filter(rule => rule.kind === 'CALL' && rule.resolvedDeclarationIds.includes(factory.id)).map(rule => ({ callerDeclarationId: row.id, ruleId: rule.id, arguments: rule.arguments, typeArguments: rule.typeArguments, inputBindings: rule.inputBindings }))) : [];
    const roots = [declaration.row.id, ...(factory ? [factory.id] : []), ...factoryBindings.map(binding => binding.callerDeclarationId)];
    const runtimeRelated = reachable(roots, true);
    const related = reachable(roots);
    const ownerContracts = unique(owners.map(owner => owner.declarationId)).map(id => ownership(id, declaration.row.id));
    const optionDeclarations = [];
    function optionTypes(node) { if (ts.isIdentifier(node)) optionDeclarations.push(...referenced(node)); ts.forEachChild(node, optionTypes); }
    for (const argument of declaration.node.type?.typeArguments ?? []) optionTypes(argument);
    const optionRelated = reachable(optionDeclarations);
    for (const id of unique([...related, ...ownerContracts.flatMap(owner => owner.reachableDeclarationIds)])) { usedDeclarations.add(id); usedSources.add(idRows.get(id).ast.fileName); }
    const rules = runtimeRelated.flatMap(id => idRows.get(id).row.rules);
    const byKind = kind => unique(rules.filter(rule => rule.kind === kind).map(rule => rule.id));
    const old = previous.get(candidate.id);
    const optionType = typePlugins.get(candidate.id);
    return {
      id: candidate.id, name, packageId: candidate.packageId ?? null, sourcePath,
      status: kind === 'UNRESOLVED' ? 'BLOCKED_SOURCE_OR_OWNERSHIP' : 'FINITE_SOURCE_CONTRACT_MAPPED_PENDING_REVIEW',
      disposition: { kind, owners, factoryDeclarationId: factory?.id ?? null, factoryBindings, directPublicExportIds: link.directPublicExportIds ?? [], conservativeExportIds: link.conservativeExportIds ?? [], publicationPackageIds: link.sourceTreePublicationPackageIds ?? [] },
      entryIds: unique([...(link.directEntryIds ?? []), ...(link.moduleEntryIds ?? []), ...(link.sourceModuleCandidates ?? []).flatMap(row => row.entryIds ?? [])]).sort(),
      declarationId: declaration.row.id, reachableDeclarationIds: related, runtimeDeclarationIds: runtimeRelated,
      ownershipContract: { interpretation: 'COMPLETE_PUBLIC_OWNER_ALGORITHMS_AND_ALL_RUNTIME_PATHS_TO_CANDIDATE', owners: ownerContracts },
      optionContract: { declaredConfigPluginType: declaration.node.type?.getText(declaration.ast) ?? null, declaredTypeArgument: old?.declaredTypeArgument ?? null, sourceDeclarationIds: optionRelated, finiteTypeIds: optionType?.optionsTypeIds ?? [], strictExpansion: old?.typescript ? { root: old.typescript.root, options: old.typescript.options } : null, priorStatus: old?.status ?? null, defaultRuleIds: byKind('DEFAULT'), enumRuleIds: unique(optionRelated.flatMap(id => idRows.get(id).row.rules.filter(rule => rule.kind === 'ENUM').map(rule => rule.id))), priorityRuleIds: byKind('PRIORITY') },
      effectContract: { orderedAlgorithmDeclarationIds: runtimeRelated, ruleIds: { reads: byKind('READ'), writes: byKind('WRITE'), deletions: byKind('DELETE'), calls: byKind('CALL'), guards: byKind('GUARD'), returns: byKind('RETURN'), errors: [...byKind('THROW'), ...byKind('ERROR_BOUNDARY')] }, idempotenceAndConflict: { interpretation: 'FINITE_ORDERED_SOURCE_ALGORITHM_NOT_BLANKET_IDEMPOTENCE_CLAIM', conditionRuleIds: byKind('GUARD'), callRuleIds: byKind('CALL'), writeRuleIds: byKind('WRITE'), deleteRuleIds: byKind('DELETE') } },
      harmonySupportAccepted: false,
    };
  });
  return {
    schemaVersion: 1, source: { revision, tree },
    contractModel: 'Exact finite declaration source, symbol-linked helper/factory inputs and ordered guarded operations; platform execution is not accepted here.',
    sources: sourceRows.filter(row => usedSources.has(row.path)).sort((a, b) => a.path.localeCompare(b.path)),
    declarations: [...usedDeclarations].sort().map(id => idRows.get(id).row),
    optionTypeGraph: typeContracts?.pluginTypeContracts?.graph?.types ?? [],
    plugins, summary: { candidates: plugins.length, mapped: plugins.filter(plugin => plugin.status === 'FINITE_SOURCE_CONTRACT_MAPPED_PENDING_REVIEW').length, blocked: plugins.filter(plugin => plugin.status === 'BLOCKED_SOURCE_OR_OWNERSHIP').length, explicitOptionPaths: plugins.reduce((count, plugin) => count + (plugin.optionContract?.strictExpansion?.options?.length ?? 0), 0), harmonySupportAccepted: false },
    independentReviewAccepted: false, stageClosable: false,
  };
}

export function validateFinalPluginContracts(actual, input) {
  const expected = buildFinalPluginContracts(input);
  return compareFinal(actual, expected);
}

function compareFinal(actual, expected) {
  function difference(left, right, location) {
    if (left === right) return null;
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return location;
    if (Array.isArray(left) !== Array.isArray(right)) return location;
    const leftKeys = Object.keys(left).sort(), rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length || leftKeys.some((key, i) => key !== rightKeys[i])) return location + '.keys';
    for (const key of rightKeys) { const result = difference(left[key], right[key], `${location}.${key}`); if (result) return result; }
    return null;
  }
  const diagnostic = difference(actual, expected, '$');
  return diagnostic ? { valid: false, diagnostic: `Fixed-source contract mismatch at ${diagnostic}` } : { valid: true };
}

function readFixedFiles(sourceDir, receipts) {
  const sourceTree = execFileSync('git', ['-C', sourceDir, 'rev-parse', `${revision}^{tree}`], { encoding: 'utf8', env: { ...process.env, GIT_NO_LAZY_FETCH: '1' } }).trim();
  assert.equal(sourceTree, tree);
  const listing = execFileSync('git', ['-C', sourceDir, 'ls-tree', '-r', '-z', '--full-tree', revision], { maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GIT_NO_LAZY_FETCH: '1' } }).toString();
  const actualBlobs = new Map(listing.split('\0').filter(Boolean).map(row => { const split = row.indexOf('\t'); return [row.slice(split + 1), row.slice(0, split).split(' ')[2]]; }));
  for (const receipt of receipts) assert.equal(receipt.blob, actualBlobs.get(receipt.path), `Fixed tree path/blob identity ${receipt.path}`);
  const result = new Map();
  for (let offset = 0; offset < receipts.length; offset += 100) {
    const batch = receipts.slice(offset, offset + 100);
    const bytes = execFileSync('git', ['-C', sourceDir, 'cat-file', '--batch'], { input: batch.map(row => row.blob).join('\n') + '\n', maxBuffer: 128 * 1024 * 1024, env: { ...process.env, GIT_NO_LAZY_FETCH: '1' } });
    let cursor = 0;
    for (const receipt of batch) {
      const newline = bytes.indexOf(10, cursor), [oid, kind, sizeText] = bytes.subarray(cursor, newline).toString().split(' '), size = Number(sizeText);
      assert.equal(oid, receipt.blob); assert.equal(kind, 'blob'); assert(Number.isSafeInteger(size));
      cursor = newline + 1; const content = bytes.subarray(cursor, cursor + size);
      assert.equal(digest(content), receipt.sha256, receipt.path); assert.equal(bytes[cursor + size], 10);
      result.set(receipt.path, content.toString()); cursor += size + 1;
    }
    assert.equal(cursor, bytes.length);
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const output = path.join(repo, 'outputs/sdk54/ai-e2e/20261027-m0-final-closure');
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i += 2) { assert(['--source', '--verify'].includes(args[i]) && args[i + 1], 'Expected --source/--verify value'); options[args[i]] = args[i + 1]; }
  const sourceDir = options['--source'] ?? '/tmp/sdk54-expo-source';
  const typePath = 'outputs/sdk54/ai-e2e/20261023-m0-plugin-type-contracts/type-contracts.json';
  const indexPath = 'docs/releases/sdk54-plugin-source-index.json';
  const linkagePath = 'outputs/sdk54/ai-e2e/20261027-m0-final-closure/review-plugin-linkage.json';
  const read = file => JSON.parse(fs.readFileSync(path.join(repo, file)));
  const censusPath = 'outputs/sdk54/ai-e2e/20261027-m0-source-census/source-census.json';
  const typeContracts = read(typePath), index = read(indexPath), linkage = read(linkagePath).linkage;
  const fixed = new Map(read(censusPath).metadata.fixedSourceInputs.map(row => [row.path, row]));
  const receipts = new Map(typeContracts.inputs.map(row => [row.path, row]));
  for (const module of index.modules) {
    const runtime = module.source.path.replace('/src/', '/build/').replace(/\.tsx?$/, '.js');
    for (const file of [runtime, runtime.replace(/\.js$/, '.d.ts'), runtime + '.map']) if (fixed.has(file)) receipts.set(file, fixed.get(file));
  }
  const files = readFixedFiles(sourceDir, [...receipts.values()]);
  const report = buildFinalPluginContracts({ files, candidates: typeContracts.batch.plugins, linkage, typeContracts, modulePaths: index.modules.map(module => module.source.path) });
  report.inputs = [typePath, indexPath, linkagePath, censusPath].map(file => ({ path: file, sha256: digest(fs.readFileSync(path.join(repo, file))) }));
  const usedPaths = new Set(report.sources.map(row => row.path));
  for (const plugin of report.plugins) for (const owner of plugin.disposition.owners) {
    const projection = owner.publicBasis.projection;
    if (projection) for (const key of ['packageManifestPath', 'sourcePath', 'runtimePath', 'declarationPath', 'mapPath']) usedPaths.add(projection[key]);
  }
  report.sourceReceipts = [...usedPaths].sort().map(file => { const receipt = receipts.get(file); assert(receipt, `Source receipt ${file}`); return { path: file, blob: receipt.blob, sha256: receipt.sha256 }; });
  if (options['--verify']) {
    const result = compareFinal(JSON.parse(fs.readFileSync(options['--verify'])), report);
    console.log(JSON.stringify(result)); process.exit(result.valid ? 0 : 1);
  }
  const bytes = JSON.stringify(report, null, 2) + '\n';
  fs.writeFileSync(path.join(output, 'plugin-contracts.json'), bytes);
  const lines = ['# M0 插件有限来源契约', '', `固定SDK54 tree，${report.summary.candidates}个原候选逐ID保留；映射${report.summary.mapped}，阻断${report.summary.blocked}；${report.summary.explicitOptionPaths}条具体选项路径。`, '', '公开入口、工厂、wrapper和实际发行投影均保留来源；每个候选关联完整有限声明、参数绑定、执行顺序及受条件控制的读取、写入、删除和错误分支。全局Harmony支持与M0终审均未提前接受。', '', '| 原候选 | 公开归属 | 具体选项数 | 契约结论 |', '| --- | --- | ---: | --- |'];
  for (const plugin of report.plugins) lines.push(`| \`${plugin.id}\` | ${plugin.disposition.kind} | ${plugin.optionContract?.strictExpansion?.options?.length ?? 0} | ${plugin.status} |`);
  fs.writeFileSync(path.join(output, 'plugin-contracts.md'), lines.join('\n') + '\n');
  console.log(JSON.stringify({ ...report.summary, declarations: report.declarations.length, sourceFiles: report.sources.length, sha256: digest(bytes) }));
}
