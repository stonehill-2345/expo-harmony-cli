import path from 'node:path';
import { createRequire } from 'node:module';
import { parse } from '@ast-grep/napi';
import { parseExpression } from '@babel/parser';
import { initializeNativeParsers, expandSourceAnnotationMacros, preprocessNativeRegistrationSource, parseSwiftSource, parseKotlinSource, parseGroovySource } from './m0-native-parser.mjs';

const require = createRequire(import.meta.url);
const { DOMParser } = require('@xmldom/xmldom');
const ANDROID_NS = 'http://schemas.android.com/apk/res/android';
const DSL = new Map(Object.entries({
  Name: 'NATIVE_MODULE', Function: 'NATIVE_FUNCTION', AsyncFunction: 'NATIVE_FUNCTION',
  Property: 'NATIVE_PROPERTY', Prop: 'VIEW_PROP', Events: 'EVENT_DECLARATION',
  Constant: 'NATIVE_CONSTANT', Constants: 'NATIVE_CONSTANTS', Class: 'NATIVE_CLASS',
  View: 'NATIVE_VIEW', Constructor: 'NATIVE_CONSTRUCTOR',
  RCT_EXPORT_MODULE: 'NATIVE_MODULE', RCT_EXTERN_MODULE: 'NATIVE_MODULE',
  RCT_EXPORT_METHOD: 'NATIVE_FUNCTION', RCT_REMAP_METHOD: 'NATIVE_FUNCTION',
  RCT_EXTERN_METHOD: 'NATIVE_FUNCTION', RCT_EXPORT_VIEW_PROPERTY: 'VIEW_PROP',
  RCT_REMAP_VIEW_PROPERTY: 'VIEW_PROP', EX_EXPORT_MODULE: 'NATIVE_MODULE',
  EX_EXPORT_METHOD_AS: 'NATIVE_FUNCTION', EX_EXPORT_VIEW_PROPERTY: 'VIEW_PROP', EX_VIEW_PROPERTY: 'VIEW_PROP',
}));

function result(language, parser, coverage) {
  return { language, parser, coverage, facts: [], boundaries: [] };
}

function lines(content, start = 0, end = content.length) {
  return { line: content.slice(0, start).split('\n').length, endLine: content.slice(0, end).split('\n').length };
}

function xmlAnalysis(file, content) {
  const output = result('xml', '@xmldom/xmldom', 'PARSED_MANIFEST');
  const doctypes = content.match(/<!DOCTYPE[^>]*>/gi) ?? [];
  const standardApplePlist = /^<!DOCTYPE\s+plist\s+PUBLIC\s+"-\/\/Apple\/\/DTD PLIST 1\.0\/\/EN"\s+"https?:\/\/www\.apple\.com\/DTDs\/PropertyList-1\.0\.dtd"\s*>$/i;
  if (doctypes.some(declaration => !standardApplePlist.test(declaration)) || /<!ENTITY/i.test(content)) {
    output.coverage = 'EXTRACTED_WITH_BOUNDARIES';
    output.boundaries.push({ kind: 'UNSUPPORTED_XML_ENTITY', severity: 'SOURCE_ENUMERATION_BLOCKER', ...lines(content), expression: content, reason: 'External or custom entities require a separate trusted resolver.' });
    return output;
  }
  const errors = [];
  let document;
  try {
    document = new DOMParser({ locator: true, onError: (level, message) => errors.push(`${level}: ${message}`) }).parseFromString(content, 'application/xml');
  } catch (error) { errors.push(error.message); }
  if (errors.length || !document?.documentElement) {
    output.coverage = 'EXTRACTED_WITH_BOUNDARIES';
    output.boundaries.push({ kind: 'MALFORMED_XML', severity: 'SOURCE_ENUMERATION_BLOCKER', ...lines(content), expression: content, reason: errors.join('\n') || 'Missing XML root.' });
    return output;
  }
  const elements = node => Array.from(node.childNodes ?? []).filter(child => child.nodeType === 1);
  const plistValue = node => {
    if (!node) throw new Error('Missing plist value.');
    if (node.nodeName === 'dict') {
      const children = elements(node), value = Object.create(null);
      if (children.length % 2) throw new Error('Odd plist dictionary entry count.');
      for (let i = 0; i < children.length; i += 2) {
        if (children[i].nodeName !== 'key') throw new Error('Plist dictionary key required.');
        const key = children[i].textContent;
        if (Object.hasOwn(value, key)) throw new Error(`Duplicate plist key ${key}.`);
        value[key] = plistValue(children[i + 1]);
      }
      return value;
    }
    if (node.nodeName === 'array') return elements(node).map(plistValue);
    if (node.nodeName === 'true') return true;
    if (node.nodeName === 'false') return false;
    if (['integer', 'real'].includes(node.nodeName)) {
      const value = Number(node.textContent);
      if (!Number.isFinite(value)) throw new Error('Invalid numeric plist value.');
      return value;
    }
    if (['string', 'date', 'data', 'key'].includes(node.nodeName)) return node.textContent;
    throw new Error(`Unsupported plist node ${node.nodeName}.`);
  };
  const root = document.documentElement;
  if (root.nodeName === 'plist') {
    try {
      const children = elements(root);
      if (children.length !== 1) throw new Error('Plist must contain exactly one root value.');
      const value = plistValue(children[0]);
      const walk = (node, pointer = '') => {
        if (node.nodeName === 'dict') {
          const children = elements(node);
          for (let i = 0; i < children.length; i += 2) {
            const key = children[i].textContent, item = children[i + 1];
            const kind = /UsageDescription$/.test(key) ? 'PERMISSION_DECLARATION' : /^NSPrivacy/.test(key) ? 'PRIVACY_DECLARATION' : 'PLIST_DECLARATION';
            output.facts.push({ kind, name: key, line: children[i].lineNumber ?? 1, endLine: item.lineNumber ?? 1, details: { pointer: `${pointer}/${key}`, value: plistValue(item) } });
            walk(item, `${pointer}/${key}`);
          }
        } else if (node.nodeName === 'array') elements(node).forEach((item, i) => walk(item, `${pointer}/${i}`));
      };
      walk(children[0]);
      if (!output.facts.length) output.facts.push({ kind: 'PLIST_ROOT', name: '/', line: 1, endLine: lines(content).endLine, details: { value } });
    } catch (error) {
      output.coverage = 'EXTRACTED_WITH_BOUNDARIES';
      output.boundaries.push({ kind: 'MALFORMED_PLIST', severity: 'SOURCE_ENUMERATION_BLOCKER', ...lines(content), expression: content, reason: error.message });
    }
    return output;
  }
  const visit = (node, pointer) => {
    const attributes = Object.fromEntries(Array.from(node.attributes ?? []).map(attr => [attr.name, attr.value]));
    const androidName = node.getAttributeNS(ANDROID_NS, 'name');
    let kind = 'MANIFEST_ELEMENT';
    if (node.localName?.startsWith('uses-permission')) kind = 'PERMISSION_DECLARATION';
    else if (root.localName === 'resources' && node !== root) kind = 'RESOURCE_DECLARATION';
    const name = androidName || node.getAttribute('name') || pointer;
    output.facts.push({ kind, name, line: node.lineNumber ?? 1, endLine: node.lastChild?.lineNumber ?? node.lineNumber ?? 1, details: { element: node.nodeName, namespace: node.namespaceURI ?? null, attributes, text: node.textContent, pointer } });
    elements(node).forEach((child, index) => visit(child, `${pointer}/${child.nodeName}[${index}]`));
  };
  visit(root, `/${root.nodeName}`);
  return output;
}

