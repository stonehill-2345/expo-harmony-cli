import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  BLANK_DEV_DEPENDENCIES,
  BLANK_EXPO_PACKAGES,
  BLANK_PLAIN_DEPENDENCIES,
  DEFAULT_DEV_DEPENDENCIES,
  DEFAULT_EXPO_PACKAGES,
  DEFAULT_EXTERNAL_PACKAGES,
  DEFAULT_IMAGE_FILES,
  DEFAULT_IMAGE_IMPORT,
  DEFAULT_PLAIN_DEPENDENCIES,
  DEFAULT_REACT_NATIVE_IMAGE_IMPORT,
  EXPO_ARCHIVE_VERSIONS,
  EXTERNAL_ARCHIVE_VERSIONS,
  OFFICIAL_TEMPLATE_DEPENDENCIES,
} from '../fixture-contract.mjs';
import {
  buildCliPatchManifest,
  stableManifestText,
  writeCliPatchManifest,
} from '../generate-cli-patch-manifest.mjs';

test('builds the SDK54 CLI manifest directly from the fixture contract', () => {
  const manifest = buildCliPatchManifest();

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.patchSet, 'sdk54-mvp-1');
  assert.equal(manifest.createExpoApp, '5.0.0');
  assert.equal(manifest.patchPackageVersion, '8.0.0');
  assert.deepEqual(manifest.catalog.expo, EXPO_ARCHIVE_VERSIONS);
  assert.deepEqual(manifest.catalog.external, EXTERNAL_ARCHIVE_VERSIONS);
  assert.deepEqual(manifest.templates['blank-typescript'], {
    sourceDependencies: OFFICIAL_TEMPLATE_DEPENDENCIES['blank-typescript'],
    expoPackages: BLANK_EXPO_PACKAGES,
    externalPackages: ['@react-native-oh/react-native-harmony'],
    dependencies: BLANK_PLAIN_DEPENDENCIES,
    devDependencies: BLANK_DEV_DEPENDENCIES,
  });
  assert.deepEqual(manifest.templates.default, {
    sourceDependencies: OFFICIAL_TEMPLATE_DEPENDENCIES.default,
    expoPackages: DEFAULT_EXPO_PACKAGES,
    externalPackages: DEFAULT_EXTERNAL_PACKAGES,
    dependencies: DEFAULT_PLAIN_DEPENDENCIES,
    devDependencies: DEFAULT_DEV_DEPENDENCIES,
  });
  assert.deepEqual(manifest.defaultImage, {
    files: DEFAULT_IMAGE_FILES,
    sourceImport: DEFAULT_IMAGE_IMPORT,
    replacementImport: DEFAULT_REACT_NATIVE_IMAGE_IMPORT,
  });
  assert.deepEqual(manifest.patches, []);
});

test('writes stable manifest bytes without local paths or registry addresses', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-manifest-'));
  try {
    const first = path.join(tmp, 'first.json');
    const second = path.join(tmp, 'second.json');
    writeCliPatchManifest(first, buildCliPatchManifest());
    writeCliPatchManifest(second, buildCliPatchManifest());
    const firstText = fs.readFileSync(first, 'utf8');
    assert.equal(firstText, fs.readFileSync(second, 'utf8'));
    assert.equal(firstText, stableManifestText(buildCliPatchManifest()));
    assert.doesNotMatch(firstText, /\/Users\/|\/private\/|registry|\.tgz/i);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
