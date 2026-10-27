import ts from 'typescript';

const modifiers = (node) => ts.canHaveModifiers(node) ? ts.getModifiers(node) ?? [] : [];
const hasModifier = (node, kind) => modifiers(node).some((modifier) => modifier.kind === kind);
const literal = (node) => node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
const unwrap = (node) => {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node))) node = node.expression;
  return node;
};

export function pluginSourceFacts(text, sourcePath) {
  const file = ts.createSourceFile(sourcePath, text, ts.ScriptTarget.Latest, true);
  if (file.parseDiagnostics.length) throw new Error(`Invalid source syntax at ${sourcePath}: ${ts.flattenDiagnosticMessageText(file.parseDiagnostics[0].messageText, ' ')}`);
  const source = (node) => {
    const { line, character } = file.getLineAndCharacterOfPosition(node.getStart(file));
    return { path: sourcePath, line: line + 1, column: character + 1 };
  };
  const id = (kind, node) => `${kind}:${sourcePath}:${node.getStart(file)}`;
  const expression = (node) => node?.getText(file) ?? null;
  const facts = { references: [], exports: [], configPlugins: [], compositions: [], stringLists: [], providers: [] };
  const reference = (node, request, kind) => facts.references.push({ id: id('REF', node), kind,
    request: literal(request), expression: expression(request), statement: expression(node), source: source(node) });
  const exported = (node, name, typeOnly = false) => facts.exports.push({ id: `${id('EXPORT', node)}:${name}`,
    name, typeOnly, expression: expression(node), source: source(node) });
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) reference(node, node.moduleSpecifier, 'import');
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) reference(node, node.moduleReference.expression, 'import-equals');
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) reference(node, node.argument.literal, 'import-type');
    if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) reference(node, node.moduleSpecifier, 'export');
      if (!node.exportClause) exported(node, '*', node.isTypeOnly);
      else if (ts.isNamedExports(node.exportClause)) {
        for (const entry of node.exportClause.elements) exported(entry, entry.name.text, node.isTypeOnly || entry.isTypeOnly);
      } else exported(node, node.exportClause.name.text, node.isTypeOnly);
    }
    if (ts.isExportAssignment(node)) exported(node, node.isExportEquals ? 'export=' : 'default');
    if (hasModifier(node, ts.SyntaxKind.ExportKeyword) && !ts.isExportDeclaration(node)) {
      const isDefault = hasModifier(node, ts.SyntaxKind.DefaultKeyword);
      if (isDefault) exported(node, 'default');
      else if (ts.isVariableStatement(node)) {
        for (const declaration of node.declarationList.declarations) exported(declaration, declaration.name.getText(file));
      } else if (node.name) exported(node, node.name.getText(file), ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node));
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const left = node.left.getText(file);
      if (left === 'module.exports' || /^(?:module\.exports|exports)\.[A-Za-z_$][\w$]*$/.test(left)) exported(node, left);
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(file);
      if (callee === 'require' || callee === 'require.resolve' || node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        reference(node, node.arguments[0], callee === 'require' ? 'require' : callee === 'require.resolve' ? 'require-resolve' : 'dynamic-import');
      }
      if (/(?:^|\.)withPlugins$/.test(callee)) {
        const list = unwrap(node.arguments[1]);
        facts.compositions.push({ id: id('COMPOSE', node), callee, source: source(node),
          listExpression: expression(list), staticArray: !!list && ts.isArrayLiteralExpression(list),
          items: list && ts.isArrayLiteralExpression(list) ? list.elements.map((item, index) => ({
            id: id('COMPOSE-ITEM', item), index, expression: expression(item), source: source(item),
            kind: ts.isArrayLiteralExpression(item) ? 'tuple' : ts.isArrowFunction(item) || ts.isFunctionExpression(item) ? 'function' :
              ts.isSpreadElement(item) ? 'spread' : 'reference',
          })) : [] });
      }
    }
    if (ts.isVariableDeclaration(node)) {
      if (node.type && ts.isTypeReferenceNode(node.type) && /(?:^|\.)ConfigPlugin$/.test(node.type.typeName.getText(file))) {
        facts.configPlugins.push({ id: id('CONFIG-PLUGIN', node), name: node.name.getText(file),
          typeArgument: node.type.typeArguments?.map(expression).join(', ') ?? null, source: source(node) });
      }
      const initializer = unwrap(node.initializer);
      if (initializer && ts.isArrayLiteralExpression(initializer) && initializer.elements.length && initializer.elements.every((entry) => literal(entry) !== null)) {
        facts.stringLists.push({ id: id('STRING-LIST', node), name: node.name.getText(file),
          values: initializer.elements.map(literal), source: source(node) });
      }
      if (initializer && ts.isObjectLiteralExpression(initializer) && node.name.getText(file) === 'defaultProviders') {
        const platform = sourcePath.endsWith('/withAndroidBaseMods.ts') ? 'android' : sourcePath.endsWith('/withIosBaseMods.ts') ? 'ios' : null;
        for (const property of initializer.properties) {
          const value = unwrap(property.initializer);
          const options = value && ts.isCallExpression(value) ? unwrap(value.arguments[0]) : null;
          facts.providers.push({ id: id('PROVIDER', property), platform, kind: ts.isSpreadAssignment(property) ? 'spread' : 'property',
            name: property.name ? literal(property.name) ?? property.name.getText(file) : null,
            expression: expression(property), source: source(property),
            members: options && ts.isObjectLiteralExpression(options) ? options.properties.map((entry) => ({
              name: entry.name ? literal(entry.name) ?? entry.name.getText(file) : null,
              kind: ts.isMethodDeclaration(entry) ? 'method' : ts.isSpreadAssignment(entry) ? 'spread' : 'property',
              expression: expression(entry), source: source(entry),
            })) : [] });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return facts;
}
