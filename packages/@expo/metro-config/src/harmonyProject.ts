import fs from 'fs';
import path from 'path';
import resolveFrom from 'resolve-from';

const harmonyPackage = '@react-native-oh/react-native-harmony';
const supportedRelease = {
  release: 'sdk54-expo-oh-harmony.1',
  expo: {
    installName: 'expo',
    publishName: '@expo-oh/expo',
    publishVersion: '54.0.39',
    upstreamVersion: '54.0.37',
    installSpec: 'npm:@expo-oh/expo@54.0.39',
  },
  harmonyVersion: '0.82.30',
} as const;

/** Detect installed release identity without reading CLI-managed state or changing process state. */
export function isHarmonyProject(projectRoot: string): boolean {
  const expoFile = resolveFrom.silent(projectRoot, 'expo/package.json');
  if (!expoFile) return false;
  const expo = JSON.parse(fs.readFileSync(expoFile, 'utf8'));
  if (expo.name !== '@expo-oh/expo') return false;

  // Once an adapted Expo package is identified, damaged release metadata is an error.
  // Falling back to official Expo would hide an incomplete or mixed installation.
  const manifestFile = path.join(path.dirname(expoFile), 'harmony-release.json');
  let release: any;
  try {
    release = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid Harmony release manifest at ${manifestFile}: ${String(error)}`);
  }
  const expoEntries = Array.isArray(release?.packages)
    ? release.packages.filter((item: any) => item?.installName === 'expo')
    : [];
  const expectedVersion = release?.catalog?.external?.[harmonyPackage];
  if (
    release?.schemaVersion !== 1 ||
    release.release !== supportedRelease.release ||
    expoEntries.length !== 1 ||
    expo.version !== supportedRelease.expo.publishVersion ||
    Object.entries(supportedRelease.expo).some(([key, value]) => expoEntries[0]?.[key] !== value) ||
    expoEntries[0].publishName !== expo.name ||
    expoEntries[0].publishVersion !== expo.version ||
    expectedVersion !== supportedRelease.harmonyVersion
  ) {
    throw new Error(
      `Invalid Harmony release identity or pinned RNOH catalog version at ${manifestFile}`
    );
  }

  const harmonyFile = resolveFrom.silent(projectRoot, `${harmonyPackage}/package.json`);
  if (!harmonyFile) return false;
  const harmony = JSON.parse(fs.readFileSync(harmonyFile, 'utf8'));
  return harmony.name === harmonyPackage && harmony.version === expectedVersion;
}

export function shouldEnableHarmonyMetro(projectRoot: string, platform?: string): boolean {
  return platform === 'harmony' || isHarmonyProject(projectRoot);
}
