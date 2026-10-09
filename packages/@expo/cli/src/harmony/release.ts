import fs from 'fs';
import path from 'path';
import resolveFrom from 'resolve-from';
import npmPackageArg from 'npm-package-arg';

import { CommandError } from '../utils/errors';

type ReleasePackage = { installName: string; upstreamVersion: string; publishName: string; publishVersion: string; installSpec: string };
type HarmonyRelease = { schemaVersion: number; release: string; packages: ReleasePackage[]; catalog: { external: Record<string, string> }; templates: { default: { dependencies: Record<string, string> } } };

export function getHarmonyRelease(projectRoot: string): HarmonyRelease | null {
  const file = resolveFrom.silent(projectRoot, 'expo/package.json');
  if (!file) return null;
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (pkg.name !== '@expo-oh/expo') return null;
  const manifest = JSON.parse(fs.readFileSync(path.join(path.dirname(file), 'harmony-release.json'), 'utf8'));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.packages)) throw new CommandError('HARMONY_RELEASE', 'Invalid @expo-oh release manifest');
  return manifest;
}

export function harmonyVersions(release: HarmonyRelease): Record<string, string> {
  return {
    ...release.catalog.external,
    ...release.templates.default.dependencies,
    ...Object.fromEntries(release.packages.map(p => [p.installName, p.publishVersion])),
  };
}

export function harmonyInstallSpec(projectRoot: string, name: string, version: string): string {
  const item = getHarmonyRelease(projectRoot)?.packages.find(p => p.installName === name);
  return `${name}@${item?.installSpec ?? version}`;
}

export function versionHarmonyPackage(release: HarmonyRelease, arg: string): string | null {
  const parsed = npmPackageArg(arg);
  const item = release.packages.find(p => p.installName === parsed.name || p.publishName === parsed.name);
  if (!item) return null;
  if (![ '', '*', item.upstreamVersion, item.publishVersion, item.installSpec ].includes(parsed.rawSpec)) {
    throw new CommandError('HARMONY_RELEASE', `${arg} is outside ${release.release}; expected ${item.installName}@${item.installSpec}`);
  }
  return `${item.installName}@${item.installSpec}`;
}

export function hasReleaseIdentity(projectRoot: string, item: ReleasePackage): boolean {
  const file = resolveFrom.silent(projectRoot, `${item.installName}/package.json`);
  if (!file) return false;
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
  return pkg.name === item.publishName && pkg.version === item.publishVersion;
}
