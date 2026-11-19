import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { SDK54_EXPO_COMMIT } from '../catalog.mjs';
import { compareSourceSeeds } from '../source-seed-diff.mjs';
import {
  buildSourceInventory,
  serializeInventory,
  validateSourceInventory,
} from '../source-inventory.mjs';

function fixture(t, { patterns, malformed = false, duplicate = false, symlinkManifest = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-source-index-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, value) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), typeof value === 'string' ? value : JSON.stringify(value));
  };
  write('package.json', {
    name: 'source-fixture', private: true,
    workspaces: { packages: patterns ?? ['packages/*', 'packages/@expo/*', '!packages/excluded'] },
  });
  write('packages/expo/package.json', malformed ? '{' : {
    name: 'expo', version: '54.0.37', main: 'src/index.ts',
    dependencies: { '@expo/config': '~12.0.0', external: '^1.0.0', 'config-alias': 'npm:@expo/config@~12.0.0' },
    scripts: { test: 'jest' },
  });
  write('packages/expo/src/index.ts', 'export const answer = 42;\n');
  if (symlinkManifest) {
    fs.renameSync(path.join(root, 'packages/expo/package.json'), path.join(root, 'expo-manifest.json'));
    fs.symlinkSync('../../expo-manifest.json', path.join(root, 'packages/expo/package.json'));
  }
  write('packages/expo/fixture/package.json', { name: 'fixture-not-a-workspace', version: '1.0.0' });
  write('packages/@expo/config/package.json', {
    name: duplicate ? 'expo' : '@expo/config', version: '12.0.0', private: true,
    exports: { '.': { types: './build/index.d.ts', default: './build/index.js' } },
    bin: { config: './bin/config.js' },
  });
  write('packages/excluded/package.json', { name: 'excluded', version: '1.0.0' });
  write('templates/expo-template-blank-typescript/package.json', {
    name: 'expo-template-blank-typescript', version: '54.0.0', dependencies: { expo: '~54.0.37' },
  });
  write('templates/expo-template-blank-typescript/fixtures/package.json', { name: 'nested-fixture' });
  const git = (args, options = {}) => execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8', ...options,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.test', GIT_COMMITTER_NAME: 'Fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.test', GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z' },
  }).trim();
  git(['init', '--quiet']);
  git(['add', '.']);
  const tree = git(['write-tree']);
  const revision = git(['commit-tree', tree], { input: 'source fixture\n' });
  return { root, revision, tree, write, options: { sourceDir: root, revision } };
}

test('PKG-01: pins commit/tree and produces deterministic portable output', (t) => {
  const f = fixture(t);
  const first = buildSourceInventory(f.options);
  assert.equal(first.source.revision, f.revision);
  assert.equal(first.source.tree, f.tree);
  assert.equal(first.completeness.publicSurface, false);
  assert.equal(first.completeness.stageClosable, false);
  assert.equal(serializeInventory(first), serializeInventory(buildSourceInventory(f.options)));
  assert.ok(!serializeInventory(first).includes(f.root));
  assert.deepEqual(validateSourceInventory(first, f.options), { valid: true, failures: [] });
});

test('PKG-02: deleting a record cannot pass by recalculating the self-reported hash', (t) => {
  const f = fixture(t);
  const inventory = buildSourceInventory(f.options);
  inventory.packages = inventory.packages.filter((entry) => entry.name !== 'expo');
  inventory.packagesHash = 'recalculated-or-forged';
  const result = validateSourceInventory(inventory, f.options);
  assert.equal(result.valid, false);
  assert.ok(result.failures.some((message) => /missing.*packages\/expo\/package.json/.test(message)));
});

test('PKG-03: rejects extra/duplicate records and altered identities/dependencies/source', (t) => {
  const f = fixture(t);
  const original = buildSourceInventory(f.options);
  const mutations = [
    (value) => value.packages.push({ ...value.packages[0], id: 'PKG:unknown' }),
    (value) => value.packages.push(value.packages[0]),
    (value) => { value.packages[0].version = '999.0.0'; },
    (value) => { value.packages.find((entry) => entry.name === 'expo').dependencies = {}; },
    (value) => { value.source.revision = '0'.repeat(40); },
    (value) => { value.completeness.publicSurface = true; },
    (value) => { delete value.source; },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const value = structuredClone(original);
    mutate(value);
    assert.equal(validateSourceInventory(value, f.options).valid, false, `mutation ${index}`);
  }
  assert.equal(validateSourceInventory(null, f.options).valid, false);
});

