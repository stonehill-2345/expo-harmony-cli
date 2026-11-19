import path from 'node:path';
import ts from 'typescript';

import { serializeInventory } from './source-inventory.mjs';

const VIRTUAL_ROOT = '/__sdk54_source__/';
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const distinct = (values) => [...new Map(values.map((value) => [serializeInventory(value), value])).values()]
  .sort((a, b) => compare(serializeInventory(a), serializeInventory(b)));

function unionVariants(models) {
  if (models.some((entry) => entry.kind === 'literal' && entry.value === true) &&
      models.some((entry) => entry.kind === 'literal' && entry.value === false)) {
    models = [...models.filter((entry) => entry.kind !== 'literal' || typeof entry.value !== 'boolean'), { kind: 'boolean' }];
  }
  return distinct(models);
}

function typeContext(files, { rootPaths = [...files.keys()].filter(file => /\.[cm]?[jt]sx?$/.test(file)), resolveSource = null } = {}) {
  const options = { strict: true, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.CommonJS,
    skipLibCheck: true, allowJs: true, noEmit: true };
  const base = ts.createCompilerHost(options);
  const libraryDirectory = path.dirname(ts.getDefaultLibFilePath(options));
  const isLibrary = (file) => file.startsWith(`${libraryDirectory}${path.sep}`);
  const inputPaths = new Set(), resolutions = new Map();
  const content = (file) => {
    if (!file.startsWith(VIRTUAL_ROOT)) return undefined;
    const logical = file.slice(VIRTUAL_ROOT.length), value = files.get(logical);
    if (value !== undefined) inputPaths.add(logical);
    return value;
  };
  const resolve = (request, containingFile) => {
    if (resolveSource) {
      const from = containingFile.slice(VIRTUAL_ROOT.length), result = resolveSource(request, from);
      resolutions.set(from + '\0' + request, { request, from, resolution: result });
      if (result.status !== 'source' || !files.has(result.path)) return undefined;
      const file = result.path;
      return { resolvedFileName: VIRTUAL_ROOT + file, extension: file.endsWith('.d.ts') ? ts.Extension.Dts :
        file.endsWith('.tsx') ? ts.Extension.Tsx : /\.[cm]?js$/.test(file) ? ts.Extension.Js : file.endsWith('.json') ? ts.Extension.Json : ts.Extension.Ts };
    }
    let candidate;
    if (request.startsWith('.')) candidate = path.posix.join(path.posix.dirname(containingFile), request);
    else {
      const parts = request.split('/');
      const packageName = parts.splice(0, request.startsWith('@') ? 2 : 1).join('/');
      let subpath = parts.join('/');
      const manifest = files.get(`packages/${packageName}/package.json`);
      if (!subpath && manifest) {
        const pkg = JSON.parse(manifest);
        subpath = pkg.types ?? pkg.typings ?? pkg.source ?? pkg.main ?? 'src/index';
      }
      subpath = (subpath || 'src/index').replace(/^\.\//, '').replace(/^build(?:\/|$)/, 'src/').replace(/\.d\.ts$/, '.ts');
      candidate = `${VIRTUAL_ROOT}packages/${packageName}/${subpath}`;
    }
    const candidates = [candidate, `${candidate}.ts`, `${candidate}.tsx`, `${candidate}.d.ts`,
      `${candidate}/index.ts`, `${candidate}/index.d.ts`, `${candidate}.js`];
    const found = candidates.find((file) => content(file) !== undefined);
    return found ? { resolvedFileName: found, extension: found.endsWith('.tsx') ? ts.Extension.Tsx :
      found.endsWith('.d.ts') ? ts.Extension.Dts : found.endsWith('.js') ? ts.Extension.Js : ts.Extension.Ts } : undefined;
  };
  const host = {
    ...base,
    fileExists: (file) => content(file) !== undefined || (isLibrary(file) && base.fileExists(file)),
    readFile: (file) => content(file) ?? (isLibrary(file) ? base.readFile(file) : undefined),
    getSourceFile: (file, languageVersion) => {
      const text = content(file) ?? (isLibrary(file) ? base.readFile(file) : undefined);
      return text === undefined ? undefined : ts.createSourceFile(file, text, languageVersion, true);
    },
    resolveModuleNames: (names, containingFile) => names.map((name) => resolve(name, containingFile)),
    getCurrentDirectory: () => VIRTUAL_ROOT,
  };
  const program = ts.createProgram(rootPaths.map((file) => VIRTUAL_ROOT + file), options, host);
  const syntaxErrors = program.getSyntacticDiagnostics();
  if (syntaxErrors.length) throw new Error(`Invalid TypeScript syntax: ${ts.flattenDiagnosticMessageText(syntaxErrors[0].messageText, ' ')}`);
  return { program, checker: program.getTypeChecker(), inputPaths, resolutions };
}

function location(node, fallback) {
  if (!node || !node.getSourceFile().fileName.startsWith(VIRTUAL_ROOT)) return fallback;
  const file = node.getSourceFile();
  const position = file.getLineAndCharacterOfPosition(node.getStart());
  return { path: file.fileName.slice(VIRTUAL_ROOT.length), line: position.line + 1, column: position.character + 1 };
}

export function syntaxFacts(text, sourcePath) {
  const file = ts.createSourceFile(VIRTUAL_ROOT + sourcePath, text, ts.ScriptTarget.ESNext, true);
  const facts = [];
  const visit = (node) => {
    let kind;
    if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
        !((ts.isPropertyAccessExpression(node.parent) || ts.isElementAccessExpression(node.parent)) && node.parent.expression === node)) kind = 'read';
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(node.operatorToken.kind)) kind = 'fallback';
    if (ts.isSpreadAssignment(node) || ts.isSpreadElement(node)) kind = 'spread';
    if (kind) facts.push({ kind, expression: node.getText(file), source: location(node) });
    ts.forEachChild(node, visit);
  };
  visit(file);
  return facts;
}

