import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

async function analyze(path, content) {
  assert.ok(fs.existsSync(new URL('../m0-native-semantics.mjs', import.meta.url)), 'native semantic extractor must exist');
  return (await import('../m0-native-semantics.mjs')).analyzeNativeSource({ path, content });
}

test('Android XML namespaces, permissions and component attributes are parsed structurally', async () => {
  const result = await analyze('android/AndroidManifest.xml', `<manifest xmlns:a="http://schemas.android.com/apk/res/android">\n<uses-permission a:name="android.permission.CAMERA"/><application><service a:name=".Recorder" a:exported="false"/></application></manifest>`);
  assert.equal(result.coverage, 'PARSED_MANIFEST');
  assert.ok(result.facts.some(f => f.kind === 'PERMISSION_DECLARATION' && f.name === 'android.permission.CAMERA' && f.line === 2));
  assert.ok(result.facts.some(f => f.kind === 'MANIFEST_ELEMENT' && f.details.attributes['a:exported'] === 'false'));
});

test('XML entities and nested resources retain structural values', async () => {
  const result = await analyze('android/res/values/strings.xml', '<resources><string name="title">A &amp; B</string><style name="App"><item name="color">red</item></style></resources>');
  assert.ok(result.facts.some(f => f.kind === 'RESOURCE_DECLARATION' && f.name === 'title' && f.details.text === 'A & B'));
  assert.ok(result.facts.some(f => f.name === 'App' && f.details.element === 'style'));
});

test('malformed XML and external entities cannot produce complete manifests', async () => {
  for (const text of ['<manifest><application></manifest>', '<!DOCTYPE manifest SYSTEM "file:///etc/passwd"><manifest/>']) {
    const result = await analyze('AndroidManifest.xml', text);
    assert.notEqual(result.coverage, 'PARSED_MANIFEST');
    assert.ok(result.boundaries.length > 0);
    assert.ok(result.boundaries.every(boundary => boundary.severity === 'SOURCE_ENUMERATION_BLOCKER'));
  }
});

test('plist keys and values record privacy, entitlements and nested resources', async () => {
  const result = await analyze('ios/PrivacyInfo.xcprivacy', '<plist version="1.0"><dict><key>NSPrivacyTracking</key><false/><key>NSCameraUsageDescription</key><string>Camera &amp; audio</string><key>Nested</key><array><string>x</string></array></dict></plist>');
  assert.ok(result.facts.some(f => f.kind === 'PRIVACY_DECLARATION' && f.name === 'NSPrivacyTracking' && f.details.value === false));
  assert.ok(result.facts.some(f => f.kind === 'PERMISSION_DECLARATION' && f.name === 'NSCameraUsageDescription' && f.details.value === 'Camera & audio'));
});

test('Expo module JSON preserves every autolinking key and platform registration', async () => {
  const result = await analyze('expo-module.config.json', JSON.stringify({ platforms: ['apple', 'android'], apple: { modules: ['Camera'], appDelegateSubscribers: ['CameraDelegate'] }, android: { modules: ['expo.Camera'] }, custom: { future: true } }));
  assert.equal(result.coverage, 'PARSED_MANIFEST');
  assert.ok(result.facts.some(f => f.kind === 'AUTOLINKING_REGISTRATION' && f.name === '/apple/modules/0' && f.details.value === 'Camera'));
  assert.ok(result.facts.some(f => f.name === '/custom/future' && f.details.value === true));
});

test('Kotlin DSL literal names, static event arrays and lifecycle calls retain exact ranges', async () => {
  const result = await analyze('Camera.kt', 'val events = arrayOf("ready", "failed")\nclass Camera : Module() { override fun definition() = ModuleDefinition {\nName("Camera")\nEvents(events)\nAsyncFunction("take") { throw CameraError() }\nView(CameraView::class) { Prop("zoom") { v, x -> v.zoom = x } }\nOnDestroy { stop() }\n} }');
  for (const [kind, name] of [['NATIVE_MODULE', 'Camera'], ['EVENT_DECLARATION', 'ready'], ['EVENT_DECLARATION', 'failed'], ['NATIVE_FUNCTION', 'take'], ['VIEW_PROP', 'zoom'], ['LIFECYCLE_HOOK', 'OnDestroy']]) assert.ok(result.facts.some(f => f.kind === kind && f.name === name), `${kind}:${name}`);
  assert.equal(result.facts.find(f => f.name === 'take').line, 5);
  assert.ok(result.boundaries.some(b => b.kind === 'NATIVE_SEMANTIC_BOUNDARY'));
  assert.equal(result.coverage, 'EXTRACTED_WITH_BOUNDARIES');
});

