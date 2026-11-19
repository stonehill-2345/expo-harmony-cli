import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBuildSource, buildConsumerBindings, selectBuildSources, validateBuildSource } from '../m0-build-source-semantics.mjs';

test('Bash grammar preserves nested conditions, functions, substitutions, assignments and commands', async () => {
  const content = '#!/bin/sh\nrun() { for x in "$@"; do if [ -n "${MODE:-dev}" ]; then OUT=$(printf "%s" "$x") ./tools/build.sh > log; else false; fi; done; }\nrun "$@"\n';
  const result = await analyzeBuildSource({ path: 'gradlew', content });
  assert.equal(result.blockerCount, 0);
  for (const type of ['function_definition', 'for_statement', 'if_statement', 'expansion', 'command_substitution', 'variable_assignment', 'redirected_statement'])
    assert.ok(result.facts.some(fact => fact.details.nodeType === type), type);
  assert.ok(result.facts.some(fact => fact.details.expression === '${MODE:-dev}'));
  assert.ok(result.facts.every(fact => fact.details.expression !== null));
  assert.equal(result.platformSupportAccepted, false);
});

test('CMake parser retains every branch and full target/variable expressions', async () => {
  const content = 'cmake_minimum_required(VERSION 3.4)\nmacro(add name)\n if(ANDROID AND NEW_ARCH)\n  target_link_libraries(${name} PRIVATE "${DEP}")\n else()\n  add_library(${name} STATIC a.cpp)\n endif()\nendmacro()\n';
  const result = await analyzeBuildSource({ path: 'CMakeLists.txt', content });
  assert.equal(result.blockerCount, 0);
  for (const name of ['if', 'else', 'endif', 'macro', 'endmacro', 'target_link_libraries', 'add_library'])
    assert.ok(result.facts.some(fact => fact.name === name), name);
  assert.ok(result.facts.some(fact => fact.name === 'if' && fact.details.expression.includes('ANDROID AND NEW_ARCH')));
});

test('standard Java properties handles escapes, continuation, unicode and ordered duplicate assignment', async () => {
  const result = await analyzeBuildSource({ path: 'gradle.properties', content: 'a\\ b: first\\\n second\nuni=\\u4e2d\nrepeat=one\nrepeat=two\n' });
  assert.equal(result.blockerCount, 0);
  assert.deepEqual(result.model.assignments, [{ key: 'a b', value: 'firstsecond' }, { key: 'uni', value: '中' }, { key: 'repeat', value: 'one' }, { key: 'repeat', value: 'two' }]);
  assert.equal(result.model.effective.repeat, 'two');
});

test('ProGuard parser retains annotations, access flags and actual JVM member signatures', async () => {
  const result = await analyzeBuildSource({ path: 'rules.pro', content: '-keep,allowoptimization @foo.Keep public class foo.Box extends foo.Base {\n public java.lang.String get*(int);\n private final int value;\n}\n-dontwarn foo.**\n' });
  assert.equal(result.blockerCount, 0);
  assert.equal(result.model.configuration.keep[0].className, 'foo/Box');
  assert.equal(result.model.configuration.keep[0].allowOptimization, true);
  assert.equal(result.model.configuration.keep[0].annotationType, 'Lfoo/Keep;');
  assert.equal(result.model.configuration.keep[0].methodSpecifications[0].descriptor, '(I)Ljava/lang/String;');
  assert.equal(result.model.configuration.keep[0].fieldSpecifications[0].name, 'value');
  assert.ok(result.facts.some(fact => fact.pointer === '/configuration/keep/0/requiredSetAccessFlags'));
});

test('ProGuard line-leading annotations are members rather than external includes', async () => {
  const result = await analyzeBuildSource({ path: 'annotated.pro', content: '-keepclassmembers class * {\n @foo.Keep public *;\n}\n' });
  assert.equal(result.blockerCount, 0);
  assert.equal(result.model.configuration.keep[0].methodSpecifications[0].annotationType, 'Lfoo/Keep;');
});

test('POSIX implicit argument for loop retains parsed loop and arguments', async () => {
  const result = await analyzeBuildSource({ path: 'gradlew', content: '#!/bin/sh\nfor arg do\n printf "%s" "$arg"\ndone\n' });
  assert.equal(result.blockerCount, 0);
  assert.ok(result.facts.some(fact => fact.kind === 'BUILD_LOOP' && fact.details.expression.includes('for arg do')));
});

