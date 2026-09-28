import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EXPECTED_INTERNAL_EDGES,
  SDK54_EXPO_COMMIT,
  SDK54_MVP_SOURCE_COMMIT,
  SDK54_PACKAGES,
  getDescriptorByName,
} from '../catalog.mjs';

const expectedPackages = [
  ['@expo/cli', '54.0.27', 'packages/@expo/cli', '@expo+cli+54.0.27.patch'],
  ['@expo/metro-config', '54.0.17', 'packages/@expo/metro-config', '@expo+metro-config+54.0.17.patch'],
  ['expo', '54.0.37', 'packages/expo', 'expo+54.0.37.patch'],
  ['expo-asset', '12.0.13', 'packages/expo-asset', 'expo-asset+12.0.13.patch'],
  ['expo-constants', '18.0.14', 'packages/expo-constants', 'expo-constants+18.0.14.patch'],
  ['expo-font', '14.0.12', 'packages/expo-font', 'expo-font+14.0.12.patch'],
  ['expo-linking', '8.0.12', 'packages/expo-linking', 'expo-linking+8.0.12.patch'],
  ['expo-modules-autolinking', '3.0.27', 'packages/expo-modules-autolinking', 'expo-modules-autolinking+3.0.27.patch'],
  ['expo-modules-core', '3.0.30', 'packages/expo-modules-core', 'expo-modules-core+3.0.30.patch'],
  ['expo-router', '6.0.24', 'packages/expo-router', 'expo-router+6.0.24.patch'],
  ['expo-splash-screen', '31.0.13', 'packages/expo-splash-screen', 'expo-splash-screen+31.0.13.patch'],
  ['expo-status-bar', '3.0.9', 'packages/expo-status-bar', 'expo-status-bar+3.0.9.patch'],
  ['expo-system-ui', '6.0.9', 'packages/expo-system-ui', 'expo-system-ui+6.0.9.patch'],
  ['expo-web-browser', '15.0.11', 'packages/expo-web-browser', 'expo-web-browser+15.0.11.patch'],
];

const fixedBuildEnvironment = {
  CI: '1',
  EXPO_NONINTERACTIVE: '1',
  TZ: 'UTC',
  LC_ALL: 'C',
  LANG: 'C',
  SOURCE_DATE_EPOCH: '946684800',
};

test('pins the approved source commits and fourteen exact packages', () => {
  assert.equal(SDK54_EXPO_COMMIT, '5b42e3d21e0ac5e086752361ca8a5cb4de53bec1');
  assert.equal(SDK54_MVP_SOURCE_COMMIT, '2704a48cc52781f510b3996af17c882fb82e1090');
  assert.deepEqual(
    SDK54_PACKAGES.map(({ name, version, relativePath, patchFile }) => [
      name,
      version,
      relativePath,
      patchFile,
    ]),
    expectedPackages,
  );
  assert.equal(EXPECTED_INTERNAL_EDGES.length, 22);
  assert.equal(getDescriptorByName('expo-modules-autolinking').templateOwner, true);
  assert.deepEqual(
    SDK54_PACKAGES.filter(({ templateOwner }) => templateOwner).map(({ name }) => name),
    ['expo-modules-autolinking'],
  );
  assert.throws(() => getDescriptorByName('expo-image'), /Unknown SDK54 package: expo-image/);
});

test('allowlists only the three runtime build recipes with fixed argv and environment', () => {
  const recipes = Object.fromEntries(
    SDK54_PACKAGES.filter(({ build }) => build).map(({ name, build }) => [name, build]),
  );
  assert.deepEqual(Object.keys(recipes), [
    '@expo/cli',
    '@expo/metro-config',
    'expo-modules-autolinking',
  ]);
  assert.deepEqual(recipes['@expo/cli'].argv, [
    'pnpm', '--dir', '{packageDir}', 'exec', 'taskr', 'release',
  ]);
  for (const name of ['@expo/metro-config', 'expo-modules-autolinking']) {
    assert.deepEqual(recipes[name].argv, [
      'pnpm', '--dir', '{packageDir}', 'exec', 'expo-module', 'tsc',
      '--project', 'tsconfig.json', '--pretty', 'false',
    ]);
  }
  for (const recipe of Object.values(recipes)) {
    assert.deepEqual(recipe.env, fixedBuildEnvironment);
    assert.equal(recipe.shell, false);
  }
});

test('declares package-specific runtime outputs and executable runtime probes', () => {
  assert.deepEqual(
    getDescriptorByName('@expo/cli').runtime.requiredFiles.map(({ path }) => path),
    [
      'build/bin/cli',
      'build/src/run/harmony/runHarmonyAsync.js',
      'build/src/prebuild/harmony/prebuildHarmonyAsync.js',
    ],
  );
  assert.equal(
    getDescriptorByName('@expo/cli').runtime.requiredFiles[0].executable,
    true,
  );
  assert.deepEqual(
    getDescriptorByName('@expo/metro-config').runtime.requiredFiles.map(({ path }) => path),
    ['build/withHarmony.js'],
  );
  assert.deepEqual(
    getDescriptorByName('expo-modules-autolinking').runtime.requiredFiles.map(({ path }) => path),
    [
      'build/platforms/harmony/index.js',
      'build/platforms/harmony/nativeProject.js',
    ],
  );
  for (const name of ['@expo/cli', '@expo/metro-config', 'expo-modules-autolinking']) {
    assert.ok(getDescriptorByName(name).runtime.probe, name);
    assert.equal(getDescriptorByName(name).runtime.semanticChecks, undefined);
  }
});
