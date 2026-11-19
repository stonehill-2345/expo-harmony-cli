import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { analyzeScriptSource } from './m0-source-semantics.mjs';
import { parseGroovySource } from './m0-native-parser.mjs';

const require = createRequire(import.meta.url);
const sha = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value, (_, child) => child && typeof child === 'object' && !Array.isArray(child)
  ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => a.localeCompare(b))) : child);
const revision = '5b42e3d21e0ac5e086752361ca8a5cb4de53bec1';
const tree = '5457e824b21d968e55c8f533cdf1751860160a92';
const censusSha256 = '42a1b8b584d042e29952f83a4f1b1c90fe49204a76cd41bfaa62f3658d3653e2';
let bashRuntime, javaRuntime;
const toolingRoot = fileURLToPath(new URL('../../.tmp/sdk54/tooling/', import.meta.url));
const cmakeRoot = process.env.SDK54_CMAKELANG_ROOT ?? path.join(toolingRoot, 'cmakelang');
const proguardJar = process.env.SDK54_PROGUARD_JAR ?? path.join(toolingRoot, 'proguard.jar');
const shfmtPath = process.env.SDK54_SHFMT ?? path.join(toolingRoot, 'shfmt');

const cmakeHelper = String.raw`
import sys,json,os,hashlib
import cmakelang,cmakelang.lex,cmakelang.parse
text=sys.stdin.read()
tokens=cmakelang.lex.tokenize(text)
tree=cmakelang.parse.parse(list(tokens))
lines=text.splitlines(keepends=True)
starts=[0]
for line in lines: starts.append(starts[-1]+len(line))
def offset(point): return starts[point.line-1]+point.col
def token(row): return dict(type=row.type.name,spelling=row.spelling,start=offset(row.begin),end=offset(row.end),line=row.begin.line,endLine=row.end.line)
def node(row):
  if isinstance(row,cmakelang.lex.Token): return dict(token=token(row))
  ts=row.get_tokens()
  return dict(type=row.node_type.name,name=row.get_funname() if hasattr(row,'get_funname') else None,start=offset(ts[0].begin) if ts else 0,end=offset(ts[-1].end) if ts else 0,children=[node(child) for child in row.children])
receipts=[]
for directory,_,files in os.walk(os.path.dirname(cmakelang.__file__)):
  for name in sorted(files):
    if name.endswith('.py'):
      file=os.path.join(directory,name)
      receipts.append(dict(path=os.path.relpath(file,os.path.dirname(cmakelang.__file__)),sha256=hashlib.sha256(open(file,'rb').read()).hexdigest()))
print(json.dumps(dict(tree=node(tree),tokens=[token(row) for row in tokens],parser=dict(engine='cmakelang',version='0.6.13',sources=sorted(receipts,key=lambda row:row['path'])))))
`;

