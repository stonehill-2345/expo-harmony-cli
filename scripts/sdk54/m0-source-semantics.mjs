import { createHash } from 'node:crypto';
import { parse } from '@babel/parser';
import ts from 'typescript';

const hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const declarationKinds = new Map([
  ['FunctionDeclaration', 'FUNCTION'], ['TSDeclareFunction', 'FUNCTION'], ['DeclareFunction', 'FUNCTION'],
  ['FunctionExpression', 'FUNCTION'], ['ArrowFunctionExpression', 'FUNCTION'], ['ObjectMethod', 'FUNCTION'],
  ['ClassMethod', 'FUNCTION'], ['ClassPrivateMethod', 'FUNCTION'], ['TSMethodSignature', 'FUNCTION'],
  ['TSDeclareMethod', 'FUNCTION'], ['TSCallSignatureDeclaration', 'FUNCTION'], ['TSConstructSignatureDeclaration', 'FUNCTION'],
  ['ClassDeclaration', 'CLASS'], ['ClassExpression', 'CLASS'], ['DeclareClass', 'CLASS'],
  ['VariableDeclarator', 'CONSTANT'], ['TSInterfaceDeclaration', 'TYPE'], ['TSTypeAliasDeclaration', 'TYPE'],
  ['TypeAlias', 'TYPE'], ['InterfaceDeclaration', 'TYPE'], ['DeclareInterface', 'TYPE'], ['DeclareTypeAlias', 'TYPE'],
  ['TSEnumDeclaration', 'TYPE'], ['TSModuleDeclaration', 'TYPE'], ['OpaqueType', 'TYPE'],
]);
const propertyKinds = new Set(['TSPropertySignature', 'ClassProperty', 'ClassPrivateProperty', 'ObjectTypeProperty', 'ObjectProperty', 'TSEnumMember',
  'TSIndexSignature', 'TSCallSignatureDeclaration', 'TSConstructSignatureDeclaration', 'TSDeclareMethod', 'TSMethodSignature',
  'ClassMethod', 'ClassPrivateMethod', 'ObjectMethod', 'ObjectTypeCallProperty', 'ObjectTypeIndexer', 'ObjectTypeInternalSlot']);
const callbackKinds = new Set(['TSFunctionType', 'TSConstructorType', 'FunctionTypeAnnotation', 'ArrowFunctionExpression', 'FunctionExpression']);
const ruleKinds = new Set(['TSConditionalType', 'TSMappedType', 'TSIndexedAccessType', 'TSTypeReference', 'TSTypeParameter', 'GenericTypeAnnotation', 'TypeParameter', 'TSExpressionWithTypeArguments', 'TSTypeQuery', 'TSImportType']);
const asset = value => /\.(?:png|jpe?g|gif|webp|avif|svg|ico|ttf|otf|woff2?|mp3|wav|mp4|mov|pdf|wasm|json)(?:\?.*)?$/i.test(value);
const terminal = node => node?.type === 'Identifier' || node?.type === 'PrivateName' ? node.name ?? node.id?.name
  : node?.type === 'MemberExpression' || node?.type === 'OptionalMemberExpression' ? terminal(node.property)
    : node?.type === 'StringLiteral' ? node.value : null;