test('Swift arrays, interpolation, comments and strings cannot fabricate literal exports', async () => {
  const content = 'let events = ["ready", "fail"]\npublic func definition() -> ModuleDefinition {\nEvents(events)\n// Function("fake")\nlet text = "Function(\\"alsoFake\\")"\nFunction("real") { x in x }\nFunction("dynamic\\(name)") { }\n}';
  const result = await analyze('Module.swift', content);
  assert.ok(result.facts.some(f => f.name === 'real' && f.kind === 'NATIVE_FUNCTION'));
  assert.ok(result.facts.some(f => f.name === 'ready' && f.kind === 'EVENT_DECLARATION'));
  assert.ok(!result.facts.some(f => ['fake', 'alsoFake', 'dynamic\\(name)'].includes(f.name)));
  assert.ok(result.boundaries.some(b => b.kind === 'DYNAMIC_NATIVE_ARGUMENT'));
});

test('dynamic event expressions are explicit obligations rather than omitted or guessed', async () => {
  const result = await analyze('Module.kt', 'fun definition() = ModuleDefinition { Events(*externalEvents()); Function(computeName()) { } }');
  assert.equal(result.facts.filter(f => f.kind === 'EVENT_DECLARATION').length, 0);
  assert.equal(result.boundaries.filter(b => b.kind === 'DYNAMIC_NATIVE_ARGUMENT').length, 2);
});

test('native exceptions, permission references and platform conditions are source facts', async () => {
  const result = await analyze('Module.kt', 'class CameraError : CodedException("Denied")\nclass Denied : CodedException("Denied")\nfun check() { if (Build.VERSION.SDK_INT > 30) throw CameraError(); requirePermission(Manifest.permission.CAMERA) }');
  assert.ok(result.facts.some(f => f.kind === 'ERROR_DECLARATION' && f.name === 'CameraError'));
  assert.ok(result.facts.some(f => f.kind === 'ERROR_DECLARATION' && f.name === 'Denied'));
  assert.ok(result.facts.some(f => f.kind === 'PERMISSION_REFERENCE' && f.name === 'Manifest.permission.CAMERA'));
  assert.ok(result.facts.some(f => f.kind === 'ERROR_BEHAVIOR'));
});

test('traditional ObjC exports and Java ReactMethod annotations are recorded without fake support claims', async () => {
  const objc = await analyze('Bridge.m', 'RCT_EXPORT_MODULE(Camera)\nRCT_EXPORT_METHOD(take:(NSString *)uri resolver:(RCTPromiseResolveBlock)resolve) { resolve(uri); }\nRCT_EXPORT_VIEW_PROPERTY(zoom, double)');
  assert.ok(objc.facts.some(f => f.kind === 'NATIVE_MODULE' && f.name === 'Camera'));
  assert.ok(objc.facts.some(f => f.kind === 'NATIVE_FUNCTION' && f.name === 'take'));
  const java = await analyze('Bridge.java', 'public class Bridge { @ReactMethod public void take(String uri, Promise promise) { promise.resolve(uri); } }');
  assert.ok(java.facts.some(f => f.kind === 'NATIVE_FUNCTION' && f.name === 'take'));
  assert.equal(java.coverage, 'EXTRACTED_WITH_BOUNDARIES');
});

test('unbalanced code and unsupported languages cannot claim complete semantics', async () => {
  const broken = await analyze('Module.kt', 'ModuleDefinition { Function("x") {');
  assert.ok(broken.boundaries.some(b => b.kind === 'UNBALANCED_NATIVE_SYNTAX'));
  const unknown = await analyze('Expo.unknown', 'custom future syntax');
  assert.equal(unknown.coverage, 'UNSUPPORTED');
  assert.ok(unknown.boundaries.some(b => b.kind === 'UNSUPPORTED_LANGUAGE'));
});