function expandType(type, context, source, stack = new Set()) {
  const { checker } = context;
  const flags = type.flags;
  if (flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) throw new Error(`Unresolved/unsupported type ${checker.typeToString(type)} at ${source.path}:${source.line}`);
  if (stack.has(type) || stack.size > 40) throw new Error(`Recursive/unsupported type at ${source.path}:${source.line}`);
  if (flags & ts.TypeFlags.StringLiteral) return { kind: 'literal', value: type.value };
  if (flags & ts.TypeFlags.NumberLiteral) return { kind: 'literal', value: type.value };
  if (flags & ts.TypeFlags.BooleanLiteral) return { kind: 'literal', value: type.intrinsicName === 'true' };
  if (flags & ts.TypeFlags.BooleanLike) return { kind: 'boolean' };
  const primitives = [[ts.TypeFlags.String, 'string'], [ts.TypeFlags.Number, 'number'],
    [ts.TypeFlags.Null, 'null'], [ts.TypeFlags.Undefined, 'undefined'], [ts.TypeFlags.Void, 'void'], [ts.TypeFlags.Never, 'never']];
  for (const [flag, kind] of primitives) if (flags & flag) return { kind };
  const next = new Set(stack).add(type);
  if (type.isUnion()) return { kind: 'union', variants: unionVariants(type.types.map((entry) => expandType(entry, context, source, next))) };
  if (checker.isArrayType(type)) return { kind: 'array', items: expandType(checker.getTypeArguments(type)[0], context, source, next) };
  if (flags & ts.TypeFlags.Object || type.isIntersection()) {
    if (checker.getSignaturesOfType(type, ts.SignatureKind.Call).length) throw new Error(`Unsupported callable option at ${source.path}:${source.line}`);
    const properties = checker.getPropertiesOfType(type).map((symbol) => {
      const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
      const position = location(declaration, source);
      return { name: symbol.name, required: !(symbol.flags & ts.SymbolFlags.Optional), source: position,
        type: expandType(checker.getTypeOfSymbolAtLocation(symbol, declaration), context, position, next) };
    }).sort((a, b) => compare(a.name, b.name));
    const indexes = checker.getIndexInfosOfType(type);
    if (indexes.length > 1 || indexes.some((index) => !(index.keyType.flags & ts.TypeFlags.String))) {
      throw new Error(`Unsupported index signature at ${source.path}:${source.line}`);
    }
    return { kind: 'object', properties, additionalProperties: indexes.length ? expandType(indexes[0].type, context, source, next) : null };
  }
  throw new Error(`Unsupported type ${checker.typeToString(type)} at ${source.path}:${source.line}`);
}

