const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const packageRoot = path.join(__dirname, '../..');
const sourcePath = path.join(packageRoot, 'src/fork/useLinking.native.ts');
const buildPath = path.join(packageRoot, 'build/fork/useLinking.native.js');
const mapPath = `${buildPath}.map`;

function assertHarmonyReload(contents, harmonyMarker, label) {
  const harmonyBranch = contents.indexOf(harmonyMarker);
  const expoLatest = contents.indexOf('return ExpoLinking.getLinkingURL();', harmonyBranch);
  const legacyInitial = contents.indexOf('Linking.getInitialURL()', harmonyBranch);

  assert.ok(harmonyBranch >= 0, `${label} must have an explicit Harmony initial URL branch`);
  assert.ok(expoLatest > harmonyBranch, `${label} must use the Ability-scoped latest URL`);
  assert.ok(legacyInitial > expoLatest, `${label} must not use the RNOH initial Want fallback`);
}

test('Harmony reload reads the latest ExpoLinking Ability URL in source and build', () => {
  const source = readFileSync(sourcePath, 'utf8');
  const build = readFileSync(buildPath, 'utf8');

  assertHarmonyReload(source, "(Platform.OS as string) === 'harmony'", 'source');
  assertHarmonyReload(build, "Platform.OS === 'harmony'", 'build');
});

test('Harmony reload build source map matches the TypeScript source', () => {
  const source = readFileSync(sourcePath, 'utf8');
  const sourceMap = JSON.parse(readFileSync(mapPath, 'utf8'));

  assert.deepEqual(sourceMap.sources, ['../../src/fork/useLinking.native.ts']);
  assert.deepEqual(sourceMap.sourcesContent, [source]);
});
