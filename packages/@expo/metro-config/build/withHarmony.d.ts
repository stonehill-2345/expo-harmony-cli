import type { ConfigT as MetroConfig } from '@expo/metro/metro-config';
type GetModulesRunBeforeMainModule = NonNullable<MetroConfig['serializer']['getModulesRunBeforeMainModule']>;
export declare function createPlatformModulesRunBeforeMainModule(beforeMain: GetModulesRunBeforeMainModule | undefined, harmonyInitializeCore: string): (entryFile: string, platform?: string) => string[];
/** SDK-owned platform integration; applications do not need a Metro config file. */
export declare function withHarmony(config: MetroConfig, projectRoot: string, { platform }?: {
    platform?: string;
}): MetroConfig;
/** Select platform-specific premodules after Metro has built the per-request graph. */
export declare function withHarmonySerializer<Config extends MetroConfig>(config: Config): Config;
export {};