test('output is deterministic and empty files still carry native semantic boundary', async () => {
  const first = await analyze('Empty.kt', '');
  assert.deepEqual(first, await analyze('Empty.kt', ''));
  assert.equal(first.coverage, 'EXTRACTED_WITH_BOUNDARIES');
  assert.ok(first.boundaries.length > 0);
});

test('plist malformed dictionaries cannot silently lose keys or unsupported values', async () => {
  for (const text of ['<dict><key>x</key></dict>', '<dict><key>x</key><string>a</string><key>x</key><string>b</string></dict>', '<dict><key>x</key><future>1</future></dict>']) {
    const result = await analyze('Info.plist', `<plist>${text}</plist>`);
    assert.equal(result.coverage, 'EXTRACTED_WITH_BOUNDARIES');
    assert.ok(result.boundaries.some(b => b.kind === 'MALFORMED_PLIST'));
  }
});

test('JSON escaped pointers, null and empty containers remain observable', async () => {
  const result = await analyze('expo-module.config.json', '{"a/b~c":null,"empty":[],"nested":{}}');
  assert.ok(result.facts.some(f => f.name === '/a~1b~0c' && f.details.value === null));
  assert.ok(result.facts.some(f => f.name === '/empty' && Array.isArray(f.details.value)));
  const malformed = await analyze('expo-module.config.json', '{');
  assert.ok(malformed.boundaries.some(b => b.kind === 'MALFORMED_JSON'));
});

test('standard Apple plist DOCTYPE is a declaration without external entity resolution', async () => {
  const result = await analyze('Info.plist', '<?xml version="1.0"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>NSCameraUsageDescription</key><string>Camera</string></dict></plist>');
  assert.equal(result.coverage, 'PARSED_MANIFEST');
  assert.ok(result.facts.some(f => f.kind === 'PERMISSION_DECLARATION'));
});

test('Ruby podspec declarations and dependency calls are enumerated by mature grammar', async () => {
  const result = await analyze('Expo.podspec', 'Pod::Spec.new do |s|\n s.name = "Expo"\n s.dependency "ExpoModulesCore"\nend');
  assert.equal(result.language, 'ruby');
  assert.equal(result.coverage, 'EXTRACTED_WITH_BOUNDARIES');
  assert.ok(result.facts.some(f => f.details.expression.includes('ExpoModulesCore')));
});

test('C++ headers choose the grammar with the fewest unparsed source ranges', async () => {
  const result = await analyze('Converter.h', '#pragma once\nnamespace expo { template <typename T> class Converter { public: T convert(T x) { return x; } }; }');
  assert.equal(result.language, 'cpp');
  assert.ok(!result.boundaries.some(b => b.severity === 'SOURCE_ENUMERATION_BLOCKER'));
  assert.ok(result.facts.some(f => f.details.expression.includes('Converter')));
});

test('grammar library provenance is deterministic across independent compiler invocations', async () => {
  const code = 'import{initializeNativeParsers}from"./scripts/sdk54/m0-native-parser.mjs"; console.log(initializeNativeParsers().objc.librarySha256)';
  const options = { cwd: new URL('../../../', import.meta.url), encoding: 'utf8' };
  assert.equal(execFileSync(process.execPath, ['--input-type=module', '-e', code], options), execFileSync(process.execPath, ['--input-type=module', '-e', code], options));
});

test('binary plist bytes retain permission and privacy declarations without UTF8 conversion', async () => {
  const bytes = Buffer.from('62706c6973743030d2010203045f10184e5343616d65726155736167654465736372697074696f6e5f10114e5350726976616379547261636b696e675643616d65726108080d283c430000000000000101000000000000000500000000000000000000000000000044', 'hex');
  const result = await analyze('Info.plist', bytes);
  assert.equal(result.coverage, 'PARSED_MANIFEST');
  assert.equal(result.parser, 'bplist-parser');
  assert.ok(result.facts.some(f => f.kind === 'PERMISSION_DECLARATION' && f.name === 'NSCameraUsageDescription' && f.details.value === 'Camera'));
  assert.ok(result.facts.some(f => f.kind === 'PRIVACY_DECLARATION' && f.details.value === false));
});

