import { getConfig } from '@expo/config';
import { resolveEntryPoint } from '@expo/config/paths';
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import resolveFrom from 'resolve-from';

import { ensureHarmonyDependenciesAsync } from '../../harmony/dependencies';
import { CommandError } from '../../utils/errors';

interface HarmonyAutolinkingExports {
  queryAutolinkingModulesFromProjectAsync(
    projectRoot: string,
    options: { platform: 'harmony' }
  ): Promise<any[]>;
  syncHarmonyNativeProjectAsync(options: any): Promise<any>;
}

interface HarmonyPrebuildDependencies {
  getConfig: typeof getConfig;
  ensureDependencies: typeof ensureHarmonyDependenciesAsync;
  loadAutolinking: (projectRoot: string) => Promise<HarmonyAutolinkingExports>;
  removeHarmonyProject: (harmonyRoot: string) => Promise<void>;
  updateDebugBundlePath: typeof updateHarmonyDebugBundlePathAsync;
}

const defaultDependencies: HarmonyPrebuildDependencies = {
  getConfig,
  ensureDependencies: ensureHarmonyDependenciesAsync,
  loadAutolinking: async (projectRoot) => {
    const expoPackageJson = resolveFrom(projectRoot, 'expo/package.json');
    return createRequire(expoPackageJson)('expo-modules-autolinking/exports');
  },
  removeHarmonyProject: async (harmonyRoot) => {
    await fs.promises.rm(harmonyRoot, { recursive: true, force: true });
  },
  updateDebugBundlePath: updateHarmonyDebugBundlePathAsync,
};

export async function prebuildHarmonyAsync(
  projectRoot: string,
  options: {
    install: boolean;
    clean?: boolean;
    bundleName?: string;
    packageManagerOptions?: { npm?: boolean; yarn?: boolean; pnpm?: boolean; bun?: boolean };
  },
  dependencies: HarmonyPrebuildDependencies = defaultDependencies
) {
  await dependencies.ensureDependencies(projectRoot, {
    install: options.install,
    packageManagerOptions: options.packageManagerOptions,
  });
  if (options.clean) {
    await dependencies.removeHarmonyProject(path.join(projectRoot, 'harmony'));
  }

  const { exp } = dependencies.getConfig(projectRoot, {
    skipPlugins: true,
    skipSDKVersionRequirement: true,
  });
  const autolinking = await dependencies.loadAutolinking(projectRoot);
  const modules = await autolinking.queryAutolinkingModulesFromProjectAsync(projectRoot, {
    platform: 'harmony',
  });
  const core = modules.find((module) => module.packageName === 'expo-modules-core');
  if (!core?.packageRoot) {
    throw new CommandError('HARMONY_AUTOLINKING', 'expo-modules-core was not resolved for Harmony');
  }
  const rnohRoot = path.join(
    projectRoot,
    'node_modules',
    '@react-native-oh',
    'react-native-harmony'
  );
  const native = await autolinking.syncHarmonyNativeProjectAsync({
    projectRoot,
    appName: exp.name,
    bundleName: options.bundleName ?? deriveHarmonyBundleName(exp.slug),
    modules,
    inputHarPath: path.join(rnohRoot, 'react_native_openharmony.har'),
    corePackageRoot: core.packageRoot,
  });
  await dependencies.updateDebugBundlePath(projectRoot, native.harmonyRoot);
  return native;
}

export async function updateHarmonyDebugBundlePathAsync(
  projectRoot: string,
  harmonyRoot: string,
  resolveEntry: typeof resolveEntryPoint = resolveEntryPoint
): Promise<void> {
  const entryFile = resolveEntry(projectRoot, { platform: 'harmony' });
  const relativeEntry = path.relative(projectRoot, entryFile).split(path.sep).join('/');
  const bundlePath = `/${relativeEntry.replace(/\.[^/.]+$/, '')}.bundle`;
  const indexPath = path.join(harmonyRoot, 'entry/src/main/ets/pages/Index.ets');
  const contents = await fs.promises.readFile(indexPath, 'utf8');
  const debugBundleUrlPattern =
    /http:\/\/127\.0\.0\.1:\d+\/[^'"]*\.bundle\?platform=harmony&dev=true&minify=false/;
  if (!debugBundleUrlPattern.test(contents)) {
    throw new CommandError(
      'HARMONY_METRO_ENTRY',
      `Harmony Debug bundle URL was not found in ${indexPath}`
    );
  }
  const updated = contents.replace(
    debugBundleUrlPattern,
    `http://127.0.0.1:8081${bundlePath}?platform=harmony&dev=true&minify=false`
  );
  if (updated !== contents) await fs.promises.writeFile(indexPath, updated);
}

export function deriveHarmonyBundleName(slug: string): string {
  let identifier = slug.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!identifier || !/^[a-z]/.test(identifier)) {
    identifier = `app${identifier}`;
  }
  return `dev.expo.${identifier}`;
}
