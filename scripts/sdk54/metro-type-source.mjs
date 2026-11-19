import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { list as listTar } from 'tar';
import ts from 'typescript';
import { buildExternalSources, serializeExternalSources } from './external-sources.mjs';
import { readSourceTree, readSourceBlobs, serializeInventory } from './source-inventory.mjs';
import { SDK54_EXPO_COMMIT } from './catalog.mjs';

const hash = data => createHash('sha256').update(data).digest('hex');
const virtual = '/__metro_dts__/';
const pkgName = '@expo/metro', pkgVersion = '54.2.0';

export function verifyArchiveIntegrity(bytes, { integrity, resolved }) {
  const expectedSha1 = resolved?.split('#')[1];
  if (!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(integrity ?? '') || Buffer.from(integrity.slice(7), 'base64').length !== 64 || !/^[a-f0-9]{40}$/.test(expectedSha1 ?? '')) throw new Error('Invalid fixed SHA512/SHA1 integrity identity');
  if ('sha512-' + createHash('sha512').update(bytes).digest('base64') !== integrity || createHash('sha1').update(bytes).digest('hex') !== expectedSha1) throw new Error('Archive integrity SHA512/SHA1 mismatch');
  return { valid: true, sha256: hash(bytes), integrity, sha1: expectedSha1, bytes: bytes.length };
}

export function assertArchiveEntry(entry, seen) {
  if (!['File', 'OldFile', 'Directory'].includes(entry.type)) throw new Error(`Unsafe archive link/type ${entry.path}`);
  if (entry.size > 64 * 1024 * 1024 || entry.size < 0) throw new Error('Archive size limit');
  const file = entry.path.replace(/\/$/, '');
  if (entry.type === 'Directory' && file === 'package') return;
  if (!file.startsWith('package/') || file.includes('\\') || file.split('/').some(segment => ['', '.', '..'].includes(segment))) throw new Error(`Unsafe archive path ${entry.path}`);
  if (seen.has(file)) throw new Error(`Duplicate archive entry ${file}`); seen.add(file);
}

export function readMetroArchive(archive, identity) {
  const verified = verifyArchiveIntegrity(fs.readFileSync(archive), identity), seen = new Set(), files = new Map(), entries = [];
  let size = 0;
  listTar({ file: archive, sync: true, strict: true, onReadEntry(entry) {
    assertArchiveEntry(entry, seen); size += entry.size;
    if (size > 64 * 1024 * 1024) throw new Error('Archive total size limit');
    entries.push({ path: entry.path, type: entry.type, bytes: entry.size });
    if (['File', 'OldFile'].includes(entry.type) && (entry.path === 'package/package.json' || entry.path.endsWith('.d.ts'))) {
      const chunks = []; entry.on('data', chunk => chunks.push(chunk)); entry.on('end', () => {
        const bytes = Buffer.concat(chunks); if (bytes.length !== entry.size) throw new Error(`Truncated archive file ${entry.path}`);
        files.set(entry.path.slice(8), bytes.toString('utf8'));
      });
    }
    entry.resume();
  } });
  if (!files.has('package.json')) throw new Error('Missing archive manifest');
  return { files, archive: { ...verified, entries: entries.sort((a, b) => a.path.localeCompare(b.path)) } };
}

