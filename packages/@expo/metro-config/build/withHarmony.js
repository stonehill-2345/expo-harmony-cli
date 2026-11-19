"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPlatformModulesRunBeforeMainModule = createPlatformModulesRunBeforeMainModule;
exports.withHarmony = withHarmony;
exports.withHarmonySerializer = withHarmonySerializer;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const resolve_from_1 = __importDefault(require("resolve-from"));
function createPlatformModulesRunBeforeMainModule(beforeMain, harmonyInitializeCore) {
    return (entryFile, platform) => {
        const standardModules = beforeMain?.(entryFile) ?? [];
        if (platform !== 'harmony')
            return standardModules;
        return [
            harmonyInitializeCore,
            ...standardModules.filter((file) => !file.replaceAll('\\', '/').includes('/Libraries/Core/InitializeCore')),
        ];
    };
}
/** SDK-owned platform integration; applications do not need a Metro config file. */
function withHarmony(config, projectRoot, { platform } = {}) {
    const harmonyPackage = '@react-native-oh/react-native-harmony';
    const harmonyRoot = path_1.default.dirname((0, resolve_from_1.default)(projectRoot, `${harmonyPackage}/package.json`));
    const { createHarmonyMetroConfig } = require(path_1.default.join(harmonyRoot, 'metro.config'));
    const harmony = createHarmonyMetroConfig({ reactNativeHarmonyPackageName: harmonyPackage });
    const packageJson = JSON.parse(fs_1.default.readFileSync(path_1.default.join(projectRoot, 'package.json'), 'utf8'));
    const aliasModulePaths = {};
    for (const name of Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies })) {
        const file = resolve_from_1.default.silent(projectRoot, `${name}/package.json`);
        if (!file)
            continue;
        const installed = JSON.parse(fs_1.default.readFileSync(file, 'utf8'));
        // RNOH uses pnpm's real package name when redirecting Harmony imports.
        if (installed.harmony?.alias && installed.name !== name) {
            aliasModulePaths[installed.name] = path_1.default.dirname(file);
        }
    }
    const resolveRequest = config.resolver.resolveRequest;
    const beforeMain = config.serializer.getModulesRunBeforeMainModule;
    const getModulesForPlatform = createPlatformModulesRunBeforeMainModule(beforeMain, require.resolve(path_1.default.join(harmonyRoot, 'Libraries/Core/InitializeCore')));
    return {
        ...config,
        resolver: {
            ...config.resolver,
            extraNodeModules: { ...config.resolver.extraNodeModules, ...aliasModulePaths },
            platforms: [...new Set([...config.resolver.platforms, 'harmony'])],
            unstable_conditionsByPlatform: {
                ...config.resolver.unstable_conditionsByPlatform,
                harmony: ['react-native'],
            },
            resolveRequest: (context, moduleName, platform) => {
                if (platform === 'harmony') {
                    const resolution = harmony.resolver.resolveRequest(context, moduleName, platform);
                    // Drawer ships native gesture entrypoints only for iOS and Android.
                    // Its default entry disables gestures, even on other native platforms.
                    if (resolution.type === 'sourceFile' &&
                        /\/react-native-drawer-layout\/(?:src|lib\/module)\/views\/GestureHandler\.(?:tsx|js)$/.test(resolution.filePath.replaceAll('\\', '/'))) {
                        return context.resolveRequest(context, path_1.default.join(path_1.default.dirname(resolution.filePath), 'GestureHandlerNative'), platform);
                    }
                    return resolution;
                }
                return resolveRequest
                    ? resolveRequest(context, moduleName, platform)
                    : context.resolveRequest(context, moduleName, platform);
            },
        },
        serializer: {
            ...config.serializer,
            getModulesRunBeforeMainModule: ((entryFile, requestPlatform) => getModulesForPlatform(entryFile, requestPlatform ?? platform)),
        },
    };
}
/** Select platform-specific premodules after Metro has built the per-request graph. */
function withHarmonySerializer(config) {
    const customSerializer = config.serializer.customSerializer;
    if (!customSerializer)
        return config;
    const getModulesRunBeforeMainModule = config.serializer
        .getModulesRunBeforeMainModule;
    const platformSerializer = async (entryPoint, preModules, graph, options) => customSerializer(entryPoint, preModules, graph, {
        ...options,
        runBeforeMainModule: getModulesRunBeforeMainModule(entryPoint, graph.transformOptions?.platform),
    });
    Object.assign(platformSerializer, customSerializer);
    config.serializer.customSerializer = platformSerializer;
    return config;
}
//# sourceMappingURL=withHarmony.js.map