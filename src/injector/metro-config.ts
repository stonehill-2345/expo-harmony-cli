import * as fs from 'fs';
import * as path from 'path';

const METRO_CONFIG_MARKER = '// expo-harmony-cli:managed';
const METRO_CONFIG_JS = `${METRO_CONFIG_MARKER}
const path = require('path');
const { mergeConfig } = require('@react-native/metro-config');

process.env.EXPO_ROUTER_APP_ROOT = path.resolve(__dirname, 'app');

const { getDefaultConfig } = require('expo/metro-config');
const {
  createHarmonyMetroConfig,
} = require('@react-native-oh/react-native-harmony/metro.config');

// 始终以 Expo 基线为准，保住 serializer / HMR / 虚拟入口；Harmony 只叠加 resolver 级字段。
const baseConfig = getDefaultConfig(__dirname);

const harmonyConfig = createHarmonyMetroConfig({
  reactNativeHarmonyPackageName: '@react-native-oh/react-native-harmony',
});

const shimAliases = require('./shims/.alias-map.json');
const harmonyResolveRequest = harmonyConfig.resolver?.resolveRequest;

// resolver 级字段叠加（不碰 serializer）
baseConfig.resolver.platforms = Array.from(
  new Set([...(baseConfig.resolver.platforms || []), ...(harmonyConfig.resolver?.platforms || [])]),
);
baseConfig.resolver.sourceExts = Array.from(
  new Set([...(baseConfig.resolver.sourceExts || []), ...(harmonyConfig.resolver?.sourceExts || [])]),
);

function resolveAliasTarget(target) {
  return target.startsWith('.') ? path.resolve(__dirname, target) : target;
}

function resolveWithHarmony(context, moduleName, platform) {
  if (harmonyResolveRequest) {
    return harmonyResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
}

// 请求级分流（双保险）：platform=harmony 或离线 RN_BUNDLE_PLATFORM=harmony 走 RNOH + alias；其余走 Expo 默认，零污染。
// 开发态 start-harmony 不注入 RN_BUNDLE_PLATFORM → 三端靠 platform 参数分流；离线 bundle 脚本注入 → release 兜底。
baseConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'harmony' || process.env.RN_BUNDLE_PLATFORM === 'harmony') {
    const aliasTarget = shimAliases[moduleName];
    if (aliasTarget) {
      return context.resolveRequest(context, resolveAliasTarget(aliasTarget), platform);
    }
    if (moduleName.startsWith('@/')) {
      return context.resolveRequest(context, path.resolve(__dirname, moduleName.slice(2)), platform);
    }
    return resolveWithHarmony(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = mergeConfig(baseConfig, {
  transformer: {
    unstable_allowRequireContext: true,
    babelTransformerPath: require.resolve('react-native-svg-transformer'),
  },
});
`;

export function writeMetroConfig(targetDir: string): void {
  const configPath = path.join(targetDir, 'metro.config.js');
  if (fs.existsSync(configPath) && !fs.readFileSync(configPath, 'utf8').includes(METRO_CONFIG_MARKER)) {
    return;
  }
  fs.writeFileSync(configPath, METRO_CONFIG_JS);
}
