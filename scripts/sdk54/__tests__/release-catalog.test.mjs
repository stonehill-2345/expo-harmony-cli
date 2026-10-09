import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';
const semver = createRequire(new URL('../../../apps/cli/package.json', import.meta.url))('semver');
import { SDK54_PACKAGES, EXPECTED_INTERNAL_EDGES } from '../catalog.mjs';
import { RELEASE_PACKAGES, rewriteReleaseManifest, createReleaseManifest } from '../release-catalog.mjs';

test('release covers all fourteen Expo packages and screens without the product CLI', () => {
  assert.equal(RELEASE_PACKAGES.length, 15);
  assert.equal(new Set(RELEASE_PACKAGES.map(p => p.publishName)).size, 15);
  assert.ok(!RELEASE_PACKAGES.some(p => p.installName === 'expo-harmony-cli'));
  for (const p of SDK54_PACKAGES) {
    const release = RELEASE_PACKAGES.find(r => r.installName === p.name);
    assert.equal(release.upstreamVersion, p.version);
    assert.equal(release.publishVersion, p.version);
  }
});

test('rewrite preserves dependency keys, optional peers and source manifests', () => {
  for (const p of SDK54_PACKAGES) {
    const source = JSON.parse(fs.readFileSync(`${p.relativePath}/package.json`));
    const before = JSON.stringify(source);
    const output = rewriteReleaseManifest(source);
    assert.equal(JSON.stringify(source), before);
    assert.equal(output.private, false);
    assert.ok(output.name.startsWith('@expo-oh/'));
    assert.deepEqual(output.peerDependenciesMeta, source.peerDependenciesMeta);
    for (const edge of EXPECTED_INTERNAL_EDGES.filter(e => e.from === p.name)) {
      const target = RELEASE_PACKAGES.find(r => r.installName === edge.to);
      if (edge.section === 'dependencies') assert.equal(output.dependencies[edge.to], target.installSpec);
      else assert.ok(semver.satisfies(target.publishVersion, output.peerDependencies[edge.to]), `${p.name} -> ${edge.to}`);
    }
  }
});

test('runtime manifest maps template packages without patch dependencies', () => {
  const manifest = createReleaseManifest();
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.cliVersion, '1.5.1');
  assert.equal(manifest.packages.length, 15);
  assert.equal(manifest.packages.find(p => p.installName === 'expo').installSpec, 'npm:@expo-oh/expo@54.0.37');
  assert.ok(!manifest.templates.default.devDependencies['patch-package']);
  assert.ok(manifest.templates.default.externalPackages.includes('@react-native-ohos/react-native-screens'));
});
