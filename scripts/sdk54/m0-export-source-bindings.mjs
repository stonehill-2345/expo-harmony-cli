import path from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { projectTemplateSource } from './m0-template-projection.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const canonical = value => JSON.stringify(value, (_key, row) => row && typeof row === 'object' && !Array.isArray(row)
  ? Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b))) : row);
const projectedPath = value => projectTemplateSource({ path: value, text: value.replaceAll('{%-', '<%-').replaceAll('%}', '%>') }).text;

export function buildExportSourceBindings({ files, requested, ambientBindings = [], packageTargets = [] }) {
  const sources = new Map(), projected = new Map(), parsed = new Map();
  for (const file of files) {
    if (sources.has(file.path)) throw new Error(`Duplicate export source: ${file.path}`);
    if (file.sha256 && hash(file.content) !== file.sha256) throw new Error(`Changed export source: ${file.path}`);
    sources.set(file.path, file);
    const key = projectedPath(file.path);
    if (projected.has(key)) throw new Error(`Ambiguous template source: ${file.path}`);
    projected.set(key, file.path);
  }
  for (const binding of ambientBindings) if (!sources.has(binding.path)) throw new Error(`Missing ambient binding: ${binding.path}`);
  const parse = file => {
    if (parsed.has(file)) return parsed.get(file);
    const raw = sources.get(file); if (!raw) return null;
    const projection = projectTemplateSource({ path: file, text: raw.content });
    const ast = ts.createSourceFile(file, projection.text, ts.ScriptTarget.Latest, true, /[jt]sx$/.test(file) ? ts.ScriptKind.TSX : /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS);
    if (ast.parseDiagnostics.length) throw new Error(`Cannot parse export source: ${file}`);
    const anchor = node => {
      const start = node.getStart(ast), end = node.end, expression = raw.content.slice(start, end);
      return { path: file, sourceSha256: hash(raw.content), start, end, line: ast.getLineAndCharacterOfPosition(start).line + 1,
        endLine: ast.getLineAndCharacterOfPosition(end).line + 1, nodeType: ts.SyntaxKind[node.kind], expression, sha256: hash(expression) };
    };
    const value = { raw, ast, anchor, projection: projection.projection };
    parsed.set(file, value); return value;
  };
  const targets = (from, request) => {
    if (!request.startsWith('.')) return packageTargets.filter(r => r.request === request).map(r => r.path).filter(p => sources.has(p));
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(projectedPath(from)), request));
    const stems = [base, base.replace(/\.[cm]?jsx?$/, '')];
    const found = new Set();
    for (const stem of stems) for (const suffix of ['', '.ts', '.tsx', '.d.ts', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js',
      '.native.ts', '.native.tsx', '.ios.ts', '.ios.tsx', '.android.ts', '.android.tsx', '.web.ts', '.web.tsx']) {
      if (projected.has(stem + suffix)) found.add(projected.get(stem + suffix));
    }
    return [...found].sort();
  };
  const trace = (file, name, ancestors = new Set()) => {
    const key = `${file}#${name}`;
    if (ancestors.has(key)) return null;
    const source = parse(file); if (!source) return null;
    const { ast, anchor } = source, seen = new Set(ancestors).add(key), localSeen = new Set();
    const merge = (step, children) => ({ steps: [anchor(step), ...children.flatMap(r => r.steps)],
      routes: children.flatMap(r => r.routes), externalRequests: children.flatMap(r => r.externalRequests),
      terminalRole: children.some(r => r.terminalRole === 'MISSING_TARGET') ? 'MISSING_TARGET'
        : children.some(r => r.terminalRole === 'EXTERNAL_CONSUMER_RULE') ? 'EXTERNAL_CONSUMER_RULE' : 'FINITE_SOURCE_DECLARATION' });
    const forward = (node, request, targetName) => {
      const found = targets(file, request);
      const children = found.map(targetPath => {
        const next = trace(targetPath, targetName, seen);
        return next ? { ...next, routes: [{ from: file, request, targetPath, targetName }, ...next.routes] }
          : { steps: [], routes: [{ from: file, request, targetPath, targetName }], externalRequests: [], terminalRole: 'MISSING_TARGET' };
      });
      if (children.length) return merge(node, children);
      if (request.startsWith('.') || found.length) return { steps: [anchor(node)], routes: [], externalRequests: [], terminalRole: 'MISSING_TARGET' };
      const bindings = ambientBindings.filter(r => r.request === request && r.name === targetName);
      const declarations = bindings.map(binding => {
        const ambient = parse(binding.path); let match;
        const visit = node => { if (node.name?.getText(ambient.ast) === targetName && (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node))) match = node; ts.forEachChild(node, visit); };
        visit(ambient.ast);
        if (!match) throw new Error(`Unresolved ambient symbol: ${binding.path}#${targetName}`);
        return { steps: [ambient.anchor(match)], routes: [{ from: file, request, targetPath: binding.path, targetName, role: 'CONSUMER_AMBIENT_CONTEXT' }], externalRequests: [], terminalRole: 'FINITE_SOURCE_DECLARATION' };
      });
      if (declarations.length) return merge(node, declarations);
      return { steps: [anchor(node)], routes: [], externalRequests: [{ from: file, request, symbol: targetName }], terminalRole: 'EXTERNAL_CONSUMER_RULE' };
    };
    const local = (node, localName) => {
      if (localSeen.has(localName)) return { steps: [anchor(node)], routes: [], externalRequests: [], terminalRole: 'MISSING_TARGET' };
      localSeen.add(localName);
      for (const statement of ast.statements) {
        if (ts.isImportDeclaration(statement) && statement.importClause) {
          const clause = statement.importClause, bindings = clause.namedBindings;
          if (clause.name?.text === localName) return merge(node, [forward(statement, statement.moduleSpecifier.text, 'default')]);
          if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) if (element.name.text === localName)
            return merge(node, [forward(statement, statement.moduleSpecifier.text, element.propertyName?.text ?? element.name.text)]);
          if (bindings && ts.isNamespaceImport(bindings) && bindings.name.text === localName) return merge(node, [forward(statement, statement.moduleSpecifier.text, '*')]);
        }
        if (statement.name?.getText(ast) === localName) return merge(node, [{ steps: [anchor(statement)], routes: [], externalRequests: [], terminalRole: 'FINITE_SOURCE_DECLARATION' }]);
        if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) if (declaration.name.getText(ast) === localName)
          return merge(node, [expression(declaration, declaration.initializer)]);
      }
      return { steps: [anchor(node)], routes: [], externalRequests: [], terminalRole: 'MISSING_TARGET' };
    };
    const expression = (node, value) => {
      if (!value) return { steps: [anchor(node)], routes: [], externalRequests: [], terminalRole: 'LOCAL_EXPRESSION_RULE' };
      const root = ts.isPropertyAccessExpression(value) ? value.expression : value;
      if (ts.isIdentifier(root)) return local(node, root.text);
      const requires = [];
      const visit = child => {
        if (ts.isCallExpression(child) && child.expression.getText(ast) === 'require' && child.arguments.length === 1 && ts.isStringLiteral(child.arguments[0])) requires.push(forward(child, child.arguments[0].text, 'default'));
        ts.forEachChild(child, visit);
      };
      visit(value);
      return merge(node, requires);
    };
    for (const statement of ast.statements) {
      if (ts.isExportDeclaration(statement)) {
        if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
          const element = statement.exportClause.elements.find(r => r.name.text === name);
          if (element) return statement.moduleSpecifier ? forward(statement, statement.moduleSpecifier.text, element.propertyName?.text ?? element.name.text)
            : local(statement, element.propertyName?.text ?? element.name.text);
        } else if (!statement.exportClause && statement.moduleSpecifier) {
          for (const target of targets(file, statement.moduleSpecifier.text)) {
            const result = trace(target, name, seen);
            if (result) return { ...merge(statement, [result]), routes: [{ from: file, request: statement.moduleSpecifier.text, targetPath: target, targetName: name }, ...result.routes] };
          }
        }
      }
      if (name === 'default' && ts.isExportAssignment(statement)) return expression(statement, statement.expression);
      const modifiers = ts.getModifiers(statement) ?? [];
      if (modifiers.some(r => r.kind === ts.SyntaxKind.ExportKeyword) && (statement.name?.getText(ast) === name || name === 'default' && modifiers.some(r => r.kind === ts.SyntaxKind.DefaultKeyword)))
        return { steps: [anchor(statement)], routes: [], externalRequests: [], terminalRole: 'FINITE_SOURCE_DECLARATION' };
    }
    let commonjs;
    const visit = node => {
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const left = node.left.getText(ast);
        if (left === `exports.${name}` || left === `module.exports.${name}` || left === 'module.exports' && ['default', 'prototype'].includes(name)) commonjs = node;
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
    return commonjs ? expression(commonjs, commonjs.right) : null;
  };
  const bindings = [], blockers = [], ids = new Set();
  for (const item of requested) {
    if (ids.has(item.id)) throw new Error(`Duplicate export binding: ${item.id}`);
    ids.add(item.id);
    const result = trace(item.path, item.name);
    if (!result || result.terminalRole === 'MISSING_TARGET') { blockers.push({ id: item.id, path: item.path, reason: result?.terminalRole ?? 'NO_EXPORT_SOURCE_RULE' }); continue; }
    const steps = [...new Map(result.steps.map(r => [`${r.path}:${r.start}:${r.end}`, r])).values()];
    bindings.push({ ...item, ...result, steps, compilerTypeReplaced: false, sourceRole: 'EXPORT_AND_CONSUMER_SOURCE_RULE_NOT_RUNTIME_SUPPORT' });
  }
  return { schemaVersion: 1, format: 'sdk54-export-source-bindings-v1', bindings, blockers,
    sources: [...parsed.values()].map(r => ({ path: r.raw.path, sha256: hash(r.raw.content), ...(r.projection ? { projection: r.projection } : {}) })).sort((a, b) => a.path.localeCompare(b.path)),
    platformSupportAccepted: false };
}

export function validateExportSourceBindings(actual, expected) {
  const failures = [];
  for (const row of expected.bindings) {
    const candidates = actual?.bindings?.filter(r => r.id === row.id) ?? [];
    if (candidates.length !== 1 || canonical(candidates[0]) !== canonical(row)) failures.push(`Missing or changed export source binding: ${row.id}`);
  }
  if (canonical(actual) !== canonical(expected)) failures.push('Export source binding content/metadata mismatch');
  return { valid: failures.length === 0, failures };
}
