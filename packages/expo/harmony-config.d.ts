import type { ExpoConfig } from '@expo/config';
import type { ExportedConfig, ModProps } from '@expo/config-plugins';

export type HarmonyJSON =
  | null
  | boolean
  | number
  | string
  | HarmonyJSON[]
  | { [key: string]: HarmonyJSON };
export type HarmonyJSONObject = { [key: string]: HarmonyJSON };
export type HarmonyPlatform = 'harmony' | 'ios' | 'android';
export interface HarmonyPermission {
  name: string;
  reason?: string;
  usedScene?: { abilities?: string[]; when?: 'inuse' | 'always' };
}
export interface HarmonyOptions {
  name?: string;
  bundleName?: string;
  version?: string;
  versionCode?: number;
  icon?: string;
  foregroundImage?: string;
  splash?: { image?: string; backgroundColor?: string };
  scheme?: string | string[];
  querySchemes?: string[];
  permissions?: HarmonyPermission[];
  orientation?: 'default' | 'portrait' | 'landscape';
  userInterfaceStyle?: 'light' | 'dark' | 'automatic';
  extensions?: { app?: HarmonyJSONObject; module?: HarmonyJSONObject };
}
export type HarmonyExpoConfig = ExpoConfig & {
  harmony?: HarmonyOptions;
  mods?: ExportedConfig['mods'] & { harmony?: Record<string, unknown> };
};
export interface ResolvedHarmonyOptions
  extends Omit<
    HarmonyOptions,
    | 'name'
    | 'bundleName'
    | 'version'
    | 'versionCode'
    | 'scheme'
    | 'querySchemes'
    | 'permissions'
    | 'orientation'
    | 'userInterfaceStyle'
    | 'extensions'
    | 'splash'
  > {
  name: string;
  bundleName: string;
  version: string;
  versionCode: number;
  scheme: string[];
  querySchemes: string[];
  permissions: HarmonyPermission[];
  orientation: 'default' | 'portrait' | 'landscape';
  userInterfaceStyle: 'light' | 'dark' | 'automatic';
  splash: { image?: string; backgroundColor?: string };
  extensions: { app?: HarmonyJSONObject; module?: HarmonyJSONObject };
}
export interface HarmonyConfigSnapshot {
  expoConfig: HarmonyExpoConfig;
  harmony: ResolvedHarmonyOptions;
}
export interface HarmonyModConfig extends HarmonyExpoConfig {
  modResults: HarmonyJSONObject;
  modRequest: Omit<ModProps<HarmonyJSONObject>, 'platform' | 'nextMod'> & {
    platform: 'harmony';
    nextMod?: HarmonyMod;
  };
  readonly modRawConfig: HarmonyExpoConfig;
}
export type HarmonyMod = (config: HarmonyModConfig) => HarmonyModConfig | Promise<HarmonyModConfig>;
export interface HarmonyPluginMetadata {
  platforms: HarmonyPlatform[];
}
export type HarmonyPlugin<Props = void> = (
  config: HarmonyExpoConfig,
  props: Props
) => HarmonyExpoConfig;
export function resolveHarmonyConfig(
  exp: HarmonyExpoConfig,
  options?: { bundleName?: string }
): HarmonyConfigSnapshot;
export function withHarmonyApp(config: HarmonyExpoConfig, action: HarmonyMod): HarmonyExpoConfig;
export function withHarmonyModule(config: HarmonyExpoConfig, action: HarmonyMod): HarmonyExpoConfig;
/** Registers app/module mods synchronously; asynchronous work belongs inside a mod callback. */
export function defineHarmonyPlugin<T extends (...args: any[]) => HarmonyExpoConfig>(
  plugin: T,
  options?: { platforms?: HarmonyPlatform[] }
): T & { harmony: HarmonyPluginMetadata };
