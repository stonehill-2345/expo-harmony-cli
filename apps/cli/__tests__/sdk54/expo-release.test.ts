import { expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getHarmonyRelease, versionHarmonyPackage, harmonyInstallSpec, hasReleaseIdentity } from '../../../../packages/@expo/cli/src/harmony/release';
import { loadReleaseManifest } from '../../src/sdk54/release-manifest';
import { enableHarmonyMetroForManagedProject } from '../../../../packages/@expo/cli/src/start';

it('enables standalone Harmony Metro for scoped managed projects', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-release-start-'));
  const previous = process.env.EXPO_HARMONY_METRO;
  try {
    fs.mkdirSync(path.join(dir, '.expo-harmony'));
    fs.writeFileSync(path.join(dir, '.expo-harmony/managed-state.json'), JSON.stringify({ sdk54: { mode: 'sdk54-scoped-packages' } }));
    delete process.env.EXPO_HARMONY_METRO;
    expect(enableHarmonyMetroForManagedProject(dir)).toBe(true);
    expect(process.env.EXPO_HARMONY_METRO).toBe('1');
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
