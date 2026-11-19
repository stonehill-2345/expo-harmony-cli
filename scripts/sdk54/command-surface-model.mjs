import path from 'node:path';
import ts from 'typescript';
import { serializeConfigContract, validateConfigContract } from './config-contract-model.mjs';

export const serializeCommandSurface = serializeConfigContract;
export const validateCommandSurface = validateConfigContract;
const encode = value => String(value).replace(/~/g, '~0').replace(/\//g, '~1');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const dispatcher = 'packages/@expo/cli/bin/cli.ts';
const constructors = new Set(['String', 'Boolean', 'Number']);
const parsers = new Set(['arg', 'assertArgs', 'assertWithOptionsArgs', 'resolveStringOrBooleanArgsAsync', 'resolveCustomBooleanArgsAsync',
  'assertUnexpectedVariadicFlags', 'assertUnexpectedObjectKeys', 'parseVariadicArguments']);

export function indexCommandSurface(files, availablePaths = [...files.keys()]) {
  const available = new Set(availablePaths);
  const modules = new Map();
  const result = { defaultCommand: null, commands: [], migrations: [], deprecated: [], parsers: [], options: [], anomalies: [], boundaries: [], helpCalls: [], branches: [], moduleReferences: [] };
  for (const [file, content] of [...files].sort(([a], [b]) => compare(a, b))) {
    if (!/\.[jt]sx?$/.test(file)) continue;
    const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    if (source.parseDiagnostics.length) throw new Error(`${file}: ${ts.flattenDiagnosticMessageText(source.parseDiagnostics[0].messageText, '\n')}`);
    modules.set(file, source);
  }
  const fail = (source, node, message) => { throw new Error(`${source.fileName}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: ${message}`); };
  const location = (source, node) => {
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
    return { source: source.fileName, line: line + 1, column: character + 1, text: node.getText(source) };
  };
  function key(source, node) {
    if (ts.isStringLiteralLike(node) || ts.isIdentifier(node) || ts.isNumericLiteral(node)) return node.text;
    fail(source, node, 'Unsupported computed property');
  }
  function resolveModule(from, request) {
    if (!request.startsWith('.')) return { target: null, resolution: 'EXTERNAL' };
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), request));
    const stem = base.replace(/\.[cm]?jsx?$/, '');
    const target = [base, `${stem}.ts`, `${stem}.tsx`, `${stem}.js`, `${base}/index.ts`, `${base}/index.js`].find(file => available.has(file));
    return { target: target ?? null, resolution: !target ? 'MISSING_RELATIVE' : modules.has(target) ? 'SELECTED_SOURCE' : 'OUTSIDE_SELECTED_SURFACE' };
  }
  function scope(node) {
    while (node && !ts.isBlock(node) && !ts.isSourceFile(node)) node = node.parent;
    return node;
  }
  function resolveValue(source, expression, stack = []) {
    if (!expression) fail(source, source, 'Missing spec expression');
    if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression)) return resolveValue(source, expression.expression, stack);
    if (!ts.isIdentifier(expression)) return expression;
    if (stack.includes(expression.text)) fail(source, expression, `Cyclic spec const ${expression.text}`);
    let current = scope(expression);
    while (current) {
      const found = [];
      function scan(node) {
        if (node !== current && (ts.isBlock(node) || ts.isFunctionLike(node))) return;
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === expression.text) found.push(node);
        ts.forEachChild(node, scan);
      }
      scan(current);
      if (found.length) {
        if (found.length !== 1 || !found[0].initializer || !(found[0].parent.flags & ts.NodeFlags.Const)) fail(source, expression, `Ambiguous/non-const spec ${expression.text}`);
        return resolveValue(source, found[0].initializer, [...stack, expression.text]);
      }
      current = scope(current.parent);
    }
    fail(source, expression, `Unresolved spec ${expression.text}`);
  }
  function owner(node) {
    const names = [];
    for (let current = node.parent; current; current = current.parent) if (ts.isFunctionLike(current)) {
      if (current.name) names.unshift(current.name.getText());
      else if (ts.isVariableDeclaration(current.parent)) names.unshift(current.parent.name.getText());
    }
    return names.join('/') || '<module>';
  }
  function namedVariable(source, name) {
    const found = [];
    function visit(node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) found.push(node);
      ts.forEachChild(node, visit);
    }
    visit(source);
    if (found.length !== 1 || !found[0].initializer) fail(source, source, `Missing/duplicate declaration ${name}`);
    return found[0];
  }
  const bin = modules.get(dispatcher);
  if (!bin) throw new Error(`${dispatcher}: missing dispatcher`);
  const defaultDecl = namedVariable(bin, 'defaultCmd');
  const defaultValue = resolveValue(bin, defaultDecl.initializer);
  if (!ts.isStringLiteralLike(defaultValue)) fail(bin, defaultValue, 'Nonliteral default command');
  result.defaultCommand = defaultValue.text;
  result.defaultCommandSource = location(bin, defaultDecl);
  const commandMap = resolveValue(bin, namedVariable(bin, 'commands').initializer);
  if (!ts.isObjectLiteralExpression(commandMap)) fail(bin, commandMap, 'Invalid commands map');
  const commandNames = new Set();
  for (const property of commandMap.properties) {
    if (!ts.isPropertyAssignment(property)) fail(bin, property, 'Unsupported dispatch property/spread');
    const name = key(bin, property.name);
    if (commandNames.has(name)) fail(bin, property, `Duplicate command ${name}`);
    commandNames.add(name);
    const fn = property.initializer;
    const body = ts.isArrowFunction(fn) ? fn.body : null;
    if (!body || !ts.isCallExpression(body) || !ts.isPropertyAccessExpression(body.expression) || body.expression.name.text !== 'then') fail(bin, property, 'Unsupported dispatch shape');
    const importCall = body.expression.expression;
    const callback = body.arguments[0];
    if (!ts.isCallExpression(importCall) || importCall.expression.kind !== ts.SyntaxKind.ImportKeyword || importCall.arguments.length !== 1 || !ts.isStringLiteralLike(importCall.arguments[0])
      || !callback || !ts.isArrowFunction(callback) || callback.parameters.length !== 1 || !ts.isIdentifier(callback.parameters[0].name)
      || !ts.isPropertyAccessExpression(callback.body) || !ts.isIdentifier(callback.body.expression) || callback.body.expression.text !== callback.parameters[0].name.text) fail(bin, property, 'Unsupported static dispatch import/export');
    const request = importCall.arguments[0].text, exported = callback.body.name.text;
    const resolution = resolveModule(dispatcher, request);
    const targetSource = modules.get(resolution.target);
    if (!targetSource) fail(bin, property, `Missing selected command source ${request}`);
    const exportedDeclarations = targetSource.statements.flatMap(statement => {
      if (!statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) return [];
      if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.map(declaration => declaration.name.getText(targetSource));
      return statement.name ? [statement.name.getText(targetSource)] : [];
    });
    if (!exportedDeclarations.includes(exported)) fail(bin, property, `Missing command export ${resolution.target}#${exported}`);
    result.commands.push({ id: `CMD:${encode(name)}`, name, request, target: resolution.target, exported,
      handlerId: `${resolution.target}#${exported}`, ...location(bin, property), parserIds: [] });
  }
  if (!commandNames.has(result.defaultCommand)) fail(bin, defaultDecl, 'Default command is not in commands map');
  const migrationMap = resolveValue(bin, namedVariable(bin, 'migrationMap').initializer);
  if (!ts.isObjectLiteralExpression(migrationMap)) fail(bin, migrationMap, 'Invalid migrationMap');
  for (const property of migrationMap.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isStringLiteralLike(property.initializer)) fail(bin, property, 'Unsupported migration map value');
    const name = key(bin, property.name);
    result.migrations.push({ id: `MIGRATION:${encode(name)}`, name, replacement: property.initializer.text, ...location(bin, property), runtimeStatus: 'NOT_EXECUTED' });
  }
  const deprecated = resolveValue(bin, namedVariable(bin, 'deprecated').initializer);
  if (!ts.isArrayLiteralExpression(deprecated)) fail(bin, deprecated, 'Invalid deprecated array');
  for (const element of deprecated.elements) {
    if (!ts.isStringLiteralLike(element)) fail(bin, element, 'Unsupported deprecated command');
    result.deprecated.push({ id: `DEPRECATED:${encode(element.text)}`, name: element.text, ...location(bin, element) });
  }

  for (const [file, source] of modules) {
    const ordinals = new Map();
    function spec(expression, parser, layer, mode) {
      const resolved = resolveValue(source, expression);
      const group = `${parser.id}/${layer}`;
      const options = [];
      if (mode?.startsWith('VARIADIC_')) {
        if (!ts.isArrayLiteralExpression(resolved)) fail(source, resolved, 'Invalid variadic spec list');
        for (const element of resolved.elements) {
          if (!ts.isStringLiteralLike(element)) fail(source, element, 'Unsupported variadic spec element');
          options.push({ name: element.text, declaredType: 'NOT_DECLARED', effectiveType: mode, aliasTarget: null, ...location(source, element) });
        }
      } else {
        if (!ts.isObjectLiteralExpression(resolved)) fail(source, resolved, 'Expected object spec');
        for (const property of resolved.properties) {
          if (!ts.isPropertyAssignment(property)) fail(source, property, 'Unsupported spec property/spread');
          const name = key(source, property.name), value = property.initializer;
          let declaredType, aliasTarget = null;
          if (ts.isStringLiteralLike(value)) { declaredType = 'Alias'; aliasTarget = value.text; }
          else if (ts.isIdentifier(value) && constructors.has(value.text)) declaredType = value.text;
          else if (ts.isArrayLiteralExpression(value) && value.elements.length === 1 && ts.isIdentifier(value.elements[0]) && constructors.has(value.elements[0].text)) declaredType = `${value.elements[0].text}[]`;
          else fail(source, value, 'Unsupported argument spec type');
          options.push({ name, declaredType, effectiveType: aliasTarget ? 'Alias' : mode || declaredType, aliasTarget, ...location(source, property) });
        }
      }
      const seen = new Set();
      for (const option of options) {
        if (!option.name.startsWith('-')) fail(source, resolved, `Invalid option spec name ${option.name}`);
        if (seen.has(option.name)) fail(source, resolved, `Duplicate option spec ${option.name}`);
        seen.add(option.name);
        option.id = `${group}/${encode(option.name)}`;
        option.parserId = parser.id; option.layer = layer; option.owner = parser.owner;
        option.aliasState = option.aliasTarget ? 'PENDING' : 'NOT_ALIAS';
      }
      parser.optionIds.push(...options.map(option => option.id));
      result.options.push(...options);
      return options;
    }
    function visit(node) {
      const call = ts.isCallExpression(node) && ts.isIdentifier(node.expression) ? node.expression.text : null;
      if (call && parsers.has(call)) {
        const functionOwner = owner(node), ordinalKey = `${functionOwner}/${call}`;
        const ordinal = (ordinals.get(ordinalKey) ?? 0) + 1; ordinals.set(ordinalKey, ordinal);
        const id = `${file}#/parsers/${encode(functionOwner)}/${call}/${ordinal}`;
        if (file.includes('/src/utils/')) {
          result.boundaries.push({ id, kind: 'PARAMETERIZED_HELPER', parser: call, ...location(source, node), runtimeStatus: 'NOT_EXECUTED' });
        } else {
          const parser = { id, parser: call, owner: functionOwner, ...location(source, node), permissive: false, optionIds: [] };
          if (['arg', 'assertWithOptionsArgs'].includes(call)) {
            const optionsNode = node.arguments[1];
            if (!optionsNode || !ts.isObjectLiteralExpression(optionsNode)) fail(source, node, 'Unsupported parser options spec');
            const permissive = optionsNode.properties.find(property => property.name && key(source, property.name) === 'permissive');
            if (permissive) {
              if (!ts.isPropertyAssignment(permissive) || ![ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword].includes(permissive.initializer.kind)) fail(source, permissive, 'Dynamic permissive parser option');
              parser.permissive = permissive.initializer.kind === ts.SyntaxKind.TrueKeyword;
            }
          }
          let base = [], extra = [];
          if (['arg', 'assertArgs', 'assertWithOptionsArgs'].includes(call)) base = spec(node.arguments[0], parser, 'base', null);
          else if (['resolveStringOrBooleanArgsAsync', 'resolveCustomBooleanArgsAsync'].includes(call)) {
            base = spec(node.arguments[1], parser, 'base', null);
            extra = spec(node.arguments[2], parser, 'extra', call === 'resolveStringOrBooleanArgsAsync' ? 'StringOrBoolean' : 'CustomBoolean');
          } else if (call === 'parseVariadicArguments') {
            if (node.arguments[1]) base = spec(node.arguments[1], parser, 'nonBoolean', 'VARIADIC_NON_BOOLEAN');
            result.boundaries.push({ id: `${id}/boundary`, kind: 'VARIADIC_VALUES_AND_EXTRAS_NOT_EXECUTED', ...location(source, node) });
          } else base = spec(node.arguments[0], parser, 'allowed', 'VARIADIC_ALLOWED');
          const combined = new Map([...base, ...extra].map(option => [option.name, option]));
          for (const option of [...base, ...extra].filter(option => option.aliasTarget)) {
            let current = option;
            const trail = [option.name];
            while (current.aliasTarget) {
              if (trail.includes(current.aliasTarget)) { option.aliasState = 'CYCLE'; break; }
              trail.push(current.aliasTarget);
              const next = combined.get(current.aliasTarget);
              if (!next) { option.aliasState = 'MISSING_TARGET'; break; }
              current = next;
            }
            if (option.aliasState === 'PENDING') { option.aliasState = 'RESOLVED'; option.canonicalName = current.name; option.effectiveType = current.effectiveType; }
            option.aliasTrail = trail;
            if (option.aliasState !== 'RESOLVED') result.anomalies.push({ id: `${option.id}/anomaly`, kind: `ALIAS_${option.aliasState}`, optionId: option.id,
              ...location(source, node), conclusion: '固定声明异常保留；不据此推断运行结果', followUp: 'M5/cli-argument-validation' });
          }
          result.parsers.push(parser);
        }
      }
      if (call === 'resolveArgsAsync') result.boundaries.push({ id: `${file}#/secondary/${node.getStart(source)}`, kind: 'SECONDARY_RESOLVER_CALL', ...location(source, node), runtimeStatus: 'NOT_EXECUTED' });
      if (ts.isCallExpression(node) && ((ts.isIdentifier(node.expression) && node.expression.text === 'printHelp') ||
        (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'exit'))) result.helpCalls.push({ id: `${file}#/help/${node.getStart(source)}`, ...location(source, node), interpretation: 'SOURCE_TEXT_ONLY' });
      if (ts.isSwitchStatement(node)) {
        const functionOwner = owner(node), ordinalKey = `${functionOwner}/switch`;
        const ordinal = (ordinals.get(ordinalKey) ?? 0) + 1; ordinals.set(ordinalKey, ordinal);
        result.branches.push({ id: `${file}#/switch/${encode(functionOwner)}/${ordinal}`, owner: functionOwner,
          expression: node.expression.getText(source), cases: node.caseBlock.clauses.map(clause => ts.isCaseClause(clause) ? clause.expression.getText(source) : 'default'),
          ...location(source, node), interpretation: 'SOURCE_TEXT_ONLY_NOT_EXECUTED' });
      }
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) && node.moduleSpecifier || ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
        const argument = ts.isCallExpression(node) ? node.arguments[0] : node.moduleSpecifier;
        const request = argument && ts.isStringLiteralLike(argument) ? argument.text : null;
        result.moduleReferences.push({ id: `${file}#/module/${node.getStart(source)}`, request, ...location(source, node),
          ...(request ? resolveModule(file, request) : { target: null, resolution: 'UNRESOLVED_DYNAMIC' }) });
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  for (const command of result.commands) {
    command.parserIds = result.parsers.filter(parser => parser.source === command.target && parser.owner === command.exported).map(parser => parser.id);
    if (!command.parserIds.length) throw new Error(`${command.target}: no indexed parser for ${command.exported}`);
    command.secondaryResolverSources = result.moduleReferences.filter(ref => ref.source === command.target && ref.target?.endsWith('/resolveOptions.ts')).map(ref => ref.target);
    command.runtimeStatus = 'NOT_EXECUTED';
  }
  const ids = new Set();
  for (const collection of Object.values(result).filter(Array.isArray)) for (const record of collection) {
    if (ids.has(record.id)) throw new Error(`${record.source ?? dispatcher}: duplicate stable ID ${record.id}`);
    ids.add(record.id);
  }
  return result;
}

