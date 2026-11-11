import ts from 'typescript';
import { createHash } from 'node:crypto';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => JSON.stringify(value, (_key, row) => row && typeof row === 'object' && !Array.isArray(row)
  ? Object.fromEntries(Object.entries(row).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : row);
const namedDeclaration = node => ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isClassDeclaration(node)
  || ts.isModuleDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isEnumDeclaration(node) || ts.isVariableDeclaration(node);
const memberNode = node => ts.isPropertySignature(node) || ts.isPropertyDeclaration(node) || ts.isMethodSignature(node)
  || ts.isMethodDeclaration(node) || ts.isCallSignatureDeclaration(node) || ts.isConstructSignatureDeclaration(node)
  || ts.isConstructorDeclaration(node) || ts.isIndexSignatureDeclaration(node) || ts.isEnumMember(node)
  || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node);

export function buildFiniteDeclarations({ files, bindings = [] }) {
  const result = { schemaVersion: 1, format: 'sdk54-finite-source-declarations-v1', sources: [], declarations: [], bindings: [] }, paths = new Set();
  for (const file of [...files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) {
    if (paths.has(file.path)) throw new Error(`Duplicate finite source path: ${file.path}`);
    paths.add(file.path);
    const sha256 = hash(file.content);
    if (file.sha256 && sha256 !== file.sha256) throw new Error(`Finite source hash mismatch: ${file.path}`);
    const scriptKind = /tsx$/.test(file.path) ? ts.ScriptKind.TSX
      : /(?:jsx|\.[cm]?js)$/.test(file.path) ? ts.ScriptKind.JSX : ts.ScriptKind.TS;
    const ast = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, scriptKind);
    if (ast.parseDiagnostics.length) throw new Error(`Finite source parse failure: ${file.path}: ${ts.flattenDiagnosticMessageText(ast.parseDiagnostics[0].messageText, ' ')}`);
    result.sources.push({ path: file.path, sha256, ...(file.origin ? { origin: file.origin } : {}), ...(file.provenance ? { provenance: file.provenance } : {}) });
    const anchor = node => {
      const start = node.getStart(ast), end = node.end, expression = file.content.slice(start, end);
      return { path: file.path, start, end, line: ast.getLineAndCharacterOfPosition(start).line + 1, endLine: ast.getLineAndCharacterOfPosition(end).line + 1,
        expression, sha256: hash(expression), nodeType: ts.SyntaxKind[node.kind] };
    };
    const walk = (node, scope = []) => {
      const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) ?? [] : [];
      const assignment = ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression)
        && node.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
        && (ts.isPropertyAccessExpression(node.expression.left) || ts.isElementAccessExpression(node.expression.left));
      const name = namedDeclaration(node) && node.name ? node.name.getText(ast)
        : ts.isFunctionDeclaration(node) && modifiers.some(row => row.kind === ts.SyntaxKind.DefaultKeyword) ? '<default>'
          : ts.isExportAssignment(node) ? '<default>' : assignment ? node.expression.left.getText(ast) : null;
      if (name) {
        const qualifiedName = [...scope, name].join('.'), source = anchor(node);
        const id = `FINITE-DECLARATION:${encodeURIComponent(file.path)}:${source.start}:${source.end}:${encodeURIComponent(qualifiedName)}`;
        const declaration = { id, name, qualifiedName, ...source, typeParameters: (node.typeParameters ?? []).map(row => row.getText(ast)),
          heritage: (node.heritageClauses ?? []).map(row => row.getText(ast)), members: [], rules: [] };
        const details = child => {
          if (memberNode(child)) {
            const memberName = child.name?.getText(ast) ?? (ts.isConstructorDeclaration(child) ? '<constructor>' : `<${ts.SyntaxKind[child.kind]}>`);
            const location = anchor(child);
            declaration.members.push({ id: `${id}/MEMBER:${location.start}:${location.end}`, name: memberName, optional: Boolean(child.questionToken),
              direct: child.parent === node || ts.isTypeAliasDeclaration(node) && child.parent === node.type,
              ...location });
          }
          if (ts.isTypeNode(child) || ts.isTypeParameterDeclaration(child) || ts.isExpressionWithTypeArguments(child)) {
            const location = anchor(child);
            declaration.rules.push({ id: `${id}/RULE:${location.start}:${location.end}:${child.kind}`, ...location,
              ...(ts.isTypeReferenceNode(child) ? { referencedName: child.typeName.getText(ast), arguments: (child.typeArguments ?? []).map(row => row.getText(ast)) } : {}) });
          }
          ts.forEachChild(child, details);
        };
        ts.forEachChild(node, details);
        result.declarations.push(declaration);
        ts.forEachChild(node, child => walk(child, [...scope, name]));
      } else ts.forEachChild(node, child => walk(child, scope));
    };
    walk(ast);
  }
  const ids = new Set();
  for (const binding of bindings) {
    if (!binding.id || ids.has(binding.id)) throw new Error(`Duplicate finite consumer binding: ${binding.id}`);
    ids.add(binding.id);
    let declarations = result.declarations.filter(row => row.path === binding.path && (binding.qualifiedName ? row.qualifiedName === binding.qualifiedName
      : binding.name ? row.name === binding.name : Number.isInteger(binding.start) && row.start <= binding.start && row.end >= binding.end));
    if (!binding.name && !binding.qualifiedName && declarations.length) {
      const length = Math.min(...declarations.map(row => row.end - row.start));
      declarations = declarations.filter(row => row.end - row.start === length);
    }
    if (!declarations.length) throw new Error(`Unresolved finite consumer binding: ${binding.id}`);
    result.bindings.push({ ...binding, declarationIds: declarations.map(row => row.id) });
  }
  result.bindings.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return result;
}

export function validateFiniteDeclarations(actual, expected) {
  const failures = [];
  for (const table of ['sources', 'declarations', 'bindings']) {
    const key = table === 'sources' ? 'path' : 'id', rows = new Map();
    for (const row of actual?.[table] ?? []) {
      if (rows.has(row[key])) failures.push(`Duplicate finite ${table}: ${row[key]}`);
      rows.set(row[key], row);
    }
    for (const row of expected[table]) {
      if (!rows.has(row[key])) failures.push(`Missing finite ${table}: ${row[key]}`);
      else if (canonical(rows.get(row[key])) !== canonical(row)) failures.push(`Changed finite ${table}: ${row[key]}`);
      rows.delete(row[key]);
    }
    for (const id of rows.keys()) failures.push(`Unexpected finite ${table}: ${id}`);
  }
  if (canonical(actual) !== canonical(expected)) failures.push('Finite declaration metadata/content mismatch');
  return { valid: failures.length === 0, failures };
}