test('current Kotlin grammar parses fun interfaces and generic DSL callbacks', async () => {
  const result = await analyze('Delegate.kt', 'fun interface PictureSavedDelegate { fun onSaved(uri: String) }');
  assert.ok(!result.boundaries.some(b => b.severity === 'SOURCE_ENUMERATION_BLOCKER'));
  assert.ok(result.facts.some(f => f.details.expression.includes('PictureSavedDelegate')));
});

test('current Swift grammar parses shorthand optional binding and conditional branches', async () => {
  const result = await analyze('Module.swift', 'func get() { guard let appContext else { return }\n#if os(iOS)\n Function("ios") {}\n#else\n Function("other") {}\n#endif\n}');
  assert.ok(!result.boundaries.some(b => b.severity === 'SOURCE_ENUMERATION_BLOCKER'));
  for (const name of ['ios', 'other']) assert.ok(result.facts.some(f => f.kind === 'NATIVE_FUNCTION' && f.name === name));
});

test('Gradle Groovy uses mature grammar to enumerate build and installation rules', async () => {
  const result = await analyze('build.gradle', 'apply plugin: "com.android.library"\nandroid { namespace "expo.camera" }\ndependencies { implementation project(":expo-modules-core") }');
  assert.equal(result.language, 'groovy');
  assert.ok(!result.boundaries.some(b => b.severity === 'SOURCE_ENUMERATION_BLOCKER'));
  assert.ok(result.facts.some(f => f.details.expression.includes('expo-modules-core')));
});

test('source defined C annotation macros preserve both conditional API branches', async () => {
  const result = await analyze('native.c', '#define SDK_API\n#if FEATURE\nSDK_API int first(void);\n#else\nSDK_API int second(void);\n#endif\n');
  assert.ok(!result.boundaries.some(b => b.severity === 'SOURCE_ENUMERATION_BLOCKER'));
  for (const name of ['first', 'second']) assert.ok(result.facts.some(f => f.kind === 'NATIVE_FUNCTION' && f.name === name));
  assert.ok(result.sourceNormalizations.some(rule => rule.kind === 'C_SOURCE_ANNOTATION_MACRO'));
});

test('ObjC registration macro recovery uses mature preprocessing and preserves every conditional branch', async () => {
  const content = '@interface Camera : NSObject\n@end\n@implementation Camera\n#if FEATURE\nRCT_EXPORT_METHOD(first:(NSString *)uri) { callback(uri); }\n#else\nRCT_EXPORT_METHOD(second:(NSString *)uri) { callback(uri); }\n#endif\n@end';
  const result = await analyze('Camera.m', content);
  assert.ok(!result.boundaries.some(b => b.severity === 'SOURCE_ENUMERATION_BLOCKER'));
  for (const [name, line] of [['first', 5], ['second', 7]]) {
    const fact = result.facts.find(f => f.kind === 'NATIVE_FUNCTION' && f.name === name);
    assert.ok(fact);
    assert.equal(fact.line, line);
    assert.ok(fact.details.expression.includes(`RCT_EXPORT_METHOD(${name}`));
  }
  assert.ok(result.facts.some(f => f.kind === 'PLATFORM_CONDITION'));
});

test('header grammar selection is evaluated after finite macro normalization', async () => {
  const result = await analyze('sqlite3.h', '#ifndef API_H\n#define API_H\n#ifndef SDK_API\n#define SDK_API\n#endif\n#ifdef __cplusplus\nextern "C" {\n#endif\nSDK_API int open_database(void);\n#ifdef __cplusplus\n}\n#endif\n#endif\n');
  assert.ok(['c', 'cpp'].includes(result.language));
  assert.ok(!result.boundaries.some(b => b.severity === 'SOURCE_ENUMERATION_BLOCKER'));
  assert.ok(result.facts.some(f => f.kind === 'NATIVE_FUNCTION' && f.name === 'open_database'));
  assert.ok(result.facts.some(f => f.kind === 'PLATFORM_CONDITION' && f.details.expression.startsWith('#ifndef API_H')));
});

