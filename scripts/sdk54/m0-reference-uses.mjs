import { createHash } from 'node:crypto';
import path from 'node:path';
import ts from 'typescript';
import { projectTemplateSource } from './m0-template-projection.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const rangeKey = (start, end) => `${start}:${end}`;
const compilerPath = file => path.posix.resolve('/', file);

function sourceRange(source, node, file, rawSource = source) {
  const start = node.getStart(source);
  const location = rawSource.getLineAndCharacterOfPosition(start);
  return { path: file, start, end: node.end, line: location.line + 1, column: location.character + 1 };
}

function lowerBound(references, start) {
  let low = 0;
  let high = references.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (references[middle].source.start < start) low = middle + 1;
    else high = middle;
  }
  return low;
}

function indexSource(source, file, checker, rawSource = source) {
  const ranges = new Set();
  const imports = new Map();
  const internalAliases = new Map();
  const identifiers = [];
  const references = [];
  function importRequest(literal) {
    const location = sourceRange(source, literal, file, rawSource);
    const raw = rawSource.text.slice(location.start, location.end);
    if (raw === source.text.slice(location.start, location.end)) return { request: literal.text };
    const parsed = ts.createSourceFile('literal.ts', raw, ts.ScriptTarget.Latest, true);
    const expression = parsed.statements[0]?.expression;
    if (parsed.parseDiagnostics.length || !expression || !ts.isStringLiteralLike(expression) || expression.getStart(parsed) !== 0 || expression.end !== raw.length) return null;
    return { request: expression.text, ...(expression.text !== literal.text ? { projectedRequest: literal.text } : {}) };
  }
  function register(name, literal) {
    const symbol = checker.getSymbolAtLocation(name);
    if (symbol && literal && ts.isStringLiteralLike(literal)) {
      const request = importRequest(literal);
      if (request) imports.set(symbol, { ...request, importSource: sourceRange(source, literal, file, rawSource) });
    }
  }
  function visit(node, inImport = false) {
    ranges.add(rangeKey(node.getStart(source), node.end));
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      if (clause?.name) register(clause.name, node.moduleSpecifier);
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) register(bindings.name, node.moduleSpecifier);
      if (bindings && ts.isNamedImports(bindings)) {
        for (const binding of bindings.elements) register(binding.name, node.moduleSpecifier);
      }
      inImport = true;
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (ts.isExternalModuleReference(node.moduleReference)) {
        register(node.name, node.moduleReference.expression);
        inImport = true;
      }
      else {
        let root = node.moduleReference;
        while (ts.isQualifiedName(root)) root = root.left;
        const alias = checker.getSymbolAtLocation(node.name);
        const target = checker.getSymbolAtLocation(root);
        if (alias && target) internalAliases.set(alias, target);
      }
    }
    if (!inImport && ts.isIdentifier(node) && !(ts.isImportEqualsDeclaration(node.parent) && node.parent.name === node)) identifiers.push(node);
    if (!inImport && ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) {
      const literal = node.argument.literal;
      const location = sourceRange(source, literal, file, rawSource);
      const request = importRequest(literal);
      if (request) references.push({ source: location, localName: null, ...request, importSource: location, evidenceKind: 'import-type-use' });
    }
    ts.forEachChild(node, child => visit(child, inImport));
  }
  visit(source);
  for (const alias of internalAliases.keys()) {
    const visited = new Set();
    let current = alias;
    while (internalAliases.has(current) && !visited.has(current) && !imports.has(current)) {
      visited.add(current);
      current = internalAliases.get(current);
    }
    if (imports.has(current)) imports.set(alias, imports.get(current));
  }
  for (const identifier of identifiers) {
    let symbol = checker.getSymbolAtLocation(identifier);
    if (ts.isShorthandPropertyAssignment(identifier.parent) && identifier.parent.name === identifier) {
      symbol = checker.getShorthandAssignmentValueSymbol(identifier.parent);
    }
    if (ts.isExportSpecifier(identifier.parent) && !identifier.parent.parent.parent.moduleSpecifier) {
      const specifier = identifier.parent;
      if (identifier === (specifier.propertyName ?? specifier.name)) symbol = checker.getExportSpecifierLocalTargetSymbol(specifier);
    }
    const imported = imports.get(symbol);
    if (imported) {
      const location = sourceRange(source, identifier, file, rawSource);
      const localName = rawSource.text.slice(location.start, location.end);
      references.push({ source: location, localName, ...(localName !== identifier.text ? { projectedLocalName: identifier.text } : {}), ...imported, evidenceKind: 'bound-import-symbol-use' });
    }
  }
  references.sort((left, right) => left.source.start - right.source.start || left.source.end - right.source.end || compare(left.evidenceKind, right.evidenceKind));
  return { ranges, references };
}