function jsonAnalysis(file, content) {
  const output = result('json', 'JSON.parse', 'PARSED_MANIFEST');
  let value;
  try { value = JSON.parse(content); } catch (error) {
    output.coverage = 'EXTRACTED_WITH_BOUNDARIES';
    output.boundaries.push({ kind: 'MALFORMED_JSON', severity: 'SOURCE_ENUMERATION_BLOCKER', ...lines(content), expression: content, reason: error.message });
    return output;
  }
  const walk = (item, pointer) => {
    const kind = /\/(modules|appDelegateSubscribers|reactDelegateHandlers|services|gradlePlugins|podspecPath)(\/|$)/.test(pointer) ? 'AUTOLINKING_REGISTRATION' : pointer.startsWith('/platforms') ? 'PLATFORM_DECLARATION' : 'MANIFEST_VALUE';
    output.facts.push({ kind, name: pointer || '/', ...lines(content), details: { pointer, value: item } });
    if (item && typeof item === 'object') for (const [key, child] of Object.entries(item)) walk(child, `${pointer}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`);
  };
  walk(value, '');
  return output;
}

function swiftAnalysis(file, content, language = 'swift') {
  const output = result(language, language === 'swift' ? 'SwiftParser/SwiftSyntax' : 'KotlinCompiler/PSI', 'EXTRACTED_WITH_BOUNDARIES');
  let tree;
  try { tree = language === 'swift' ? parseSwiftSource(content) : parseKotlinSource(content, file); } catch (error) {
    output.boundaries.push({ kind: 'NATIVE_FRONTEND_FAILED', severity: 'SOURCE_ENUMERATION_BLOCKER', ...lines(content), expression: '', reason: error.message });
    return output;
  }
  output.parserProvenance = tree.provenance;
  output.syntaxNodeCount = tree.nodeCount;
  const bytes = Buffer.from(content);
  const byteLine = offset => (language === 'swift' ? bytes.subarray(0, offset).toString('utf8') : content.slice(0, offset)).split('\n').length;
  const location = record => ({ line: byteLine(record.start), endLine: byteLine(record.end) });
  const add = (kind, name, record, details = {}) => output.facts.push({ kind, name, ...location(record), details: { syntaxKind: record.originalSyntaxKind ?? record.syntaxKind, expression: record.expression, ...details } });
  const boundary = (kind, record, reason, severity = 'BINDING_CONTEXT_ONLY') => output.boundaries.push({ kind, severity, ...location(record), expression: record.expression, reason });
  output.boundaries.push({ kind: 'NATIVE_SEMANTIC_BOUNDARY', severity: 'BINDING_CONTEXT_ONLY', ...lines(content), expression: '', reason: `${output.parser} enumerates every source syntax branch without resolving platform types or executing native code. Native binding and Harmony behavior remain later acceptance obligations.` });
  if (language === 'kotlin') for (const record of tree.records) {
    record.originalSyntaxKind = record.syntaxKind;
    record.syntaxKind = ({ KtStringTemplateExpression: 'stringLiteralExpr', KtCallExpression: 'functionCallExpr', KtImportDirective: 'importDecl', KtThrowExpression: 'throwStmt', KtIfExpression: 'ifExpr', KtWhenExpression: 'switchExpr' })[record.syntaxKind] ?? (record.declaration ? 'nativeDecl' : record.syntaxKind);
  }
  for (const diagnostic of tree.diagnostics) {
    if (diagnostic.severity === 'error') output.boundaries.push({ kind: 'UNBALANCED_NATIVE_SYNTAX', severity: 'SOURCE_ENUMERATION_BLOCKER', line: byteLine(diagnostic.offset), endLine: byteLine(diagnostic.offset), expression: bytes.subarray(diagnostic.offset, diagnostic.offset + 160).toString('utf8'), reason: diagnostic.message });
  }
  const byExpression = new Map(), bindings = new Map();
  for (const record of tree.records) {
    if (!byExpression.has(record.expression)) byExpression.set(record.expression, []);
    byExpression.get(record.expression).push(record);
    if (record.bindings) for (const binding of record.bindings) {
      if (!bindings.has(binding.name)) bindings.set(binding.name, []);
      bindings.get(binding.name).push({ ...binding, initializer: record.bindingKind === 'let' ? binding.initializer : undefined, declaration: record });
    }
    if (record.parameterName) {
      if (!bindings.has(record.parameterName)) bindings.set(record.parameterName, []);
      bindings.get(record.parameterName).push({ name: record.parameterName, declaration: record });
    }
  }
  const visibleBindings = (name, context) => {
    const visible = (bindings.get(name) ?? []).filter(binding => binding.declaration.scope.start <= context.start && binding.declaration.scope.end >= context.end);
    const width = binding => binding.declaration.scope.end - binding.declaration.scope.start;
    const nearest = Math.min(...visible.map(width));
    return visible.filter(binding => width(binding) === nearest);
  };
  const resolve = (expression, context, seen = new Set()) => {
    const records = byExpression.get(expression) ?? [];
    const literal = records.find(record => record.syntaxKind === 'stringLiteralExpr');
    if (literal && !literal.interpolated) {
      try { return [JSON.parse(expression)]; } catch { return null; }
    }
    const array = records.find(record => record.syntaxKind === 'arrayExpr');
    if (array) {
      const values = array.elements.map(value => resolve(value, context, new Set(seen)));
      return values.every(Boolean) ? values.flat() : null;
    }
    const arrayCall = records.find(record => ['arrayOf', 'listOf', 'setOf'].includes(record.callee));
    if (arrayCall) {
      const values = arrayCall.arguments.map(value => resolve(value, context, new Set(seen)));
      return values.every(Boolean) ? values.flat() : null;
    }
    const candidates = visibleBindings(expression, context);
    if (candidates.length === 1 && candidates[0].initializer !== undefined && candidates[0].declaration.start < context.start && !seen.has(expression)) {
      seen.add(expression);
      return resolve(candidates[0].initializer, candidates[0].declaration, seen);
    }
    return null;
  };
  for (const record of tree.records) {
    const { syntaxKind: kind, expression, name } = record;
    // Every declaration, expression and statement is kept as a finite syntax rule,
    // so method-body algorithms remain reviewable beyond named registrations.
    add('NATIVE_SYNTAX_RULE', kind, record);
    if (kind.endsWith('Decl')) add(/(?:Exception|Error)$/.test(name ?? '') || record.superTypes?.some(type => /(?:Exception|Error)\b/.test(type)) ? 'ERROR_DECLARATION' : 'NATIVE_DECLARATION', name ?? kind, record);
    if (kind === 'importDecl') add('NATIVE_SOURCE_DEPENDENCY', expression, record);
    if (['ifConfigDecl', 'ifConfigClause', 'availabilityCondition'].includes(kind) || kind === 'attribute' && /^(?:@available|@unavailable)\b/.test(expression)) add('PLATFORM_CONDITION', kind, record);
    if (['ifExpr', 'switchExpr', 'guardStmt'].includes(kind)) add('CONDITIONAL_EXPRESSION', kind, record);
    if (kind === 'throwStmt') add('ERROR_BEHAVIOR', 'throw', record);
    if (record.originalSyntaxKind === 'KtDotQualifiedExpression' && /^Manifest\.permission\.[A-Za-z_][A-Za-z_0-9]*$/.test(expression)) add('PERMISSION_REFERENCE', expression, record);
    if (!record.callee) continue;
    const callee = record.callee, args = record.arguments;
    add('NATIVE_CALL_EXPRESSION', callee, record, { arguments: args });
    if (/(?:^|\.)reject$/.test(callee)) add('ERROR_BEHAVIOR', callee, record);
    const lifecycle = /^On[A-Z]/.test(callee), category = lifecycle ? 'LIFECYCLE_HOOK' : DSL.get(callee);
    if (!category) continue;
    let names = category === 'EVENT_DECLARATION' ? (() => { const values = args.map(arg => resolve(arg, record)); return values.every(Boolean) ? values.flat() : null; })() : resolve(args[0], record);
    if (lifecycle || ['NATIVE_VIEW', 'NATIVE_CONSTANTS', 'NATIVE_CONSTRUCTOR'].includes(category)) names = [args.join(', ') || callee];
    if (names) for (const value of names) add(category, value, record, { callee, arguments: args, nameResolution: 'STATIC_SOURCE_VALUE' });
    else {
      add(category + '_EXPRESSION', callee, record, { callee, arguments: args, nameResolution: 'SOURCE_EXPRESSION', localBindings: args.flatMap(arg => visibleBindings(arg, record).map(binding => ({ name: arg, ...location(binding.declaration), expression: binding.declaration.expression }))) });
      boundary('DYNAMIC_NATIVE_ARGUMENT', record, 'The complete SwiftSyntax expression and local immutable declaration rules are retained; imported/runtime values are binding context and are not executed during M0.');
    }
  }
  return output;
}

