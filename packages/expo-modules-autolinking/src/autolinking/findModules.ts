import fs from 'fs';
import path from 'path';

import { discoverExpoModuleConfigAsync } from '../ExpoModuleConfig';
import { AutolinkingOptions } from '../commands/autolinkingOptions';
import {
  type DependencyResolution,
  scanDependenciesRecursively,
  scanDependenciesInSearchPath,
  filterMapResolutionResult,
  mergeResolutionResults,
} from '../dependencies';
import { PackageRevision, SearchResults, SupportedPlatform } from '../types';
import { discoverRnohHarmonyConfigAsync } from '../platforms/harmony/rnohConfig';

export async function resolveExpoModule(
  resolution: DependencyResolution,
  platform: SupportedPlatform,
  excludeNames: Set<string>
): Promise<PackageRevision | null> {
  if (excludeNames.has(resolution.name)) {
    return null;
  }
  let expoModuleConfig = await discoverExpoModuleConfigAsync(resolution.path);
  if (platform === 'harmony') {
    if (expoModuleConfig?.supportsPlatform('harmony')) {
      if (!expoModuleConfig.harmonyConfig()) {
        throw new Error(`Invalid Harmony config for "${resolution.name}" at "${resolution.path}": missing Harmony metadata`);
      }
    } else {
      expoModuleConfig = await discoverRnohHarmonyConfigAsync(resolution.path, resolution.name);
    }
    if (expoModuleConfig && resolution.duplicates?.length) {
      const root = await fs.promises.realpath(resolution.path);
      for (const duplicate of resolution.duplicates) {
        if (await fs.promises.realpath(duplicate.path) !== root) {
          throw new Error(`Harmony native identity conflict for "${resolution.name}": "${resolution.path}" (${resolution.version}) and "${duplicate.path}" (${duplicate.version}) conflict on native package identity`);
        }
      }
    }
  }
  if (expoModuleConfig && expoModuleConfig.supportsPlatform(platform)) {
    return {
      name: resolution.name,
      path: resolution.path,
      version: resolution.version,
      ...(platform === 'harmony' ? await readNpmIdentityAsync(resolution.path) : {}),
      config: expoModuleConfig,
      duplicates:
        resolution.duplicates?.map((duplicate) => ({
          name: duplicate.name,
          path: duplicate.path,
          version: duplicate.version,
        })) ?? [],
    };
  } else {
    return null;
  }
}

async function readNpmIdentityAsync(packageRoot: string) {
  const manifest = JSON.parse(await fs.promises.readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  return { npmPackageName: manifest.name, npmPackageVersion: manifest.version };
}

interface FindModulesParams {
  appRoot: string;
  autolinkingOptions: AutolinkingOptions & { platform: SupportedPlatform };
}

/** Searches for modules to link based on given config. */
export async function findModulesAsync({
  appRoot,
  autolinkingOptions,
}: FindModulesParams): Promise<SearchResults> {
  const excludeNames = new Set(autolinkingOptions.exclude);

  // custom native modules should be resolved first so that they can override other modules
  const searchPaths = autolinkingOptions.nativeModulesDir
    ? [autolinkingOptions.nativeModulesDir, ...autolinkingOptions.searchPaths]
    : autolinkingOptions.searchPaths;

  return filterMapResolutionResult(
    mergeResolutionResults(
      await Promise.all([
        ...searchPaths.map((searchPath) => scanDependenciesInSearchPath(searchPath)),
        scanDependenciesRecursively(appRoot),
      ])
    ),
    (resolution) => resolveExpoModule(resolution, autolinkingOptions.platform, excludeNames)
  );
}