export function findMetroAlias(text) {
  const source = ts.createSourceFile('packages/@expo/metro-config/src/ExpoMetroConfig.ts', text, ts.ScriptTarget.Latest, true);
  if (source.parseDiagnostics.length) throw new Error('Invalid upstream alias source');
  for (const statement of source.statements) {
    if (!ts.isExportDeclaration(statement) || statement.moduleSpecifier || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue;
    const exported = statement.exportClause.elements.find(element => element.name.text === 'MetroConfig'); if (!exported) continue;
    const localName = exported.propertyName?.text ?? exported.name.text;
    for (const imported of source.statements.filter(ts.isImportDeclaration)) {
      if (!ts.isStringLiteral(imported.moduleSpecifier) || imported.moduleSpecifier.text !== '@expo/metro/metro-config' || !imported.importClause?.namedBindings || !ts.isNamedImports(imported.importClause.namedBindings)) continue;
      const binding = imported.importClause.namedBindings.elements.find(element => element.name.text === localName);
      if (binding) return { importedName: binding.propertyName?.text ?? binding.name.text, localName, exportedName: 'MetroConfig', request: imported.moduleSpecifier.text,
        source: { path: source.fileName, line: source.getLineAndCharacterOfPosition(binding.getStart(source)).line + 1, start: binding.getStart(source), end: binding.end } };
    }
  }
  throw new Error('Missing upstream MetroConfig import/export alias');
}

export function indexMetroTypes({ files, upstreamText }) {
  const manifest = JSON.parse(String(files.get('package.json')));
  if (manifest.name !== pkgName || manifest.version !== pkgVersion) throw new Error('Metro archive package identity mismatch');
  const alias = findMetroAlias(upstreamText), sources = new Map();
  for (const [file, text] of files) if (file.endsWith('.d.ts')) {
    const source = ts.createSourceFile(virtual + file, String(text), ts.ScriptTarget.Latest, true);
    if (source.parseDiagnostics.length) throw new Error(`Invalid published declaration ${file}`); sources.set(virtual + file, source);
  }
  const resolve = (request, from) => {
    if (!request.startsWith('.')) return null;
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), request));
    if (base.startsWith('../') || base.startsWith('/')) throw new Error(`Declaration source escape ${request}`);
    const stem = base.replace(/\.(?:mjs|cjs|js)$/, '');
    return [base, stem + '.d.ts', base + '/index.d.ts'].find(file => sources.has(virtual + file)) ?? null;
  };
  const exportPath = manifest.exports?.['./metro-config'];
  if (typeof exportPath !== 'string' || !exportPath.startsWith('./')) throw new Error('Missing Metro declaration entry export');
  const entry = exportPath.slice(2).replace(/\.js$/, '.d.ts');
  const entryChain = [], visited = new Set(); let terminal = entry;
  while (true) {
    if (visited.has(terminal)) throw new Error('Declaration namespace forwarding cycle'); visited.add(terminal);
    const source = sources.get(virtual + terminal); if (!source) throw new Error(`Missing declaration entry ${terminal}`);
    entryChain.push({ path: terminal, sha256: hash(String(files.get(terminal))) });
    const assignment = source.statements.find(node => ts.isExportAssignment(node) && node.isExportEquals && ts.isIdentifier(node.expression));
    if (!assignment) break;
    const namespace = source.statements.find(node => ts.isImportDeclaration(node) && node.importClause?.namedBindings && ts.isNamespaceImport(node.importClause.namedBindings) && node.importClause.namedBindings.name.text === assignment.expression.text);
    if (!namespace || !ts.isStringLiteral(namespace.moduleSpecifier)) throw new Error('Unsupported declaration namespace wrapper');
    const target = resolve(namespace.moduleSpecifier.text, terminal); if (!target) throw new Error('Missing namespace declaration target'); terminal = target;
  }
  const host = { getSourceFile: file => sources.get(file), getDefaultLibFileName: () => '', writeFile() {}, getCurrentDirectory: () => virtual, getDirectories: () => [],
    fileExists: file => sources.has(file), readFile: file => sources.get(file)?.text, getCanonicalFileName: file => file, useCaseSensitiveFileNames: () => true, getNewLine: () => '\n',
    resolveModuleNames: (requests, containing) => requests.map(request => { const file = resolve(request, containing.slice(virtual.length)); return file ? { resolvedFileName: virtual + file, extension: ts.Extension.Dts } : undefined; }) };
  const program = ts.createProgram([...sources.keys()], { noLib: true, noEmit: true, types: [], strict: true, target: ts.ScriptTarget.Latest, module: ts.ModuleKind.CommonJS }, host), checker = program.getTypeChecker();
  const source = sources.get(virtual + terminal), module = checker.getSymbolAtLocation(source);
  const rootSymbol = module ? checker.getExportsOfModule(module).find(symbol => symbol.getName() === alias.importedName) : null;
  const target = rootSymbol && rootSymbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(rootSymbol) : rootSymbol;
  if (!target?.declarations?.length) throw new Error(`Cannot resolve published ${alias.importedName}`);
  const loc = node => { const source = node.getSourceFile(), start = node.getStart(source), position = source.getLineAndCharacterOfPosition(start); return { path: source.fileName.slice(virtual.length), line: position.line + 1, column: position.character + 1, start, end: node.end }; };
  const declarationMap = new Map();
  for (const source of sources.values()) for (const statement of source.statements) {
    const nodes = ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : [statement];
    for (const node of nodes) if (node.name && [ts.SyntaxKind.InterfaceDeclaration, ts.SyntaxKind.TypeAliasDeclaration, ts.SyntaxKind.ClassDeclaration, ts.SyntaxKind.EnumDeclaration, ts.SyntaxKind.FunctionDeclaration, ts.SyntaxKind.VariableDeclaration].includes(node.kind)) declarationMap.set(node, `DTS:${loc(node).path}#${node.name.getText(source)}:${node.getStart(source)}`);
  }
  const queue = new Set(target.declarations.filter(node => declarationMap.has(node))), declarations = [], members = [], references = [];
  const utilities = new Set(['Readonly', 'ReadonlyArray', 'Array', 'Promise', 'Partial', 'Required', 'Pick', 'Omit', 'Record', 'NonNullable', 'Exclude', 'Extract', 'ReturnType', 'Parameters', 'InstanceType']);
  const memberKinds = new Set(['PropertySignature', 'MethodSignature', 'PropertyDeclaration', 'MethodDeclaration', 'Constructor', 'GetAccessor', 'SetAccessor', 'IndexSignature', 'CallSignature', 'ConstructSignature', 'Parameter', 'TypeParameter', 'EnumMember', 'NamedTupleMember']);
  for (const node of queue) {
    const id = declarationMap.get(node), name = node.name.getText(), counts = new Map();
    declarations.push({ id, name, kind: ts.SyntaxKind[node.kind], source: loc(node), signature: node.getText() });
    const visit = (current, prefix) => {
      if (ts.canHaveModifiers(current) && (ts.getModifiers(current) ?? []).some(m => [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword].includes(m.kind)) || current.name && ts.isPrivateIdentifier(current.name)) return;
      if (current !== node && memberKinds.has(ts.SyntaxKind[current.kind])) {
        const memberName = current.name?.getText() ?? `$${ts.SyntaxKind[current.kind]}`; prefix += '/' + memberName;
        const ordinal = (counts.get(prefix) ?? 0) + 1; counts.set(prefix, ordinal);
        members.push({ id: `${id}/MEMBER:${prefix}:${ordinal}`, declarationId: id, name: memberName, optional: Boolean(current.questionToken), readonlySyntax: ts.canHaveModifiers(current) && (ts.getModifiers(current) ?? []).some(m => m.kind === ts.SyntaxKind.ReadonlyKeyword), kind: ts.SyntaxKind[current.kind], source: loc(current), signature: current.getText() });
      }
      const entity = ts.isTypeReferenceNode(current) ? current.typeName : ts.isExpressionWithTypeArguments(current) ? current.expression : ts.isTypeQueryNode(current) ? current.exprName : null;
      if (entity || ts.isImportTypeNode(current)) {
        let symbol = entity ? checker.getSymbolAtLocation(entity) : null;
        if (symbol?.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
        const local = (symbol?.declarations ?? []).filter(declaration => declarationMap.has(declaration));
        for (const declaration of local) queue.add(declaration);
        const referenceName = entity?.getText() ?? current.getText();
        references.push({ id: `${id}/REF:${references.length + 1}`, declarationId: id, name: referenceName, source: loc(current), targetIds: local.map(declaration => declarationMap.get(declaration)).sort(),
          resolution: local.length ? 'archive-source' : symbol?.declarations?.some(ts.isTypeParameterDeclaration) ? 'type-parameter' : utilities.has(referenceName) ? 'utility-not-expanded' : 'external-or-unresolved' });
      }
      ts.forEachChild(current, child => visit(child, prefix));
    };
    visit(node, name);
  }
  const sort = records => records.sort((a, b) => a.id.localeCompare(b.id));
  return { schemaVersion: 1, compilerVersion: ts.version, package: { name: manifest.name, version: manifest.version }, alias, entryChain,
    root: { name: alias.importedName, declarationIds: target.declarations.map(node => declarationMap.get(node)).filter(Boolean) },
    inputs: [...files].sort(([a], [b]) => a.localeCompare(b)).map(([file, text]) => ({ path: file, sha256: hash(String(text)) })),
    declarations: sort(declarations), members: sort(members), references: sort(references), fullTypeSurfaceComplete: false, stageClosable: false,
    limitation: 'Published explicit declarations reachable from the upstream ConfigT alias; no default libraries, external packages, utility expansion or project/runtime acceptance.' };
}

