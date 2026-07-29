import * as fs from 'fs';
import * as path from 'path';

const METRO_CONFIG_JS = `const path = require('path');
const { mergeConfig } = require('@react-native/metro-config');

process.env.EXPO_ROUTER_APP_ROOT = path.resolve(__dirname, 'app');

const isHarmonyBundle = process.env.RN_BUNDLE_PLATFORM === 'harmony';

if (isHarmonyBundle) {
  const { getDefaultConfig } = require('@react-native/metro-config');
  const {
    createHarmonyMetroConfig,
  } = require('@react-native-oh/react-native-harmony/metro.config');

  const harmonyConfig = createHarmonyMetroConfig({
    reactNativeHarmonyPackageName: '@react-native-oh/react-native-harmony',
  });

  const shimAliases = require('./shims/.alias-map.json');
  const harmonyResolveRequest = harmonyConfig.resolver?.resolveRequest;

  function resolveAliasTarget(target) {
    return target.startsWith('.') ? path.resolve(__dirname, target) : target;
  }

  function resolveWithHarmony(context, moduleName, platform) {
    if (harmonyResolveRequest) {
      return harmonyResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  }

  module.exports = mergeConfig(getDefaultConfig(__dirname), harmonyConfig, {
    transformer: {
      unstable_allowRequireContext: true,
      babelTransformerPath: require.resolve('react-native-svg-transformer'),
    },
    resolver: {
      resolveRequest(context, moduleName, platform) {
        const aliasTarget = shimAliases[moduleName];
        if (aliasTarget) {
          return context.resolveRequest(context, resolveAliasTarget(aliasTarget), platform);
        }
        if (moduleName.startsWith('@/')) {
          return context.resolveRequest(context, path.resolve(__dirname, moduleName.slice(2)), platform);
        }
        return resolveWithHarmony(context, moduleName, platform);
      },
    },
  });
} else {
  const { getDefaultConfig } = require('expo/metro-config');
  module.exports = getDefaultConfig(__dirname);
}
`;

export function writeMetroConfig(targetDir: string): void {
  fs.writeFileSync(path.join(targetDir, 'metro.config.js'), METRO_CONFIG_JS);
}