test('PKG-04: includes scoped/private packages and template roots, excludes fixtures', (t) => {
  const f = fixture(t);
  const inventory = buildSourceInventory(f.options);
  assert.deepEqual(inventory.packages.map((entry) => entry.name), ['@expo/config', 'expo']);
  const config = inventory.packages[0];
  assert.equal(config.private, true);
  assert.equal(config.sourcePath, 'packages/@expo/config/package.json');
  assert.deepEqual(config.entryPoints.exports, {
    '.': { default: './build/index.js', types: './build/index.d.ts' },
  });
  const expo = inventory.packages.find((entry) => entry.name === 'expo');
  assert.equal(expo.dependencies.dependencies['@expo/config'].targetId, 'PKG:@expo/config');
  assert.equal(expo.dependencies.dependencies.external.targetId, null);
  assert.equal(expo.dependencies.dependencies.external.spec, '^1.0.0');
  assert.equal(expo.dependencies.dependencies['config-alias'].targetId, null);
  assert.equal(expo.dependencies.dependencies['config-alias'].spec, 'npm:@expo/config@~12.0.0');
  assert.equal(inventory.templates.length, 1);
  assert.equal(inventory.templates[0].name, 'expo-template-blank-typescript');
});

test('PKG-05: fails closed on unsupported patterns, wrong commit and broken manifests', (t) => {
  for (const patterns of [['packages/{expo,config}'], [], ['../*'], ['packages/[ab]*'], ['packages/@(expo|config)']]) {
    const f = fixture(t, { patterns });
    assert.throws(() => buildSourceInventory(f.options), /workspace/i);
  }
  const malformed = fixture(t, { malformed: true });
  assert.throws(() => buildSourceInventory(malformed.options), /packages\/expo\/package.json/);
  const duplicate = fixture(t, { duplicate: true });
  assert.throws(() => buildSourceInventory(duplicate.options), /duplicate.*expo/i);
  const valid = fixture(t);
  assert.throws(() => buildSourceInventory({ ...valid.options, revision: '0'.repeat(40) }), /revision|commit/i);
  assert.throws(() => buildSourceInventory({ ...valid.options, revision: 'HEAD' }), /revision/i);
});

test('rejects a workspace manifest symlink instead of silently omitting the package', (t) => {
  const f = fixture(t, { symlinkManifest: true });
  assert.throws(() => buildSourceInventory(f.options), /symlink.*packages\/expo\/package.json/i);
});

test('reports missing immutable blobs with the source location and no implicit network', (t) => {
  const f = fixture(t);
  const inventory = buildSourceInventory(f.options);
  const { manifestBlob } = inventory.packages.find((entry) => entry.name === 'expo');
  fs.rmSync(path.join(f.root, '.git/objects', manifestBlob.slice(0, 2), manifestBlob.slice(2)));
  assert.throws(() => buildSourceInventory(f.options), /Missing source blob for packages\/expo\/package.json/);
});

test('matches recursive workspace patterns', (t) => {
  const f = fixture(t, { patterns: ['packages/**', '!packages/excluded'] });
  const inventory = buildSourceInventory(f.options);
  assert.ok(inventory.packages.some((entry) => entry.name === 'fixture-not-a-workspace'));
});

test('PKG-06: reads immutable commit objects even when checkout changes or disappears', (t) => {
  const f = fixture(t);
  const before = serializeInventory(buildSourceInventory(f.options));
  f.write('packages/expo/package.json', { name: 'fake', version: '999.0.0' });
  f.write('packages/new/package.json', { name: 'untracked', version: '1.0.0' });
  fs.rmSync(path.join(f.root, 'templates'), { recursive: true });
  assert.equal(serializeInventory(buildSourceInventory(f.options)), before);
});

test('CLI rejects unknown arguments and non-pinned repositories with nonzero exit', (t) => {
  const f = fixture(t);
  const script = path.resolve('scripts/sdk54/source-inventory.mjs');
  for (const args of [[], ['--unknown'], ['--source', f.root, '--output', path.join(f.root, 'out.json')]]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.ok(result.stderr.length > 0);
  }
});

test('SEED-DIFF: preserves both directions without declaring missing sources out of scope', (t) => {
  const f = fixture(t, { patterns: ['packages/**', '!packages/excluded'] });
  const inventory = buildSourceInventory(f.options);
  assert.throws(() => compareSourceSeeds(inventory, {}, {}), /fixed Expo/);
  inventory.source.revision = SDK54_EXPO_COMMIT;
  const result = compareSourceSeeds(inventory, { expo: '~54.0.37', 'external-rn': '^1.0.0' }, {});
  assert.equal(result.summary.present, 2);
  assert.equal(result.sourceOnly.length, 1);
  assert.equal(result.sourceOnly[0].name, 'fixture-not-a-workspace');
  const external = result.seeds.find((entry) => entry.name === 'external-rn');
  assert.equal(external.result, 'absent-from-workspace');
  assert.equal(external.bundledSpec, '^1.0.0');
  assert.equal(external.review, '未完成范围及来源评估');
  assert.equal(result.stageClosable, false);
  assert.equal(result.summary.present + result.summary.absent, result.summary.seeds);
  assert.equal(result.summary.present + result.summary.sourceOnly, result.summary.workspacePackages);
  inventory.packages.push(inventory.packages[0]);
  assert.throws(() => compareSourceSeeds(inventory, {}, {}), /Duplicate source/);
});