function groovyAnalysis(file, content) {
  const output = result('groovy', 'GroovyCompiler/AST', 'EXTRACTED_WITH_BOUNDARIES');
  try {
    const tree = parseGroovySource(content);
    output.parserProvenance = tree.provenance;
    output.syntaxNodeCount = tree.nodeCount;
    output.boundaries.push({ kind: 'NATIVE_SEMANTIC_BOUNDARY', severity: 'BINDING_CONTEXT_ONLY', ...lines(content), expression: '', reason: 'Groovy compiler parsing/conversion enumerates Gradle source rules without executing source, plugins, repositories or dependency resolution.' });
    for (const record of tree.records) {
      const { syntaxKind, name, line, endLine, expression, callee, arguments: args } = record;
      output.facts.push({ kind: 'INSTALLATION_CONFIGURATION', name: name ?? callee ?? syntaxKind, line, endLine, details: { syntaxKind, expression } });
      if (callee) output.facts.push({ kind: 'NATIVE_CALL_EXPRESSION', name: callee, line, endLine, details: { syntaxKind, expression, arguments: args } });
      if (syntaxKind === 'ThrowStatement') output.facts.push({ kind: 'ERROR_BEHAVIOR', name: 'throw', line, endLine, details: { syntaxKind, expression } });
    }
    for (const diagnostic of tree.diagnostics) if (diagnostic.severity === 'error') output.boundaries.push({ kind: 'UNBALANCED_NATIVE_SYNTAX', severity: 'SOURCE_ENUMERATION_BLOCKER', line: diagnostic.line, endLine: diagnostic.endLine, expression: content, reason: diagnostic.message });
  } catch (error) { output.boundaries.push({ kind: 'NATIVE_FRONTEND_FAILED', severity: 'SOURCE_ENUMERATION_BLOCKER', ...lines(content), expression: '', reason: error.message }); }
  return output;
}

