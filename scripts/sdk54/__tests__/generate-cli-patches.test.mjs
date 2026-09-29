import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import test from 'node:test';
import { normalizePatchText, validateGeneratedPatch } from '../generate-cli-patches.mjs';
test('normalizes disposable roots while preserving runtime Harmony and manifest hunks', () => {
 const raw='diff --git a/private/tmp/base/node_modules/expo-asset/harmony/src/main/ets/Asset.ets b/private/tmp/base/node_modules/expo-asset/harmony/src/main/ets/Asset.ets\n+Harmony\ndiff --git a/private/tmp/base/node_modules/expo-asset/expo-module.config.json b/private/tmp/base/node_modules/expo-asset/expo-module.config.json\n+{"harmony":"./harmony"}\n';
 const text=normalizePatchText(raw,'expo-asset','/private/tmp/base'); assert.doesNotMatch(text,/private\/tmp/); assert.match(text,/node_modules\/expo-asset\/harmony/); assert.match(text,/expo-module\.config\.json/); assert.deepEqual(validateGeneratedPatch(text,'expo-asset'),[]);
});
test('rejects source-only patches and absolute paths',()=>{assert.ok(validateGeneratedPatch('diff --git a/node_modules/pkg/src/a.ts b/node_modules/pkg/src/a.ts\n+/Users/me/x\n','pkg').length>=2);});


test('removes non-runtime rebuild output, Harmony fixtures, Android Maven artifacts, and provenance-only manifests', () => {
 const raw = [
  'diff --git a/node_modules/@expo/cli/build/bin/cli b/node_modules/@expo/cli/build/bin/cli\n@@ -1 +1 @@\n-old\n+new\n',
  'diff --git a/node_modules/@expo/cli/build/src/api/endpoint.js b/node_modules/@expo/cli/build/src/api/endpoint.js\n@@ -1 +1 @@\n-old\n+new\n',
  'diff --git a/node_modules/expo-modules-core/harmony/src/main/cpp/Runtime.cpp b/node_modules/expo-modules-core/harmony/src/main/cpp/Runtime.cpp\n@@ -0,0 +1 @@\n+runtime\n',
  'diff --git a/node_modules/expo-modules-core/harmony/example/host/package-lock.json b/node_modules/expo-modules-core/harmony/example/host/package-lock.json\n@@ -0,0 +1 @@\n+fixture\n',
  'diff --git a/node_modules/expo-modules-core/harmony/tests/RuntimeTest.cpp b/node_modules/expo-modules-core/harmony/tests/RuntimeTest.cpp\n@@ -0,0 +1 @@\n+test\n',
  'diff --git a/node_modules/expo-asset/local-maven-repo/group/artifact.pom b/node_modules/expo-asset/local-maven-repo/group/artifact.pom\n@@ -1 +0,0 @@\n-old\n',
  'diff --git a/node_modules/expo-asset/package.json b/node_modules/expo-asset/package.json\n@@ -1 +1 @@\n-{"gitHead":"old"}\n+{"gitHead":"new"}\n',
 ].join('');
 const cli = normalizePatchText(raw, '@expo/cli', '/private/tmp/base');
 assert.match(cli, /build\/bin\/cli/);
 assert.doesNotMatch(cli, /build\/src\/api\/endpoint\.js/);
 const core = normalizePatchText(raw, 'expo-modules-core', '/private/tmp/base');
 assert.match(core, /harmony\/src\/main\/cpp\/Runtime\.cpp/);
 assert.doesNotMatch(core, /harmony\/(?:example|tests)\//);
 const asset = normalizePatchText(raw, 'expo-asset', '/private/tmp/base');
 assert.doesNotMatch(asset, /local-maven-repo|package\.json/);
});


test('keeps the generic Expo CLI dispatch files that route prebuild and run to Harmony', () => {
 const raw = [
  'diff --git a/node_modules/@expo/cli/build/src/prebuild/index.js b/node_modules/@expo/cli/build/src/prebuild/index.js\n@@ -1 +1 @@\n-old\n+Harmony prebuild\n',
  'diff --git a/node_modules/@expo/cli/build/src/run/index.js b/node_modules/@expo/cli/build/src/run/index.js\n@@ -1 +1 @@\n-old\n+Harmony run\n',
 ].join('');
 const text = normalizePatchText(raw, '@expo/cli', '');
 assert.match(text, /build\/src\/prebuild\/index\.js/);
 assert.match(text, /build\/src\/run\/index\.js/);
});


test('keeps expo-modules-core RNOH compatibility tooling used by official prebuild', () => {
 const raw = 'diff --git a/node_modules/expo-modules-core/harmony/rnoh-compat/prepare_har.py b/node_modules/expo-modules-core/harmony/rnoh-compat/prepare_har.py\n@@ -0,0 +1 @@\n+runtime tool\n';
 const text = normalizePatchText(raw, 'expo-modules-core', '');
 assert.match(text, /harmony\/rnoh-compat\/prepare_har\.py/);
});