const javaHelper = String.raw`
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.lang.reflect.*;
import java.util.*;
import proguard.*;
public class M0BuildSyntax {
  static Object map(Object... values) { Map<String,Object> out=new TreeMap<>(); for(int i=0;i<values.length;i+=2)out.put((String)values[i],values[i+1]);return out; }
  static String json(Object value) throws Exception {
    if(value==null)return "null";
    if(value instanceof String || value instanceof File){String s=value.toString();StringBuilder b=new StringBuilder("\"");for(char c:s.toCharArray()){if(c=='"'||c=='\\')b.append('\\').append(c);else if(c<32)b.append(String.format("\\u%04x",(int)c));else b.append(c);}return b.append('"').toString();}
    if(value instanceof Number || value instanceof Boolean)return value.toString();
    if(value instanceof Map){List<String> out=new ArrayList<>();for(Object item:((Map<?,?>)value).entrySet()){Map.Entry<?,?> entry=(Map.Entry<?,?>)item;out.add(json(entry.getKey().toString())+":"+json(entry.getValue()));}return "{"+String.join(",",out)+"}";}
    if(value instanceof Iterable){List<String> out=new ArrayList<>();for(Object child:(Iterable<?>)value)out.add(json(child));return "["+String.join(",",out)+"]";}
    Map<String,Object> out=new TreeMap<>();for(Field field:value.getClass().getFields())if(!Modifier.isStatic(field.getModifiers()))out.put(field.getName(),field.get(value));return json(out);
  }
  static class OrderedProperties extends Properties {
    List<Object> assignments=new ArrayList<>();
    public synchronized Object put(Object key,Object value){assignments.add(map("key",key,"value",value));return super.put(key,value);}
  }
  static class SafeReader extends LineWordReader {
    SafeReader(String source)throws IOException{super(new LineNumberReader(new StringReader(source)),"fixed-source",new File("/__sdk54_fixed_source__"));}
    public void includeWordReader(WordReader reader){throw new IllegalArgumentException("External ProGuard includes require fixed-source resolution");}
  }
  public static void main(String[] args)throws Exception {
    byte[] bytes=System.in.readAllBytes();
    if(args[0].equals("properties")){
      OrderedProperties values=new OrderedProperties();values.load(new ByteArrayInputStream(bytes));
      Map<String,String> effective=new TreeMap<>();for(String key:values.stringPropertyNames())effective.put(key,values.getProperty(key));
      System.out.print(json(map("assignments",values.assignments,"effective",effective)));return;
    }
    String source=new String(bytes,StandardCharsets.UTF_8);
    List<Object> tokens=new ArrayList<>();SafeReader reader=new SafeReader(source);String word;int braces=0;String previous="";
    while((word=reader.nextWord(false,false))!=null){tokens.add(map("value",word,"location",reader.locationDescription()));
      if(word.startsWith("-") && word.length()>1 && "-include".startsWith(word))throw new IllegalArgumentException("Unresolved ProGuard include directive");
      if(word.equals("@") && braces==0 && !(previous.startsWith("-keep") || previous.equals("allowobfuscation") || previous.equals("allowoptimization") || previous.equals("allowshrinking")))throw new IllegalArgumentException("Unresolved ProGuard @file include");
      if(word.equals("{"))braces++;if(word.equals("}"))braces--;previous=word;
    }
    reader.close();
    Configuration config=new Configuration();ConfigurationParser parser=new ConfigurationParser(new SafeReader(source),new Properties());parser.parse(config);parser.close();
    System.out.print(json(map("tokens",tokens,"configuration",config)));
  }
}
`;

async function getBash() {
  if (bashRuntime) return bashRuntime;
  const runtime = await import('web-tree-sitter');
  await runtime.Parser.init();
  const grammarPath = process.env.SDK54_BASH_WASM ?? '/Applications/Visual Studio Code.app/Contents/Resources/app/node_modules.asar.unpacked/@vscode/tree-sitter-wasm/wasm/tree-sitter-bash.wasm';
  const parser = new runtime.Parser(); parser.setLanguage(await runtime.Language.load(grammarPath));
  const runtimePath = require.resolve('web-tree-sitter');
  bashRuntime = { parser, provenance: { engine: 'tree-sitter-bash', runtimeVersion: '0.25.10',
    runtimeSha256: sha(fs.readFileSync(runtimePath)), runtimeWasmSha256: sha(fs.readFileSync(path.join(path.dirname(runtimePath), 'tree-sitter.wasm'))),
    grammarPath, grammarSha256: sha(fs.readFileSync(grammarPath)), grammarAbi: parser.language.abiVersion } };
  return bashRuntime;
}

function getJava() {
  if (javaRuntime) return javaRuntime;
  const javaVersion = execFileSync('java', ['--version'], { encoding: 'utf8' }).trim(), jarSha256 = sha(fs.readFileSync(proguardJar));
  const sourceSha256 = sha(javaHelper), key = sha(canonical({ sourceSha256, javaVersion, jarSha256 }));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-build-java-'));
  fs.writeFileSync(path.join(directory, 'M0BuildSyntax.java'), javaHelper, { mode: 0o600, flag: 'wx' });
  execFileSync('javac', ['-proc:none', '-cp', proguardJar, '-d', directory, path.join(directory, 'M0BuildSyntax.java')], { maxBuffer: 8 * 1024 * 1024 });
  const classes = fs.readdirSync(directory).filter(file => file.endsWith('.class')).sort().map(file => ({ path: file, sha256: sha(fs.readFileSync(path.join(directory, file))) }));
  javaRuntime = { classpath: directory + path.delimiter + proguardJar,
    provenance: { engine: 'java.util.Properties / ProGuard.ConfigurationParser', javaVersion, sourceSha256, jarSha256, key, classes } };
  process.once('exit', () => fs.rmSync(directory, { recursive: true, force: true }));
  return javaRuntime;
}

