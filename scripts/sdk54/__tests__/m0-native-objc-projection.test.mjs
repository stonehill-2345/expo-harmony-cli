import test from 'node:test';
import assert from 'node:assert/strict';
import { projectObjcPublicSource } from '../m0-native-objc-projection.mjs';

test('all fixed-source synchronous and command macro families retain names, selectors and arguments', () => {
  const source = '@implementation A\nRCT_EXPORT_MODULE(A)\nRCT_EXPORT_SYNCHRONOUS_TYPED_METHOD(void, nothing) {}\nRCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(add:(int)x next:(int)y) { return @(x+y); }\nEX_EXPORT_SCOPED_MODULE(Scoped, KernelService);\n#define QUICK_RCT_EXPORT_COMMAND_METHOD(name) RCT_EXPORT_METHOD(name:(id)tag) { invoke(tag); }\nQUICK_RCT_EXPORT_COMMAND_METHOD(reload)\n@end';
  const result = projectObjcPublicSource(source);
  assert.equal(result.unresolved.length, 0, JSON.stringify(result.unresolved));
  for (const name of ['nothing', 'add:next:', 'reload:']) assert.ok(result.methods.some(row => row.name === name), name);
  for (const name of ['RCT_EXPORT_SYNCHRONOUS_TYPED_METHOD', 'RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD', 'EX_EXPORT_SCOPED_MODULE', 'QUICK_RCT_EXPORT_COMMAND_METHOD']) assert.ok(result.registrations.some(row => row.name === name), name);
  assert.ok(result.facts.some(row => row.name === 'Scoped' && row.kind === 'NATIVE_MODULE'));
});

test('mature dual AST projection preserves ObjC++ fields, functions, full selectors, events and every branch', () => {
  const source = '#ifdef ARCH\nnamespace {\nid convert(const folly::dynamic &dyn) { return @(dyn.getInt()); }\n}\n@implementation A { react::State::Shared _state; }\n- (void)first { const auto &x = static_cast<const react::Props &>(*_props); }\n- (void)dispatchEvent:(NSString *)name payload:(id)value { emitter.dispatch(normalizeEventName(name), value); }\n- (void)update:(react::State::Shared const &)state old:(react::State::Shared const &)old {\n#if VERSION >= 82\n updateImmediate(state);\n#else\n updateDeferred(state);\n#endif\n}\n@end\n#endif';
  const result = projectObjcPublicSource(source);
  assert.equal(result.unresolved.length, 0, JSON.stringify(result.unresolved));
  for (const name of ['first', 'dispatchEvent:payload:', 'update:old:']) assert.ok(result.methods.some(row => row.name === name), name);
  assert.ok(result.facts.some(row => row.kind === 'NATIVE_CPP_SOURCE_RULE' && row.details.expression.includes('_state')));
  assert.ok(result.facts.some(row => row.kind === 'NATIVE_CPP_SOURCE_RULE' && row.details.expression.includes('convert')));
  assert.ok(result.facts.some(row => row.name === 'dispatchEvent:payload:' && row.details.expression.includes('normalizeEventName(name)')));
  assert.ok(result.conditions.some(row => row.expression === '#if VERSION >= 82'));
  assert.ok(result.conditions.some(row => row.expression === '#else'));
});

test('unknown export macros and malformed selectors cannot be accepted', () => {
  for (const source of ['@implementation A\nRCT_EXPORT_FUTURE_METHOD(run) {}\n@end', '@implementation A\n- (void)run:(int)x next ??? { return value; }\n@end']) {
    assert.ok(projectObjcPublicSource(source).unresolved.length > 0);
  }
});

test('missing end markers and incomplete signatures remain explicit source boundaries', () => {
  for (const source of ['@implementation A\n- (void)hello {}\n', '@interface A : NSObject\n- (void)hello;\n', '@implementation A\n- (void)run:(id)value next:(id other {}\n@end', '#ifdef ARCH\n@implementation A\n- (void)hello {}\n@end', '#if ARCH\n@implementation A\n- (void)hello {}\n@end']) assert.ok(projectObjcPublicSource(source).unresolved.length > 0, source);
});

test('nested C++ loops before generics and following methods preserve nonmissing scope tokens', () => {
  const source = '@implementation A\n- (void)finalize { for (const auto &entry : props) { if (entry) { invoke(entry); } } }\n- (void)update:(NSDictionary<NSString *, id> *)props {}\n- (void)next:(react::State::Shared const &)state {}\n@end';
  const result = projectObjcPublicSource(source);
  assert.equal(result.unresolved.length, 0, JSON.stringify(result.unresolved));
  assert.deepEqual(result.methods.map(row => row.name), ['finalize', 'update:', 'next:']);
});

