import type { ConfigT as MetroConfig } from '@expo/metro/metro-config';
import path from 'path';
import resolveFrom from 'resolve-from';

/** SDK-owned platform integration; applications do not need a Metro config file. */
export function withHarmony(config: MetroConfig, projectRoot: string): MetroConfig {
  const harmonyPackage = '@react-native-oh/react-native-harmony';
  const harmonyRoot = path.dirname(resolveFrom(projectRoot, `${harmonyPackage}/package.json`));
  const { createHarmonyMetroConfig } = require(path.join(harmonyRoot, 'metro.config'));
  const harmony = createHarmonyMetroConfig({ reactNativeHarmonyPackageName: harmonyPackage });
  const resolveRequest = config.resolver.resolveRequest;
  const beforeMain = config.serializer.getModulesRunBeforeMainModule;

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
      getModulesRunBeforeMainModule: (entryFile) => [
        require.resolve(path.join(harmonyRoot, 'Libraries/Core/InitializeCore')),
        ...(beforeMain?.(entryFile) ?? []).filter(
          (file) => !file.replaceAll('\\', '/').includes('/Libraries/Core/InitializeCore')
        ),
      ],
    },
  };
}
