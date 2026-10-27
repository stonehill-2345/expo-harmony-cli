import ts from 'typescript';
import { serializeInventory } from './source-inventory.mjs';

const escape = value => String(value).replace(/~/g, '~0').replace(/\//g, '~1');
const unique = values => [...new Set(values)].sort();
const literalKey = value => JSON.stringify(value);
export const serializeConfigContract = value => serializeInventory(value).replace(/\//g, '\\/');

function projectFields(nodes, rootId) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  if (byId.size !== nodes.length) throw new Error('Duplicate config node ID');
  const fields = new Map();
  function visit(id, path, required, stack = []) {
    const node = byId.get(id);
    if (!node) throw new Error(`Unresolved config node ${id}`);
    if (stack.includes(id)) throw new Error(`Cyclic config reference ${id}`);
    const next = [...stack, id];
    const record = () => {
      if (!path) return;
      if (!fields.has(path)) fields.set(path, { path, types: [], literals: [], requiredStates: [], sources: [] });
      const field = fields.get(path);
      field.types.push(node.kind);
      field.literals.push(...(node.literals ?? []));
      field.requiredStates.push(required);
      field.sources.push(id);
    };
    if (node.kind === 'reference') return visit(node.targetId, path, required, next);
    if (node.kind === 'union') {
      for (const child of node.branches) visit(child, path, required, next);
      return;
    }
    record();
    for (const property of node.properties ?? []) visit(property.typeId, `${path}/p/${escape(property.name)}`, property.required, next);
    if (node.itemId) visit(node.itemId, `${path}/items`, 'NOT_APPLICABLE', next);
    node.tupleIds?.forEach((child, index) => visit(child, `${path}/tuple/${index}`, 'NOT_APPLICABLE', next));
    if (node.additionalId) visit(node.additionalId, `${path}/additional`, 'NOT_APPLICABLE', next);
  }
  visit(rootId, '', 'UNKNOWN');
  return [...fields.values()].map(field => {
    const states = unique(field.requiredStates);
    return { path: field.path, types: unique(field.types),
      literals: [...new Map(field.literals.map(value => [literalKey(value), value])).values()].sort((a, b) => literalKey(a).localeCompare(literalKey(b), 'en')),
      required: states.length === 1 ? states[0] : 'MIXED', requiredStates: states, sources: unique(field.sources) };
  }).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

export function parseConfigTypes(content, file) {
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const fail = (node, message) => { throw new Error(`${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: ${message}`); };
  if (source.parseDiagnostics.length) fail(source, ts.flattenDiagnosticMessageText(source.parseDiagnostics[0].messageText, '\n'));
  const nodes = [];
  const interfaces = [];
  const declarations = new Map();
  for (const declaration of source.statements) {
    if (!ts.isInterfaceDeclaration(declaration) || declaration.heritageClauses?.length || declaration.typeParameters?.length) fail(declaration, 'Unsupported interface declaration');
    const name = declaration.name.text;
    if (declarations.has(name)) fail(declaration, `Duplicate interface ${name}`);
    declarations.set(name, declaration);
  }
  const nodeId = pointer => `${file}#${pointer}`;
  function add(node, pointer, value) {
    const position = source.getLineAndCharacterOfPosition(node.getStart(source));
    const result = { id: nodeId(pointer), pointer, source: file, line: position.line + 1, column: position.character + 1, text: node.getText(source), ...value };
    nodes.push(result);
    return result;
  }
  function object(node, pointer) {
    const result = add(node, pointer, { kind: 'object', properties: [], additionalId: null });
    const names = new Set();
    for (const member of node.members) {
      if (ts.isIndexSignatureDeclaration(member)) {
        if (result.additionalId || member.parameters.length !== 1 || member.parameters[0].type?.kind !== ts.SyntaxKind.StringKeyword || !member.type) fail(member, 'Unsupported index signature');
        result.additionalId = type(member.type, `${pointer}/additional`);
      } else if (ts.isPropertySignature(member) && member.type && member.name && !ts.isComputedPropertyName(member.name)) {
        const name = ts.isIdentifier(member.name) || ts.isStringLiteralLike(member.name) || ts.isNumericLiteral(member.name) ? member.name.text : null;
        if (name === null || names.has(name)) fail(member, `Duplicate/unsupported property ${name}`);
        names.add(name);
        const position = source.getLineAndCharacterOfPosition(member.getStart(source));
        result.properties.push({ name, required: member.questionToken ? 'OPTIONAL' : 'REQUIRED',
          line: position.line + 1, column: position.character + 1, text: member.getFullText(source).trim(),
          typeId: type(member.type, `${pointer}/p/${escape(name)}`) });
      } else fail(member, 'Unsupported object member');
    }
    return result.id;
  }
  function type(node, pointer) {
    if (ts.isTypeLiteralNode(node)) return object(node, pointer);
    if (ts.isParenthesizedTypeNode(node)) return add(node, pointer, { kind: 'union', branches: [type(node.type, `${pointer}/parenthesized`)] }).id;
    if (ts.isUnionTypeNode(node)) return add(node, pointer, { kind: 'union', branches: node.types.map((child, i) => type(child, `${pointer}/union/${i}`)) }).id;
    if (ts.isArrayTypeNode(node)) return add(node, pointer, { kind: 'array', itemId: type(node.elementType, `${pointer}/items`) }).id;
    if (ts.isTupleTypeNode(node)) return add(node, pointer, { kind: 'array', tupleIds: node.elements.map((child, i) => type(child, `${pointer}/tuple/${i}`)) }).id;
    if (ts.isTypeReferenceNode(node)) {
      const name = node.typeName.getText(source);
      if (node.typeArguments?.length || !declarations.has(name)) fail(node, `Unresolved/unsupported type reference ${name}`);
      return add(node, pointer, { kind: 'reference', name, targetId: nodeId(`/interfaces/${escape(name)}`) }).id;
    }
    const keywords = new Map([[ts.SyntaxKind.StringKeyword, 'string'], [ts.SyntaxKind.NumberKeyword, 'number'], [ts.SyntaxKind.BooleanKeyword, 'boolean'], [ts.SyntaxKind.AnyKeyword, 'any']]);
    if (keywords.has(node.kind)) return add(node, pointer, { kind: keywords.get(node.kind) }).id;
    if (ts.isLiteralTypeNode(node)) {
      const literal = node.literal;
      const value = ts.isStringLiteralLike(literal) ? literal.text : ts.isNumericLiteral(literal) ? Number(literal.text)
        : literal.kind === ts.SyntaxKind.TrueKeyword ? true : literal.kind === ts.SyntaxKind.FalseKeyword ? false
          : literal.kind === ts.SyntaxKind.NullKeyword ? null : undefined;
      if (value === undefined) fail(node, 'Unsupported literal');
      return add(node, pointer, { kind: value === null ? 'null' : typeof value, literals: [value] }).id;
    }
    fail(node, `Unsupported type ${ts.SyntaxKind[node.kind]}`);
  }
  for (const [name, declaration] of declarations) interfaces.push({ name, nodeId: object(declaration, `/interfaces/${escape(name)}`) });
  if (!declarations.has('ExpoConfig')) throw new Error(`${file}: missing ExpoConfig`);
  // Project every interface as well, so an unreachable malformed reference cannot hide.
  for (const entry of interfaces) projectFields(nodes, entry.nodeId);
  return { source: file, interfaces, nodes, fields: projectFields(nodes, nodeId('/interfaces/ExpoConfig')) };
}

const schemaKeywords = new Set(['type', 'description', 'meta', 'tsType', 'pattern', 'minLength', 'minimum', 'maximum', 'enum', 'required', 'uniqueItems',
  'fallback', 'example', 'exampleString', 'properties', 'oneOf', 'anyOf', 'items', 'additionalProperties', 'additionalItems', 'not']);
const childKeywords = new Set(['properties', 'oneOf', 'anyOf', 'items', 'additionalProperties', 'additionalItems', 'not']);
const schemaTypes = new Set(['string', 'number', 'integer', 'boolean', 'object', 'array', 'null']);

export function parseConfigSchema(mapping, file) {
  const nodes = [];
  const fail = (pointer, message) => { throw new Error(`${file}#${pointer}: ${message}`); };
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!isObject(mapping)) fail('', 'Expected docs field mapping');
  function walk(value, pointer, root = false) {
    const id = `${file}#${pointer}`;
    const booleanSchema = typeof value === 'boolean';
    if (!booleanSchema && !isObject(value)) fail(pointer, 'Invalid schema object');
    if (booleanSchema) { nodes.push({ id, source: file, pointer, kind: value ? 'any' : 'never', attributes: { booleanSchema: value } }); return id; }
    for (const key of Object.keys(value)) if (!schemaKeywords.has(key)) fail(pointer, `Unsupported keyword ${key}`);
    const attributes = Object.fromEntries(Object.entries(value).filter(([key]) => !childKeywords.has(key)));
    const node = { id, source: file, pointer, kind: 'any', attributes, properties: [] };
    nodes.push(node);
    const declaredTypes = value.type === undefined ? [] : Array.isArray(value.type) ? value.type : [value.type];
    if (declaredTypes.some(kind => !schemaTypes.has(kind)) || (Array.isArray(value.type) && !value.type.length)) fail(pointer, 'Unsupported type');
    if (value.enum !== undefined && (!Array.isArray(value.enum) || value.enum.some(item => item !== null && !['string', 'number', 'boolean'].includes(typeof item)))) fail(pointer, 'Unsupported enum');
    const kinds = declaredTypes.length ? declaredTypes : value.properties ? ['object'] : value.items ? ['array']
      : value.enum ? unique(value.enum.map(item => item === null ? 'null' : typeof item)) : [];
    if (kinds.length > 1 && (value.properties || value.items || value.additionalProperties !== undefined || value.additionalItems !== undefined)) fail(pointer, 'Unsupported multitype structural siblings');
    node.kind = kinds.length === 1 ? kinds[0] : kinds.length > 1 ? 'union' : 'any';
    if (kinds.length > 1) node.branches = kinds.map((kind, i) => {
      const childId = `${id}/type/${i}`;
      nodes.push({ id: childId, source: file, pointer: `${pointer}/type/${i}`, kind, literals: value.enum?.filter(item => (item === null ? 'null' : typeof item) === kind), attributes: {} });
      return childId;
    });
    else if (value.enum) node.literals = value.enum;
    if (value.properties !== undefined && !isObject(value.properties)) fail(pointer, 'Invalid properties');
    if (value.required !== undefined && (!Array.isArray(value.required) || value.required.some(name => typeof name !== 'string' || !Object.hasOwn(value.properties ?? {}, name)))) fail(pointer, 'Invalid required');
    for (const [name, child] of Object.entries(value.properties ?? {})) node.properties.push({ name, required: root ? 'UNKNOWN' : value.required?.includes(name) ? 'REQUIRED' : 'OPTIONAL', typeId: walk(child, `${pointer}/properties/${escape(name)}`) });
    for (const key of ['oneOf', 'anyOf']) if (value[key] !== undefined) {
      if (!Array.isArray(value[key]) || !value[key].length || node.branches) fail(pointer, `Unsupported ${key} combination`);
      const branches = value[key].map((child, i) => walk(child, `${pointer}/${key}/${i}`));
      if (kinds.length || value.properties || value.items || value.enum) fail(pointer, `Unsupported structural siblings of ${key}`);
      node.kind = 'union'; node.branches = branches;
    }
    if (value.items !== undefined) {
      if (Array.isArray(value.items)) node.tupleIds = value.items.map((child, i) => walk(child, `${pointer}/items/${i}`));
      else node.itemId = walk(value.items, `${pointer}/items`);
    }
    if (value.additionalProperties !== undefined) {
      const additionalId = walk(value.additionalProperties, `${pointer}/additionalProperties`);
      node.additionalPropertiesId = additionalId;
      if (value.additionalProperties !== false) node.additionalId = additionalId;
    }
    if (value.additionalItems !== undefined) node.additionalItemsId = walk(value.additionalItems, `${pointer}/additionalItems`);
    if (value.not !== undefined) node.notId = walk(value.not, `${pointer}/not`);
    return id;
  }
  // The synthetic root is explicitly marked; root required is absent in this source.
  const rootId = walk({ type: 'object', properties: mapping }, '', true);
  nodes[0].synthetic = true;
  // Use source pointers into the original mapping, without synthetic /properties.
  for (const node of nodes) {
    const rewrite = value => typeof value === 'string' && value.startsWith(`${file}#/properties/`) ? value.replace(`${file}#/properties/`, `${file}#/`) : value;
    node.id = rewrite(node.id);
    node.pointer = node.pointer.replace(/^\/properties\//, '/');
    for (const key of ['itemId', 'additionalId', 'additionalPropertiesId', 'additionalItemsId', 'notId']) if (node[key]) node[key] = rewrite(node[key]);
    if (node.branches) node.branches = node.branches.map(rewrite);
    if (node.tupleIds) node.tupleIds = node.tupleIds.map(rewrite);
    node.properties?.forEach(property => { property.typeId = rewrite(property.typeId); });
  }
  return { source: file, format: 'DOCS_FIELD_MAPPING', rootRequired: 'UNKNOWN', raw: mapping, nodes, fields: projectFields(nodes, rootId) };
}

export function compareConfigFields(left, right, comparison) {
  const a = new Map(left.map(field => [field.path, field]));
  const b = new Map(right.map(field => [field.path, field]));
  const differences = [];
  for (const path of unique([...a.keys(), ...b.keys()])) {
    const l = a.get(path), r = b.get(path);
    const add = (kind, leftValue, rightValue) => differences.push({ id: `${comparison}:${path}:${kind}`, comparison, path, kind,
      left: leftValue, right: rightValue, leftSources: l?.sources ?? [], rightSources: r?.sources ?? [],
      conclusion: kind === 'REQUIRED' && (leftValue === 'UNKNOWN' || rightValue === 'UNKNOWN') ? 'SOURCE_REQUIRED_UNKNOWN'
        : 'SOURCE_SURFACE_DIFFERENCE_REQUIRES_REVIEW', followUp: 'M1/config-snapshot' });
    if (!l || !r) { add(l ? 'ONLY_LEFT' : 'ONLY_RIGHT', l ?? null, r ?? null); continue; }
    for (const [key, kind] of [['types', 'TYPES'], ['literals', 'LITERALS'], ['required', 'REQUIRED']]) {
      if (serializeInventory(l[key]) !== serializeInventory(r[key])) add(kind, l[key], r[key]);
    }
  }
  return differences;
}

export function validateConfigContract(actual, expected) {
  const errors = [];
  function visit(a, b, pointer) {
    if (errors.length >= 30 || serializeInventory(a) === serializeInventory(b)) return;
    if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
      for (const key of unique([...Object.keys(a), ...Object.keys(b)])) {
        const child = `${pointer}/${escape(key)}`;
        if (!Object.hasOwn(a, key) || !Object.hasOwn(b, key)) errors.push({ path: child, reason: 'Missing/unexpected record', source: b[key]?.id ?? a[key]?.id ?? null });
        else visit(a[key], b[key], child);
      }
    } else errors.push({ path: pointer || '/', reason: 'Fixed-source reconstruction mismatch', actual: a, expected: b });
  }
  visit(actual, expected, '');
  return { valid: errors.length === 0, errors };
}