test('extensionless executables route by actual shebang and Mach-O stays a binary artifact', async () => {
  const js = await analyzeBuildSource({ path: 'bin/tool', content: '#!/usr/bin/env node\nmodule.exports = require("../build/index");\n' });
  assert.equal(js.language, 'javascript'); assert.equal(js.blockerCount, 0);
  const binary = await analyzeBuildSource({ path: 'libsql', content: Buffer.from('cafebabe000000010100000c', 'hex') });
  assert.equal(binary.language, 'mach-o');
  assert.equal(binary.facts.length, 1);
  assert.equal(binary.facts[0].kind, 'COMPILED_BUILD_ARTIFACT');
  assert.equal(binary.platformSupportAccepted, false);
  const unsupported = await analyzeBuildSource({ path: 'tool', content: '#!/usr/bin/env python\nprint(1)\n' });
  assert.ok(unsupported.blockerCount > 0);
});

test('source selection keeps original IDs and never exempts apps, docs, tests or binaries', () => {
  const rows = ['apps/a/gradlew', 'docs/deploy.sh', 'packages/x/.tests/build.sh', 'packages/libsql'].map((path, index) => ({ id: `FILE:${index}`, path, type: 'blob', mode: '100755' }));
  assert.deepEqual(selectBuildSources({ files: [...rows, { id: 'link', path: 'a.sh', type: 'blob', mode: '120000' }] }).map(row => row.id), rows.map(row => row.id));
});

test('consumer binding proves exact manifest bin, Gradle proguard/CMake call and shell invocation', async () => {
  const files = new Map([
    ['packages/a/package.json', '{"name":"a","bin":{"tool":"bin/tool"},"scripts":{"build":"./build.sh"}}'],
    ['packages/a/bin/tool', '#!/usr/bin/env node\nconsole.log(1)'],
    ['packages/a/build.sh', '#!/bin/sh\n./bin/tool "$@"\n'],
    ['packages/a/android/build.gradle', 'android { defaultConfig { consumerProguardFiles "proguard-rules.pro" }; externalNativeBuild { cmake { path "CMakeLists.txt" } } }'],
    ['packages/a/android/proguard-rules.pro', '-keep class a.A'],
    ['packages/a/android/CMakeLists.txt', 'add_library(a a.cpp)'],
    ['packages/a/android/gradle.properties', 'newArchEnabled=true'],
  ]);
  const bindings = await buildConsumerBindings(files);
  for (const [target, kind] of [['packages/a/bin/tool', 'PACKAGE_BIN'], ['packages/a/build.sh', 'PACKAGE_SCRIPT_COMMAND'], ['packages/a/android/proguard-rules.pro', 'GRADLE_BUILD_FILE_REFERENCE'], ['packages/a/android/CMakeLists.txt', 'GRADLE_BUILD_FILE_REFERENCE'], ['packages/a/android/gradle.properties', 'GRADLE_PROJECT_PROPERTIES_CONVENTION']])
    assert.ok(bindings.some(row => row.targetPath === target && row.kind === kind && row.expression && row.sourceSha256), `${kind}: ${target}`);
  assert.ok(!bindings.some(row => row.sourcePath === 'packages/a/android/build.gradle' && row.targetPath === 'packages/a/bin/tool'));
});

test('consumer Gradle parser handles single quotes and nested default ProGuard function calls', async () => {
  const files = new Map([
    ['p/build.gradle', "android { defaultConfig { consumerProguardFiles 'consumer.pro' }; buildTypes { release { proguardFiles getDefaultProguardFile('default.pro'), 'rules.pro' } } }"],
    ['p/consumer.pro', '-keep class x'], ['p/rules.pro', '-keep class y'],
  ]);
  const result = await buildConsumerBindings(files);
  assert.ok(result.some(row => row.targetPath === 'p/consumer.pro'));
  assert.ok(result.some(row => row.targetPath === 'p/rules.pro'));
  assert.ok(!result.some(row => row.targetPath === 'p/default.pro'));
});

test('malformed sources and file includes remain blockers; changed condition, facts or support claims fail validation', async () => {
  for (const [path, content] of [['bad.sh', 'if then'], ['bad.pro', '-unknown-option'], ['bad.properties', 'a=\\uQQQQ'], ['CMakeLists.txt', 'if('], ['include.pro', '-include /tmp/untrusted-config']]) {
    const actual = await analyzeBuildSource({ path, content });
    assert.ok(actual.blockerCount > 0, path);
  }
  const expected = await analyzeBuildSource({ path: 'good.sh', content: 'if [ "$X" = 1 ]; then echo yes; fi\n' });
  const deleted = structuredClone(expected); deleted.facts.pop();
  assert.equal(validateBuildSource(deleted, expected).valid, false);
  const condition = structuredClone(expected); condition.facts.find(fact => fact.details.nodeType === 'if_statement').details.expression = 'if false; then echo yes; fi';
  assert.equal(validateBuildSource(condition, expected).valid, false);
  const forged = structuredClone(expected); forged.platformSupportAccepted = true;
  assert.equal(validateBuildSource(forged, expected).valid, false);
});