function codeAnalysis(file, content, language) {
  const output = result(language, '@ast-grep/napi/tree-sitter', 'EXTRACTED_WITH_BOUNDARIES');
  let root;
  let parsedContent = content, preprocessed = null;
  try {
    initializeNativeParsers();
    root = parse(language, content).root();
  } catch (error) {
    output.coverage = 'UNSUPPORTED';
    output.boundaries.push({ kind: 'UNSUPPORTED_LANGUAGE', severity: 'SOURCE_ENUMERATION_BLOCKER', ...lines(content), expression: '', reason: error.message });
    return output;
  }
  if (['c', 'cpp', 'objc'].includes(language)) {
    const sourceNodes = [];
    const scan = node => { sourceNodes.push(node); for (const child of node.children()) scan(child); };
    scan(root);
    const definitions = new Map();
    for (const node of sourceNodes.filter(node => node.kind() === 'preproc_def')) {
      const name = node.field('name')?.text(), value = node.field('value')?.text().trim() ?? '';
      if (!name) continue;
      if (!definitions.has(name)) definitions.set(name, []);
      definitions.get(name).push({ value, expression: node.text(), line: node.range().start.line + 1 });
    }
    const macros = [...definitions].filter(([, rules]) => new Set(rules.map(rule => rule.value)).size === 1 && ['', 'extern', 'static', 'inline'].includes(rules[0].value)).map(([name, rules]) => ({ name, value: rules[0].value, rules }));
    const expansions = expandSourceAnnotationMacros(macros);
    const inDirective = node => node.ancestors().some(parent => {
      if (['preproc_def', 'preproc_function_def', 'preproc_arg', 'preproc_include', 'preproc_call'].includes(parent.kind())) return true;
      if (!parent.kind().startsWith('preproc_if') && !parent.kind().startsWith('preproc_elif')) return false;
      return ['name', 'condition'].map(field => parent.field(field)).filter(Boolean).some(field => field.range().start.index <= node.range().start.index && field.range().end.index >= node.range().end.index);
    });
    const edits = sourceNodes.filter(node => node.isLeaf() && ['identifier', 'type_identifier'].includes(node.kind()) && expansions.has(node.text()) && !inDirective(node)).map(node => ({ start: node.range().start.index, end: node.range().end.index, name: node.text(), expansion: expansions.get(node.text()) })).filter(edit => edit.expansion.length <= edit.end - edit.start);
    if (edits.length) {
      let normalized = content;
      for (const edit of edits.sort((a, b) => b.start - a.start)) normalized = normalized.slice(0, edit.start) + edit.expansion.padEnd(edit.end - edit.start) + normalized.slice(edit.end);
      root = parse(language, normalized).root();
      parsedContent = normalized;
      output.sourceNormalizations = macros.filter(macro => edits.some(edit => edit.name === macro.name)).map(({ name, value, rules }) => ({ kind: 'C_SOURCE_ANNOTATION_MACRO', name, expansion: value, rules, engine: 'cc -E -P', sourceBranches: 'ALL_PRESERVED', rule: 'Only object-like source-defined macros with one finite empty/storage-keyword body are expanded. External overrides remain a binding context; every original declaration expression and conditional branch is retained.' }));
      for (const normalization of output.sourceNormalizations) output.boundaries.push({ kind: 'C_SOURCE_ANNOTATION_MACRO', severity: 'BINDING_CONTEXT_ONLY', line: normalization.rules[0].line, endLine: normalization.rules[0].line, expression: normalization.rules.map(rule => rule.expression).join('\n'), reason: normalization.rule });
    }
  }
  const hasParseErrors = node => node.kind() === 'ERROR' || node.children().some(hasParseErrors);
  if (language === 'kotlin' && hasParseErrors(root)) return swiftAnalysis(file, content, 'kotlin');
  if (language === 'groovy' && hasParseErrors(root)) return groovyAnalysis(file, content);
  if (language === 'objc' || ['c', 'cpp'].includes(language) && hasParseErrors(root)) {
    try {
      const original = [];
      const visit = node => { original.push(node); for (const child of node.children()) visit(child); };
      visit(root);
      preprocessed = preprocessNativeRegistrationSource(parsedContent, root, { language, allowNoRegistration: language !== 'objc' });
      if (preprocessed) {
        output.sourceNormalizations ??= [];
        output.sourceNormalizations.push(preprocessed.rule);
        for (const condition of preprocessed.conditions) output.facts.push({ kind: 'PLATFORM_CONDITION', name: condition.directive, line: condition.line, endLine: condition.endLine, details: { expression: condition.expression, allBranchesPreserved: true } });
        for (const node of original.filter(node => ['preproc_include', 'preproc_def', 'preproc_function_def', 'preproc_call'].includes(node.kind()))) output.facts.push({ kind: node.kind() === 'preproc_include' ? 'NATIVE_SOURCE_DEPENDENCY' : node.kind() === 'preproc_call' ? 'NATIVE_PREPROCESSOR_RULE' : 'NATIVE_MACRO_DEFINITION', name: node.field('name')?.text() ?? node.text(), line: node.range().start.line + 1, endLine: node.range().end.line + 1, details: { expression: node.text(), syntaxKind: node.kind() } });
        for (const node of original.filter(node => node.kind() === 'function_declarator' && node.children().find(child => child.isNamed())?.text() === 'RCT_EXPORT_METHOD')) {
          const pending = [...node.children()]; let selector;
          while (pending.length && !selector) { const child = pending.shift(); if (child.kind() === 'type_identifier') selector = child.text(); else pending.push(...child.children()); }
          if (selector) output.facts.push({ kind: 'NATIVE_FUNCTION', name: selector, line: node.range().start.line + 1, endLine: node.range().end.line + 1, details: { expression: node.text(), callee: 'RCT_EXPORT_METHOD', nameResolution: 'ORIGINAL_MACRO_SELECTOR_AST' } });
        }
        root = parse(language, preprocessed.content).root();
        output.boundaries.push({ kind: preprocessed.rule.kind, severity: 'BINDING_CONTEXT_ONLY', ...lines(content), expression: '', reason: preprocessed.rule.reason });
      }
    } catch (error) {
      preprocessed = null;
      output.boundaries.push({ kind: 'OBJC_PREPROCESSING_FAILED', severity: 'SOURCE_ENUMERATION_BLOCKER', ...lines(content), expression: '', reason: error.message });
    }
  }
  if (language === 'kotlin') {
    const corrections = [];
    const findSamModifiers = node => {
      const children = node.children();
      if (node.kind() === 'ERROR' && children.length === 3 && children[0].kind() === 'fun' && children[1].text() === 'interface' && children[2].kind() === 'simple_identifier') {
        corrections.push({ start: children[0].range().start.index, end: children[0].range().end.index, name: children[2].text(), line: node.range().start.line + 1, endLine: node.range().end.line + 1, expression: node.text() });
      }
      for (const child of children) findSamModifiers(child);
    };
    findSamModifiers(root);
    if (corrections.length) {
      let normalized = content;
      for (const correction of [...corrections].sort((a, b) => b.start - a.start)) normalized = normalized.slice(0, correction.start) + ' '.repeat(correction.end - correction.start) + normalized.slice(correction.end);
      root = parse(language, normalized).root();
      output.sourceNormalizations = corrections.map(({ start, end, ...item }) => ({ ...item, kind: 'KOTLIN_SAM_MODIFIER', bytePreservingRange: [start, end], rule: 'Kotlin fun interface retains the functional/SAM modifier as a separate source fact; the interface body is parsed by the mature Kotlin grammar with only that modifier replaced by equal-width spaces.' }));
      for (const correction of corrections) {
        output.facts.push({ kind: 'NATIVE_FUNCTIONAL_INTERFACE', name: correction.name, line: correction.line, endLine: correction.endLine, details: { expression: correction.expression, modifier: 'fun', rule: 'KOTLIN_SAM_MODIFIER' } });
        output.boundaries.push({ kind: 'KOTLIN_SAM_MODIFIER', severity: 'BINDING_CONTEXT_ONLY', line: correction.line, endLine: correction.endLine, expression: correction.expression, reason: 'The standard functional-interface modifier is separately retained; no native execution or type binding is required for source enumeration.' });
      }
    }
  }
  const nodes = [];
  const visit = node => { nodes.push(node); for (const child of node.children()) visit(child); };
  visit(root);
  const location = node => ({ line: preprocessed?.sourceLines[node.range().start.line] ?? node.range().start.line + 1, endLine: preprocessed?.sourceLines[node.range().end.line] ?? node.range().end.line + 1 });
  const named = node => node.children().filter(n => n.isNamed());
  const sourceExpression = node => preprocessed ? content.split('\n').slice(location(node).line - 1, location(node).endLine).join('\n') : content.slice(node.range().start.index, node.range().end.index);
  const add = (kind, name, node, details = {}) => output.facts.push({ kind, name, ...location(node), details: { syntaxKind: node.kind(), expression: sourceExpression(node), ...details } });
  const boundary = (kind, node, reason, severity = 'BINDING_CONTEXT_ONLY') => output.boundaries.push({ kind, severity, ...location(node), expression: sourceExpression(node), syntaxKind: node.kind(), reason });
  output.boundaries.push({ kind: 'NATIVE_SEMANTIC_BOUNDARY', severity: 'BINDING_CONTEXT_ONLY', ...lines(content), expression: '', reason: 'AST declaration and expression source inventory; native execution, compiler binding, macro evaluation and Harmony support are separate later acceptance obligations.' });
  const descendants = (node, kind) => {
    const found = [];
    const scan = current => { for (const child of current.children()) { if (child.kind() === kind) found.push(child); scan(child); } };
    scan(node); return found;
  };
  const callInfo = node => {
    const children = named(node), callee = children[0];
    if (!callee || callee.kind() === 'call_expression') return null;
    const suffix = children.find(n => n.kind() === 'call_suffix');
    const args = suffix?.children().find(n => n.kind() === 'value_arguments') ?? children.find(n => ['argument_list', 'arguments'].includes(n.kind()));
    const methodName = node.kind() === 'method_invocation' ? node.field('name') : language === 'ruby' ? node.field('method') : null;
    return { callee: methodName?.text() ?? callee.text(), args: args ? named(args).map(n => n.kind() === 'value_argument' ? named(n).at(-1) ?? n : n) : [] };
  };
  const bindings = new Map();
  for (const node of nodes) {
    if (node.kind() !== 'property_declaration') continue;
    const children = named(node), binding = children.find(n => ['variable_declaration', 'pattern'].includes(n.kind()));
    const name = binding && (descendants(binding, 'simple_identifier')[0]?.text() ?? binding.text());
    const value = children.at(-1);
    if (name && value && value.id() !== binding.id() && /^(let|val)\b/.test(node.text())) {
      if (!bindings.has(name)) bindings.set(name, []);
      bindings.get(name).push({ value, declaration: node });
    }
  }
  const resolve = (node, seen = new Set()) => {
    if (!node) return null;
    const kind = node.kind(), text = node.text();
    if (['string_literal', 'line_string_literal', 'multi_line_string_literal'].includes(kind)) {
      if (descendants(node, 'interpolated_expression').length || descendants(node, 'interpolation_expression').length || descendants(node, 'string_interpolation').length) return null;
      try { return [JSON.parse(text)]; } catch { return null; }
    }
    if (kind === 'simple_identifier' && bindings.has(text) && bindings.get(text).length === 1 && !seen.has(text)) {
      seen.add(text); return resolve(bindings.get(text)[0].value, seen);
    }
    let items = kind === 'array_literal' ? named(node) : null;
    const info = kind === 'call_expression' ? callInfo(node) : null;
    if (info && ['arrayOf', 'listOf', 'setOf'].includes(info.callee)) items = info.args;
    if (items) {
      const values = items.map(n => resolve(n, new Set(seen)));
      return values.every(Boolean) ? values.flat() : null;
    }
    return null;
  };
  for (const node of nodes) {
    const kind = node.kind(), text = node.text();
    if (kind === 'ERROR') boundary('UNBALANCED_NATIVE_SYNTAX', node, 'Tree-sitter reports an unparsed native source range.', 'SOURCE_ENUMERATION_BLOCKER');
    if (node.isNamed() && (kind.endsWith('_declaration') || ['method_definition', 'function_definition', 'field_definition', 'preproc_def', 'preproc_function_def'].includes(kind))) {
      const nameNode = node.field('name') ?? named(node).find(n => ['simple_identifier', 'type_identifier', 'identifier', 'variable_declaration', 'pattern'].includes(n.kind()));
      const name = nameNode?.text() ?? kind;
      const errorBase = kind === 'class_declaration' && named(node).filter(n => ['delegation_specifier', 'inheritance_specifier', 'superclass', 'super_interfaces'].includes(n.kind())).some(n => descendants(n, 'type_identifier').some(type => /(?:Exception|Error)$/.test(type.text())));
      if (!name.startsWith('__m0_')) add(/(?:Exception|Error)$/.test(name) || errorBase ? 'ERROR_DECLARATION' : 'NATIVE_DECLARATION', name, node);
      if (kind === 'method_definition' && !name.startsWith('__m0_')) add('NATIVE_FUNCTION', name, node, { declarationOnly: true });
      if (kind === 'method_declaration' && descendants(node, 'marker_annotation').some(n => n.text() === '@ReactMethod')) add('NATIVE_FUNCTION', name, node, { annotation: 'ReactMethod' });
    }
    if (['macro_type_specifier', 'function_declarator'].includes(kind)) {
      const callee = named(node)[0]?.text(), category = DSL.get(callee);
      if (category) {
        const value = named(node)[1];
        const name = value && (descendants(value, 'type_identifier')[0]?.text() ?? descendants(value, 'identifier')[0]?.text() ?? value.text());
        if (name) add(category, name, node, { callee, nameResolution: 'MACRO_AST_ARGUMENT', expansionNotExecuted: true });
      }
      if (kind === 'function_declarator') {
        const name = node.field('declarator');
        if (name && !DSL.has(name.text())) add('NATIVE_FUNCTION', name.text(), node, { declarationOnly: true });
      }
    }
    if (kind === 'call_expression' || kind === 'method_invocation' || language === 'ruby' && kind === 'call') {
      const info = callInfo(node);
      if (info) {
        if (info.callee === '__M0_SOURCE_REGISTER__') {
          try {
            const callee = JSON.parse(info.args[0].text()), name = JSON.parse(info.args[1].text()), sourceLine = Number(info.args[2].text());
            const category = DSL.get(callee);
            if (category) output.facts.push({ kind: name ? category : category + '_EXPRESSION', name: name || callee, line: sourceLine, endLine: sourceLine, details: { callee, expression: content.split('\n')[sourceLine - 1] ?? '', arguments: [name], nameResolution: 'COMPILER_STRINGIFIED_SOURCE_ARGUMENT' } });
          } catch (error) { boundary('OBJC_REGISTRATION_ARGUMENT', node, error.message, 'SOURCE_ENUMERATION_BLOCKER'); }
          continue;
        }
        add('NATIVE_CALL_EXPRESSION', info.callee, node, { arguments: info.args.map(n => n.text()) });
        const lifecycle = /^On[A-Z]/.test(info.callee), category = lifecycle ? 'LIFECYCLE_HOOK' : DSL.get(info.callee);
        if (category) {
          let names = category === 'EVENT_DECLARATION' ? (() => { const v = info.args.map(n => resolve(n)); return v.every(Boolean) ? v.flat() : null; })() : resolve(info.args[0]);
          if (!names && info.callee.startsWith('RCT_') && info.args[0] && ['identifier', 'type_identifier'].includes(info.args[0].kind())) names = [info.args[0].text()];
          if (lifecycle || ['NATIVE_VIEW', 'NATIVE_CONSTANTS', 'NATIVE_CONSTRUCTOR'].includes(category)) names = [info.args.map(n => n.text()).join(', ') || info.callee];
          if (names) for (const name of names) add(category, name, node, { callee: info.callee, arguments: info.args.map(n => n.text()), nameResolution: 'STATIC_SOURCE_VALUE' });
          else {
            add(category + '_EXPRESSION', info.callee, node, { arguments: info.args.map(n => n.text()), nameResolution: 'SOURCE_EXPRESSION', localBindings: info.args.flatMap(n => (bindings.get(n.text()) ?? []).map(b => ({ name: n.text(), ...location(b.declaration), expression: b.declaration.text() }))) });
            boundary('DYNAMIC_NATIVE_ARGUMENT', node, 'The complete finite AST expression and local declaration rules are retained; imported/runtime values are not executed during M0.');
          }
        }
        if (/(?:^|\.)reject$/.test(info.callee)) add('ERROR_BEHAVIOR', info.callee, node);
      }
    }
    if (kind.includes('throw')) add('ERROR_BEHAVIOR', 'throw', node);
    if (language === 'ruby' && ['assignment', 'operator_assignment'].includes(kind)) add('INSTALLATION_CONFIGURATION', node.field('left')?.text() ?? kind, node);
    if (['navigation_expression', 'field_access'].includes(kind) && /^Manifest\.permission\.[A-Za-z_][A-Za-z_0-9]*$/.test(text)) add('PERMISSION_REFERENCE', text, node);
    if (kind.startsWith('preproc_if') || kind.includes('availability') || kind === 'directive' && /^#(?:if|elseif|else|endif)\b/.test(text)) add('PLATFORM_CONDITION', kind, node);
    else if (['if_expression', 'if_statement', 'guard_statement', 'switch_expression', 'switch_statement'].includes(kind)) add('CONDITIONAL_EXPRESSION', kind, node);
    if (kind.includes('import') && node.isNamed()) add('NATIVE_SOURCE_DEPENDENCY', text, node);
  }
  return output;
}

export function analyzeNativeSource({ path: file, content }) {
  if (typeof file !== 'string' || typeof content !== 'string' && !Buffer.isBuffer(content)) throw new TypeError('path must be a string and content must be a string or Buffer');
  if (Buffer.isBuffer(content) && content.subarray(0, 8).toString() === 'bplist00') {
    const output = result('plist', 'bplist-parser', 'PARSED_MANIFEST');
    try {
      const roots = require('bplist-parser').parseBuffer(content);
      if (roots.length !== 1) throw new Error('Binary plist must have one root.');
      const walk = (value, pointer = '') => {
        const key = pointer.split('/').at(-1) ?? '/';
        const kind = /UsageDescription$/.test(key) ? 'PERMISSION_DECLARATION' : /^NSPrivacy/.test(key) ? 'PRIVACY_DECLARATION' : 'PLIST_DECLARATION';
        output.facts.push({ kind, name: key, line: 1, endLine: 1, details: { pointer, value, byteRange: [0, content.length], representation: 'BINARY_PLIST' } });
        if (value && typeof value === 'object' && !Buffer.isBuffer(value) && !(value instanceof Date)) for (const [name, child] of Object.entries(value)) walk(child, `${pointer}/${name.replaceAll('~', '~0').replaceAll('/', '~1')}`);
      };
      walk(roots[0]);
    } catch (error) {
      output.coverage = 'EXTRACTED_WITH_BOUNDARIES';
      output.boundaries.push({ kind: 'MALFORMED_BINARY_PLIST', severity: 'SOURCE_ENUMERATION_BLOCKER', line: 1, endLine: 1, expression: '', reason: error.message });
    }
    return output;
  }
  if (Buffer.isBuffer(content)) content = content.toString('utf8');
  if (file.includes('template') && content.includes('<%')) {
    const rules = [];
    const projected = content.replace(/<%([=-]?)([\s\S]*?)%>/g, (expression, mode, body, start) => {
      let ast;
      try { ast = parseExpression(body.trim()); } catch { return expression; }
      const finite = node => node.type === 'Identifier' && node.name === 'project' || node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier' && finite(node.object);
      if (!mode || !finite(ast) || /[\r\n]/.test(expression)) return expression;
      const replacement = `M0Template${rules.length}`.padEnd(expression.length, 'X');
      if (replacement.length !== expression.length) return expression;
      rules.push({ kind: 'NATIVE_TEMPLATE_GENERATION_RULE', start, end: start + expression.length, ...lines(content, start, start + expression.length), expression, valueExpression: body.trim(), replacement, parser: '@babel/parser' });
      return replacement;
    });
    if (rules.length && !projected.includes('<%')) {
      const output = analyzeNativeSource({ path: file, content: projected });
      const restore = value => typeof value === 'string' ? rules.reduce((text, rule) => text.replaceAll(rule.replacement, rule.expression), value) : Array.isArray(value) ? value.map(restore) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, restore(child)])) : value;
      for (let index = 0; index < output.facts.length; index++) {
        const fact = output.facts[index];
        const affected = rules.filter(rule => JSON.stringify(fact).includes(rule.replacement));
        if (!affected.length) continue;
        const restored = restore(fact);
        restored.details.valueMode = 'TEMPLATE_GENERATION_RULE';
        restored.details.templateRules = affected.map(({ replacement, ...rule }) => rule);
        if (rules.some(rule => String(fact.name).includes(rule.replacement)) && DSL.has(fact.details.callee)) restored.kind += '_EXPRESSION';
        output.facts[index] = restored;
      }
      output.boundaries = output.boundaries.map(restore);
      output.sourceNormalizations = [...(output.sourceNormalizations ?? []), ...rules.map(({ replacement, ...rule }) => ({ ...rule, rule: 'A mature JavaScript parser validates each project member expression. Equal-width symbolic identifiers allow native syntax enumeration; original EJS expressions remain generation rules and never become concrete runtime API names.' }))];
      output.boundaries.push({ kind: 'NATIVE_TEMPLATE_GENERATION_RULE', severity: 'BINDING_CONTEXT_ONLY', ...lines(content), expression: '', reason: 'Every template interpolation is retained as its finite project-member expression; concrete project identity is supplied by the later generation invocation.' });
      return output;
    }
  }
  const extension = path.posix.extname(file).toLowerCase();
  // COCOA_NULLABILITY_SOURCE_PROJECTION_BEGIN
  if (extension === '.groovy') return groovyAnalysis(file, content);
  if (['.m', '.mm', '.h'].includes(extension)) {
    initializeNativeParsers();
    const analyzeProjected = projected => {
      const candidates = (extension === '.h' ? ['c', 'cpp', 'objc'] : ['objc']).map(language => codeAnalysis(file, projected, language));
      const errors = candidate => candidate.boundaries.filter(boundary => boundary.severity === 'SOURCE_ENUMERATION_BLOCKER').length;
      candidates.sort((a, b) => errors(a) - errors(b));
      const output = candidates[0];
      if (extension === '.h') output.parserSelection = candidates.map(candidate => ({ language: candidate.language, sourceEnumerationBlockers: errors(candidate), normalizationRules: candidate.sourceNormalizations?.length ?? 0 }));
      if (output.language === 'objc') {
        const inventory = node => {
          const children = node.children();
          if (['class_interface', 'class_implementation', 'protocol_declaration', 'category_interface', 'category_implementation'].includes(node.kind())) {
            const name = node.field('name')?.text() ?? children.find(child => ['identifier', 'type_identifier'].includes(child.kind()))?.text() ?? node.kind();
            output.facts.push({ kind: 'NATIVE_TYPE_DECLARATION', name, line: node.range().start.line + 1, endLine: node.range().end.line + 1, details: { syntaxKind: node.kind(), expression: node.text() } });
          }
          if (['method_declaration', 'method_definition'].includes(node.kind())) {
            const selector = children.flatMap((child, index) => child.kind() === 'identifier' ? [child.text() + (children[index + 1]?.kind() === 'method_parameter' ? ':' : '')] : []).join('');
            output.facts.push({ kind: 'NATIVE_FUNCTION_DECLARATION', name: selector, line: node.range().start.line + 1, endLine: node.range().end.line + 1, details: { syntaxKind: node.kind(), expression: node.text(), selector, declarationOnly: node.kind() === 'method_declaration' } });
          }
          for (const child of children) inventory(child);
        };
        inventory(parse('objc', projected).root());
      }
      return output;
    };
    const annotations = [];
    const scan = node => {
      if (node.isLeaf() && ['NS_ASSUME_NONNULL_BEGIN', 'NS_ASSUME_NONNULL_END'].includes(node.text()) && !node.ancestors().some(parent => ['preproc_def', 'preproc_function_def'].includes(parent.kind()))) annotations.push({ name: node.text(), start: node.range().start.index, end: node.range().end.index, line: node.range().start.line + 1 });
      for (const child of node.children()) scan(child);
    };
    scan(parse('objc', content).root());
    if (annotations.length) {
      let projected = content;
      for (const annotation of [...annotations].sort((a, b) => b.start - a.start)) projected = projected.slice(0, annotation.start) + ' '.repeat(annotation.end - annotation.start) + projected.slice(annotation.end);
      const output = analyzeProjected(projected);
      const originalExpression = row => {
        if (!row.expression) return row.expression;
        const lineStart = projected.split('\n').slice(0, row.line - 1).join('\n').length + (row.line > 1 ? 1 : 0);
        const index = projected.indexOf(row.expression, lineStart);
        return index < 0 ? row.expression : content.slice(index, index + row.expression.length);
      };
      for (const fact of output.facts) if (fact.details?.expression) fact.details.expression = originalExpression({ ...fact, expression: fact.details.expression });
      for (const boundary of output.boundaries) boundary.expression = originalExpression(boundary);
      const pending = [];
      for (const annotation of annotations) {
        if (annotation.name === 'NS_ASSUME_NONNULL_BEGIN') pending.push(annotation);
        else {
          const begin = pending.pop();
          output.facts.push({ kind: 'NATIVE_NULLABILITY_SCOPE', name: 'nonnull', line: begin?.line ?? annotation.line, endLine: annotation.line, details: { expression: content.slice(begin?.start ?? annotation.start, annotation.end), defaultNullability: 'nonnull', begin: begin ?? null, end: annotation, resolution: begin ? 'SOURCE_PAIRED_SCOPE' : 'EXTERNAL_SCOPE_CONTEXT' } });
        }
      }
      for (const begin of pending) output.facts.push({ kind: 'NATIVE_NULLABILITY_SCOPE', name: 'nonnull', line: begin.line, endLine: lines(content).endLine, details: { expression: content.slice(begin.start), defaultNullability: 'nonnull', begin, end: null, resolution: 'EXTERNAL_SCOPE_CONTEXT' } });
      output.sourceNormalizations = [...(output.sourceNormalizations ?? []), { kind: 'COCOA_DEFAULT_NULLABILITY', annotations, rule: 'Only mature-AST tokenized NS_ASSUME_NONNULL_BEGIN/END annotations are projected to equal-width spaces. Their complete default-nonnull scope and original expressions remain explicit source facts; explicit nullable/nonnull types are unchanged, and platform binding is not claimed.' }];
      output.boundaries.push({ kind: 'COCOA_DEFAULT_NULLABILITY', severity: 'BINDING_CONTEXT_ONLY', ...lines(content), expression: '', reason: 'Default nonnull scope is independently retained; native platform macro expansion and Swift binding remain separate obligations.' });
      return output;
    }
    return analyzeProjected(content);
  }
  // COCOA_NULLABILITY_SOURCE_PROJECTION_END
  if (['.xml', '.plist', '.xcprivacy', '.entitlements', '.storyboard', '.xib'].includes(extension)) return xmlAnalysis(file, content);
  if (extension === '.json') return jsonAnalysis(file, content);
  if (extension === '.swift') return swiftAnalysis(file, content);
  if (extension === '.h') {
    const candidates = ['c', 'cpp', 'objc'].map(language => codeAnalysis(file, content, language));
    const errors = candidate => candidate.boundaries.filter(boundary => boundary.severity === 'SOURCE_ENUMERATION_BLOCKER').length;
    candidates.sort((a, b) => errors(a) - errors(b));
    candidates[0].parserSelection = candidates.map(candidate => ({ language: candidate.language, sourceEnumerationBlockers: errors(candidate), normalizationRules: candidate.sourceNormalizations?.length ?? 0 }));
    return candidates[0];
  }
  const language = ({ '.kt': 'kotlin', '.kts': 'kotlin', '.swift': 'swift', '.java': 'java', '.m': 'objc', '.mm': 'objc', '.h': 'objc', '.hpp': 'cpp', '.cpp': 'cpp', '.c': 'c', '.podspec': 'ruby', '.rb': 'ruby', '.gradle': 'groovy' })[extension];
  if (language) return codeAnalysis(file, content, language);
  const output = result(extension.slice(1) || 'unknown', null, 'UNSUPPORTED');
  output.boundaries.push({ kind: 'UNSUPPORTED_LANGUAGE', severity: 'SOURCE_ENUMERATION_BLOCKER', ...lines(content), expression: '', reason: `No structured parser for ${extension || 'extensionless input'}; file content remains an explicit semantic review obligation.` });
  return output;
}