function factCategory(type) {
  return /if|else|case|test|condition|FLOW_CONTROL/.test(type) ? 'BUILD_CONDITION'
    : /function|macro/.test(type) ? 'BUILD_FUNCTION'
      : /for|while|until/.test(type) ? 'BUILD_LOOP'
        : /assignment|set|option/.test(type) ? 'BUILD_ASSIGNMENT'
          : /expansion|substitution/.test(type) ? 'BUILD_EXPANSION'
            : /command|STATEMENT/.test(type) ? 'BUILD_CALL' : 'BUILD_SYNTAX';
}

export function selectBuildSources(census) {
  return census.files.filter(row => row.type === 'blob' && row.mode !== '120000' &&
    (/(?:CMakeLists\.txt|\.cmake|\.properties|\.pro|\.sh)$/.test(row.path) || !path.posix.extname(row.path) && row.mode === '100755'));
}

export async function analyzeBuildSource({ path: file, content }) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content), text = bytes.toString('utf8');
  const result = { path: file, sourceSha256: sha(bytes), sourceByteLength: bytes.length, language: null, parser: null,
    facts: [], boundaries: [], consumers: [], platformSupportAccepted: false, buildExecuted: false };
  const add = ({ kind, name, expression, start = 0, end = text.length, pointer, ...details }) => {
    const category = kind;
    const fact = { id: `BUILD-SOURCE:${encodeURIComponent(file)}:${result.facts.length}`, path: file, kind, category, name,
      ...(pointer !== undefined ? { pointer } : {}), start, end, line: text.slice(0, start).split('\n').length,
      details: { expression, expressionSha256: sha(expression), ...details } };
    result.facts.push(fact); return fact;
  };
  const block = (kind, reason) => result.boundaries.push({ kind, reason, severity: 'SOURCE_ENUMERATION_BLOCKER' });
  try {
    const magic = bytes.subarray(0, 4).toString('hex');
    if (['cafebabe', 'bebafeca', 'feedface', 'cefaedfe', 'feedfacf', 'cffaedfe'].includes(magic)) {
      result.language = 'mach-o'; result.parser = { engine: 'Mach-O magic/byte identity', execution: false };
      result.binary = { magic, sha256: sha(bytes), byteLength: bytes.length };
      add({ kind: 'COMPILED_BUILD_ARTIFACT', name: path.posix.basename(file), expression: magic, start: 0, end: 4, byteRange: true });
      result.boundaries.push({ kind: 'COMPILED_BINARY_NO_SOURCE_API_CLAIM', severity: 'DOWNSTREAM_IMPLEMENTATION_BOUNDARY', reason: 'Fixed compiled artifact identity retained; binary export reconstruction and Harmony compatibility are not claimed.' });
    } else if (/(?:CMakeLists\.txt|\.cmake)$/.test(file)) {
      result.language = 'cmake';
      const parsed = JSON.parse(execFileSync('python3', ['-c', cmakeHelper], { input: text, encoding: 'utf8', env: { ...process.env, PYTHONPATH: cmakeRoot }, stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 }));
      result.parser = { ...parsed.parser, helperSha256: sha(cmakeHelper), execution: false };
      result.model = parsed;
      const codepoints = [...text], cpToUtf16 = [0];
      for (const cp of codepoints) cpToUtf16.push(cpToUtf16.at(-1) + cp.length);
      const visit = (node, parentId = null) => {
        const start = cpToUtf16[node.start ?? node.token?.start ?? 0], end = cpToUtf16[node.end ?? node.token?.end ?? 0];
        const type = node.type ?? `TOKEN:${node.token.type}`, name = node.name ?? type;
        const fact = add({ kind: factCategory(name === type ? type : name === 'if' || name === 'elseif' ? 'condition' : name), name,
          expression: text.slice(start, end), start, end, nodeType: type, parentId });
        for (const child of node.children ?? []) visit(child, fact.id);
      };
      visit(parsed.tree);
    } else if (/\.(?:properties|pro)$/.test(file)) {
      const format = file.endsWith('.pro') ? 'proguard' : 'properties', runtime = getJava();
      result.language = format; result.parser = runtime.provenance;
      result.model = JSON.parse(execFileSync('java', ['-cp', runtime.classpath, 'M0BuildSyntax', format], { input: bytes, encoding: 'utf8', stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 }));
      const visit = (value, pointer = '') => {
        add({ kind: format === 'properties' ? 'BUILD_PROPERTY' : 'PROGUARD_CONFIGURATION', name: pointer || format, pointer,
          expression: text, value, precision: 'WHOLE_DOCUMENT_WITH_EXACT_STRUCTURED_POINTER' });
        if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) visit(child, `${pointer}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`);
      };
      visit(result.model);
    } else if (/^#![^\n]*\bnode\b/.test(text)) {
      result.language = 'javascript';
      const parsed = analyzeScriptSource({ path: file, content: text }); result.parser = parsed.parser;
      result.boundaries.push(...parsed.boundaries.map(row => ({ ...row, severity: row.disposition === 'SOURCE_ENUMERATION_BLOCKER' ? 'SOURCE_ENUMERATION_BLOCKER' : 'DOWNSTREAM_IMPLEMENTATION_BOUNDARY' })));
      result.facts = parsed.facts.map(row => ({ ...row, kind: row.kind === 'CALL_SITE' ? 'BUILD_CALL' : row.kind, category: row.kind,
        details: { ...row.details, expression: row.details.expression ?? text.slice(row.start, row.end) } }));
    } else if (/\.sh$/.test(file) || /^#![^\n]*\b(?:ba|z|k)?sh\b/.test(text)) {
      result.language = 'shell'; const runtime = await getBash(); result.parser = runtime.provenance;
      const ast = runtime.parser.parse(text);
      try {
        const visit = (node, parentId = null) => {
          const kind = factCategory(node.type), fact = add({ kind, name: node.childForFieldName('name')?.text ?? node.type,
            expression: node.text, start: node.startIndex, end: node.endIndex, nodeType: node.type, parentId,
            fields: Object.fromEntries(node.namedChildren.map((child, i) => [String(i), { type: child.type, field: node.fieldNameForNamedChild(i) }])) });
          if (node.type === 'ERROR' || node.isMissing) block('SHELL_PARSE_ERROR', `${node.type} at ${node.startPosition.row + 1}:${node.startPosition.column}`);
          for (const child of node.namedChildren) visit(child, fact.id);
        };
        visit(ast.rootNode);
        if (ast.rootNode.hasError && !result.boundaries.length) block('SHELL_PARSE_ERROR', 'Bash grammar reported an error.');
      } finally { ast.delete(); }
      if (result.boundaries.some(row => row.severity === 'SOURCE_ENUMERATION_BLOCKER')) {
        const model = JSON.parse(execFileSync(shfmtPath, ['--to-json', '--language-dialect', 'bash'], { input: bytes, encoding: 'utf8', stdio: 'pipe', maxBuffer: 128 * 1024 * 1024 }));
        result.model = model;
        result.parser = { ...result.parser, fallback: { engine: 'mvdan.cc/sh/v3/syntax', version: execFileSync(shfmtPath, ['--version'], { encoding: 'utf8' }).trim(),
          binarySha256: sha(fs.readFileSync(shfmtPath)), invocation: ['--to-json', '--language-dialect', 'bash'], sourceExecuted: false } };
        for (const boundary of result.boundaries) {
          boundary.severity = 'PARSER_LIMITATION_RESOLVED_BY_MVDAN_AST';
          boundary.resolution = 'Complete alternate mature AST retained; original tree-sitter error nodes retained.';
        }
        const visit = (value, pointer = '', parentId = null) => {
          if (!value || typeof value !== 'object') return;
          if (Array.isArray(value)) { value.forEach((child, index) => visit(child, `${pointer}/${index}`, parentId)); return; }
          let nextParent = parentId;
          if (value.Pos && value.End) {
            const startByte = value.Pos.Offset, endByte = value.End.Offset, expression = bytes.subarray(startByte, endByte).toString('utf8');
            const type = value.Type ?? pointer.split('/').at(-1), kind = /ForClause|WhileClause/.test(type) ? 'BUILD_LOOP'
              : /IfClause|CaseClause|TestClause/.test(type) ? 'BUILD_CONDITION' : /CallExpr/.test(type) ? 'BUILD_CALL'
                : /FuncDecl/.test(type) ? 'BUILD_FUNCTION' : /Assign/.test(type) ? 'BUILD_ASSIGNMENT'
                  : /ParamExp|CmdSubst|ArithmExp/.test(type) ? 'BUILD_EXPANSION' : 'BUILD_SYNTAX';
            const start = bytes.subarray(0, startByte).toString('utf8').length, end = start + expression.length;
            nextParent = add({ kind, name: type, expression, start, end, pointer, nodeType: `mvdan:${type}`, parentId, startByte, endByte }).id;
          }
          for (const [key, child] of Object.entries(value)) if (!['Pos', 'End'].includes(key)) visit(child, `${pointer}/${key}`, nextParent);
        };
        visit(model);
      }
    } else block('UNSUPPORTED_BUILD_SOURCE', 'No verified parser for this executable format/shebang; fixed source identity retained.');
  } catch (error) { block('BUILD_SOURCE_PARSE_ERROR', error.stderr?.toString().trim() || error.message); }
  result.blockerCount = result.boundaries.filter(row => row.severity === 'SOURCE_ENUMERATION_BLOCKER').length;
  result.coverage = result.blockerCount ? 'SOURCE_ENUMERATION_BLOCKED' : 'BUILD_SOURCE_ENUMERATED';
  return result;
}