function compilerFallback(result, content) {
  const ast = ts.createSourceFile(result.path, content, ts.ScriptTarget.Latest, true, /tsx$/.test(result.path) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  if (ast.parseDiagnostics.length) return null;
  result.parser = 'typescript/compiler-ast'; result.language = 'typescript';
  const visit = node => {
    const start = node.getStart(ast), end = node.end;
    if (end > start) {
      const nodeType = ts.SyntaxKind[node.kind], name = node.name?.getText(ast) ?? `<${nodeType}>`;
      const kind = ts.isPropertySignature(node) || ts.isPropertyDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)
        || ts.isIndexSignatureDeclaration(node) || ts.isCallSignatureDeclaration(node) || ts.isConstructSignatureDeclaration(node) ? 'COMPONENT_PROPERTY'
        : ts.isMethodSignature(node) || ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isConstructorDeclaration(node) ? 'FUNCTION'
          : ts.isFunctionTypeNode(node) || ts.isConstructorTypeNode(node) || ts.isArrowFunction(node) ? 'CALLBACK'
            : ts.isClassDeclaration(node) ? 'CLASS' : ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isModuleDeclaration(node) ? 'TYPE'
              : ts.isTypeNode(node) || ts.isTypeParameterDeclaration(node) ? 'TYPE_RULE' : ts.isExportDeclaration(node) || ts.isExportSpecifier(node) ? 'EXPORT'
                : ts.isCallExpression(node) || ts.isNewExpression(node) ? 'CALL_SITE' : 'SOURCE_AST_NODE';
      const expression = content.slice(start, end), sliceSha256 = hash(expression);
      result.facts.push({ id: `SOURCE-SEMANTIC:${kind}:${encodeURIComponent(result.path)}:${start}:${end}:${hash(name).slice(0, 16)}`, path: result.path,
        kind, name, start, end, line: ast.getLineAndCharacterOfPosition(start).line + 1, endLine: ast.getLineAndCharacterOfPosition(end).line + 1, sliceSha256,
        details: { nodeType, valueMode: 'FINITE_SOURCE_EXPRESSION', expression: expression.length <= 16384 ? expression : null,
          ...(expression.length > 16384 ? { expressionReference: { path: result.path, start, end, sha256: sliceSha256 } } : {}),
          optional: Boolean(node.questionToken), declarationExposure: 'SOURCE_DECLARATION_REQUIRES_CONSUMER_BINDING',
          ...(node.typeParameters ? { typeParameterRanges: node.typeParameters.map(row => ({ start: row.getStart(ast), end: row.end })) } : {}),
          ...(node.parameters ? { parameterRanges: node.parameters.map(row => ({ start: row.getStart(ast), end: row.end })) } : {}) } });
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  result.facts = [...new Map(result.facts.map(row => [row.id, row])).values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return result;
}

export function analyzeScriptSource({ path, content }) {
  if (typeof path !== 'string' || !path || typeof content !== 'string') throw new Error('Expected source path/content');
  const result = { path, sourceSha256: hash(content), language: /\.[cm]?tsx?$/.test(path) ? 'typescript' : 'javascript',
    parser: '@babel/parser', coverage: 'PARSED_FINITE_SOURCE', facts: [], boundaries: [] };
  const templateRanges = [];
  const projected = content.replace(/<%[=-]?[\s\S]*?%>/g, (value, offset) => {
    templateRanges.push({ start: offset, end: offset + value.length, expression: value });
    return value.replace(/[^\r\n]/g, 'X');
  });
  let ast;
  const modes = result.language === 'typescript' ? ['typescript'] : /(?:@flow|import\s+typeof)/.test(content) ? ['flow', 'typescript'] : ['typescript', 'flow'];
  const failures = [];
  for (const mode of modes) {
    try {
      ast = parse(projected, { sourceType: 'unambiguous', errorRecovery: true, allowReturnOutsideFunction: true,
        allowAwaitOutsideFunction: true, plugins: ['jsx', 'decorators-legacy', mode === 'typescript' ? ['typescript', { dts: /\.d\.[cm]?ts$/.test(path) }] : ['flow', { all: true }]] });
      if (!ast.errors.length) { result.language = mode; break; }
      failures.push(...ast.errors); ast = null;
    } catch (error) { failures.push(error); }
  }
  if (!ast) {
    if (result.language === 'typescript' && !templateRanges.length) {
      const fallback = compilerFallback(result, content);
      if (fallback) return fallback;
    }
    result.coverage = 'SOURCE_ENUMERATION_BLOCKED';
    const unique = new Map(failures.map(error => [error.message, error]));
    result.boundaries = [...unique.values()].map(error => ({ kind: 'SCRIPT_PARSE_ERROR', disposition: 'SOURCE_ENUMERATION_BLOCKER',
      line: error.loc?.line ?? 1, endLine: error.loc?.line ?? 1, column: error.loc?.column ?? 0, reason: error.message }));
    return result;
  }
  const seen = new Set();
  const text = node => content.slice(node.start, node.end);
  const identifier = node => node?.name ?? node?.value ?? (node ? text(node) : null);
  const add = (node, kind, name, details = {}) => {
    const start = node.start, end = node.end, expression = content.slice(start, end), sliceSha256 = hash(expression);
    const templated = templateRanges.filter(range => range.start < end && range.end > start);
    const id = `SOURCE-SEMANTIC:${kind}:${encodeURIComponent(path)}:${start}:${end}:${hash(String(name)).slice(0, 16)}`;
    if (seen.has(id)) return; seen.add(id);
    result.facts.push({ id, path, kind, name: name ?? `<${node.type}>`, start, end, line: node.loc.start.line, endLine: node.loc.end.line, sliceSha256,
      details: { nodeType: node.type, valueMode: templated.length ? 'TEMPLATE_GENERATION_RULE' : 'FINITE_SOURCE_EXPRESSION',
        expression: expression.length <= 16384 ? expression : null,
        ...(expression.length > 16384 ? { expressionReference: { path, start, end, sha256: sliceSha256 } } : {}),
        ...(templated.length ? { templateRules: templated } : {}), ...details } });
  };
  const containsIdentifier = (node, name) => {
    let found = false;
    const walk = value => {
      if (!value || typeof value !== 'object' || found) return;
      if (value.type === 'Identifier' && value.name === name) { found = true; return; }
      for (const [key, child] of Object.entries(value)) if (!['loc', 'comments', 'leadingComments', 'trailingComments', 'extra', 'tokens'].includes(key)) {
        if (Array.isArray(child)) child.forEach(walk); else if (child && typeof child === 'object') walk(child);
      }
    };
    walk(node); return found;
  };
  const visit = (node, parent = null) => {
    if (!node || typeof node !== 'object' || typeof node.type !== 'string' || node.start === undefined) return;
    const name = identifier(node.id ?? node.key) ?? (node.type === 'VariableDeclarator' ? identifier(node.id) : null);
    if (declarationKinds.has(node.type)) add(node, declarationKinds.get(node.type), name, {
      declarationExposure: parent?.type?.startsWith('Export') ? 'EXPORTED_DECLARATION' : 'SOURCE_DECLARATION_NOT_PUBLICNESS_PROOF',
      ...(node.typeParameters ? { typeParameterRange: { start: node.typeParameters.start, end: node.typeParameters.end } } : {}),
      ...(node.typeAnnotation ? { annotationRange: { start: node.typeAnnotation.start, end: node.typeAnnotation.end } } : {}),
    });
    if (propertyKinds.has(node.type)) add(node, 'COMPONENT_PROPERTY', name, { optional: node.optional === true,
      propertyRole: 'SOURCE_PROPERTY_REQUIRES_CONSUMER_BINDING', computed: node.computed === true });
    if (callbackKinds.has(node.type)) add(node, 'CALLBACK', name, { parameterRanges: (node.params ?? node.parameters ?? []).map(value => ({ start: value.start, end: value.end })) });
    if (ruleKinds.has(node.type)) add(node, 'TYPE_RULE', name ?? identifier(node.typeName ?? node.id));
    if (node.type === 'ImportDeclaration' || node.type === 'ExportAllDeclaration' || node.type === 'ExportNamedDeclaration') {
      if (node.source) {
        const request = node.source.value; add(node, 'DEPENDENCY', request, { request, dependencyKind: node.type, targetResolution: 'SOURCE_REQUEST_RULE' });
        if (asset(request)) add(node, 'RESOURCE', request, { request });
      }
      if (node.type.startsWith('Export')) {
        const exported = node.declaration?.id ?? node.declaration?.declarations?.[0]?.id;
        if (exported || node.type === 'ExportAllDeclaration') add(node, 'EXPORT', exported ? identifier(exported) : '*', { request: node.source?.value ?? null });
        for (const specifier of node.specifiers ?? []) add(specifier, 'EXPORT', identifier(specifier.exported), { localName: identifier(specifier.local), request: node.source?.value ?? null });
      }
    }
    if (node.type === 'ExportDefaultDeclaration' || node.type === 'TSExportAssignment') add(node, 'EXPORT', 'default');
    if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression' || node.type === 'NewExpression') {
      const callee = terminal(node.callee) ?? (node.callee?.type === 'Import' ? 'import' : '<computed-call>');
      const call = { callee, argumentRanges: (node.arguments ?? []).map(argument => ({ start: argument.start, end: argument.end })) };
      add(node, 'CALL_SITE', callee, call);
      if (['require', 'import'].includes(callee)) {
        const request = node.arguments?.[0]?.type === 'StringLiteral' ? node.arguments[0].value : null;
        add(node, 'DEPENDENCY', request ?? '<dynamic-source-request>', { ...call, request, targetResolution: request ? 'LITERAL_SOURCE_REQUEST' : 'FINITE_SOURCE_EXPRESSION' });
        if (callee === 'require' || request && asset(request)) add(node, 'RESOURCE', request ?? '<dynamic-resource>', { ...call, request });
      }
      if (/^(?:emit|sendEvent|sendEventWithName|addListener|removeListener|removeAllListeners|EventEmitter|NativeEventEmitter|useEvent|useEventListener)$/.test(callee)) add(node, 'EVENT', callee, call);
      if (/permission/i.test(callee)) add(node, 'PERMISSION', callee, call);
      if (/^(?:useEffect|useLayoutEffect|useFocusEffect|registerRootComponent|registerComponent|register|unregister|destroy|dispose|invalidate)$/.test(callee)) add(node, 'LIFECYCLE', callee, call);
      if (/^(?:remove|removeAsync|deleteAsync|uninstall|unlink|unregister|removeAllListeners)$/.test(callee)) add(node, 'REMOVE', callee, call);
      if (/^(?:install|installAsync|link|registerRootComponent|registerComponent)$/.test(callee)) add(node, 'INSTALL', callee, call);
      if (/autolink/i.test(callee)) add(node, 'AUTOLINKING', callee, call);
      if (/prebuild/i.test(callee)) add(node, 'PREBUILD', callee, call);
      if (/(?:Error|Exception)$/.test(callee) || callee === 'reject') add(node, 'ERROR', callee, call);
      if (containsIdentifier(node.callee, 'Platform')) add(node, 'PLATFORM_CONDITION', callee, call);
    }
    if (node.type === 'ThrowStatement' || node.type === 'CatchClause') add(node, 'ERROR', node.type);
    if (['IfStatement', 'ConditionalExpression', 'SwitchStatement'].includes(node.type)) {
      add(node, 'BRANCH_RULE', node.type);
      if (containsIdentifier(node.test ?? node.discriminant, 'Platform')) add(node, 'PLATFORM_CONDITION', node.type);
    }
    if (node.type === 'JSXOpeningElement') add(node, 'COMPONENT_USE', text(node.name));
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'comments', 'leadingComments', 'trailingComments', 'innerComments', 'extra', 'tokens', 'errors'].includes(key)) continue;
      if (Array.isArray(value)) for (const child of value) visit(child, node);
      else if (value && typeof value === 'object') visit(value, node);
    }
  };
  visit(ast);
  result.facts.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return result;
}

export function validateSourceSemantics(actual, expected) {
  const failures = [], rows = new Map();
  for (const row of actual?.facts ?? []) {
    if (!row.id || rows.has(row.id)) failures.push(`Duplicate semantic fact: ${row.id} at ${actual.path}`);
    rows.set(row.id, row);
  }
  for (const row of expected.facts) {
    const candidate = rows.get(row.id);
    if (!candidate) failures.push(`Missing semantic fact: ${row.id} at ${row.path}:${row.line}`);
    else if (canonical(candidate) !== canonical(row)) failures.push(`Changed semantic fact: ${row.id} at ${row.path}:${row.line}`);
    rows.delete(row.id);
  }
  for (const row of rows.values()) failures.push(`Unexpected semantic fact: ${row.id} at ${actual.path}`);
  const metadata = value => Object.fromEntries(Object.entries(value ?? {}).filter(([key]) => key !== 'facts'));
  if (canonical(metadata(actual)) !== canonical(metadata(expected))) failures.push(`Changed semantic source metadata: ${expected.path}`);
  return { valid: failures.length === 0, failures };
}
