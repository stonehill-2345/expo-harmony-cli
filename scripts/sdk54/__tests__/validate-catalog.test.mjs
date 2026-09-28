import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { getDescriptorByName, SDK54_EXPO_COMMIT, SDK54_MVP_SOURCE_COMMIT } from '../catalog.mjs';
import { validateCatalog } from '../validate-catalog.mjs';

function createRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-catalog-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function writePackage(root, descriptor, overrides = {}) {
  const packageDir = path.join(root, descriptor.relativePath);
  fs.mkdirSync(packageDir, { recursive: true });
  const manifest = {
    name: descriptor.name,
    version: descriptor.version,
    private: true,
    ...overrides.manifest,
  };
  const provenance = {
    packageName: descriptor.name,
    version: descriptor.version,
    expoCommit: SDK54_EXPO_COMMIT,
    mvpSourceCommit: SDK54_MVP_SOURCE_COMMIT,
    publish: false,
    ...overrides.provenance,
  };
  fs.writeFileSync(path.join(packageDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(
    path.join(packageDir, 'harmony-upstream.json'),
    `${JSON.stringify(provenance, null, 2)}\n`,
  );
}

test('reports missing package directories instead of throwing', (t) => {
  const root = createRoot(t);
  const descriptor = getDescriptorByName('@expo/cli');
  const report = validateCatalog(root, [descriptor]);
  assert.deepEqual(report, {
    packages: 0,
    internalEdges: 0,
    publishable: [],
    failures: ['@expo/cli: package directory is missing'],
  });
});

test('validates exact package and provenance metadata', async (t) => {
  const descriptor = getDescriptorByName('@expo/cli');
  const cases = [
    {
      name: 'package name',
      overrides: { manifest: { name: '@expo/wrong' } },
      failure: '@expo/cli: expected package name @expo/cli, found @expo/wrong',
    },
    {
      name: 'version',
      overrides: { manifest: { version: '0.0.0' } },
      failure: '@expo/cli: expected version 54.0.27, found 0.0.0',
    },
    {
      name: 'private flag',
      overrides: { manifest: { private: false } },
      failure: '@expo/cli: private must be true',
    },
    {
      name: 'upstream commit',
      overrides: { provenance: { expoCommit: 'wrong' } },
      failure: `@expo/cli: expected expoCommit ${SDK54_EXPO_COMMIT}, found wrong`,
    },
    {
      name: 'MVP source commit',
      overrides: { provenance: { mvpSourceCommit: 'wrong' } },
      failure: `@expo/cli: expected mvpSourceCommit ${SDK54_MVP_SOURCE_COMMIT}, found wrong`,
    },
    {
      name: 'publish flag',
      overrides: { provenance: { publish: true } },
      failure: '@expo/cli: publish must be false',
    },
  ];

  for (const entry of cases) {
    await t.test(entry.name, (subtest) => {
      const root = createRoot(subtest);
      writePackage(root, descriptor, entry.overrides);
      const report = validateCatalog(root, [descriptor]);
      assert.ok(report.failures.includes(entry.failure), JSON.stringify(report, null, 2));
    });
  }
});

test('accepts a valid scoped package', (t) => {
  const root = createRoot(t);
  const descriptor = getDescriptorByName('@expo/cli');
  writePackage(root, descriptor);
  assert.deepEqual(validateCatalog(root, [descriptor]), {
    packages: 1,
    internalEdges: 0,
    publishable: [],
    failures: [],
  });
});

test('reports a version mismatch across the seven runtime packages', (t) => {
  const root = createRoot(t);
  const names = [
    'expo-asset',
    'expo-constants',
    'expo-font',
    'expo-linking',
    'expo-splash-screen',
    'expo-status-bar',
    'expo-system-ui',
  ];
  const descriptors = names.map(getDescriptorByName);
  for (const descriptor of descriptors) {
    writePackage(
      root,
      descriptor,
      descriptor.name === 'expo-font' ? { manifest: { version: '0.0.0' } } : {},
    );
  }
  const report = validateCatalog(root, descriptors);
  assert.ok(
    report.failures.includes('expo-font: expected version 14.0.12, found 0.0.0'),
    JSON.stringify(report, null, 2),
  );
});

test('rejects native artifacts and dependency or build caches', (t) => {
  const root = createRoot(t);
  const descriptor = getDescriptorByName('expo-asset');
  writePackage(root, descriptor);
  const packageDir = path.join(root, descriptor.relativePath);
  const forbidden = [
    'output.hap',
    'module.har',
    'archive.tgz',
    'node_modules/x',
    'oh_modules/x',
    '.hvigor/cache',
    '.cxx/cache',
    'build-cache/x',
  ];
  for (const relativePath of forbidden) {
    const filePath = path.join(packageDir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, 'forbidden');
  }
  fs.mkdirSync(path.join(packageDir, 'build'), { recursive: true });
  fs.writeFileSync(path.join(packageDir, 'build/output.js'), 'allowed');

  const report = validateCatalog(root, [descriptor]);
  for (const relativePath of forbidden) {
    assert.ok(
      report.failures.includes(`expo-asset: forbidden artifact ${relativePath}`),
      `missing rejection for ${relativePath}: ${JSON.stringify(report, null, 2)}`,
    );
  }
});

test('allows the tracked @expo/cli canary node_modules fixture only', (t) => {
  const root = createRoot(t);
  const descriptor = getDescriptorByName('@expo/cli');
  writePackage(root, descriptor);
  const fixtureFile = path.join(
    root,
    descriptor.relativePath,
    'static/canary-full/node_modules/react/index.js',
  );
  fs.mkdirSync(path.dirname(fixtureFile), { recursive: true });
  fs.writeFileSync(fixtureFile, 'module.exports = {};\n');

  const report = validateCatalog(root, [descriptor]);
  assert.equal(
    report.failures.some((failure) => failure.includes('forbidden artifact')),
    false,
    JSON.stringify(report, null, 2),
  );
});

test('ignores workspace-installed root node_modules inside a Git checkout', (t) => {
  const root = createRoot(t);
  fs.mkdirSync(path.join(root, '.git'));
  const descriptor = getDescriptorByName('expo-asset');
  writePackage(root, descriptor);
  const installedFile = path.join(root, descriptor.relativePath, 'node_modules/cache/index.js');
  fs.mkdirSync(path.dirname(installedFile), { recursive: true });
  fs.writeFileSync(installedFile, 'installed dependency\n');
  const report = validateCatalog(root, [descriptor]);
  assert.equal(report.failures.some((failure) => failure.includes('node_modules')), false, JSON.stringify(report, null, 2));
});
