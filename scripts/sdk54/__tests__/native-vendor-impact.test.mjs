import test from 'node:test';
import assert from 'node:assert/strict';
import { collectMacroImplementations, projectStbPublicHeader, validateVendorImpact } from '../native-vendor-impact.mjs';

test('finite macro consumer rules retain full signatures, extra arguments and complete balanced bodies', () => {
  const source = '#define NATIVE_METHOD(name, ...) jsi::Value glNativeMethod_##name(int argc)\n#define SIMPLE_NATIVE_METHOD(name, fn) NATIVE_METHOD(name) { fn(); }\n#define UNIMPL_NATIVE_METHOD(name) NATIVE_METHOD(name) { throw 1; }\nNATIVE_METHOD(texImage2D, 6) { if (ARG(0, const jsi::Value &).isNull()) { foo([=, vec{std::move(vec)}] { bar(); }); } return 0; }\nSIMPLE_NATIVE_METHOD(clear, glClear)\nUNIMPL_NATIVE_METHOD(missing)\n';
  const result = collectMacroImplementations(source);
  assert.equal(result.implementations.length, 3);
  assert.deepEqual(result.implementations.map(row => row.name), ['texImage2D', 'clear', 'missing']);
  assert.deepEqual(result.implementations[0].arguments, ['texImage2D', '6']);
  assert.ok(result.implementations[0].expression.includes('vec{std::move(vec)}'));
  assert.ok(result.implementations[0].expression.endsWith('return 0; }'));
  assert.equal(result.implementations[1].macroName, 'SIMPLE_NATIVE_METHOD');
  assert.equal(result.implementations[2].implementationStatus, 'EXPLICIT_UNIMPLEMENTED_SOURCE_RULE');
  assert.equal(result.macros.length, 3);
});

test('public stb qualifier projection preserves every platform branch, callback and original signature', () => {
  const source = '#ifndef STBI_H\n#define STBI_H\n#ifndef STBIDEF\n#define STBIDEF extern\n#endif\ntypedef struct { int (*read)(void *ctx, char *out, int size); void (*skip)(void *, int); } stbi_io_callbacks;\nSTBIDEF unsigned char *stbi_load(const char *, int *, int *);\n#ifdef STBI_WINDOWS_UTF8\nSTBIDEF int stbi_windows(const wchar_t *);\n#endif\n#endif\n#ifdef STB_IMAGE_IMPLEMENTATION\nSTBIDEF unsigned char *stbi_load(const char *f, int *x, int *y) { return 0; }\n#endif\n';
  const result = projectStbPublicHeader(source);
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.functions.map(row => row.name), ['stbi_load', 'stbi_windows']);
  assert.ok(result.callbacks.some(row => row.name === 'read'));
  assert.ok(result.callbacks.some(row => row.name === 'skip'));
  assert.ok(result.conditions.some(row => row.expression.includes('STBI_WINDOWS_UTF8')));
  assert.equal(result.qualifierRules.length, 2);
  assert.ok(result.projectedSource.includes('#ifndef STBIDEF'));
  assert.ok(result.functions[0].expression.startsWith('STBIDEF'));
  assert.ok(!result.projectedSource.includes('return 0'));
});

test('deleting rules, changing macro bodies, declaration signatures or accepted support claims fails', () => {
  const expected = { sourceSha256: 'abc', files: [{ facts: [{ kind: 'MACRO', expression: 'macro body' }], publicDeclarations: [{ name: 'x', signature: 'int x(int)' }] }], platformSupportAccepted: false };
  for (const mutate of [value => value.files[0].facts.pop(), value => { value.files[0].facts[0].expression = 'changed'; }, value => { value.files[0].publicDeclarations[0].signature = 'void x()'; }, value => { value.platformSupportAccepted = true; }]) {
    const actual = structuredClone(expected); mutate(actual); assert.equal(validateVendorImpact(actual, expected).valid, false);
  }
  assert.equal(validateVendorImpact(expected, expected).valid, true);
});