export function collectDeclarationReferences({ files, declarations, resolutions, templateProjection = false }) {
  const declarationPaths = new Set(declarations.map(row => row.path));
  const sourceTexts = new Map(), projections = [];
  for (const [file, text] of [...files].sort(([left], [right]) => compare(left, right))) {
    const projected = templateProjection && declarationPaths.has(file) ? projectTemplateSource({ path: file, text }) : { text, projection: null };
    sourceTexts.set(compilerPath(file), projected.text);
    if (projected.projection) projections.push(projected.projection);
  }
  const rootNames = [...new Set(declarations.filter(row => files.has(row.path)).map(row => compilerPath(row.path)))].sort(compare);
  const options = { target: ts.ScriptTarget.Latest, module: ts.ModuleKind.ESNext, noResolve: true, noLib: true, allowJs: true, skipLibCheck: true };
  const host = {
    getSourceFile(file, languageVersion) {
      const text = sourceTexts.get(compilerPath(file));
      return text === undefined ? undefined : ts.createSourceFile(file, text, languageVersion, true);
    },
    getDefaultLibFileName: () => '',
    writeFile() {},
    getCurrentDirectory: () => '/',
    getDirectories: () => [],
    fileExists: file => sourceTexts.has(compilerPath(file)),
    readFile: file => sourceTexts.get(compilerPath(file)),
    getCanonicalFileName: file => file,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
  };
  // Binding is intentionally isolated from module resolution and the host filesystem.
  const program = ts.createProgram(rootNames, options, host);
  const checker = program.getTypeChecker();
  const indexes = new Map();
  for (const file of [...declarationPaths].sort(compare)) {
    const source = program.getSourceFile(compilerPath(file));
    if (source) {
      const rawSource = source.text === files.get(file) ? source : ts.createSourceFile(compilerPath(file), files.get(file), ts.ScriptTarget.Latest, true);
      indexes.set(file, indexSource(source, file, checker, rawSource));
    }
  }
  const resolutionByKey = new Map(resolutions.map(row => [row.key, row]));
  const declarationRows = [];
  const uses = [];
  for (const declaration of [...declarations].sort((left, right) => compare(left.id, right.id))) {
    const row = { id: declaration.id, useIds: [], referenceScanStatus: 'SOURCE_UNAVAILABLE' };
    declarationRows.push(row);
    if (!files.has(declaration.path)) continue;
    const index = indexes.get(declaration.path);
    row.referenceScanStatus = 'RANGE_UNMATCHED';
    if (!index?.ranges.has(rangeKey(declaration.start, declaration.end))) continue;
    row.referenceScanStatus = 'SCANNED';
    for (let position = lowerBound(index.references, declaration.start); position < index.references.length; position++) {
      const reference = index.references[position];
      if (reference.source.start >= declaration.end) break;
      if (reference.source.end > declaration.end) continue;
      const resolutionKey = `${declaration.path}\0${reference.request}`;
      const id = `USE:${hash(JSON.stringify([declaration.id, reference.source.path, reference.source.start, reference.source.end, reference.evidenceKind]))}`;
      uses.push({ id, declarationId: declaration.id, ...reference, resolutionKey, resolutionStatus: resolutionByKey.get(resolutionKey)?.status ?? 'NOT_OBSERVED' });
      row.useIds.push(id);
    }
  }
  return {
    compilerVersion: ts.version,
    declarations: declarationRows,
    uses,
    inputs: [...files].sort(([left], [right]) => compare(left, right)).map(([file, text]) => ({ path: file, sha256: hash(text) })),
    ...(templateProjection ? { projections } : {}),
  };
}
