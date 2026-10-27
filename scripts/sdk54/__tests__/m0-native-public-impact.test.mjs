import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeNativeSource } from '../m0-native-semantics.mjs';
import { auditNativePublicImpact } from '../m0-native-public-impact.mjs';

const analyze = source => ({ path: 'A.mm', ...analyzeNativeSource({ path: 'A.mm', content: source }) });

test('complete native method signatures and finite bodies retain implementation diagnostics', () => {
  const source = '@implementation A\n- (void)run { std::vector<int> values; }\n@end';
  const analysis = analyze(source);
  assert.ok(analysis.boundaries.some(row => row.severity === 'SOURCE_ENUMERATION_BLOCKER'));
  const audit = auditNativePublicImpact({ source, analysis });
  assert.equal(audit.disposition, 'SOURCE_ENUMERATION_ACCEPTED_WITH_IMPLEMENTATION_DIAGNOSTICS');
  assert.equal(audit.methods[0].signature.trim(), '- (void)run');
  assert.equal(audit.methods[0].sourceRuleRetained, true);
});

test('missing registration facts cannot be closed by storing the enclosing native method', () => {
  const source = '@implementation A\n- (void)run { Function("take"); std::vector<int> values; }\n@end';
  const analysis = analyze(source);
  analysis.facts = analysis.facts.filter(row => row.details.callee !== 'Function');
  const audit = auditNativePublicImpact({ source, analysis });
  assert.equal(audit.disposition, 'PUBLIC_IMPACT_REQUIRES_REVIEW');
  assert.ok(audit.registrations.some(row => row.name === 'Function' && row.disposition === 'MISSING_REGISTRATION_RULE'));
});

test('unparsed native selector syntax remains an explicit public impact obligation', () => {
  const source = '@implementation A\n- (void)run:(int)x next ??? { return value; }\n@end';
  const analysis = analyze(source);
  const audit = auditNativePublicImpact({ source, analysis });
  assert.equal(audit.disposition, 'PUBLIC_IMPACT_REQUIRES_REVIEW');
  assert.ok(audit.unresolved.length > 0);
});

test('bounded native type expressions retain exact selectors and source signatures', () => {
  const source = '@implementation A\n- (std::vector<int>)run { return value; }\n@end';
  const analysis = analyze(source);
  const audit = auditNativePublicImpact({ source, analysis });
  assert.equal(audit.disposition, 'SOURCE_ENUMERATION_ACCEPTED_WITH_IMPLEMENTATION_DIAGNOSTICS');
  assert.ok(audit.signatureTypeRules.some(rule => rule.signature.name === 'run' && rule.source.includes('std::vector<int>')));
});

test('JNI ABI qualifiers require a clean mature parse and complete original function and call facts', () => {
  const source = 'JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM *vm, void *) { return initialize(vm); }';
  const analysis = { path: 'JNI.cpp', ...analyzeNativeSource({ path: 'JNI.cpp', content: source }) };
  const audit = auditNativePublicImpact({ source, analysis });
  assert.equal(audit.disposition, 'SOURCE_ENUMERATION_ACCEPTED_WITH_ABI_QUALIFIER_DIAGNOSTICS');
  assert.equal(audit.normalizationProof.projectedDiagnosticCount, 0);
  analysis.facts = analysis.facts.filter(row => row.name !== 'initialize');
  assert.equal(auditNativePublicImpact({ source, analysis }).disposition, 'PUBLIC_IMPACT_REQUIRES_REVIEW');
});
