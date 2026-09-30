import type { ConfigT as MetroConfig } from '@expo/metro/metro-config';
import path from 'path';
import resolveFrom from 'resolve-from';

type GetModulesRunBeforeMainModule = NonNullable<
  MetroConfig['serializer']['getModulesRunBeforeMainModule']
>;

export function createPlatformModulesRunBeforeMainModule(
  beforeMain: GetModulesRunBeforeMainModule | undefined,
  harmonyInitializeCore: string
) {
  return (entryFile: string, platform?: string): string[] => {
    const standardModules = beforeMain?.(entryFile) ?? [];
    if (platform !== 'harmony') return standardModules;
    return [
      harmonyInitializeCore,
      ...standardModules.filter(
        (file) => !file.replaceAll('\\', '/').includes('/Libraries/Core/InitializeCore')
      ),
    ];
  };
}

/** SDK-owned platform integration; applications do not need a Metro config file. */
export function withHarmony(
  config: MetroConfig,
  projectRoot: string,
  { platform }: { platform?: string } = {}
): MetroConfig {
  const harmonyPackage = '@react-native-oh/react-native-harmony';
  const harmonyRoot = path.dirname(resolveFrom(projectRoot, `${harmonyPackage}/package.json`));
  const { createHarmonyMetroConfig } = require(path.join(harmonyRoot, 'metro.config'));
  const harmony = createHarmonyMetroConfig({ reactNativeHarmonyPackageName: harmonyPackage });
  const resolveRequest = config.resolver.resolveRequest;
  const beforeMain = config.serializer.getModulesRunBeforeMainModule;
  const getModulesForPlatform = createPlatformModulesRunBeforeMainModule(
    beforeMain,
    require.resolve(path.join(harmonyRoot, 'Libraries/Core/InitializeCore'))
  );

  return {
    ...config,
    resolver: {
      ...config.resolver,
      platforms: [...new Set([...config.resolver.platforms, 'harmony'])],
      unstable_conditionsByPlatform: {
        ...config.resolver.unstable_conditionsByPlatform,
        harmony: ['react-native'],
      },
      resolveRequest: (context, moduleName, platform) => {
        if (platform === 'harmony') {
          return harmony.resolver.resolveRequest(context, moduleName, platform);
        }
        return resolveRequest
          ? resolveRequest(context, moduleName, platform)
          : context.resolveRequest(context, moduleName, platform);
      },
    },
    serializer: {
      ...config.serializer,
      getModulesRunBeforeMainModule: ((entryFile: string, requestPlatform?: string) =>
        getModulesForPlatform(entryFile, requestPlatform ?? platform)) as GetModulesRunBeforeMainModule,
    },
  };
}


/** Select platform-specific premodules after Metro has built the per-request graph. */
export function withHarmonySerializer<Config extends MetroConfig>(config: Config): Config {
  const customSerializer = config.serializer.customSerializer;
  if (!customSerializer) return config;
  const getModulesRunBeforeMainModule = config.serializer
    .getModulesRunBeforeMainModule as unknown as (entryFile: string, platform?: string) => string[];

  const platformSerializer = async (
    entryPoint: Parameters<typeof customSerializer>[0],
    preModules: Parameters<typeof customSerializer>[1],
    graph: Parameters<typeof customSerializer>[2],
    options: Parameters<typeof customSerializer>[3]
  ) =>
    customSerializer(entryPoint, preModules, graph, {
      ...options,
      runBeforeMainModule: getModulesRunBeforeMainModule(
        entryPoint,
        graph.transformOptions?.platform
      ),
    });

  Object.assign(platformSerializer, customSerializer);
  (config.serializer as any).customSerializer = platformSerializer;
  return config;
}