export function validateBuildSource(actual, expected) {
  const valid = canonical(actual) === canonical(expected);
  return { valid, failures: valid ? [] : [`Missing or changed build source identity/semantic facts: ${expected.path}`] };
}

export async function buildConsumerBindings(files) {
  const bindings = [], targetPaths = new Set([...files.keys()].filter(file => /(?:CMakeLists\.txt|\.cmake|\.properties|\.pro|\.sh)$/.test(file) || !path.posix.extname(file)));
  const content = file => Buffer.isBuffer(files.get(file)) ? files.get(file).toString('utf8') : files.get(file);
  const add = (sourcePath, targetPath, kind, expression, locator, extra = {}) => {
    if (!files.has(targetPath)) return;
    bindings.push({ id: `BUILD-CONSUMER:${bindings.length}`, sourcePath, sourceSha256: sha(files.get(sourcePath)),
      targetPath, targetSha256: sha(files.get(targetPath)), kind, expression, expressionSha256: sha(expression), locator, buildExecuted: false, ...extra });
  };
  const commandBindings = async (sourcePath, command, kind, directory, locator) => {
    const runtime = await getBash(), ast = runtime.parser.parse(command);
    try {
      const visit = node => {
        if (node.type === 'command') {
          const name = node.childForFieldName('name')?.text;
          if (name && !/[\$`*?{]/.test(name)) {
            const literal = name.replace(/^['"]|['"]$/g, '');
            const target = path.posix.normalize(path.posix.join(directory, literal));
            if (literal.includes('/') && targetPaths.has(target)) add(sourcePath, target, kind, node.text, { ...locator, commandStart: node.startIndex, commandEnd: node.endIndex });
          }
        }
        for (const child of node.namedChildren) visit(child);
      };
      if (!ast.rootNode.hasError) visit(ast.rootNode);
    } finally { ast.delete(); }
  };
  for (const [file] of files) {
    if (path.posix.basename(file) === 'package.json') {
      let json; try { json = JSON.parse(content(file)); } catch { continue; }
      const directory = path.posix.dirname(file), bins = typeof json.bin === 'string' ? [['', json.bin]] : Object.entries(json.bin ?? {});
      for (const [name, target] of bins) if (typeof target === 'string') add(file, path.posix.normalize(path.posix.join(directory, target)), 'PACKAGE_BIN', target, { pointer: name ? `/bin/${name}` : '/bin' });
      for (const [name, command] of Object.entries(json.scripts ?? {})) if (typeof command === 'string') await commandBindings(file, command, 'PACKAGE_SCRIPT_COMMAND', directory, { pointer: `/scripts/${name}` });
    } else if (/\.gradle$/.test(file)) {
      // Use compiler conversion rather than interpreting or evaluating the Gradle DSL.
      if (/(?:CMakeLists\.txt|\.cmake|\.pro|\.properties|\.sh)['"]/.test(content(file))) {
        const parsed = parseGroovySource(content(file)), calls = parsed.records.filter(row => row.syntaxKind === 'MethodCallExpression');
        assert.equal(parsed.diagnostics.length, 0, `Consumer Gradle parse ${file}`);
        for (const call of calls) {
          const cmakeContext = calls.some(row => row.callee === 'cmake' && row.expression.includes(call.expression));
          if (!/^(?:consumerProguardFiles|proguardFiles|proguardFile)$/.test(call.callee ?? '') && !(call.callee === 'path' && cmakeContext)) continue;
          for (const argument of call.arguments ?? []) {
            const match = /^(['"])([^'"\\\n\r$]*)\1$/.exec(argument);
            if (!match) continue;
            const literal = match[2], target = path.posix.normalize(path.posix.join(path.posix.dirname(file), literal));
            if (targetPaths.has(target)) add(file, target, 'GRADLE_BUILD_FILE_REFERENCE', call.expression,
              { line: call.line, endLine: call.endLine, stringExpression: argument },
              { resolution: 'EXACT_PROJECT_RELATIVE_LITERAL_WITH_BUILD_DSL_CALL_CONTEXT', parser: parsed.provenance, callee: call.callee, cmakeContext });
          }
        }
      }
      const props = path.posix.join(path.posix.dirname(file), 'gradle.properties');
      if (/\/(?:build|settings)\.gradle$/.test(file)) add(file, props, 'GRADLE_PROJECT_PROPERTIES_CONVENTION', 'Gradle project-directory gradle.properties loading convention', { sourceFile: file, convention: 'PROJECT_DIRECTORY_PROPERTIES' });
    } else if (/\.sh$/.test(file) || /^#![^\n]*\b(?:ba)?sh\b/.test(content(file).slice(0, 200))) {
      await commandBindings(file, content(file), 'SHELL_SOURCE_RELATIVE_COMMAND_CANDIDATE', path.posix.dirname(file), { workingDirectory: 'SOURCE_DIRECTORY_CANDIDATE_NOT_RUNTIME_CWD_PROOF' });
    }
  }
  return bindings.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath) || a.targetPath.localeCompare(b.targetPath) || a.expression.localeCompare(b.expression)).map((row, index) => ({ ...row, id: `BUILD-CONSUMER:${index}` }));
}

export async function buildFixedBuildIndex({ source = '/tmp/sdk54-expo-source', censusFile, outputDirectory, check = false }) {
  const censusBytes = fs.readFileSync(censusFile); assert.equal(sha(censusBytes), censusSha256, 'Fixed census hash');
  const census = JSON.parse(censusBytes), rows = selectBuildSources(census);
  const git = args => execFileSync('git', ['-C', source, ...args], { env: { ...process.env, GIT_NO_LAZY_FETCH: '1' }, maxBuffer: 256 * 1024 * 1024 });
  assert.equal(git(['rev-parse', `${revision}^{tree}`]).toString().trim(), tree, 'Fixed Git tree');
  const entries = new Map(git(['ls-tree', '-r', '-z', revision]).toString().split('\0').filter(Boolean).map(line => { const [metadata, file] = line.split('\t'); const [mode, type, oid] = metadata.split(' '); return [file, { mode, type, oid }]; }));
  const files = new Map(), receipts = [];
  // Read every possible text consumer from the fixed tree, independent of ownership or directory scope.
  const paths = new Set([...rows.map(row => row.path), ...[...entries.keys()].filter(file => /(?:package\.json|\.gradle|\.sh)$/.test(file))]);
  for (const file of [...paths].sort()) {
    const entry = entries.get(file); assert(entry && entry.type === 'blob' && entry.mode !== '120000', `Fixed input ${file}`);
    const bytes = git(['cat-file', 'blob', entry.oid]); files.set(file, bytes);
    receipts.push({ path: file, blob: entry.oid, sha256: sha(bytes) });
  }
  const consumers = await buildConsumerBindings(files), artifacts = [];
  for (const row of rows) {
    const bytes = files.get(row.path), entry = entries.get(row.path);
    assert.equal(entry.oid, row.oid, `Census blob ${row.path}`); assert.equal(sha(bytes), row.sha256, `Census hash ${row.path}`);
    const artifact = await analyzeBuildSource({ path: row.path, content: bytes });
    artifact.sourceId = row.id; artifact.ownerId = row.ownerId; artifact.capabilityIds = row.capabilityIds;
    artifact.source = { revision, tree, blob: row.oid, sha256: row.sha256, mode: row.mode };
    artifact.consumers = consumers.filter(binding => binding.targetPath === row.path);
    artifact.boundaries.push({ kind: artifact.consumers.length ? 'CONSUMER_CONTEXT_STATIC_ONLY' : 'NO_EXACT_CONSUMER_LOCATOR_PROVED', severity: 'DOWNSTREAM_IMPLEMENTATION_BOUNDARY',
      reason: artifact.consumers.length ? 'Static source witnesses retained; execution, runtime cwd, conditional reachability and Harmony behavior are not asserted.' : 'Complete source is enumerated; dynamic or external consumers require downstream implementation evidence.' });
    artifacts.push(artifact);
  }
  const index = { schemaVersion: 1, source: { revision, tree, censusSha256 }, selection: 'ALL_FIXED_NON_SYMLINK_CMAKE_PROPERTIES_PROGUARD_SHELL_AND_EXTENSIONLESS_EXECUTABLES',
    policy: { sourceEnumeratedDoesNotMeanHarmonySupported: true, platformSupportAccepted: false, buildExecuted: false },
    toolSourceSha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))), receipts, files: [], summary: {} };
  for (const artifact of artifacts) {
    const bytes = gzipSync(Buffer.from(JSON.stringify(artifact)), { level: 9 }), digest = sha(bytes), shard = `build-source-parts/${digest}.json.gz`;
    index.files.push({ id: artifact.sourceId, path: artifact.path, sourceSha256: artifact.sourceSha256, shard, sha256: digest, factCount: artifact.facts.length, blockerCount: artifact.blockerCount, consumerCount: artifact.consumers.length, language: artifact.language });
    if (!check) { fs.mkdirSync(path.join(outputDirectory, 'build-source-parts'), { recursive: true }); fs.writeFileSync(path.join(outputDirectory, shard), bytes); }
    else {
      const actualBytes = fs.readFileSync(path.join(outputDirectory, shard)); assert.equal(sha(actualBytes), digest, `Build artifact ${artifact.path}`);
      assert(validateBuildSource(JSON.parse(gunzipSync(actualBytes)), artifact).valid, `Build semantic reconstruction ${artifact.path}`);
    }
  }
  index.summary = { files: rows.length, facts: index.files.reduce((n, row) => n + row.factCount, 0), blockers: index.files.reduce((n, row) => n + row.blockerCount, 0),
    consumers: consumers.length, filesWithConsumers: index.files.filter(row => row.consumerCount).length,
    languages: Object.fromEntries([...new Set(index.files.map(row => row.language))].sort().map(language => [language, index.files.filter(row => row.language === language).length])),
    conclusion: index.files.some(row => row.blockerCount) ? 'BUILD_SOURCE_ENUMERATION_BLOCKED' : 'BUILD_SOURCE_ENUMERATED_WITH_EXPLICIT_DOWNSTREAM_BOUNDARIES' };
  const indexFile = path.join(outputDirectory, 'build-source-index.json');
  if (check) assert.equal(canonical(JSON.parse(fs.readFileSync(indexFile))), canonical(index), 'Build index reconstruction mismatch');
  else fs.writeFileSync(indexFile, JSON.stringify(index, null, 2) + '\n');
  return index;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
  try {
    const result = await buildFixedBuildIndex({ source: option('--source', '/tmp/sdk54-expo-source'),
      censusFile: option('--census', 'outputs/sdk54/ai-e2e/20261027-m0-source-census/source-census.json'),
      outputDirectory: option('--output', 'outputs/sdk54/ai-e2e/20261027-m0-final-closure'), check: args.includes('--check') });
    console.log(JSON.stringify(result.summary));
    if (result.summary.blockers) process.exitCode = 1;
  } catch (error) { console.error(error.stack); process.exitCode = 1; }
}