test('C++ namespaces cannot be accepted as an Objective-C function that hides declarations', () => {
  const source = 'namespace expo { using PromiseBlock = void (^)(Resolve resolve, Reject reject); bool supports(Runtime &runtime); }\n@interface A : NSObject\n- (void)run;\n@end';
  const result = projectObjcPublicSource(source);
  assert.equal(result.unresolved.length, 0, JSON.stringify(result.unresolved));
  assert.ok(!result.methods.some(row => row.name === 'expo'));
  assert.ok(result.facts.some(row => row.kind === 'NATIVE_CPP_AST_RULE' && row.details.expression.includes('supports')));
  assert.ok(result.facts.some(row => row.kind === 'NATIVE_BLOCK_TYPE_RULE' && row.details.expression.includes('PromiseBlock')));
});

test('conditional alternative signatures sharing one body enumerate both methods without selecting a platform', () => {
  const source = '@implementation A\n#ifdef ARCH\n- (void)destroyView\n#else\n- (void)removeFromSuperview\n#endif\n{ cleanup(); }\n- (void)next {}\n@end';
  const result = projectObjcPublicSource(source);
  assert.equal(result.unresolved.length, 0, JSON.stringify(result.unresolved));
  for (const name of ['destroyView', 'removeFromSuperview', 'next']) assert.ok(result.methods.some(row => row.name === name), name);
  assert.ok(result.facts.some(row => row.details.sourceRule === 'CONDITIONAL_SHARED_METHOD_BODY' && row.details.alternativeSignatures.length === 2));
});

test('Objective-C imports and forward classes survive the other frontend declaration projection', () => {
  const source = '@import UIKit;\n@class First;\n@class Second;\nNSString * const Key = @"value";\n@interface A : NSObject <Protocol>\n@end\n@implementation A\nextern void RCTRegisterModule(Class);\n+ (void)load { RCTRegisterModule(self); }\n@end';
  const result = projectObjcPublicSource(source);
  assert.equal(result.unresolved.length, 0, JSON.stringify(result.unresolved));
  assert.ok(result.methods.some(row => row.name === 'load'));
  assert.ok(!result.facts.some(row => row.kind === 'NATIVE_CPP_SOURCE_RULE' && /^(?:import|class) /.test(row.details.expandedExpression)));
});

test('Objective-C ownership qualifiers retain binding rules while mixed C++ ivars remain complete', () => {
  const source = '@implementation A { __weak Runtime *_runtime; std::shared_ptr<jsi::Object> _object; }\n- (void)run {}\n@end';
  const result = projectObjcPublicSource(source);
  assert.equal(result.unresolved.length, 0, JSON.stringify(result.unresolved));
  assert.ok(result.facts.some(row => row.kind === 'NATIVE_ABI_ANNOTATION_RULE' && row.name === '__weak'));
  assert.ok(result.facts.some(row => row.kind === 'NATIVE_CPP_AST_RULE' && row.details.expression.includes('_object')));
});

test('preprocessor pairing is verified independently of Objective-C implementation grammar recovery', () => {
  const source = '#if !TARGET_OS_TV\n@implementation Convert (Status)\nRCT_ENUM_CONVERTER(Status, (@{ @"default": @(0) }), 0, integerValue);\n@end\n#endif\n@implementation A\n#if !TARGET_OS_TV\n- (void)run { invoke(); }\n#endif\n@end';
  const result = projectObjcPublicSource(source);
  assert.equal(result.unresolved.length, 0, JSON.stringify(result.unresolved));
  assert.equal(result.conditions.filter(row => row.expression === '#if !TARGET_OS_TV').length, 2);
  assert.equal(result.conditions.filter(row => row.expression === '#endif').length, 2);
  assert.equal(result.facts.filter(row => row.kind === 'NATIVE_PREPROCESSOR_AST_RULE' && row.name === 'preproc_if').length, 2);
  for (const row of result.facts.filter(row => row.kind === 'NATIVE_PREPROCESSOR_AST_RULE')) assert.equal(row.details.expression, source.slice(row.start, row.end));
  assert.ok(projectObjcPublicSource(source.replace(/#endif\n@end$/, '@end')).unresolved.length > 0);
});

test('header availability conditions and enum-only declarations in interfaces preserve their exact source rules', () => {
  const source = '#if __has_include(<React/Runtime.h>)\n@class Runtime;\n#endif\n@interface A : NSObject\ntypedef NS_OPTIONS(NSUInteger, Options) { OptionOne = 1, OptionTwo = 2, };\n- (void)run;\n@end';
  const result = projectObjcPublicSource(source);
  assert.equal(result.unresolved.length, 0, JSON.stringify(result.unresolved));
  assert.ok(result.conditions.some(row => row.expression === '#if __has_include(<React/Runtime.h>)'));
  assert.ok(result.facts.some(row => row.kind === 'NATIVE_TYPE_MEMBER_RULE' && row.details.expression.includes('OptionTwo')));
});