export function compareCommandSurfaces(source, adaptation) {
  const differences = [];
  for (const category of ['commands', 'options', 'parsers', 'branches', 'migrations', 'deprecated']) {
    const left = new Map(source[category].map(record => [record.id, record]));
    const right = new Map(adaptation[category].map(record => [record.id, record]));
    const signature = record => category === 'commands' ? { target: record.target, exported: record.exported }
      : category === 'options' ? Object.fromEntries(['name', 'declaredType', 'effectiveType', 'aliasTarget', 'aliasState', 'canonicalName'].map(key => [key, record[key] ?? null]))
        : category === 'parsers' ? { permissive: record.permissive }
          : category === 'branches' ? { expression: record.expression, cases: record.cases }
            : category === 'migrations' ? { replacement: record.replacement } : { name: record.name };
    for (const id of [...new Set([...left.keys(), ...right.keys()])].sort(compare)) {
      const a = left.get(id), b = right.get(id);
      if (a && b && serializeCommandSurface(signature(a)) === serializeCommandSurface(signature(b))) continue;
      differences.push({ id: `DIFF:${category}:${id}`, category, recordId: id, kind: !a ? 'ONLY_ADAPTATION' : !b ? 'ONLY_SOURCE' : 'CHANGED',
        sourceIds: [a?.id, b?.id].filter(Boolean), source: a ?? null, adaptation: b ?? null,
        conclusion: '命令或参数声明差异已定位；实现与运行效果尚未验收',
        followUp: category === 'commands' ? 'M0A/command-handoff-and-M5' : 'M5/cli-argument-validation' });
    }
  }
  if (source.defaultCommand !== adaptation.defaultCommand) differences.push({ id: 'DIFF:defaultCommand', category: 'defaultCommand', kind: 'CHANGED',
    source: source.defaultCommand, adaptation: adaptation.defaultCommand, sourceIds: [dispatcher], conclusion: '默认入口声明变化，须实际回归', followUp: 'M5/cli-argument-validation' });
  return differences;
}
