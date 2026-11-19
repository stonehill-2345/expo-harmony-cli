import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { parse } from '@ast-grep/napi';
import { initializeNativeParsers } from './m0-native-parser.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const walk = root => { const nodes = []; const visit = node => { nodes.push(node); for (const child of node.children()) visit(child); }; visit(root); return nodes; };
const position = node => ({ start: node.range().start.index, end: node.range().end.index, line: node.range().start.line + 1, endLine: node.range().end.line + 1 });
const within = (node, container) => position(node).start >= position(container).start && position(node).end <= position(container).end;
const blank = text => text.replace(/[^\n]/g, ' ');
const missingToken = node => node.isLeaf() && position(node).start === position(node).end && node.kind() !== 'translation_unit';
const macroDefinitions = [
  '#define __M0_RECORD__(...) __m0_record(__VA_ARGS__)',
  '#define __M0_MARK__(kind,args) +(void)__m0_marker { __M0_RECORD__(kind,args,__LINE__); }',
  '#define RCT_EXPORT_MODULE(...) __M0_MARK__("RCT_EXPORT_MODULE",#__VA_ARGS__)',
  '#define EX_EXPORT_MODULE(...) __M0_MARK__("EX_EXPORT_MODULE",#__VA_ARGS__)',
  '#define EX_EXPORT_MODULE_WITH_CUSTOM_LOAD(name,...) __M0_MARK__("EX_EXPORT_MODULE_WITH_CUSTOM_LOAD",#name) +(void)__m0_custom_load { __VA_ARGS__ }',
  '#define EX_EXPORT_SCOPED_MODULE(name,...) __M0_MARK__("EX_EXPORT_SCOPED_MODULE",#name)',
  '#define EX_EXPORT_SCOPED_MULTISERVICE_MODULE(name,...) __M0_MARK__("EX_EXPORT_SCOPED_MULTISERVICE_MODULE",#name)',
  '#define RCT_EXPORT_METHOD(...) __M0_MARK__("RCT_EXPORT_METHOD",#__VA_ARGS__) -(void)__VA_ARGS__',
  '#define RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(...) __M0_MARK__("RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD",#__VA_ARGS__) -(id)__VA_ARGS__',
  '#define RCT_EXPORT_SYNCHRONOUS_TYPED_METHOD(type,...) __M0_MARK__("RCT_EXPORT_SYNCHRONOUS_TYPED_METHOD",#__VA_ARGS__) -(type)__VA_ARGS__',
  '#define RCT_REMAP_METHOD(name,...) __M0_MARK__("RCT_REMAP_METHOD",#name) -(void)__VA_ARGS__',
  '#define EX_EXPORT_METHOD_AS(name,...) __M0_MARK__("EX_EXPORT_METHOD_AS",#name) -(void)__VA_ARGS__',
  '#define RCT_EXPORT_VIEW_PROPERTY(name,...) __M0_MARK__("RCT_EXPORT_VIEW_PROPERTY",#name)',
  '#define RCT_REMAP_VIEW_PROPERTY(name,...) __M0_MARK__("RCT_REMAP_VIEW_PROPERTY",#name)',
  '#define EX_EXPORT_VIEW_PROPERTY(name,...) __M0_MARK__("EX_EXPORT_VIEW_PROPERTY",#name)',
  '#define EX_VIEW_PROPERTY(name,...) __M0_MARK__("EX_VIEW_PROPERTY",#name)',
  '#define RCT_CUSTOM_VIEW_PROPERTY(name,type,viewType) __M0_MARK__("RCT_CUSTOM_VIEW_PROPERTY",#name) -(void)__m0_custom_##name:(id)json view:(viewType *)view defaultView:(viewType *)defaultView',
  '#define RCT_EXTERN_METHOD(...) -(void)__VA_ARGS__;',
  '#define RCT_EXTERN_MODULE(name,base) @interface name : base',
  '#define NS_ENUM(type,name) type name; enum name',
  '#define NS_OPTIONS(type,name) type name; enum name',
  '#define NS_CLOSED_ENUM(type,name) type name; enum name',
  '#define NS_ERROR_ENUM(domain,name) int name; enum name',
  '#define EX_REGISTER_MODULE(...) __M0_MARK__("EX_REGISTER_MODULE",#__VA_ARGS__)',
  '#define RCT_NOT_IMPLEMENTED(...) __VA_ARGS__ { __M0_RECORD__("RCT_NOT_IMPLEMENTED",#__VA_ARGS__,__LINE__); }',
  '#define RCT_ENUM_CONVERTER(type,...) +(type)type:(id)json { __M0_RECORD__("RCT_ENUM_CONVERTER",#__VA_ARGS__,__LINE__); }',
  '#define RCT_MULTI_ENUM_CONVERTER(type,...) +(type)type:(id)json { __M0_RECORD__("RCT_MULTI_ENUM_CONVERTER",#__VA_ARGS__,__LINE__); }',
  '#define EX_REGISTER_SINGLETON_MODULE(name) __M0_MARK__("EX_REGISTER_SINGLETON_MODULE",#name)',
  '#define EX_REGISTER_SINGLETON_MODULE_WITH_CUSTOM_LOAD(name,...) __M0_MARK__("EX_REGISTER_SINGLETON_MODULE_WITH_CUSTOM_LOAD",#name) +(void)__m0_custom_load { __VA_ARGS__ }',
  '#define JSI_EXPORT',
  '#define RCT_EXTERN extern',
  '#define EX_EXTERN extern',
  '#define NS_SWIFT_NAME(...)',
  '#define NS_REFINED_FOR_SWIFT',
  '#define NS_UNAVAILABLE',
  '#define __unused',
  '#define __weak',
  '#define __strong',
  '#define __unsafe_unretained',
  '#define EX_DEFINE_SCOPED_MODULE_GETTER(className,getter) @implementation EXScopedModuleRegistry (className) -(className *)getter { return [self.bridge moduleForClass:[className class]]; } @end',
  '#define EX_DECLARE_SCOPED_MODULE_GETTER(className,getter) @interface EXScopedModuleRegistry (className) @property (nonatomic, readonly) className *__nonnull getter; @end',
];
const knownMacros = new Set(macroDefinitions.flatMap(text => /^#define ((?:RCT|EX)_[A-Z_]+)/.exec(text)?.slice(1) ?? []).concat(['QUICK_RCT_EXPORT_COMMAND_METHOD', 'QUICK_RCT_EXPORT_COMMAND_METHOD_PARAMS']));
const isRegistration = name => /^(?:RCT_(?:EXPORT|EXTERN|REMAP|CUSTOM)_|EX_(?:EXPORT|VIEW|REMAP|REGISTER)_|QUICK_RCT_EXPORT_)/.test(name);

export function projectObjcPublicSource(source) {
  initializeNativeParsers();
  const output = { engine: '@ast-grep/napi:tree-sitter-objc+tree-sitter-cpp+cc-E', sourceSha256: hash(source), facts: [], methods: [], registrations: [], conditions: [], projections: [], unresolved: [] };
  const originalNodes = walk(parse('objc', source).root());
  const originalCppNodes = walk(parse('cpp', source).root());
  const originalLines = source.split('\n');
  const directives = new Set(['#if', '#ifdef', '#ifndef', '#elif', '#else', '#endif']);
  const edits = [], sharedSignatures = [];
  const inMacro = node => node.ancestors().some(parent => ['preproc_def', 'preproc_function_def'].includes(parent.kind()));
  const directiveNodes = new Map(), directiveConditions = new Map();
  for (const node of [...originalNodes, ...originalCppNodes].filter(node => node.isLeaf() && directives.has(node.text()) && !inMacro(node))) {
    const start = position(node).start;
    directiveNodes.set(start, node);
    const condition = node.parent()?.field('condition');
    if (condition && !directiveConditions.has(start)) directiveConditions.set(start, condition);
  }
  let directiveSource = blank(source);
  for (const [start, node] of directiveNodes) {
    const condition = directiveConditions.get(start);
    const endOfLine = source.indexOf('\n', Math.max(position(node).end, condition ? position(condition).end : 0)), end = endOfLine < 0 ? source.length : endOfLine;
    output.conditions.push({ ...position(node), endLine: source.slice(0, end).split('\n').length, expression: source.slice(start, end) });
    edits.push({ start, end });
    directiveSource = directiveSource.slice(0, start) + source.slice(start, end) + directiveSource.slice(end);
    if (['#if', '#elif'].includes(node.text())) {
      const conditionStart = position(node).end;
      const placeholder = blank(source.slice(conditionStart, end)).replace('  ', ' 1');
      directiveSource = directiveSource.slice(0, conditionStart) + placeholder + directiveSource.slice(end);
    }
  }
  const directiveAst = walk(parse('cpp', directiveSource).root());
  for (const node of directiveAst.filter(node => node.kind() === 'ERROR' || missingToken(node))) output.unresolved.push({ ...position(node), expectedToken: node.kind(), reason: 'The mature preprocessor grammar cannot prove the independently retained complete directive stream.' });
  for (const node of directiveAst.filter(node => node.isNamed())) output.facts.push({ kind: 'NATIVE_PREPROCESSOR_AST_RULE', name: node.kind(), ...position(node), details: { expression: source.slice(position(node).start, position(node).end), projectedExpression: node.text(), parser: 'tree-sitter-cpp', sourceBranches: 'ALL_ENUMERATED_NO_RUNTIME_SELECTION', rule: 'Only directive nesting is proved by this AST. Each original condition is retained independently; a constant placeholder prevents unsupported header-availability expressions from corrupting structural pairing.' } });
  for (const node of originalNodes) {
    if (node.isLeaf() && ['JSI_EXPORT', 'RCT_EXTERN', 'EX_EXTERN', 'NS_SWIFT_NAME', 'NS_REFINED_FOR_SWIFT', 'NS_UNAVAILABLE', '__unused', '__weak', '__strong', '__unsafe_unretained'].includes(node.text()) && !inMacro(node)) output.facts.push({ kind: 'NATIVE_ABI_ANNOTATION_RULE', name: node.text(), ...position(node), details: { expression: originalLines[node.range().start.line], rule: 'Finite imported visibility/storage/Swift-name/availability/ownership annotation retained as a binding rule; projected only for mature source syntax enumeration.' } });
    if (node.isLeaf() && isRegistration(node.text()) && !inMacro(node)) {
      const row = { name: node.text(), ...position(node), knownExpansion: knownMacros.has(node.text()) };
      output.registrations.push(row);
      if (!row.knownExpansion) output.unresolved.push({ ...row, reason: 'Unknown registration macro requires a finite source expansion rule.' });
    }
    if (['preproc_include', 'preproc_def', 'preproc_function_def', 'preproc_call'].includes(node.kind())) {
      const name = node.field('name')?.text();
      const preserveQuickDefinition = node.kind() === 'preproc_function_def' && ['QUICK_RCT_EXPORT_COMMAND_METHOD', 'QUICK_RCT_EXPORT_COMMAND_METHOD_PARAMS'].includes(name);
      if (!preserveQuickDefinition) edits.push(position(node));
      output.facts.push({ kind: node.kind() === 'preproc_include' ? 'NATIVE_SOURCE_DEPENDENCY' : 'NATIVE_MACRO_DEFINITION', name: name ?? node.text(), ...position(node), details: { expression: node.text(), syntaxKind: node.kind(), parser: 'tree-sitter-objc', sourceBranches: 'ALL_PRESERVED' } });
    }
    if (node.isLeaf() && ['NS_ASSUME_NONNULL_BEGIN', 'NS_ASSUME_NONNULL_END'].includes(node.text()) && !inMacro(node)) edits.push(position(node));
  }
  const projectedConditionalStarts = new Set();
  for (const conditional of [...originalCppNodes, ...originalNodes].filter(node => ['preproc_if', 'preproc_ifdef'].includes(node.kind()))) {
    if (projectedConditionalStarts.has(position(conditional).start)) continue;
    const branchTokens = walk(conditional).filter(node => node.isLeaf() && directives.has(node.text()));
    if (branchTokens.length !== 3 || branchTokens[1].text() !== '#else' || branchTokens[2].text() !== '#endif') continue;
    const headers = [];
    for (let index = 0; index < 2; index++) {
      const start = source.indexOf('\n', position(branchTokens[index]).end) + 1;
      const end = position(branchTokens[index + 1]).start;
      if (start <= 0 || /[{}]/.test(source.slice(start, end))) break;
      const signature = source.slice(start, end).trim();
      const validation = walk(parse('objc', `@interface __M0 : NSObject\n${signature};\n@end`).root());
      const methods = validation.filter(node => node.kind() === 'method_declaration');
      if (methods.length !== 1 || validation.some(node => node.kind() === 'ERROR' || missingToken(node))) break;
      const children = methods[0].children();
      const selector = children.flatMap((child, childIndex) => child.kind() === 'identifier' ? [child.text() + (children[childIndex + 1]?.kind() === 'method_parameter' ? ':' : '')] : []).join('');
      headers.push({ start, end, signature, selector, line: source.slice(0, start).split('\n').length, endLine: source.slice(0, end).split('\n').length });
    }
    if (headers.length === 2) {
      projectedConditionalStarts.add(position(conditional).start);
      edits.push({ start: headers[0].start, end: headers[0].end });
      sharedSignatures.push({ condition: position(conditional), headers });
    }
  }
  // Directive ranges can overlap their containing macro; blanking a union keeps source offsets stable.
  let input = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) input = input.slice(0, edit.start) + blank(input.slice(edit.start, edit.end)) + input.slice(edit.end);
  const expanded = execFileSync('cc', ['-E', '-undef', '-x', 'objective-c++', '-'], { input: macroDefinitions.join('\n') + '\n#line 1 "m0-source"\n' + input, encoding: 'utf8', timeout: 30_000, maxBuffer: 64 * 1024 * 1024 });
  let sourceLine = null;
  const sourceLines = [];
  let projected = expanded.split('\n').map(line => {
    const marker = /^#\s+(\d+)\s+"([^"]+)"/.exec(line);
    if (marker) { sourceLine = marker[2] === 'm0-source' ? Number(marker[1]) : null; sourceLines.push(null); return blank(line); }
    sourceLines.push(sourceLine);
    if (sourceLine !== null) sourceLine++;
    return line;
  }).join('\n');
  const location = node => ({ line: sourceLines[node.range().start.line] ?? node.range().start.line + 1, endLine: sourceLines[node.range().end.line] ?? node.range().end.line + 1 });
  const expression = node => originalLines.slice(location(node).line - 1, location(node).endLine).join('\n');
  const fact = (kind, name, node, details = {}) => ({ kind, name, ...location(node), details: { syntaxKind: node.kind(), expression: expression(node), expandedExpression: node.text(), parser: 'tree-sitter-objc/tree-sitter-cpp', ...details } });
  const blockTypeRules = walk(parse('objc', projected).root()).filter(node => node.kind() === 'type_definition' && walk(node).some(child => child.isLeaf() && child.text() === '^')).concat(walk(parse('cpp', projected).root()).filter(node => node.kind() === 'alias_declaration' && walk(node).some(child => child.isLeaf() && child.text() === '^')));
  const blockEdits = [];
  for (const node of blockTypeRules) {
    let pointerSource = node.text();
    const tokens = walk(node).filter(child => child.isLeaf() && child.text() === '^');
    const generics = walk(node).filter(child => child.kind() === 'generic_specifier');
    const qualifiers = walk(node).filter(child => child.isLeaf() && ['_Nonnull', '_Nullable', '__autoreleasing'].includes(child.text()));
    const transforms = tokens.map(child => ({ node: child, text: '*' })).concat(generics.map(child => ({ node: child, text: 'id' })), qualifiers.map(child => ({ node: child, text: '' })));
    for (const transform of transforms.sort((a, b) => position(b.node).start - position(a.node).start)) {
      const start = position(transform.node).start - position(node).start, end = position(transform.node).end - position(node).start;
      pointerSource = pointerSource.slice(0, start) + transform.text.padEnd(end - start) + pointerSource.slice(end);
    }
    const pointerNodes = walk(parse('cpp', pointerSource).root());
    if (pointerNodes.some(child => child.kind() === 'ERROR' || missingToken(child))) continue;
    output.facts.push(fact('NATIVE_BLOCK_TYPE_RULE', node.field('declarator')?.text() ?? 'block-type', node, { pointerProjectionSha256: hash(pointerSource), rule: 'Mature Objective-C typedef boundary and block caret tokens are independently parsed as a C++ function pointer signature. Original Objective-C generic types/nullability and block calling convention remain binding rules.' }));
    for (const child of pointerNodes.filter(child => child.isNamed())) output.facts.push({ kind: 'NATIVE_BLOCK_SIGNATURE_AST_RULE', name: child.field('declarator')?.text() ?? child.kind(), ...location(node), details: { expression: expression(node), syntaxKind: child.kind(), projectedExpression: child.text() } });
    blockEdits.push(node);
  }
  for (const node of blockEdits.sort((a, b) => position(b).start - position(a).start)) projected = projected.slice(0, position(node).start) + blank(node.text()) + projected.slice(position(node).end);
  const expandedNodes = walk(parse('objc', projected).root());
  const fieldContainerKinds = ['enum_specifier', 'struct_specifier', 'union_specifier', 'instance_variables'];
  for (const node of expandedNodes.filter(node => fieldContainerKinds.includes(node.kind()) && !walk(node).some(child => child.kind() === 'ERROR'))) {
    output.facts.push(fact('NATIVE_TYPE_DECLARATION', node.field('name')?.text() ?? node.kind(), node));
    for (const child of walk(node).filter(child => child.isNamed())) output.facts.push(fact('NATIVE_TYPE_MEMBER_RULE', child.field('name')?.text() ?? child.kind(), child));
  }
  const eraseNodes = (nodes, reason) => {
    const unique = nodes.filter((node, index) => !nodes.some((other, otherIndex) => otherIndex !== index && within(node, other) && (position(node).start !== position(other).start || position(node).end !== position(other).end || otherIndex < index)));
    for (const node of unique.sort((a, b) => position(b).start - position(a).start)) {
      const range = position(node);
      output.projections.push({ ...location(node), syntaxKind: node.kind(), expandedExpressionSha256: hash(node.text()), reason });
      projected = projected.slice(0, range.start) + blank(projected.slice(range.start, range.end)) + projected.slice(range.end);
    }
    return unique.length;
  };
  const standaloneEnums = expandedNodes.filter(node => node.kind() === 'declaration' && node.children().some(child => child.kind() === 'enum_specifier' && child.field('body')) && node.children().some(child => child.text() === ';') && walk(node).every(child => child.kind() !== 'ERROR' && (!missingToken(child) || child.kind() === 'identifier' && node.children().some(specifier => specifier.kind() === 'enum_specifier' && position(child).start === position(specifier).end))) && node.children().filter(child => child.isNamed() && !missingToken(child)).every(child => child.kind() === 'enum_specifier'));
  for (const node of standaloneEnums) output.facts.push(fact('NATIVE_ENUM_DECLARATION_RULE', node.text(), node, { rule: 'Complete enum definition and real semicolon form a standalone enum declaration. The Objective-C interface grammar inserts only an optional variable identifier after the complete enum body; the retained type/member AST enumerates the original declaration.' }));
  eraseNodes(standaloneEnums, 'Complete standalone enum source and member AST retained; no variable declaration is inferred.');
  const cpp = walk(parse('cpp', projected).root());
  const implTokens = walk(parse('objc', projected).root()).filter(node => node.isLeaf() && ['@implementation', '@interface', '@protocol'].includes(node.text()));
  const firstImplementation = implTokens.length ? Math.min(...implTokens.map(node => position(node).start)) : Infinity;
  const cppTopKinds = ['namespace_definition', 'namespace_alias_definition', 'using_declaration', 'using_directive', 'alias_declaration', 'declaration', 'function_definition', 'class_specifier', 'template_declaration'];
  const topCpp = cpp.filter(node => cppTopKinds.includes(node.kind()) && (position(node).end <= firstImplementation || ['namespace_definition', 'class_specifier'].includes(node.kind()) && !implTokens.some(token => within(token, node))) && !node.ancestors().some(parent => ['namespace_definition', 'function_definition', 'declaration', 'class_specifier', 'template_declaration'].includes(parent.kind())));
  const cppProjection = [];
  const objcDeclarations = expandedNodes.filter(node => ['class_declaration', 'module_import'].includes(node.kind()));
  for (const node of topCpp) {
    if (objcDeclarations.some(other => position(other).start < position(node).end && position(other).end > position(node).start)) continue;
    const descendants = walk(node);
    const functions = descendants.filter(child => child.kind() === 'function_definition');
    const errors = descendants.filter(child => child.kind() === 'ERROR' || missingToken(child));
    const covered = errors.every(error => functions.some(fn => fn.field('body') && within(error, fn.field('body'))));
    if (!covered) continue;
    output.facts.push(fact('NATIVE_CPP_SOURCE_RULE', node.field('name')?.text() ?? node.kind(), node, { rule: 'Complete mature C++ declaration/namespace retained; diagnostics, if any, occur only in complete function bodies.' }));
    for (const child of descendants.filter(child => child.isNamed())) output.facts.push(fact('NATIVE_CPP_AST_RULE', child.field('name')?.text() ?? child.field('declarator')?.text() ?? child.kind(), child));
    cppProjection.push(node);
  }
  for (const node of cpp.filter(node => node.kind() === 'function_definition' && node.children().some(child => child.text() === 'implementation'))) {
    const body = node.field('body');
    if (!body || walk(body).some(child => child.kind() === 'ERROR' || missingToken(child))) continue;
    output.facts.push(fact('NATIVE_CPP_SOURCE_RULE', 'implementation-ivars', body));
    for (const child of walk(body).filter(child => child.isNamed())) output.facts.push(fact('NATIVE_CPP_AST_RULE', child.field('declarator')?.text() ?? child.kind(), child));
    cppProjection.push(body);
  }
  eraseNodes(cppProjection, 'A mature C++ AST identifies complete declarations/ivars. All named AST nodes are retained; equal-width spaces permit independent Objective-C selector enumeration.');
  const mixedSource = projected;
  // Mature lexers exclude braces inside strings/comments; the C++ grammar, not a custom stack,
  // assigns nesting and complete ranges. Every resulting scope must later match an ObjC method.
  const skeleton = blank(projected).split('');
  for (const language of ['objc', 'cpp']) for (const token of walk(parse(language, projected).root()).filter(node => node.isLeaf() && ['{', '}'].includes(node.kind()) && node.text() === node.kind())) skeleton[position(token).start] = token.text();
  const skeletonRoot = parse('cpp', skeleton.join('')).root();
  const skeletonErrors = walk(skeletonRoot).filter(node => node.kind() === 'ERROR');
  const scopes = skeletonRoot.children().filter(node => node.kind() === 'compound_statement');
  if (skeletonErrors.length) output.unresolved.push({ reason: 'Mature scope grammar cannot prove complete mixed-language brace structure.' });
  for (const scope of [...scopes].sort((a, b) => position(b).start - position(a).start)) {
    const range = position(scope);
    projected = projected.slice(0, range.start + 1) + blank(projected.slice(range.start + 1, range.end - 1)) + projected.slice(range.end - 1);
  }
  const matchedScopes = new Set();
  for (const shared of sharedSignatures) {
    const scope = scopes.find(node => location(node).line > shared.condition.endLine);
    if (!scope) { output.unresolved.push({ line: shared.condition.line, reason: 'Conditional method signatures have no independently matched shared body.' }); continue; }
    const bodyLocation = location(scope);
    const first = shared.headers[0];
    const row = { kind: 'NATIVE_FUNCTION_DECLARATION', name: first.selector, line: first.line, endLine: bodyLocation.endLine, details: { expression: originalLines.slice(first.line - 1, bodyLocation.endLine).join('\n'), signature: first.signature, selector: first.selector, sourceRule: 'CONDITIONAL_SHARED_METHOD_BODY', alternativeSignatures: shared.headers, sharedBody: bodyLocation, sourceBranches: 'ALL_ENUMERATED_NO_RUNTIME_SELECTION', parser: 'tree-sitter-objc independent branch signatures + tree-sitter-cpp scope grammar' } };
    output.facts.push(row);
    output.methods.push({ name: first.selector, line: first.line, endLine: bodyLocation.endLine, signature: first.signature, expressionSha256: hash(row.details.expression), conditionalSharedBody: true });
  }
  for (const scope of scopes) if (expandedNodes.some(node => fieldContainerKinds.includes(node.kind()) && !walk(node).some(child => child.kind() === 'ERROR') && within(scope, node))) matchedScopes.add(position(scope).start);
  const retainedMethods = new Set();
  for (let pass = 0; pass < 256; pass++) {
    const nodes = walk(parse('objc', projected).root());
    const remove = [], typeEdits = [];
    for (const node of nodes.filter(node => ['method_definition', 'method_declaration', 'function_definition'].includes(node.kind()))) {
      const children = node.children();
      const body = node.field('body') ?? children.find(child => child.kind() === 'compound_statement');
      const types = children.filter(child => child.kind() === 'method_type').concat(children.filter(child => child.kind() === 'method_parameter').flatMap(child => child.children().filter(item => item.kind() === 'method_type')));
      const signatureErrors = nodes.filter(error => error.kind() === 'ERROR' && within(error, node) && (!body || position(error).start < position(body).start));
      if (walk(node).some(child => missingToken(child) && (!body || position(child).start < position(body).start))) continue;
      if (signatureErrors.some(error => !types.some(type => within(error, type)))) continue;
      const identifiers = children.filter(child => child.kind() === 'identifier');
      const parameters = children.filter(child => child.kind() === 'method_parameter');
      if (node.kind() !== 'function_definition' && identifiers.length !== (parameters.length || 1)) continue;
      const functionDeclarator = node.kind() === 'function_definition' ? walk(node).find(child => child.kind() === 'function_declarator' && (!body || position(child).end <= position(body).start)) : null;
      if (node.kind() === 'function_definition' && !functionDeclarator) continue;
      const name = functionDeclarator ? functionDeclarator.field('declarator')?.text() ?? functionDeclarator.text() : children.flatMap((child, index) => child.kind() === 'identifier' ? [child.text() + (children[index + 1]?.kind() === 'method_parameter' ? ':' : '')] : []).join('');
      const key = `${position(node).start}:${name}`;
      if (body) matchedScopes.add(position(body).start);
      if (!retainedMethods.has(key)) {
        retainedMethods.add(key);
        if (name === '__m0_marker') {
          const markerBody = mixedSource.slice(position(body).start, position(body).end);
          for (const call of walk(parse('objc', markerBody).root()).filter(child => child.kind() === 'call_expression' && child.field('function')?.text() === '__m0_record')) {
            const args = call.field('arguments')?.children().filter(child => child.isNamed()) ?? [];
            if (args.length !== 3) continue;
            const callee = JSON.parse(args[0].text()), value = JSON.parse(args[1].text()), line = Number(args[2].text());
            output.facts.push({ kind: /(?:MODULE)/.test(callee) ? 'NATIVE_MODULE' : /PROPERTY/.test(callee) ? 'VIEW_PROP' : 'NATIVE_FUNCTION', name: value || callee, line, endLine: line, details: { callee, expression: originalLines[line - 1], arguments: [value], nameResolution: 'COMPILER_STRINGIFIED_SOURCE_ARGUMENT' } });
          }
        } else {
          const row = fact('NATIVE_FUNCTION_DECLARATION', name, node, { selector: name, sourceRule: 'COMPLETE_SELECTOR_SIGNATURE_AND_BODY', signature: projected.slice(position(node).start, body ? position(body).start : position(node).end), parameterTypes: types.map(type => type.text()) });
          output.facts.push(row);
          output.methods.push({ name, ...location(node), signature: row.details.signature, expressionSha256: hash(row.details.expression), parameterCount: parameters.length });
          if (body) {
            for (const language of ['objc', 'cpp']) {
              const originalBody = mixedSource.slice(position(body).start, position(body).end);
              const bodyNodes = walk(parse(language, originalBody).root());
              for (const child of bodyNodes.filter(child => child.isNamed() && !['translation_unit', 'ERROR'].includes(child.kind()))) {
                const line = location(body).line + child.range().start.line;
                const endLine = location(body).line + child.range().end.line;
                output.facts.push({ kind: 'NATIVE_METHOD_BODY_AST_RULE', name: child.field('name')?.text() ?? child.field('function')?.text() ?? child.kind(), line, endLine, details: { expression: originalLines.slice(line - 1, endLine).join('\n'), expandedExpression: child.text(), syntaxKind: child.kind(), parser: `tree-sitter-${language}`, enclosingSelector: name } });
              }
            }
          }
        }
      }
      if (body && body.text().slice(1, -1).trim()) remove.push(...body.children().filter(child => !['{', '}'].includes(child.kind())));
      for (const type of types) if (walk(type).some(child => child.kind() === 'ERROR') && !walk(type).some(child => child.isLeaf() && ['{', '}', ';'].includes(child.text()))) {
        const originalType = fact('NATIVE_SIGNATURE_TYPE_RULE', name, type, { selector: name });
        output.facts.push(originalType);
        typeEdits.push(type);
      }
    }
    const removed = eraseNodes(remove, 'Complete selector/signature and finite original method/type rule retained before body projection; no native binding is claimed.');
    for (const type of typeEdits.sort((a, b) => position(b).start - position(a).start)) {
      const range = position(type);
      if (/[{};]/.test(type.text())) continue;
      const replacement = type.text().replace(/[^\n]/g, ' ').split('');
      replacement[0] = '('; replacement[1] = 'i'; replacement[2] = 'd'; replacement[replacement.length - 1] = ')';
      projected = projected.slice(0, range.start) + replacement.join('') + projected.slice(range.end);
    }
    if (!removed && !typeEdits.length) break;
  }
  const finalNodes = walk(parse('objc', projected).root());
  for (const declaration of expandedNodes.filter(node => node.kind() === 'declaration')) {
    const blocks = walk(declaration).filter(node => ['block_expression', 'block_literal'].includes(node.kind()));
    const errors = walk(declaration).filter(node => node.kind() === 'ERROR');
    if (!blocks.length || errors.some(error => !blocks.some(block => {
      const body = block.field('body') ?? block.children().find(child => child.kind() === 'compound_statement');
      return body && within(error, body);
    }))) continue;
    output.facts.push(fact('NATIVE_BLOCK_DECLARATION_RULE', declaration.field('declarator')?.text() ?? 'block-declaration', declaration));
    for (const child of walk(declaration).filter(node => node.isNamed())) output.facts.push(fact('NATIVE_BLOCK_DECLARATION_AST_RULE', child.field('name')?.text() ?? child.kind(), child));
    for (const scope of scopes) if (within(scope, declaration)) matchedScopes.add(position(scope).start);
  }
  let cppOnly = mixedSource;
  for (const node of finalNodes.filter(node => ['class_interface', 'class_implementation', 'category_interface', 'category_implementation', 'protocol_declaration'].includes(node.kind())).sort((a, b) => position(b).start - position(a).start)) cppOnly = cppOnly.slice(0, position(node).start) + blank(cppOnly.slice(position(node).start, position(node).end)) + cppOnly.slice(position(node).end);
  for (const namespace of walk(parse('cpp', cppOnly).root()).filter(node => node.kind() === 'namespace_definition' && !node.ancestors().some(parent => parent.kind() === 'namespace_definition'))) {
    const descendants = walk(namespace), functions = descendants.filter(node => node.kind() === 'function_definition');
    if (descendants.filter(node => node.kind() === 'ERROR' || missingToken(node)).some(error => !functions.some(fn => fn.field('body') && within(error, fn.field('body'))))) continue;
    output.facts.push(fact('NATIVE_CPP_SOURCE_RULE', namespace.field('name')?.text() ?? 'namespace', namespace));
    for (const child of descendants.filter(node => node.isNamed())) output.facts.push(fact('NATIVE_CPP_AST_RULE', child.field('name')?.text() ?? child.field('declarator')?.text() ?? child.kind(), child));
    for (const scope of scopes) if (within(scope, namespace)) matchedScopes.add(position(scope).start);
  }
  for (const scope of scopes) if (!matchedScopes.has(position(scope).start)) output.unresolved.push({ ...location(scope), reason: 'A mature matched scope has no independently parsed complete Objective-C method signature or exact C++/block declaration rule.' });
  for (const node of finalNodes.filter(node => node.kind() === 'ERROR')) output.unresolved.push({ ...location(node), syntaxKind: node.kind(), expression: expression(node), projectedExpression: node.text(), reason: 'Remaining mature Objective-C syntax diagnostics outside fully retained method bodies/types.' });
  for (const node of finalNodes.filter(missingToken)) output.unresolved.push({ ...location(node), syntaxKind: node.kind(), expectedToken: node.kind(), reason: 'The mature grammar inserted a missing token; source enumeration cannot accept an incomplete declaration or container.' });
  for (const row of output.conditions) output.facts.push({ kind: 'PLATFORM_CONDITION', name: row.expression, line: row.line, endLine: row.endLine, details: { expression: row.expression, allBranchesPreserved: true } });
  output.projectedSourceSha256 = hash(projected);
  output.macroRules = macroDefinitions;
  return output;
}
