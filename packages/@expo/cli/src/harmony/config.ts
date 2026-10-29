import { withMod } from '@expo/config-plugins';
import { validate } from '@expo/schema-utils';

type Config = Record<string, any>;
type HarmonyPlatform = 'harmony' | 'ios' | 'android';
type HarmonyAction = (config: any) => any;

function assertJSON(value: unknown, location: string, ancestors = new Set<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object' || value === undefined) {
    throw new Error(`Invalid Harmony JSON value at ${location}`);
  }
  if (ancestors.has(value)) throw new Error(`Circular Harmony JSON value at ${location}`);
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  ) {
    throw new Error(`Invalid Harmony JSON object at ${location}`);
  }
  ancestors.add(value);
  for (const [key, child] of Object.entries(value))
    assertJSON(child, `${location}.${key}`, ancestors);
  ancestors.delete(value);
}

export function resolveHarmonyConfig(exp: Config, options: { bundleName?: string } = {}) {
  // Schema-utils caches by object identity, so each validation uses a detached value.
  const raw = exp.harmony === undefined ? {} : exp.harmony;
  assertJSON(raw, 'harmony');
  const override = JSON.parse(JSON.stringify(raw));
  const schema = require('expo/harmony-config.schema.json');
  validate(schema, override);
  let identifier = (exp.slug ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!identifier || !/^[a-z]/.test(identifier)) identifier = `app${identifier}`;
  const harmony = {
    name: override.name ?? exp.name,
    bundleName: options.bundleName ?? override.bundleName ?? `dev.expo.${identifier}`,
    version: override.version ?? exp.version ?? '1.0.0',
    versionCode: override.versionCode ?? 1,
    ...(override.icon ?? exp.icon ? { icon: override.icon ?? exp.icon } : {}),
    ...(override.foregroundImage ? { foregroundImage: override.foregroundImage } : {}),
    splash: {
      ...(override.splash?.imageWidth !== undefined ? { imageWidth: override.splash.imageWidth } : {}),
      ...(override.splash?.resizeMode !== undefined ? { resizeMode: override.splash.resizeMode } : {}),
      ...(override.splash?.dark !== undefined ? { dark: override.splash.dark } : {}),
      ...(override.splash?.image ?? exp.splash?.image
        ? { image: override.splash?.image ?? exp.splash?.image }
        : {}),
      ...(override.splash?.backgroundColor ?? exp.splash?.backgroundColor
        ? {
            backgroundColor: override.splash?.backgroundColor ?? exp.splash?.backgroundColor,
          }
        : {}),
    },
    scheme:
      typeof (override.scheme ?? exp.scheme) === 'string'
        ? [override.scheme ?? exp.scheme]
        : override.scheme ?? exp.scheme ?? [],
    querySchemes: override.querySchemes ?? [],
    permissions: override.permissions ?? [],
    orientation: override.orientation ?? exp.orientation ?? 'default',
    userInterfaceStyle: override.userInterfaceStyle ?? exp.userInterfaceStyle ?? 'light',
    extensions: override.extensions ?? {},
  };
  if (!harmony.name) throw new Error('Harmony name must not be empty');
  validate(schema, harmony);
  const permissions = new Set<string>();
  for (const permission of harmony.permissions) {
    if (permissions.has(permission.name))
      throw new Error(`Duplicate Harmony permission: ${permission.name}`);
    permissions.add(permission.name);
  }

  const publicConfig = { ...exp };
  for (const key of ['mods', '_internal', 'hooks']) delete publicConfig[key];
  for (const platform of ['ios', 'android']) {
    if (publicConfig[platform]) {
      publicConfig[platform] = { ...publicConfig[platform] };
      delete publicConfig[platform].config;
    }
  }
  if (publicConfig.updates) {
    publicConfig.updates = { ...publicConfig.updates };
    for (const key of [
      'codeSigningCertificate',
      'codeSigningMetadata',
      'requestHeaders',
      'headers',
    ])
      delete publicConfig.updates[key];
  }
  const expoConfig = JSON.parse(JSON.stringify(publicConfig));
  return { expoConfig, harmony: JSON.parse(JSON.stringify(harmony)) };
}

export function withHarmonyApp(config: Config, action: HarmonyAction): Config {
  return withMod(config as any, {
    platform: 'harmony' as any,
    mod: 'app',
    action,
  });
}

export function withHarmonyModule(config: Config, action: HarmonyAction): Config {
  return withMod(config as any, {
    platform: 'harmony' as any,
    mod: 'module',
    action,
  });
}

export function defineHarmonyPlugin<T extends (...args: any[]) => any>(
  plugin: T,
  options: { platforms?: HarmonyPlatform[] } = {}
): T & { harmony: { platforms: HarmonyPlatform[] } } {
  const platforms = options.platforms ?? ['harmony'];
  if (
    typeof plugin !== 'function' ||
    !Array.isArray(platforms) ||
    !platforms.length ||
    new Set(platforms).size !== platforms.length ||
    platforms.some((platform) => !['harmony', 'ios', 'android'].includes(platform))
  ) {
    throw new Error('Invalid Harmony plugin or platforms declaration');
  }
  const declaredPlatforms = [...platforms];
  const definition = new Error('Harmony plugin definition');
  Error.captureStackTrace(definition, defineHarmonyPlugin);
  const definitionSource = definition.stack?.split('\n')[1]?.trim() ?? 'unknown plugin definition';
  const wrapped = function (this: any, ...args: Parameters<T>): ReturnType<T> {
    const before = args[0]?.mods?.harmony;
    const app = before?.app;
    const module = before?.module;
    const result = plugin.apply(this, args);
    if (result && typeof result.then === 'function') {
      // A rejected async export must not leak an unhandled rejection after this diagnostic.
      Promise.resolve(result).catch(() => {});
      throw new Error(
        `Harmony config plugins must be synchronous; register async work in a mod (${definitionSource})`
      );
    }
    if (declaredPlatforms.includes('harmony')) {
      const after = result?.mods?.harmony;
      const appChanged = typeof after?.app === 'function' && after.app !== app;
      const moduleChanged = typeof after?.module === 'function' && after.module !== module;
      if (!appChanged && !moduleChanged) {
        throw new Error(
          `Harmony plugin has an empty Harmony implementation: register an app or module mod (${definitionSource})`
        );
      }
    }
    return result;
  };
  return Object.assign(wrapped, plugin, { harmony: { platforms: declaredPlatforms } }) as T & {
    harmony: { platforms: HarmonyPlatform[] };
  };
}