export function buildMetroTypeSource({ sourceDir, archive }) {
  const review = buildExternalSources({ sourceDir }), identity = review.locks.find(row => row.selector === '@expo/metro@~54.2.0');
  if (identity?.version !== pkgVersion) throw new Error('Missing exact fixed Metro lock identity');
  const loaded = readMetroArchive(archive, identity), { tree, entries } = readSourceTree(sourceDir, SDK54_EXPO_COMMIT);
  const entry = entries.find(entry => entry.path === 'packages/@expo/metro-config/src/ExpoMetroConfig.ts');
  const bytes = readSourceBlobs(sourceDir, [entry]).get(entry.path);
  const result = indexMetroTypes({ files: loaded.files, upstreamText: bytes.toString('utf8') });
  result.source = { revision: SDK54_EXPO_COMMIT, tree, upstream: { path: entry.path, blob: entry.oid, sha256: hash(bytes) } };
  result.lockIdentity = identity; result.archive = loaded.archive;
  return result;
}

export function validateMetroTypes(actual, expected) {
  const failures = [];
  for (const field of ['inputs', 'declarations', 'members', 'references']) {
    const rows = new Map(); for (const row of actual?.[field] ?? []) { const id = row.id ?? row.path; if (rows.has(id)) failures.push(`Duplicate ${field} ${id}`); rows.set(id, row); }
    for (const row of expected[field]) { const id = row.id ?? row.path, value = rows.get(id); if (!value || serializeInventory(value) !== serializeInventory(row)) failures.push(`${!value ? 'Missing' : 'Changed'} ${field} ${id} at ${row.source?.path ?? row.path}:${row.source?.line ?? ''}`); rows.delete(id); }
    for (const id of rows.keys()) failures.push(`Unexpected ${field} ${id}`);
  }
  if (serializeInventory(actual) !== serializeInventory(expected)) failures.push('Metro type source differs from verified archive and fixed upstream alias');
  return { valid: !failures.length, failures };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2), options = {};
    for (let i = 0; i < args.length; i += 2) { if (!['--source', '--archive', '--output', '--check'].includes(args[i]) || !args[i + 1] || options[args[i]]) throw new Error('Invalid args'); options[args[i]] = args[i + 1]; }
    if (!options['--source'] || !options['--archive'] || Boolean(options['--output']) === Boolean(options['--check'])) throw new Error('Usage: --source <git> --archive <fixed-tgz> --output|--check <json>');
    const expected = buildMetroTypeSource({ sourceDir: options['--source'], archive: options['--archive'] });
    if (options['--check']) { const result = validateMetroTypes(JSON.parse(fs.readFileSync(options['--check'])), expected); console.log(JSON.stringify(result)); if (!result.valid) process.exitCode = 1; }
    else { fs.writeFileSync(options['--output'], serializeExternalSources(expected)); console.log(JSON.stringify({ root: expected.root.name, declarations: expected.declarations.length, members: expected.members.length, references: expected.references.length, archiveInputs: expected.inputs.length, fullTypeSurfaceComplete: false, stageClosable: false })); }
  } catch (error) { console.error(error.stack); process.exitCode = 1; }
}