function flatten(model, namespace, rootSource) {
  const options = new Map();
  const record = (optionPath, type, source, required) => {
    if (!optionPath) return;
    const occurrences = options.get(optionPath) ?? [];
    occurrences.push({ type, source, required });
    options.set(optionPath, occurrences);
  };
  const walk = (node, prefix, source) => {
    source = node.source ?? source;
    if (['union', 'intersection'].includes(node.kind)) {
      for (const variant of node.variants) walk(variant, prefix, source);
    } else if (node.kind === 'object') {
      for (const property of node.properties) {
        if (!property.name || /[.\[\]*]/.test(property.name)) {
          throw new Error(`Unsupported property path ${JSON.stringify(property.name)} at ${JSON.stringify(property.source)}`);
        }
        const optionPath = prefix ? `${prefix}.${property.name}` : property.name;
        record(optionPath, property.type, property.source, property.required);
        walk(property.type, optionPath, property.source);
      }
      if (node.additionalProperties) {
        const optionPath = prefix ? `${prefix}.*` : '*';
        const value = node.additionalProperties === true ? { kind: 'any-json' } : node.additionalProperties;
        record(optionPath, value, value.source ?? source, false);
        walk(value, optionPath, source);
      }
    } else if (node.kind === 'array') {
      const optionPath = `${prefix}[]`;
      record(optionPath, node.items, node.items.source ?? source, true);
      walk(node.items, optionPath, source);
    }
  };
  walk(model, '', rootSource);
  return [...options].sort(([a], [b]) => compare(a, b)).map(([optionPath, occurrences]) => ({
    id: `${namespace}:${optionPath}`, path: optionPath, occurrences: distinct(occurrences),
  }));
}

export function extractTypeSurface(files, descriptor) {
  const context = typeContext(files);
  return extractFromContext(files, descriptor, context);
}

function extractFromContext(files, descriptor, context) {
  const file = context.program.getSourceFile(VIRTUAL_ROOT + descriptor.sourcePath);
  if (!file) throw new Error(`Missing TypeScript source: ${descriptor.sourcePath}`);
  const declarations = [];
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === descriptor.symbol &&
        (descriptor.start === undefined || node.getStart(file) === descriptor.start)) declarations.push(node);
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (declarations.length !== 1) throw new Error(`Expected one ${descriptor.symbol} at ${descriptor.sourcePath}`);
  const declaration = declarations[0];
  if (!declaration.type || !ts.isTypeReferenceNode(declaration.type) || declaration.type.typeName.getText() !== 'ConfigPlugin') {
    throw new Error(`Unsupported ConfigPlugin declaration at ${descriptor.sourcePath}`);
  }
  const source = location(declaration);
  const argument = declaration.type.typeArguments?.[0];
  const root = argument ? expandType(context.checker.getTypeFromTypeNode(argument), context, source) : { kind: 'no-explicit-options' };
  return { source, root, options: flatten(root, `OPTION:${descriptor.id}:typescript`, source),
    facts: syntaxFacts(files.get(descriptor.sourcePath), descriptor.sourcePath) };
}

export function extractTypeSurfaces(files, descriptors, options = {}) {
  const ids = new Set();
  for (const descriptor of descriptors) {
    if (!descriptor.id || ids.has(descriptor.id)) throw new Error(`Duplicate/missing plugin ID ${descriptor.id}`);
    ids.add(descriptor.id);
  }
  const context = typeContext(files, { ...options, rootPaths: [...new Set(descriptors.map(d => d.sourcePath))] });
  const plugins = descriptors.map(descriptor => {
    try {
      return { ...descriptor, status: 'EXPANDED', typescript: extractFromContext(files, descriptor, context) };
    } catch (error) {
      return { ...descriptor, status: 'BLOCKED_OPTION_TYPE', error: error.message, typescript: null };
    }
  });
  return { plugins, inputPaths: [...context.inputPaths].sort(), resolutions: [...context.resolutions.values()].sort((a,b) =>
    a.from.localeCompare(b.from) || a.request.localeCompare(b.request)), projectTypecheckAcceptance: 'NOT_VERIFIED' };
}

