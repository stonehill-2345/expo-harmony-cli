import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { registerDynamicLanguage } from '@ast-grep/napi';
import java from '@ast-grep/lang-java';
import ruby from '@ast-grep/lang-ruby';

const require = createRequire(import.meta.url);
const grammarPackages = Object.freeze({
  'tree-sitter-objc': require.resolve('tree-sitter-objc/package.json'),
  'tree-sitter-kotlin': require.resolve('tree-sitter-kotlin/package.json'),
  'tree-sitter-swift': require.resolve('tree-sitter-swift/package.json'),
  'tree-sitter-groovy': require.resolve('tree-sitter-groovy/package.json'),
  'tree-sitter-c': require.resolve('tree-sitter-c/package.json'),
  'tree-sitter-cpp': require.resolve('tree-sitter-cpp/package.json'),
});
const sha = value => createHash('sha256').update(value).digest('hex');
let provenance;
let swiftFrontend;
let kotlinFrontend;
let groovyFrontend;

export function parseGroovySource(content) {
  if (!groovyFrontend) {
    const lib = process.env.SDK54_GROOVY_LIB ?? path.join(os.homedir(), '.gradle/wrapper/dists/gradle-8.14.3-bin/cv11ve7ro1n3o1j4so8xd9n66/gradle-8.14.3/lib');
    const jars = ['groovy-3.0.24.jar', 'groovy-json-3.0.24.jar'].map(name => ({ name, sha256: sha(fs.readFileSync(path.join(lib, name))) }));
    const script = new URL('./m0-groovy-syntax.groovy', import.meta.url);
    groovyFrontend = { script: script.pathname, classpath: jars.map(({ name }) => path.join(lib, name)).join(path.delimiter), metadata: { engine: 'GroovyCompiler/AST', sourceSha256: sha(fs.readFileSync(script)), jars, javaVersion: execFileSync('java', ['--version'], { encoding: 'utf8' }).trim(), phases: ['PARSING', 'CONVERSION'] } };
  }
  return { ...JSON.parse(execFileSync('java', ['-cp', groovyFrontend.classpath, 'groovy.ui.GroovyMain', groovyFrontend.script], { input: content, encoding: 'utf8', timeout: 30_000, maxBuffer: 128 * 1024 * 1024 })), provenance: groovyFrontend.metadata };
}

export function parseKotlinSource(content, filename = 'Source.kt') {
  if (!kotlinFrontend) {
    const lib = process.env.SDK54_KOTLIN_LIB ?? '/Applications/Android Studio.app/Contents/plugins/Kotlin/kotlinc/lib';
    const jars = ['kotlin-compiler.jar', 'kotlin-stdlib.jar', 'kotlinx-coroutines-core-jvm.jar', 'annotations-13.0.jar'].map(name => ({ name, sha256: sha(fs.readFileSync(path.join(lib, name))) }));
    const source = new URL('./M0KotlinSyntax.java', import.meta.url);
    const sourceSha256 = sha(fs.readFileSync(source));
    const javaVersion = execFileSync('java', ['--version'], { encoding: 'utf8' }).trim();
    const sourceHash = sha(JSON.stringify({ sourceSha256, jars, javaVersion }));
    const cache = path.join(os.tmpdir(), `sdk54-kotlin-psi-${process.getuid?.() ?? 'local'}`, sourceHash);
    fs.mkdirSync(cache, { recursive: true, mode: 0o700 });
    for (const directory of [path.dirname(cache), cache]) {
      const stat = fs.lstatSync(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink() || stat.mode & 0o077 || process.getuid && stat.uid !== process.getuid()) throw new Error('Unsafe Kotlin PSI cache directory.');
    }
    const classFile = path.join(cache, 'M0KotlinSyntax.class'), receiptFile = path.join(cache, 'receipt.json');
    const classpath = jars.map(({ name }) => path.join(lib, name)).join(path.delimiter);
    let receipt;
    if (fs.existsSync(classFile) && fs.existsSync(receiptFile)) {
      for (const file of [classFile, receiptFile]) {
        const stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('Unsafe Kotlin PSI cache file.');
      }
      receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
      if (receipt.sourceHash !== sourceHash || receipt.classSha256 !== sha(fs.readFileSync(classFile))) throw new Error('Kotlin PSI cache integrity mismatch.');
    } else {
      execFileSync('javac', ['-proc:none', '-cp', classpath, '-d', cache, source.pathname], { timeout: 30_000, stdio: 'pipe' });
      receipt = { sourceHash, classSha256: sha(fs.readFileSync(classFile)) };
      fs.writeFileSync(receiptFile, JSON.stringify(receipt), { flag: 'wx', mode: 0o600 });
    }
    kotlinFrontend = { classpath: cache + path.delimiter + classpath, metadata: { engine: 'KotlinCompiler/PSI', sourceSha256, sourceHash, classSha256: receipt.classSha256, javaVersion, jars } };
  }
  return { ...JSON.parse(execFileSync('java', ['-cp', kotlinFrontend.classpath, 'M0KotlinSyntax', path.basename(filename)], { input: content, encoding: 'utf8', timeout: 30_000, maxBuffer: 128 * 1024 * 1024 })), provenance: kotlinFrontend.metadata };
}

