import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { parse } from '@ast-grep/napi';
import { initializeNativeParsers } from './m0-native-parser.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value, (_, row) => row && typeof row === 'object' && !Array.isArray(row) ? Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b))) : row);
const revision = '5b42e3d21e0ac5e086752361ca8a5cb4de53bec1', tree = '5457e824b21d968e55c8f533cdf1751860160a92';
const base = 'packages/expo-gl/common/';
const macroNames = new Set(['NATIVE_METHOD', 'SIMPLE_NATIVE_METHOD', 'UNIMPL_NATIVE_METHOD']);
const allNodes = root => { const nodes = []; const visit = node => { nodes.push(node); node.children().forEach(visit); }; visit(root); return nodes; };
const range = node => ({ start: node.range().start.index, end: node.range().end.index, line: node.range().start.line + 1, endLine: node.range().end.line + 1 });
const witness = node => ({ syntaxKind: node.kind(), ...range(node), expression: node.text(), expressionSha256: hash(node.text()) });
function syntax(language, source) { initializeNativeParsers(); return parse(language, source).root(); }
function clangRawTokens(source) {
  const result = spawnSync('clang', ['-x', 'c++', '-fsyntax-only', '-Xclang', '-dump-raw-tokens', '-'], { input: source, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  assert.equal(result.status, 0, 'Mature Clang raw lexer failed');
  const bytes = Buffer.from(source), starts = [0]; for (let i = 0; i < bytes.length; i++) if (bytes[i] === 10) starts.push(i + 1);
  const rows = [...result.stderr.matchAll(/(?:^|\n)([a-z_]+) '[\s\S]*?\tLoc=<<stdin>:(\d+):(\d+)>/g)].map(match => ({ tokenKind: match[1], line: Number(match[2]), column: Number(match[3]), startByte: starts[Number(match[2]) - 1] + Number(match[3]) - 1 }));
  assert(rows.length, 'No mature raw tokens retained');
  const punctuation = { l_paren: '(', r_paren: ')', l_brace: '{', r_brace: '}', comma: ',' };
  const tokens = rows.map((row, index) => {
    const endByte = rows[index + 1]?.startByte ?? bytes.length, start = bytes.subarray(0, row.startByte).toString('utf8').length, expression = bytes.subarray(row.startByte, endByte).toString('utf8');
    return { ...row, endByte, start, end: start + expression.length, expression };
  });
  return { dumpSha256: hash(result.stderr), tokens, adapters: tokens.filter(row => !['unknown', 'comment'].includes(row.tokenKind)).map(row => ({
    kind: () => punctuation[row.tokenKind] ?? row.tokenKind, text: () => row.expression,
    range: () => ({ start: { index: row.start, line: row.line - 1 }, end: { index: row.end, line: row.line - 1 + row.expression.split('\n').length - 1 } }),
  })) };
}
function flatten(root, source) {
  const rows = [], visit = (node, parent = null) => {
    const id = rows.length, expression = node.text(), position = range(node);
    const row = { id, parent, syntaxKind: node.kind(), named: node.isNamed(), ...position, expressionSha256: hash(expression),
      ...(expression.length <= 16384 ? { expression } : { expressionReference: { start: position.start, end: position.end, sha256: hash(expression) } }), children: [] };
    rows.push(row); for (const child of node.children()) row.children.push(visit(child, id)); return id;
  }; visit(root);
  for (const row of rows) assert.equal(hash(source.slice(row.start, row.end)), row.expressionSha256);
  return rows;
}

export function collectMacroImplementations(source) {
  const root = syntax('cpp', source), nodes = allNodes(root), macros = nodes.filter(node => node.kind() === 'preproc_function_def').map(witness);
  const raw = clangRawTokens(source), tokens = raw.adapters.filter(node => !macros.some(macro => range(node).start >= macro.start && range(node).end <= macro.end));
  const implementations = [];
  for (let i = 0; i < tokens.length; i++) {
    if (!macroNames.has(tokens[i].text()) || tokens[i + 1]?.kind() !== '(') continue;
    const macroName = tokens[i].text(), argumentParts = []; let start = range(tokens[i + 1]).end, depth = 1, endIndex = -1;
    for (let j = i + 2; j < tokens.length; j++) {
      const token = tokens[j], type = token.kind();
      if (type === '(') depth++;
      if (type === ')') depth--;
      if (type === ',' && depth === 1 || depth === 0) { argumentParts.push(source.slice(start, range(token).start).trim()); start = range(token).end; }
      if (depth === 0) { endIndex = j; break; }
    }
    assert(endIndex >= 0, 'Unclosed finite native macro invocation');
    let end = range(tokens[endIndex]).end, bodyStart = null;
    if (macroName === 'NATIVE_METHOD') {
      assert.equal(tokens[endIndex + 1]?.kind(), '{', `Native macro ${argumentParts[0]} requires a full definition body`);
      let braceDepth = 0; bodyStart = range(tokens[endIndex + 1]).start;
      for (let j = endIndex + 1; j < tokens.length; j++) {
        if (tokens[j].kind() === '{') braceDepth++;
        if (tokens[j].kind() === '}') braceDepth--;
        if (!braceDepth) { end = range(tokens[j]).end; break; }
      }
      assert.equal(braceDepth, 0, 'Unclosed native macro body');
    }
    assert(/^[A-Za-z_]\w*$/.test(argumentParts[0]), 'Finite native method name required');
    const definition = macros.find(row => source.slice(row.start, row.end).startsWith(`#define ${macroName}(`));
    assert(definition, `Missing original macro definition ${macroName}`);
    const position = range(tokens[i]);
    implementations.push({ macroName, name: argumentParts[0], arguments: argumentParts, start: position.start, end, line: position.line,
      endLine: source.slice(0, end).split('\n').length, bodyStart, expression: source.slice(position.start, end), expressionSha256: hash(source.slice(position.start, end)),
      definition, implementationStatus: macroName === 'UNIMPL_NATIVE_METHOD' ? 'EXPLICIT_UNIMPLEMENTED_SOURCE_RULE' : 'FINITE_SOURCE_IMPLEMENTATION_RULE' });
  }
  return { sourceSha256: hash(source), macros, implementations, rawLexer: { dumpSha256: raw.dumpSha256, tokens: raw.tokens }, sourceConditions: nodes.filter(node => node.kind().startsWith('preproc_')).map(witness),
    errors: nodes.filter(node => node.kind() === 'ERROR').map(witness), ast: flatten(root, source) };
}

export function projectStbPublicHeader(source) {
  const original = syntax('c', source), nodes = allNodes(original), raw = clangRawTokens(source);
  const directives = raw.adapters.filter((node, index) => node.text() === 'STB_IMAGE_IMPLEMENTATION' && raw.adapters[index - 1]?.text() === 'ifdef' && raw.adapters[index - 2]?.text() === '#');
  const implementation = directives[0];
  assert(implementation, 'Explicit STB_IMAGE_IMPLEMENTATION source boundary required');
  const nameStart = range(implementation).start, end = source.lastIndexOf('#', nameStart), publicSource = source.slice(0, end), publicRoot = syntax('c', publicSource), publicNodes = allNodes(publicRoot);
  const qualifierTokens = publicNodes.filter(node => node.isLeaf() && node.text() === 'STBIDEF' &&
    !publicSource.slice(publicSource.lastIndexOf('\n', range(node).start) + 1, range(node).start).trimStart().startsWith('#'));
  const qualifierRules = qualifierTokens.map(node => ({ ...witness(node), replacement: 'extern ', meaning: 'STBIDEF source macro is externally visible by default; STB_IMAGE_STATIC branch remains an explicit retained source condition.' }));
  let projectedSource = publicSource;
  for (const row of [...qualifierRules].sort((a, b) => b.start - a.start)) projectedSource = projectedSource.slice(0, row.start) + row.replacement + projectedSource.slice(row.end);
  const projected = syntax('c', projectedSource), projectedNodes = allNodes(projected), functions = [], callbacks = [];
  for (const node of projectedNodes.filter(node => node.kind() === 'function_declarator')) {
    const declarator = node.field('declarator'), named = allNodes(declarator ?? node).find(child => ['identifier', 'field_identifier'].includes(child.kind()));
    const name = named?.text(); if (!name) continue;
    const parent = node.ancestors().find(row => ['declaration', 'field_declaration'].includes(row.kind()));
    if (!parent) continue;
    const row = { name, ...range(parent), expression: publicSource.slice(range(parent).start, range(parent).end),
      parameterRule: node.field('parameters')?.text(), generatedExpression: parent.text(), expressionSha256: hash(publicSource.slice(range(parent).start, range(parent).end)) };
    (parent.kind() === 'field_declaration' ? callbacks : functions).push(row);
  }
  return { sourceSha256: hash(source), headerEnd: end, originalHeader: publicSource, projectedSource,
    projectedSourceSha256: hash(projectedSource), qualifierRules, functions, callbacks, rawLexer: { dumpSha256: raw.dumpSha256, tokens: raw.tokens },
    errors: projectedNodes.filter(node => node.kind() === 'ERROR').map(witness),
    conditions: publicNodes.filter(node => node.kind().startsWith('preproc_')).map(witness), ast: flatten(projected, projectedSource) };
}

export function validateVendorImpact(actual, expected) {
  const valid = canonical(actual) === canonical(expected); return { valid, failures: valid ? [] : ['Changed native vendor impact facts, source identity, public declarations, consumer proofs or support boundary.'] };
}

function stripIncludes(source, keep = []) {
  const includes = allNodes(syntax('cpp', source)).filter(node => node.kind() === 'preproc_include');
  let projected = source;
  const removed = includes.filter(node => !keep.some(file => node.text().includes(`"${file}"`))).map(witness);
  for (const row of [...removed].sort((a, b) => b.start - a.start)) projected = projected.slice(0, row.start) + source.slice(row.start, row.end).replace(/[^\n\r]/g, ' ') + projected.slice(row.end);
  return { projected, removed };
}

function normalizeClangAst(ast) {
  const identifiers = new Map(), visit = value => {
    if (typeof value === 'string' && /^0x[\da-f]+$/i.test(value)) { if (!identifiers.has(value)) identifiers.set(value, `CLANG-ID:${identifiers.size}`); return identifiers.get(value); }
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, visit(child)]));
    return value;
  }; return visit(ast);
}

export async function buildVendorImpact({ sourceDirectory = '/tmp/sdk54-expo-source', outputDirectory = 'outputs/sdk54/ai-e2e/20261027-m0-final-closure', check = false } = {}) {
  const git = args => execFileSync('git', ['-C', sourceDirectory, ...args], { env: { ...process.env, GIT_NO_LAZY_FETCH: '1' }, maxBuffer: 256 * 1024 * 1024 });
  assert.equal(git(['rev-parse', `${revision}^{tree}`]).toString().trim(), tree);
  const names = ['EXWebGLMethods.cpp', 'EXWebGLMethods.h', 'EXWebGLMethods.def', 'EXWebGLRenderer.cpp', 'stb_image.h', 'EXGLImageUtils.cpp', 'EXGLImageUtils.h'];
  const files = new Map(), receipts = [];
  for (const name of names) {
    const file = base + name, blob = git(['rev-parse', `${revision}:${file}`]).toString().trim(), bytes = git(['cat-file', 'blob', blob]); files.set(name, bytes.toString('utf8'));
    receipts.push({ path: file, blob, sha256: hash(bytes), bytes: bytes.length });
  }
  const cpp = collectMacroImplementations(files.get('EXWebGLMethods.cpp')), stbSource = files.get('stb_image.h'), stb = projectStbPublicHeader(stbSource);
  assert.equal(stb.errors.length, 0, 'All-branch stb public header must parse cleanly');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-native-vendor-'));
  try {
    fs.writeFileSync(path.join(temporary, 'EXWebGLMethods.def'), files.get('EXWebGLMethods.def'));
    const clang = execFileSync('xcrun', ['--find', 'clang'], { encoding: 'utf8' }).trim();
    const sdk = execFileSync('xcrun', ['--show-sdk-path'], { encoding: 'utf8' }).trim();
    const clangProvenance = { compiler: clang, version: execFileSync(clang, ['--version'], { encoding: 'utf8' }).trim(), binarySha256: hash(fs.readFileSync(clang)), sdk, execution: 'PREPROCESS_AND_SYNTAX_AST_ONLY_NO_SOURCE_EXECUTION' };
    const preprocess = source => execFileSync(clang, ['-E', '-P', '-x', 'c++', '-I', temporary, '-'], { input: source, encoding: 'utf8', stdio: 'pipe', maxBuffer: 128 * 1024 * 1024 });
    const headerProjection = stripIncludes(files.get('EXWebGLMethods.h'), ['EXWebGLMethods.def']);
    const headerSource = preprocess(headerProjection.projected), headerRoot = syntax('cpp', headerSource), headerNodes = allNodes(headerRoot);
    assert.equal(headerNodes.filter(node => node.kind() === 'ERROR').length, 0, 'Expanded original WebGL public header must be clean');
    const declarations = headerNodes.filter(node => node.kind() === 'function_declarator').map(node => ({ name: node.field('declarator')?.text(), ...witness(node), fullSignature: node.parent()?.text() }));
    const rendererProjection = stripIncludes(files.get('EXWebGLRenderer.cpp'), ['EXWebGLMethods.def']), rendererSource = preprocess(rendererProjection.projected);
    const rendererRoot = syntax('cpp', rendererSource), rendererNodes = allNodes(rendererRoot);
    const registrationFunctions = rendererNodes.filter(node => node.kind() === 'function_definition' && /^installWebGL(?:2)?Methods$/.test(node.field('declarator')?.field('declarator')?.text() ?? ''));
    const registrations = registrationFunctions.flatMap(fn => allNodes(fn).filter(node => node.kind() === 'call_expression' && node.field('function')?.text() === 'setFunctionOnObject').map(node => {
      const args = node.field('arguments')?.children().filter(child => child.isNamed()) ?? [];
      return { consumer: fn.field('declarator')?.field('declarator')?.text(), name: args[2]?.text().slice(1, -1), symbol: args[3]?.text().replace(/^method::/, ''), ...witness(node) };
    }));
    const defNodes = allNodes(syntax('cpp', files.get('EXWebGLMethods.def'))), defTokens = defNodes.filter(node => node.isLeaf() && !node.kind().includes('comment'));
    const methodList = [];
    for (let i = 0; i < defTokens.length; i++) if (['NATIVE_METHOD', 'NATIVE_WEBGL2_METHOD'].includes(defTokens[i].text()) && defTokens[i + 1]?.kind() === '(') methodList.push({ macroName: defTokens[i].text(), name: defTokens[i + 2]?.text(), start: range(defTokens[i]).start, end: range(defTokens[i + 3]).end });
    const macroBindings = methodList.map(row => {
      const symbol = `glNativeMethod_${row.name}`, declaration = declarations.find(item => item.name === symbol), implementation = cpp.implementations.find(item => item.name === row.name), consumers = registrations.filter(item => item.name === row.name && item.symbol === symbol);
      assert(declaration && implementation, `Missing WebGL declaration/implementation ${row.name}`);
      assert.equal(consumers.length, row.macroName === 'NATIVE_METHOD' ? 2 : 1, `Complete WebGL1/2 registration ${row.name}`);
      return { ...row, expression: files.get('EXWebGLMethods.def').slice(row.start, row.end), declaration, implementation, consumers };
    });
    assert.equal(new Set(cpp.implementations.map(row => row.name)).size, cpp.implementations.length, 'Duplicate macro implementation');
    const unmatchedImplementations = cpp.implementations.filter(row => !methodList.some(item => item.name === row.name));
    assert.equal(unmatchedImplementations.length, 0, 'Unlisted macro implementation is a public-impact boundary');
    const diagnosticCoverage = cpp.errors.map(error => {
      const method = cpp.implementations.find(row => error.start >= row.start && error.end <= row.end);
      assert(method, `Unproved C++ diagnostic outside macro method ${error.line}`);
      return { error, implementationName: method.name, bodyExpressionSha256: method.expressionSha256, declarationSymbol: `glNativeMethod_${method.name}` };
    });
    const clangArgs = ['-x', 'c', '-isysroot', sdk, '-DSTB_IMAGE_IMPLEMENTATION', '-fsyntax-only', '-Xclang', '-ast-dump=json', '-'];
    const clangBytes = execFileSync(clang, clangArgs, { input: stbSource, encoding: 'utf8', stdio: 'pipe', maxBuffer: 256 * 1024 * 1024 });
    const clangAst = normalizeClangAst(JSON.parse(clangBytes));
    const clangNodes = []; const visitClang = node => { if (!node || typeof node !== 'object') return; clangNodes.push(node); for (const child of node.inner ?? []) visitClang(child); }; visitClang(clangAst);
    const clangFunctions = clangNodes.filter(node => node.kind === 'FunctionDecl' && node.name?.startsWith('stbi_') && !node.loc?.includedFrom);
    const stbSymbols = stb.functions.map(row => row.name);
    const missingDefaultSymbols = stbSymbols.filter(name => name !== 'stbi_convert_wchar_to_utf8' && !clangFunctions.some(node => node.name === name));
    assert.equal(missingDefaultSymbols.length, 0, 'Public stb declarations missing from mature complete implementation AST');
    const imageRoot = syntax('cpp', files.get('EXGLImageUtils.cpp')), imageNodes = allNodes(imageRoot);
    const imageCalls = imageNodes.filter(node => node.kind() === 'call_expression' && /^stbi_/.test(node.field('function')?.text() ?? '')).map(witness);
    assert(imageCalls.some(row => row.expression.startsWith('stbi_load(')) && imageCalls.some(row => row.expression.startsWith('stbi_image_free(')), 'Concrete fixed decoder and free consumers required');
    const consumedClangArgs = ['-x', 'c++', '-isysroot', sdk, '-DSTB_IMAGE_IMPLEMENTATION', '-DSTBI_ONLY_JPEG', '-DSTBI_ONLY_PNG', '-fsyntax-only', '-Xclang', '-ast-dump=json', '-'];
    const consumedAst = normalizeClangAst(JSON.parse(execFileSync(clang, consumedClangArgs, { input: stbSource, encoding: 'utf8', stdio: 'pipe', maxBuffer: 256 * 1024 * 1024 })));
    const externalFiles = new Set(), collectExternal = value => {
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        if (key === 'file' && typeof child === 'string' && path.isAbsolute(child) && fs.existsSync(child)) externalFiles.add(child);
        else if (child && typeof child === 'object') { if (Array.isArray(child)) child.forEach(collectExternal); else collectExternal(child); }
      }
    }; collectExternal(clangAst); collectExternal(consumedAst);
    clangProvenance.astReferencedSystemFiles = [...externalFiles].sort().map(file => ({ path: file, sha256: hash(fs.readFileSync(file)) }));
    const rawStbRoot = syntax('cpp', stbSource), rawStbNodes = allNodes(rawStbRoot);
    const stbImplementationRules = rawStbNodes.filter(node => node.kind() === 'function_declarator' && /^stbi_/.test(node.field('declarator')?.text() ?? '')).map(witness);
    const optionalWindowsRule = stbImplementationRules.filter(row => /stbi_convert_wchar_to_utf8/.test(row.expression));
    assert(optionalWindowsRule.length >= 2, 'All-branch optional Windows declaration and definition required');
    const filesReport = [
      { path: base + 'EXWebGLMethods.cpp', sourceSha256: hash(files.get('EXWebGLMethods.cpp')), sourceEnumerationAccepted: true,
        disposition: 'SOURCE_ENUMERATION_ACCEPTED_WITH_COMPLETE_MACRO_DECLARATION_IMPLEMENTATION_AND_REGISTRATION_PROOF',
        sourceText: files.get('EXWebGLMethods.cpp'), ast: cpp.ast, rawLexer: cpp.rawLexer, macroRules: cpp.macros, macroBindings, diagnosticCoverage,
        sourceConditions: cpp.sourceConditions, publicHeader: { path: base + 'EXWebGLMethods.h', sourceText: files.get('EXWebGLMethods.h'), projection: headerProjection, expandedSource: headerSource, ast: flatten(headerRoot, headerSource), declarations },
        registrationConsumer: { path: base + 'EXWebGLRenderer.cpp', sourceText: files.get('EXWebGLRenderer.cpp'), projection: rendererProjection, expandedSource: rendererSource, ast: flatten(rendererRoot, rendererSource), registrations } },
      { path: base + 'stb_image.h', sourceSha256: hash(stbSource), sourceEnumerationAccepted: true,
        disposition: 'SOURCE_ENUMERATION_ACCEPTED_WITH_ALL_BRANCH_PUBLIC_HEADER_AND_COMPLETE_CLANG_IMPLEMENTATION_AST',
        sourceText: stbSource, ast: flatten(rawStbRoot, stbSource), publicHeader: stb, implementation: { clangArgs, clangAst, defaultPublicFunctions: clangFunctions.map(node => ({ id: node.id, name: node.name, type: node.type, loc: node.loc, range: node.range, hasBody: node.inner?.some(child => child.kind === 'CompoundStmt') })),
          missingDefaultSymbols, optionalWindowsRule, consumedProfile: { macros: ['STB_IMAGE_IMPLEMENTATION', 'STBI_ONLY_JPEG', 'STBI_ONLY_PNG'], language: 'c++', clangArgs: consumedClangArgs, clangAst: consumedAst }, sourceConditions: rawStbNodes.filter(node => node.kind().startsWith('preproc_')).map(witness) },
        consumers: { path: base + 'EXGLImageUtils.cpp', sourceText: files.get('EXGLImageUtils.cpp'), ast: flatten(imageRoot, files.get('EXGLImageUtils.cpp')), calls: imageCalls,
          decoderMacros: imageNodes.filter(node => node.kind() === 'preproc_def').map(witness), include: imageNodes.filter(node => node.kind() === 'preproc_include' && node.text().includes('stb_image.h')).map(witness) },
        originalDiagnosticCount: rawStbNodes.filter(node => node.kind() === 'ERROR').length },
    ];
    const parts = [], output = { schemaVersion: 1, source: { revision, tree }, receipts, parser: clangProvenance,
      inputTools: ['scripts/sdk54/native-vendor-impact.mjs', 'scripts/sdk54/m0-native-parser.mjs'].map(file => ({ path: file, sha256: hash(fs.readFileSync(file)) })),
      policy: { sourceEnumerationOnly: true, platformSupportAccepted: false, nativeCompilationAccepted: false, optionalSymbolAvailabilityAccepted: false }, files: [] };
    for (const file of filesReport) {
      const bytes = gzipSync(Buffer.from(JSON.stringify(file)), { level: 9 }), digest = hash(bytes), shard = `native-vendor-impact-parts/${digest}.json.gz`;
      parts.push({ shard, bytes, file });
      output.files.push({ path: file.path, sourceSha256: file.sourceSha256, sourceEnumerationAccepted: true, disposition: file.disposition, shard, sha256: digest,
        factCount: file.ast.length, publicDeclarations: file.macroBindings?.length ?? file.publicHeader.functions.length, consumers: file.registrationConsumer?.registrations.length ?? file.consumers.calls.length });
    }
    output.summary = { files: 2, sourceEnumerationAccepted: 2, unresolved: 0, macroBindings: macroBindings.length, webglRegistrations: registrations.length, stbPublicDeclarations: stb.functions.length, stbCallbacks: stb.callbacks.length, clangAstNodes: clangNodes.length, clangPublicFunctionNodes: clangFunctions.length };
    fs.mkdirSync(outputDirectory, { recursive: true });
    for (const { shard, bytes, file } of parts) {
      if (check) { const actual = fs.readFileSync(path.join(outputDirectory, shard)); assert.equal(hash(actual), hash(bytes), `Vendor part ${file.path}`); assert(validateVendorImpact(JSON.parse(gunzipSync(actual)), file).valid); }
      else { fs.mkdirSync(path.dirname(path.join(outputDirectory, shard)), { recursive: true }); fs.writeFileSync(path.join(outputDirectory, shard), bytes); }
    }
    const destination = path.join(outputDirectory, 'native-vendor-impact.json');
    if (check) assert.equal(canonical(JSON.parse(fs.readFileSync(destination))), canonical(output), 'Vendor impact reconstruction mismatch');
    else fs.writeFileSync(destination, JSON.stringify(output, null, 2) + '\n');
    return output;
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
  try { console.log(JSON.stringify((await buildVendorImpact({ outputDirectory: option('--output', 'outputs/sdk54/ai-e2e/20261027-m0-final-closure'), check: args.includes('--check') })).summary)); }
  catch (error) { console.error(error.stack); process.exitCode = 1; }
}
