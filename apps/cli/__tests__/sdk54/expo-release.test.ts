import { expect, it, vi } from 'vitest';
// Source-workspace tests resolve the same helper source that the candidate package compiles.
vi.mock('@expo/metro-config/build/harmonyProject', async () =>
  import('../../../../packages/@expo/metro-config/src/harmonyProject'),
);
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getHarmonyRelease, versionHarmonyPackage, harmonyInstallSpec, hasReleaseIdentity } from '../../../../packages/@expo/cli/src/harmony/release';
import { loadReleaseManifest } from '../../src/sdk54/release-manifest';
import { enableHarmonyMetroForManagedProject } from '../../../../packages/@expo/cli/src/start';
import currentRelease from '../../../../docs/releases/sdk54-expo-oh-harmony.1.json';

it('requires installed release identities and keeps Harmony enabled after managed state is deleted', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-release-start-'));
  const previous = process.env.EXPO_HARMONY_METRO;
  try {
    const stateOnlyDir = path.join(dir, 'state-only');
    fs.mkdirSync(path.join(stateOnlyDir, '.expo-harmony'), { recursive: true });
    fs.writeFileSync(path.join(stateOnlyDir, '.expo-harmony/managed-state.json'), JSON.stringify({ sdk54: { mode: 'sdk54-scoped-packages' } }));
    delete process.env.EXPO_HARMONY_METRO;
    expect(enableHarmonyMetroForManagedProject(stateOnlyDir)).toBe(false);
    const expo = currentRelease.packages.find(item => item.installName === 'expo')!;
    const expoRoot = path.join(dir, 'node_modules/expo');
    const rnohName = '@react-native-oh/react-native-harmony';
    const rnohRoot = path.join(dir, 'node_modules', rnohName);
    fs.mkdirSync(expoRoot, { recursive: true });
    fs.mkdirSync(rnohRoot, { recursive: true });
    fs.writeFileSync(path.join(expoRoot, 'package.json'), JSON.stringify({ name: expo.publishName, version: expo.publishVersion }));
    fs.writeFileSync(path.join(expoRoot, 'harmony-release.json'), JSON.stringify(currentRelease));
    fs.writeFileSync(path.join(rnohRoot, 'package.json'), JSON.stringify({ name: rnohName, version: currentRelease.catalog.external[rnohName] }));
    fs.mkdirSync(path.join(dir, '.expo-harmony'));
    fs.writeFileSync(path.join(dir, '.expo-harmony/managed-state.json'), JSON.stringify({ sdk54: { mode: 'sdk54-scoped-packages' } }));
    expect(enableHarmonyMetroForManagedProject(dir)).toBe(true);
    fs.rmSync(path.join(dir, '.expo-harmony'), { recursive: true });
    expect(enableHarmonyMetroForManagedProject(dir)).toBe(true);
    expect(process.env.EXPO_HARMONY_METRO).toBeUndefined();
    fs.writeFileSync(path.join(expoRoot, 'package.json'), JSON.stringify({ name: 'expo', version: expo.publishVersion }));
    process.env.EXPO_HARMONY_METRO = '1';
    expect(enableHarmonyMetroForManagedProject(dir)).toBe(false);
  } finally {
    if (previous === undefined) delete process.env.EXPO_HARMONY_METRO;
    else process.env.EXPO_HARMONY_METRO = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

it('keeps install and fix specs scoped and rejects unsupported explicit versions', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-release-'));
  try {
    const root = path.join(dir, 'node_modules/expo');
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: '@expo-oh/expo', version: '54.0.37' }));
    fs.writeFileSync(path.join(root, 'harmony-release.json'), JSON.stringify(loadReleaseManifest()));
    const release = getHarmonyRelease(dir)!;
    const expected = 'expo-font@npm:@expo-oh/expo-font@14.0.12';
    expect(versionHarmonyPackage(release, 'expo-font')).toBe(expected);
    expect(versionHarmonyPackage(release, 'expo-font@14.0.12')).toBe(expected);
    expect(versionHarmonyPackage(release, expected)).toBe(expected);
    expect(harmonyInstallSpec(dir, 'expo-font', '14.0.12')).toBe(expected);
    expect(() => versionHarmonyPackage(release, 'expo-font@latest')).toThrow(/outside/);
    expect(() => versionHarmonyPackage(release, 'expo-font@13.0.0')).toThrow(/outside/);
    const item = release.packages.find(p => p.installName === 'expo')!;
    expect(hasReleaseIdentity(dir, item)).toBe(true);
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'expo', version: item.publishVersion }));
    expect(hasReleaseIdentity(dir, item)).toBe(false);
    expect(getHarmonyRelease(dir)).toBe(null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