export function parseSwiftSource(content) {
  if (!swiftFrontend) {
    const compiler = execFileSync('xcrun', ['--find', 'swiftc'], { encoding: 'utf8' }).trim();
    const sdk = execFileSync('xcrun', ['--show-sdk-path'], { encoding: 'utf8' }).trim();
    const host = path.resolve(path.dirname(compiler), '../lib/swift/host');
    const sourceFile = new URL('./m0-swift-syntax.swift', import.meta.url);
    const sourceSha256 = sha(fs.readFileSync(sourceFile));
    const compilerVersion = execFileSync(compiler, ['--version'], { encoding: 'utf8' }).trim();
    const libraries = ['SwiftSyntax', 'SwiftParser', 'SwiftParserDiagnostics', 'SwiftDiagnostics'].map(name => ({ name, sha256: sha(fs.readFileSync(path.join(host, `lib${name}.dylib`))) }));
    const sourceHash = sha(JSON.stringify({ sourceSha256, compilerVersion, libraries, flags: 'explicit-sdk stable-module-name v2' }));
    const cache = path.join(os.tmpdir(), `sdk54-swift-syntax-${process.getuid?.() ?? 'local'}`, sourceHash);
    fs.mkdirSync(cache, { mode: 0o700, recursive: true });
    for (const directory of [path.dirname(cache), cache]) {
      const stat = fs.lstatSync(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink() || stat.mode & 0o077 || process.getuid && stat.uid !== process.getuid()) throw new Error('Unsafe SwiftSyntax cache directory.');
    }
    const executable = path.join(cache, 'swift-syntax'), receiptFile = path.join(cache, 'receipt.json');
    let receipt;
    if (fs.existsSync(executable) && fs.existsSync(receiptFile)) {
      for (const file of [executable, receiptFile]) {
        const stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('Unsafe SwiftSyntax cache file.');
      }
      receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
      if (receipt.sourceHash !== sourceHash || receipt.binarySha256 !== sha(fs.readFileSync(executable))) throw new Error('SwiftSyntax cache integrity mismatch.');
    } else {
      const build = fs.mkdtempSync(path.join(cache, 'build-'));
      const binary = path.join(build, 'swift-syntax');
      execFileSync(compiler, ['-sdk', sdk, '-I', host, '-L', host, ...libraries.map(({ name }) => `-l${name}`), '-Xlinker', '-rpath', '-Xlinker', host, '-module-name', 'SDK54SourceSyntax', '-module-cache-path', path.join(build, 'module-cache'), sourceFile.pathname, '-o', binary], { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
      receipt = { sourceHash, binarySha256: sha(fs.readFileSync(binary)) };
      fs.copyFileSync(binary, executable, fs.constants.COPYFILE_EXCL);
      fs.writeFileSync(receiptFile, JSON.stringify(receipt), { flag: 'wx', mode: 0o600 });
      fs.rmSync(build, { recursive: true });
    }
    swiftFrontend = { executable, metadata: { engine: 'SwiftParser/SwiftSyntax', sourceSha256, sourceHash, binarySha256: receipt.binarySha256, compilerVersion, libraries } };
  }
  return { ...JSON.parse(execFileSync(swiftFrontend.executable, [], { input: content, encoding: 'utf8', timeout: 30_000, maxBuffer: 128 * 1024 * 1024 })), provenance: swiftFrontend.metadata };
}

function compileGrammar(packageName, languageSymbol) {
  if (!Object.hasOwn(grammarPackages, packageName)) throw new Error(`Unregistered native grammar: ${packageName}`);
  const grammarRoot = path.dirname(grammarPackages[packageName]);
  const manifest = JSON.parse(fs.readFileSync(path.join(grammarRoot, 'package.json'), 'utf8'));
  const gather = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? gather(path.join(directory, entry.name)) : /\.(?:c|cc|cpp|h)$/.test(entry.name) ? [path.join(directory, entry.name)] : []);
  const sources = gather(path.join(grammarRoot, 'src')).map(file => path.relative(grammarRoot, file)).sort();
  const sourceFiles = sources.map(file => ({ path: file, sha256: sha(fs.readFileSync(path.join(grammarRoot, file))) }));
  const compilerVersion = execFileSync('cc', ['--version'], { encoding: 'utf8' }).split('\n')[0];
  const sourceHash = sha(JSON.stringify({ version: manifest.version, files: sourceFiles, platform: process.platform, arch: process.arch, compilerVersion, flags: '-O2 -fPIC stable-install-name' }));
  const cacheRoot = path.join(os.tmpdir(), `sdk54-native-grammars-${process.getuid?.() ?? 'local'}`);
  fs.mkdirSync(cacheRoot, { mode: 0o700, recursive: true });
  const cacheStat = fs.lstatSync(cacheRoot);
  if (!cacheStat.isDirectory() || cacheStat.isSymbolicLink() || cacheStat.mode & 0o077 || process.getuid && cacheStat.uid !== process.getuid()) throw new Error('Unsafe native grammar cache directory.');
  const cache = path.join(cacheRoot, sourceHash);
  fs.mkdirSync(cache, { mode: 0o700, recursive: true });
  const cacheEntry = fs.lstatSync(cache);
  if (!cacheEntry.isDirectory() || cacheEntry.isSymbolicLink() || cacheEntry.mode & 0o077) throw new Error('Unsafe native grammar cache entry.');
  const libraryPath = path.join(cache, process.platform === 'darwin' ? 'grammar.dylib' : 'grammar.so');
  const receiptPath = path.join(cache, 'receipt.json');
  let receipt;
  if (fs.existsSync(libraryPath) && fs.existsSync(receiptPath)) {
    const stat = fs.lstatSync(libraryPath), receiptStat = fs.lstatSync(receiptPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || !receiptStat.isFile() || receiptStat.isSymbolicLink() || receiptStat.nlink !== 1) throw new Error('Unsafe grammar cache files.');
    receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    if (receipt.sourceHash !== sourceHash || receipt.librarySha256 !== sha(fs.readFileSync(libraryPath))) throw new Error('Grammar cache integrity mismatch.');
  } else {
    const build = fs.mkdtempSync(path.join(cache, 'build-'));
    const compilationUnits = sources.filter(file => /^src\/(?:parser|scanner)\.(?:c|cc|cpp)$/.test(file));
    const objects = compilationUnits.map((file, index) => {
      const object = path.join(build, `${index}.o`), compiler = file.endsWith('.c') ? 'cc' : 'c++';
      execFileSync(compiler, ['-c', '-fPIC', '-O2', '-I', path.join(grammarRoot, 'src'), path.join(grammarRoot, file), '-o', object], { timeout: 120_000, stdio: 'pipe' });
      return object;
    });
    const stableLibraryName = process.platform === 'darwin' ? ['-Wl,-install_name,@rpath/sdk54-native-grammar.dylib'] : ['-Wl,-soname,sdk54-native-grammar.so'];
    const builtLibrary = path.join(build, 'grammar');
    execFileSync(compilationUnits.some(file => !file.endsWith('.c')) ? 'c++' : 'cc', [process.platform === 'darwin' ? '-dynamiclib' : '-shared', ...stableLibraryName, ...objects, '-o', builtLibrary], { timeout: 120_000, stdio: 'pipe' });
    receipt = { sourceHash, librarySha256: sha(fs.readFileSync(builtLibrary)) };
    fs.copyFileSync(builtLibrary, libraryPath, fs.constants.COPYFILE_EXCL);
    fs.writeFileSync(receiptPath, JSON.stringify(receipt), { flag: 'wx', mode: 0o600 });
    fs.rmSync(build, { recursive: true });
  }
  return { registration: { libraryPath, languageSymbol, extensions: [] }, metadata: { package: packageName, version: manifest.version, sourceHash, sourceFiles, librarySha256: receipt.librarySha256, compilerVersion, compilationFlags: ['dynamic-shared-library', '-fPIC', '-O2', 'stable-install-name'] } };
}

export function initializeNativeParsers() {
  if (provenance) return provenance;
  const objc = compileGrammar('tree-sitter-objc', 'tree_sitter_objc');
  const kotlin = compileGrammar('tree-sitter-kotlin', 'tree_sitter_kotlin');
  const swift = compileGrammar('tree-sitter-swift', 'tree_sitter_swift');
  const groovy = compileGrammar('tree-sitter-groovy', 'tree_sitter_groovy');
  const c = compileGrammar('tree-sitter-c', 'tree_sitter_c');
  const cpp = compileGrammar('tree-sitter-cpp', 'tree_sitter_cpp');
  registerDynamicLanguage({ kotlin: kotlin.registration, swift: swift.registration, groovy: groovy.registration, java, c: c.registration, cpp: cpp.registration, ruby, objc: objc.registration });
  provenance = { engine: '@ast-grep/napi', objc: objc.metadata, kotlin: kotlin.metadata, swift: swift.metadata, groovy: groovy.metadata, c: c.metadata, cpp: cpp.metadata, languages: ['kotlin', 'swift', 'java', 'c', 'cpp', 'ruby', 'objc', 'groovy'] };
  return provenance;
}

export function expandSourceAnnotationMacros(macros) {
  if (!macros.length) return new Map();
  const input = macros.map(({ name, value }) => `#define ${name} ${value}\n${name}\n`).join('');
  const expanded = execFileSync('cc', ['-E', '-P', '-x', 'c', '-'], { input, encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
  // Each accepted macro expands to either whitespace or one C storage keyword.
  // Independent preprocessing preserves that finite rule without selecting any
  // conditional source branch or loading external headers.
  const expected = macros.map(({ value }) => value).filter(Boolean);
  if (expanded.trim().split(/\s+/).filter(Boolean).join(' ') !== expected.join(' ')) throw new Error('Unexpected annotation macro expansion.');
  return new Map(macros.map(({ name, value }) => [name, value]));
}

export function preprocessNativeRegistrationSource(content, root, { language = 'objc', allowNoRegistration = false } = {}) {
  const nodes = [];
  const visit = node => { nodes.push(node); for (const child of node.children()) visit(child); };
  visit(root);
  const macros = ['RCT_EXPORT_METHOD', 'RCT_REMAP_METHOD', 'RCT_EXPORT_MODULE', 'RCT_EXPORT_VIEW_PROPERTY', 'RCT_REMAP_VIEW_PROPERTY', 'EX_EXPORT_METHOD_AS', 'EX_EXPORT_MODULE', 'EX_VIEW_PROPERTY'];
  const hasRegistration = nodes.some(node => node.isLeaf() && macros.includes(node.text()) && !node.ancestors().some(parent => ['preproc_def', 'preproc_function_def'].includes(parent.kind())));
  if (!hasRegistration && !allowNoRegistration) return null;
  const directives = new Set(['#if', '#ifdef', '#ifndef', '#elif', '#else', '#endif']);
  const erased = [], conditions = [];
  for (const node of nodes) {
    if (node.isLeaf() && directives.has(node.text())) {
      const condition = node.parent()?.field('condition');
      const start = node.range().start.index;
      let end = content.indexOf('\n', Math.max(node.range().end.index, condition?.range().end.index ?? 0));
      if (end < 0) end = content.length;
      erased.push([start, end]);
      conditions.push({ line: node.range().start.line + 1, endLine: content.slice(0, end).split('\n').length, expression: content.slice(start, end), directive: node.text() });
    }
    if (['preproc_include', 'preproc_def', 'preproc_function_def', 'preproc_call'].includes(node.kind())) erased.push([node.range().start.index, node.range().end.index]);
  }
  let input = content;
  for (const [start, end] of erased.sort((a, b) => b[0] - a[0])) input = input.slice(0, start) + input.slice(start, end).replace(/[^\n]/g, ' ') + input.slice(end);
  const definitions = [
    '#define RCT_EXPORT_METHOD(...) -(void)__VA_ARGS__',
    '#define RCT_REMAP_METHOD(name,...) -(void)__m0_method_marker { __M0_SOURCE_REGISTER__("RCT_REMAP_METHOD",#name,__LINE__); } -(void)__VA_ARGS__',
    '#define RCT_EXPORT_MODULE(...) +(const char*)__m0_module_marker { __M0_SOURCE_REGISTER__("RCT_EXPORT_MODULE",#__VA_ARGS__,__LINE__); return ""; }',
    '#define RCT_EXPORT_VIEW_PROPERTY(name,...) -(void)__m0_prop_marker { __M0_SOURCE_REGISTER__("RCT_EXPORT_VIEW_PROPERTY",#name,__LINE__); }',
    '#define RCT_REMAP_VIEW_PROPERTY(name,...) -(void)__m0_prop_marker { __M0_SOURCE_REGISTER__("RCT_REMAP_VIEW_PROPERTY",#name,__LINE__); }',
    '#define EX_EXPORT_METHOD_AS(name,...) -(void)__m0_method_marker { __M0_SOURCE_REGISTER__("EX_EXPORT_METHOD_AS",#name,__LINE__); } -(void)__VA_ARGS__',
    '#define EX_EXPORT_MODULE(...) +(const char*)__m0_module_marker { __M0_SOURCE_REGISTER__("EX_EXPORT_MODULE",#__VA_ARGS__,__LINE__); return ""; }',
    '#define EX_VIEW_PROPERTY(name,...) -(void)__m0_prop_marker { __M0_SOURCE_REGISTER__("EX_VIEW_PROPERTY",#name,__LINE__); }',
  ];
  if (!hasRegistration && !erased.length) return null;
  const expanded = execFileSync('cc', ['-E', '-undef', '-x', language === 'cpp' ? 'c++' : language === 'c' ? 'c' : 'objective-c', '-'], { input: (hasRegistration ? definitions.join('\n') + '\n' : '') + '#line 1 "m0-source"\n' + input, encoding: 'utf8', timeout: 30_000, maxBuffer: 64 * 1024 * 1024 });
  let sourceLine = null;
  const sourceLines = expanded.split('\n').map(line => {
    const directive = /^#\s+(\d+)\s+"([^"]+)"/.exec(line);
    if (directive) { sourceLine = directive[2] === 'm0-source' ? Number(directive[1]) : null; return null; }
    const current = sourceLine;
    if (sourceLine !== null) sourceLine++;
    return current;
  });
  return { content: expanded, sourceLines, conditions, rule: { kind: hasRegistration ? 'OBJC_REGISTRATION_MACRO' : 'C_CONDITIONAL_SOURCE_RULE', engine: 'cc -E', sourceBranches: 'ALL_PRESERVED', macros: hasRegistration ? macros : [], reason: 'Registration macros are lowered only for source enumeration. Compiler stringification preserves their full arguments. Conditional directives, macro definitions and imports are retained as source rules while every branch body remains available; no native platform or runtime binding is selected and arbitrary source macros are not executed.' } };
}