test('SwiftSyntax frontend enumerates complete syntax without resolving SDK imports', async () => {
  const result = await analyze('Current.swift', 'import MissingPlatformSDK\nstruct State {\nfunc value() async throws -> String {\n if let result = try? await task({ (done: Callback<String>) in\n guard let item else { return done("") }; done(item)\n }) { return result }\n return ""\n}\n}');
  assert.equal(result.parser, 'SwiftParser/SwiftSyntax');
  assert.ok(!result.boundaries.some(b => b.severity === 'SOURCE_ENUMERATION_BLOCKER'));
  assert.ok(result.facts.some(f => f.kind === 'NATIVE_DECLARATION' && f.name === 'value'));
});

test('SwiftSyntax diagnostics and byte ranges preserve malformed and Unicode source locations', async () => {
  const valid = await analyze('Unicode.swift', 'let label = "相机"\nFunction("take") {}');
  assert.equal(valid.facts.find(f => f.kind === 'NATIVE_FUNCTION' && f.name === 'take').line, 2);
  const malformed = await analyze('Broken.swift', 'func take( {');
  assert.ok(malformed.boundaries.some(b => b.kind === 'UNBALANCED_NATIVE_SYNTAX' && b.severity === 'SOURCE_ENUMERATION_BLOCKER'));
});

test('SwiftSyntax immutable array resolution respects parameter shadowing', async () => {
  const result = await analyze('Shadow.swift', 'let events = ["global"]\nfunc definition(events: [String]) { Events(events) }');
  assert.equal(result.facts.filter(f => f.kind === 'EVENT_DECLARATION').length, 0);
  assert.ok(result.boundaries.some(b => b.kind === 'DYNAMIC_NATIVE_ARGUMENT'));
});

test('Kotlin compiler PSI fallback preserves generic exception declarations and registrations', async () => {
  const { parseKotlinSource } = await import('../m0-native-parser.mjs');
  const tree = parseKotlinSource('class Invalid(enumType: KClass<Enum<*>>) : CodedException("bad")\nfun definition() = ModuleDefinition { Function("take") {} }');
  assert.equal(tree.parser, 'KotlinCompiler/PSI');
  assert.equal(tree.diagnostics.length, 0);
  assert.ok(tree.records.some(record => record.name === 'Invalid' && record.superTypes.some(type => type.includes('CodedException'))));
  assert.ok(tree.records.some(record => record.callee === 'Function' && record.arguments[0] === '"take"'));
});

test('Groovy compiler AST parses Gradle source without executing plugins or source statements', async () => {
  const { parseGroovySource } = await import('../m0-native-parser.mjs');
  const tree = parseGroovySource('plugins { id "missing.plugin" }\nthrow new RuntimeException("must not execute")\nandroid { namespace "expo.camera" }');
  assert.equal(tree.parser, 'GroovyCompiler/AST');
  assert.equal(tree.diagnostics.length, 0);
  assert.ok(tree.records.some(record => record.callee === 'namespace' && record.arguments[0] === '"expo.camera"'));
  assert.ok(tree.records.some(record => record.syntaxKind === 'ThrowStatement'));
});

test('native EJS template expressions remain finite generation rules with original ranges', async () => {
  const result = await analyze('packages/expo-module-template/ios/{%- project.moduleName %}.swift', 'public class <%- project.moduleName %>: Module {\nfunc definition() { Name("<%- project.name %>"); Function("hello") {} }\n}');
  assert.ok(!result.boundaries.some(b => b.severity === 'SOURCE_ENUMERATION_BLOCKER'));
  assert.ok(result.facts.some(f => f.kind === 'NATIVE_FUNCTION' && f.name === 'hello'));
  assert.ok(result.facts.some(f => f.kind === 'NATIVE_MODULE_EXPRESSION' && f.name === '<%- project.name %>' && f.details.valueMode === 'TEMPLATE_GENERATION_RULE'));
  assert.ok(result.sourceNormalizations.some(rule => rule.kind === 'NATIVE_TEMPLATE_GENERATION_RULE' && rule.expression === '<%- project.moduleName %>'));
});
