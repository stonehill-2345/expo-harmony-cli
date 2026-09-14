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

// 始终以 Expo 基线为准；Harmony bundle 时再叠加 RNOH serializer。
const baseConfig = getDefaultConfig(__dirname);

const harmonyConfig = createHarmonyMetroConfig({
  reactNativeHarmonyPackageName: '@react-native-oh/react-native-harmony',
});

// 保存 Expo 原始 getModulesRunBeforeMainModule，RN_BUNDLE_PLATFORM=harmony 时 Android 入口回退使用
const expoGetModulesRunBeforeMainModule = baseConfig.serializer?.getModulesRunBeforeMainModule;

const shimAliases = require('./shims/.alias-map.json');
const harmonyResolveRequest = harmonyConfig.resolver?.resolveRequest;

// resolver 级字段叠加。
baseConfig.resolver.platforms = Array.from(
  new Set([...(baseConfig.resolver.platforms || []), ...(harmonyConfig.resolver?.platforms || [])]),
);
baseConfig.resolver.sourceExts = Array.from(
  new Set([...(baseConfig.resolver.sourceExts || []), ...(harmonyConfig.resolver?.sourceExts || [])]),
);

function resolveAliasTarget(target) {
  return target.startsWith('.') ? path.resolve(__dirname, target) : target;
}

function isRequestFromHarmonyAlias(originModulePath, aliasTarget) {
  if (!originModulePath || !aliasTarget.startsWith('@react-native-ohos/')) return false;
  const packagePath = aliasTarget.split('/').join(path.sep);
  return originModulePath.includes(path.sep + 'node_modules' + path.sep + packagePath + path.sep);
}

function resolveWithHarmony(context, moduleName, platform) {
  if (harmonyResolveRequest) {
    return harmonyResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
}

// 请求级分流（双保险）：platform=harmony 或 RN_BUNDLE_PLATFORM=harmony 走 RNOH + alias；其余走 Expo 默认，零污染。
baseConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'harmony' || process.env.RN_BUNDLE_PLATFORM === 'harmony') {
    const aliasTarget = shimAliases[moduleName];
    // Harmony adapter packages re-export their original package. Redirecting
    // their internal import back to the adapter creates a self-referential module.
    if (aliasTarget && !isRequestFromHarmonyAlias(context.originModulePath, aliasTarget)) {
      return context.resolveRequest(context, resolveAliasTarget(aliasTarget), platform);
    }
    if (moduleName.startsWith('@/')) {
      return context.resolveRequest(context, path.resolve(__dirname, moduleName.slice(2)), platform);
    }
    return resolveWithHarmony(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

const finalConfig = mergeConfig(
  baseConfig,
  process.env.RN_BUNDLE_PLATFORM === 'harmony'
    ? { serializer: harmonyConfig.serializer }
    : {},
  {
    transformer: {
      unstable_allowRequireContext: true,
      babelTransformerPath: require.resolve('react-native-svg-transformer'),
    },
  },
);

const originalRunBeforeMainModule = finalConfig.serializer?.getModulesRunBeforeMainModule;
if (originalRunBeforeMainModule) {
  finalConfig.serializer.getModulesRunBeforeMainModule = (entryFile) => {
    const preModules = originalRunBeforeMainModule(entryFile);
    const isHarmonyEntry = String(entryFile).endsWith('index.harmony.js') || process.env.RN_BUNDLE_PLATFORM === 'harmony';
    if (!isHarmonyEntry) return preModules;
    // Android/iOS entry under RN_BUNDLE_PLATFORM=harmony:
    // RNOH serializer 的 preModules 缺少 Expo winter runtime（URLSearchParams 等 polyfill），
    // 回退到 Expo 原始 preModules。
    if (!String(entryFile).endsWith('index.harmony.js') && expoGetModulesRunBeforeMainModule) {
      return expoGetModulesRunBeforeMainModule(entryFile);
    }
    const formDataBootstrap = path.resolve(__dirname, 'shims/harmony-form-data.js');
    const initializeCoreIndex = preModules.findIndex((modulePath) => modulePath.includes('Libraries/Core/InitializeCore'));
    if (initializeCoreIndex === -1) return [formDataBootstrap, ...preModules];
    return [
      ...preModules.slice(0, initializeCoreIndex + 1),
      formDataBootstrap,
      ...preModules.slice(initializeCoreIndex + 1),
    ];
  };
}

module.exports = finalConfig;
`;

export function writeMetroConfig(targetDir: string): void {
  const configPath = path.join(targetDir, 'metro.config.js');
  if (fs.existsSync(configPath) && !fs.readFileSync(configPath, 'utf8').includes(METRO_CONFIG_MARKER)) {
    return;
  }
  fs.writeFileSync(configPath, METRO_CONFIG_JS);
}
