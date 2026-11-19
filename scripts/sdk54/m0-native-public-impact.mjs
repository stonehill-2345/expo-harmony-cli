import { createHash } from 'node:crypto';
import { parse } from '@ast-grep/napi';
import { initializeNativeParsers } from './m0-native-parser.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const registrations = new Set(['Name', 'Function', 'AsyncFunction', 'Property', 'Prop', 'Events', 'Constant', 'Constants', 'Class', 'View', 'Constructor', 'RCT_EXPORT_MODULE', 'RCT_EXTERN_MODULE', 'RCT_EXPORT_METHOD', 'RCT_REMAP_METHOD', 'RCT_EXTERN_METHOD', 'RCT_EXPORT_VIEW_PROPERTY', 'RCT_REMAP_VIEW_PROPERTY', 'EX_EXPORT_MODULE', 'EX_EXPORT_METHOD_AS', 'EX_EXPORT_VIEW_PROPERTY', 'EX_VIEW_PROPERTY']);
const definitionKinds = new Set(['method_definition', 'function_definition', 'function_declaration', 'secondary_constructor']);
const bodyKinds = new Set(['compound_statement', 'function_body', 'block', 'constructor_body']);

export function auditNativePublicImpact({ source, analysis }) {
  const blockers = analysis.boundaries.filter(boundary => boundary.severity === 'SOURCE_ENUMERATION_BLOCKER');
  const output = { path: analysis.path, sourceSha256: hash(source), parser: analysis.parser, diagnosticCount: blockers.length, disposition: blockers.length ? 'PUBLIC_IMPACT_REQUIRES_REVIEW' : 'SOURCE_ENUMERATION_ACCEPTED', registrations: [], conditions: [], methods: [], unresolved: [] };
  if (!blockers.length) return output;
  if (!['c', 'cpp', 'objc', 'kotlin', 'java', 'ruby', 'groovy'].includes(analysis.language)) {
    output.unresolved = blockers.map(boundary => ({ line: boundary.line, endLine: boundary.endLine, reason: boundary.reason }));
    return output;
  }
  initializeNativeParsers();
  const root = parse(analysis.language, source).root(), nodes = [];
  const visit = node => { nodes.push(node); for (const child of node.children()) visit(child); };
  visit(root);
  const range = node => ({ start: node.range().start.index, end: node.range().end.index, line: node.range().start.line + 1, endLine: node.range().end.line + 1 });
  const errors = nodes.filter(node => node.kind() === 'ERROR');
  const tokens = nodes.filter(node => node.isLeaf() && !node.kind().includes('comment'));
  const abiQualifiers = tokens.filter(node => ['JNIEXPORT', 'JNICALL'].includes(node.text()));
  if (analysis.language === 'cpp' && abiQualifiers.length) {
    let projected = source;
    for (const token of [...abiQualifiers].sort((a, b) => range(b).start - range(a).start)) {
      const position = range(token);
      projected = projected.slice(0, position.start) + ' '.repeat(position.end - position.start) + projected.slice(position.end);
    }
    const projectedNodes = [];
    const scan = node => { projectedNodes.push(node); for (const child of node.children()) scan(child); };
    scan(parse('cpp', projected).root());
    const projectedErrors = projectedNodes.filter(node => node.kind() === 'ERROR');
    const definitions = projectedNodes.filter(node => node.kind() === 'function_definition');
    const functions = projectedNodes.filter(node => node.kind() === 'function_declarator').map(node => ({ name: node.field('declarator')?.text(), ...range(node) }));
    const calls = projectedNodes.filter(node => node.kind() === 'call_expression').map(node => ({ name: node.children().find(child => child.isNamed())?.text(), ...range(node) }));
    const missingFunctions = functions.filter(node => !analysis.facts.some(fact => fact.kind === 'NATIVE_FUNCTION' && fact.name === node.name && fact.line <= node.line && fact.endLine >= node.endLine));
    const missingCalls = calls.filter(node => !analysis.facts.some(fact => fact.kind === 'NATIVE_CALL_EXPRESSION' && fact.name === node.name && fact.line <= node.line && fact.endLine >= node.endLine));
    const missingBodies = definitions.filter(node => !analysis.facts.some(fact => fact.details?.syntaxKind === 'function_definition' && fact.details.expression.includes(source.slice(range(node).start, range(node).end))));
    if (!projectedErrors.length && definitions.length && !missingFunctions.length && !missingCalls.length && !missingBodies.length) {
      output.disposition = 'SOURCE_ENUMERATION_ACCEPTED_WITH_ABI_QUALIFIER_DIAGNOSTICS';
      output.normalizationProof = { engine: '@ast-grep/napi/tree-sitter-cpp', qualifierRules: abiQualifiers.map(token => ({ name: token.text(), ...range(token), bindingMeaning: token.text() === 'JNIEXPORT' ? 'JNI symbol visibility/export qualifier retained as a platform binding rule.' : 'JNI calling convention qualifier retained as a platform binding rule.' })), projectedSourceSha256: hash(projected), projectedDiagnosticCount: 0, functions, calls, completeBodiesRetained: definitions.length, missingFunctions, missingCalls, missingBodies: [] };
      output.acceptanceRule = 'Only mature-AST tokenized JNIEXPORT/JNICALL ABI qualifiers are projected to equal-width spaces. The complete C++ translation unit then parses without errors; every recovered function, invocation and complete body is independently matched to the original source inventory. Visibility/calling convention remain explicit binding rules, with no claim of native ABI compatibility.';
      return output;
    }
  }
  const declarations = nodes.filter(node => definitionKinds.has(node.kind())).flatMap(node => {
    const body = node.field('body') ?? node.children().find(child => bodyKinds.has(child.kind()));
    if (!body) return [];
    const position = range(node), bodyPosition = range(body);
    const signatureErrors = errors.filter(error => range(error).start >= position.start && range(error).start < bodyPosition.start);
    const retained = analysis.facts.find(fact => ['NATIVE_DECLARATION', 'NATIVE_FUNCTION', 'ERROR_DECLARATION'].includes(fact.kind) && fact.line <= position.line && fact.endLine >= position.endLine && typeof fact.details?.expression === 'string' && fact.details.expression.includes(node.text()));
    return [{ node, body, position, bodyPosition, signatureErrors, retained }];
  });
  const methodTypeRules = nodes.filter(node => ['method_declaration', 'method_definition'].includes(node.kind())).flatMap(node => {
    const children = node.children();
    const selectors = children.filter(child => child.kind() === 'identifier');
    const parameters = children.filter(child => child.kind() === 'method_parameter');
    const types = children.filter(child => child.kind() === 'method_type').concat(parameters.flatMap(parameter => parameter.children().filter(child => child.kind() === 'method_type')));
    const position = range(node);
    const retained = analysis.facts.find(fact => fact.kind === 'NATIVE_FUNCTION_DECLARATION' && fact.line === position.line && fact.endLine === position.endLine && fact.details.expression.includes(node.text()));
    if (!retained || selectors.length !== (parameters.length || 1)) return [];
    return types.map(type => ({ position: range(type), source: type.text(), signature: { name: retained.name, ...position, expressionSha256: hash(retained.details.expression) } }));
  });
  output.signatureTypeRules = methodTypeRules;
  const errorInRetainedTypeRule = position => methodTypeRules.some(rule => position.start >= rule.position.start && position.end <= rule.position.end);
  for (const declaration of declarations) {
    const contained = errors.filter(error => range(error).start >= declaration.bodyPosition.start && range(error).end <= declaration.bodyPosition.end);
    if (!contained.length) continue;
    output.methods.push({ ...declaration.position, syntaxKind: declaration.node.kind(), signature: source.slice(declaration.position.start, declaration.bodyPosition.start), expressionSha256: hash(declaration.node.text()), sourceRuleRetained: Boolean(declaration.retained), retainedFact: declaration.retained ? { kind: declaration.retained.kind, name: declaration.retained.name, line: declaration.retained.line, endLine: declaration.retained.endLine, expressionSha256: hash(declaration.retained.details.expression) } : null, signatureDiagnosticCount: declaration.signatureErrors.length, bodyDiagnosticCount: contained.length });
  }
  for (const token of nodes.filter(node => node.isLeaf() && ['identifier', 'type_identifier', 'simple_identifier'].includes(node.kind()) && (registrations.has(node.text()) || /^On[A-Z]/.test(node.text())))) {
    if (token.ancestors().some(parent => ['preproc_def', 'preproc_function_def', 'import_header', 'import_declaration'].includes(parent.kind()))) continue;
    const position = range(token);
    const declarationName = token.ancestors().some(parent => {
      const field = parent.field('name') ?? (parent.kind() === 'function_declarator' ? parent.field('declarator') : null);
      return field && field.range().start.index === position.start && field.range().end.index === position.end;
    });
    const fact = analysis.facts.find(fact => fact.details?.callee === token.text() && fact.line <= position.line && fact.endLine >= position.endLine);
    const nonInvocationReference = !['(', '{'].includes(tokens.find(node => node.range().start.index >= position.end)?.text());
    output.registrations.push({ name: token.text(), ...position, disposition: fact ? 'ENUMERATED_REGISTRATION_RULE' : declarationName ? 'ENUMERATED_DECLARATION_NAME' : nonInvocationReference ? 'NON_INVOCATION_REFERENCE' : 'MISSING_REGISTRATION_RULE', fact: fact ? { kind: fact.kind, name: fact.name, line: fact.line, endLine: fact.endLine, expressionSha256: hash(fact.details.expression) } : null });
  }
  for (const token of tokens.filter(node => ['#if', '#ifdef', '#ifndef', '#elif', '#else', '#endif'].includes(node.text()))) {
    const position = range(token);
    const fact = analysis.facts.find(fact => fact.kind === 'PLATFORM_CONDITION' && fact.line <= position.line && fact.endLine >= position.endLine);
    output.conditions.push({ directive: token.text(), ...position, sourceRuleRetained: Boolean(fact) });
    if (!fact) output.unresolved.push({ ...position, reason: 'A source conditional directive has no retained platform branch rule.' });
  }
  for (const error of errors) {
    const position = range(error);
    const method = declarations.find(declaration => declaration.retained && !declaration.signatureErrors.length && position.start >= declaration.bodyPosition.start && position.end <= declaration.bodyPosition.end);
    if (!method && !errorInRetainedTypeRule(position)) {
      const enclosing = analysis.facts.filter(fact => fact.line <= position.line && fact.endLine >= position.endLine && ['NATIVE_FUNCTION_DECLARATION', 'NATIVE_TYPE_DECLARATION', 'NATIVE_DECLARATION'].includes(fact.kind)).sort((a, b) => a.endLine - a.line - (b.endLine - b.line))[0];
      output.unresolved.push({ ...position, syntaxKind: error.kind(), expressionSha256: hash(error.text()), expression: error.text().length <= 8192 ? error.text() : null, retainedEnclosingRule: enclosing ? { kind: enclosing.kind, name: enclosing.name, line: enclosing.line, endLine: enclosing.endLine, expressionSha256: hash(enclosing.details.expression) } : null, reason: 'The diagnostic is outside the proved method body or bounded signature type rule. Its public impact still requires source review; an enclosing rule alone does not close it.' });
    }
  }
  for (const diagnostic of blockers) {
    const insideTypeRule = methodTypeRules.some(rule => diagnostic.line >= rule.position.line && diagnostic.endLine <= rule.position.endLine);
    if (diagnostic.kind !== 'UNBALANCED_NATIVE_SYNTAX' || !insideTypeRule && !declarations.some(declaration => declaration.retained && !declaration.signatureErrors.length && diagnostic.line >= declaration.bodyPosition.line && diagnostic.endLine <= declaration.bodyPosition.endLine)) output.unresolved.push({ line: diagnostic.line, endLine: diagnostic.endLine, kind: diagnostic.kind, reason: 'The emitted diagnostic is not covered by the independently retained method body or exact selector/type expression proof.' });
  }
  const missing = output.registrations.filter(row => row.disposition === 'MISSING_REGISTRATION_RULE');
  if (!output.unresolved.length && !missing.length && errors.length) output.disposition = 'SOURCE_ENUMERATION_ACCEPTED_WITH_IMPLEMENTATION_DIAGNOSTICS';
  output.acceptanceRule = 'Accept implementation/type binding diagnostics only when each error lies within a retained full method body with a clean signature, or a bounded method_type whose complete selector/parameter count and original signature are independently retained. All mature-lexer registration/lifecycle invocation tokens and source conditional branches require corresponding rules. Diagnostics outside that proof remain open; path, sibling filename and raw-source storage alone never close them.';
  return output;
}