const pointerKey = (key) => key.replace(/~/g, '~0').replace(/\//g, '~1');

export function extractSchemaSurface(schema, descriptor) {
  const source = (pointer) => ({ path: descriptor.sourcePath, pointer });
  const resolve = (ref) => {
    if (!ref.startsWith('#/')) throw new Error(`Unsupported external schema ref ${ref}`);
    let value = schema;
    for (const key of ref.slice(2).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))) {
      if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) throw new Error(`Missing schema ref ${ref}`);
      value = value[key];
    }
    return value;
  };
  const expand = (node, pointer, refs = new Set()) => {
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      const unsupported = ['patternProperties', 'propertyNames', 'dependencies', 'dependentSchemas', 'dependentRequired',
        'not', 'if', 'then', 'else', 'contains', 'prefixItems', 'additionalItems', 'unevaluatedItems', 'unevaluatedProperties',
        '$dynamicRef', '$recursiveRef'].find((key) => Object.hasOwn(node, key));
      if (unsupported) throw new Error(`Unsupported schema keyword ${unsupported} at ${pointer}`);
      const selectors = ['$ref', 'oneOf', 'anyOf', 'allOf'].filter((key) => Object.hasOwn(node, key));
      const siblings = ['type', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const'];
      if (selectors.length > 1 || (selectors.length && siblings.some((key) => Object.hasOwn(node, key)))) {
        throw new Error(`Unsupported mixed schema composition at ${pointer}`);
      }
      if (Object.hasOwn(node, 'const')) throw new Error(`Unsupported schema const at ${pointer}`);
    }
    if (node && typeof node === 'object' && node.$ref) {
      if (refs.has(node.$ref)) throw new Error(`Recursive schema ref ${node.$ref}`);
      return expand(resolve(node.$ref), node.$ref, new Set(refs).add(node.$ref));
    }
    return { ...expandNode(node, pointer, refs), source: source(pointer) };
  };
  const expandNode = (node, pointer, refs) => {
    if (node === true) return { kind: 'any-json' };
    if (node === false) return { kind: 'never' };
    if (!node || typeof node !== 'object' || Array.isArray(node)) throw new Error(`Unsupported schema at ${pointer}`);
    for (const combinator of ['oneOf', 'anyOf', 'allOf']) {
      if (node[combinator]) return { kind: combinator === 'allOf' ? 'intersection' : 'union',
        variants: node[combinator].map((entry, index) => expand(entry, `${pointer}/${combinator}/${index}`, refs)) };
    }
    if (node.enum) return { kind: 'union', variants: unionVariants(node.enum.map((value) => ({ kind: 'literal', value }))) };
    if (Array.isArray(node.type)) return { kind: 'union', variants: node.type.map((type) => expand({ ...node, type }, pointer, refs)) };
    if (node.type === 'object') return { kind: 'object',
      properties: Object.entries(node.properties ?? {}).sort(([a], [b]) => compare(a, b)).map(([name, value]) => {
        const propertyPointer = `${pointer}/properties/${pointerKey(name)}`;
        return { name, required: (node.required ?? []).includes(name),
          source: source(value.$ref ?? propertyPointer), type: expand(value, propertyPointer, refs) };
      }),
      additionalProperties: typeof node.additionalProperties === 'object'
        ? expand(node.additionalProperties, `${pointer}/additionalProperties`, refs) : node.additionalProperties !== false,
    };
    if (node.type === 'array') {
      if (Array.isArray(node.items)) throw new Error(`Unsupported tuple schema at ${pointer}`);
      return { kind: 'array', items: expand(node.items ?? true, `${pointer}/items`, refs) };
    }
    if (['string', 'boolean', 'number', 'integer', 'null'].includes(node.type)) return { kind: node.type };
    throw new Error(`Unsupported schema type at ${pointer}`);
  };
  const root = expand(schema, '#');
  const options = flatten(root, `OPTION:${descriptor.id}:schema`, source('#'));
  return { source: source('#'), root, options, rawSchema: schema };
}

function signature(model) {
  if (model.kind === 'union' || model.kind === 'intersection') {
    const variants = [...new Set(model.variants.filter((entry) => entry.kind !== 'undefined').map(signature))].sort();
    return variants.length === 1 ? variants[0] : variants.join(model.kind === 'intersection' ? '&' : '|');
  }
  if (model.kind === 'literal') return JSON.stringify(model.value);
  if (model.kind === 'array') return `array<${signature(model.items)}>`;
  return model.kind;
}

export function compareOptionSurfaces(typescript, schema) {
  const types = new Map(typescript.options.map((entry) => [entry.path, entry]));
  const schemas = new Map(schema.options.map((entry) => [entry.path, entry]));
  const differences = [];
  for (const optionPath of [...new Set([...types.keys(), ...schemas.keys()])].sort()) {
    const type = types.get(optionPath);
    const json = schemas.get(optionPath);
    const record = (kind) => differences.push({ path: optionPath, kind, typescriptId: type?.id ?? null, schemaId: json?.id ?? null });
    if (!type) record('schema-only');
    else if (!json) record('typescript-only');
    else {
      if (serializeInventory(distinct(type.occurrences.map((entry) => signature(entry.type)))) !==
          serializeInventory(distinct(json.occurrences.map((entry) => signature(entry.type))))) record('type-difference');
      if (serializeInventory(distinct(type.occurrences.map((entry) => entry.required))) !==
          serializeInventory(distinct(json.occurrences.map((entry) => entry.required)))) record('required-difference');
    }
  }
  return differences;
}
