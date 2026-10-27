import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSupportSource, validateSupportSource } from '../m0-support-source-semantics.mjs';

test('preserves JSONC compiler options, JSON manifests and complete source-map provenance', () => {
  const config = analyzeSupportSource({ path: 'tsconfig.json', content: '{ // config\n "compilerOptions": { "paths": { "@x/*": ["src/*"] }, }, "include": ["src"], }' });
  assert.deepEqual(config.boundaries, []);
  assert.ok(config.facts.some(row => row.pointer === '/compilerOptions/paths/@x~1*/0' && row.value === 'src/*'));
  const editor = analyzeSupportSource({ path: '.vscode/settings.json', content: '{ "files.exclude": { "build": true, }, }' });
  assert.deepEqual(editor.boundaries, []);
  const map = analyzeSupportSource({ path: 'build/a.js.map', content: '{"version":3,"sources":["../src/a.ts"],"sourcesContent":["export const a = 1;"],"mappings":"AAAA"}' });
  assert.deepEqual(map.boundaries, []);
  assert.ok(map.facts.some(row => row.kind === 'SOURCE_MAP_SOURCE' && row.value === '../src/a.ts'));
  assert.ok(map.facts.some(row => row.kind === 'SOURCE_MAP_EMBEDDED_CONTENT' && row.value === 'export const a = 1;'));
});
test('uses the established Xcode parser and preserves actual resource and build-setting references', () => {
  const content = '// !$*UTF8*$!\n{ archiveVersion = 1; classes = {}; objectVersion = 46; objects = { ABC = { isa = PBXFileReference; path = "Assets.xcassets"; sourceTree = "<group>"; }; DEF = { isa = XCBuildConfiguration; buildSettings = { PRODUCT_NAME = "$(TARGET_NAME)"; }; }; }; rootObject = ABC; }\n';
  const result = analyzeSupportSource({ path: 'a.xcodeproj/project.pbxproj', content });
  assert.deepEqual(result.boundaries, []);
  assert.ok(result.facts.some(row => row.pointer === '/project/objects/ABC/path' && row.value === '"Assets.xcassets"'));
  assert.ok(result.facts.some(row => row.pointer.endsWith('/buildSettings/PRODUCT_NAME') && row.value === '"$(TARGET_NAME)"'));
  const sectioned = '// !$*UTF8*$!\n{ objects = {\n/* Begin PBXFileReference section */\nABC /* Assets */ = { isa = PBXFileReference; path = Assets.xcassets; };\n/* End PBXFileReference section */\n}; rootObject = ABC; }\n';
  const actual = analyzeSupportSource({ path: 'sectioned.pbxproj', content: sectioned });
  assert.deepEqual(actual.boundaries, []);
  assert.ok(actual.facts.some(row => row.kind === 'PROJECT_RESOURCE' && row.pointer === '/project/objects/PBXFileReference/ABC/path' && row.value === 'Assets.xcassets'));
});
test('malformed data and unsupported sources remain explicit; deleted or forged facts are rejected', () => {
  assert.ok(analyzeSupportSource({ path: 'package.json', content: '{"bad":' }).boundaries.length);
  assert.ok(analyzeSupportSource({ path: 'a.js.map', content: '{"version":3,"sources":["a.ts"],"sourcesContent":[]}' }).boundaries.length);
  assert.ok(analyzeSupportSource({ path: 'CMakeLists.txt', content: 'add_library(x x.cpp)' }).boundaries.length);
  const expected = analyzeSupportSource({ path: 'app.json', content: '{"expo":{"name":"app"}}' }), actual = structuredClone(expected);
  actual.facts.pop();
  assert.equal(validateSupportSource(actual, expected).valid, false);
  const changed = structuredClone(expected); changed.facts.at(-1).value = 'other';
  assert.equal(validateSupportSource(changed, expected).valid, false);
});
