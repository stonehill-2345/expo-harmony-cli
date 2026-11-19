import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeNativeSource } from '../m0-native-semantics.mjs';

test('Cocoa default nullability retains its scope and every public selector', () => {
  const content = '#import <Foundation/Foundation.h>\nNS_ASSUME_NONNULL_BEGIN\n@interface Utilities : NSObject\n+ (void)perform:(nonnull void (^)(void))block;\n+ (nullable UIColor *)color:(nullable id)json;\n- (nullable NSDictionary *)launchOptions;\n@end\nNS_ASSUME_NONNULL_END\n';
  const result = analyzeNativeSource({ path: 'Utilities.h', content });
  assert.equal(result.language, 'objc');
  assert.ok(!result.boundaries.some(row => row.severity === 'SOURCE_ENUMERATION_BLOCKER'));
  for (const name of ['perform', 'color', 'launchOptions']) assert.ok(result.facts.some(row => row.kind === 'NATIVE_DECLARATION' && row.name === name), name);
  assert.ok(result.facts.some(row => row.kind === 'NATIVE_NULLABILITY_SCOPE' && row.details.defaultNullability === 'nonnull' && row.line === 2 && row.endLine === 8));
  assert.ok(result.sourceNormalizations.some(row => row.kind === 'COCOA_DEFAULT_NULLABILITY'));
});

test('ObjC type identity and complete multi-part selectors have explicit source rules', () => {
  const content = 'NS_ASSUME_NONNULL_BEGIN\n@interface Utilities : NSObject\n+ (BOOL)catchException:(void(^)(void))tryBlock error:(NSError **)error;\n@end\nNS_ASSUME_NONNULL_END';
  const result = analyzeNativeSource({ path: 'Utilities.h', content });
  assert.ok(result.facts.some(row => row.kind === 'NATIVE_TYPE_DECLARATION' && row.name === 'Utilities'));
  assert.ok(result.facts.some(row => row.kind === 'NATIVE_FUNCTION_DECLARATION' && row.name === 'catchException:error:' && row.details.expression.includes('NSError')));
});
