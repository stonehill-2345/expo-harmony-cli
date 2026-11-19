import { BaseMods, compileModsAsync } from '@expo/config-plugins';
import {
  normalizeStaticPlugin,
  resolveConfigPluginFunctionWithInfo,
} from '@expo/config-plugins/build/utils/plugin-resolver';
import fs from 'fs';
import JsonFile from '@expo/json-file';
import path from 'path';
import resolveFrom from 'resolve-from';

import { resolveHarmonyConfig } from '../../harmony/config';
import { CommandError } from '../../utils/errors';

type JSONObject = Record<string, any>;
type Snapshot = ReturnType<typeof resolveHarmonyConfig>;
interface PluginRegistration {
  reference: string;
  pluginFile: string;
  platforms: string[];
}

export function validateHarmonyPlugins(projectRoot: string, exp: JSONObject): PluginRegistration[] {
  const files = new Set<string>();
  return (exp.plugins ?? []).map((entry: any) => {
    const [reference] = normalizeStaticPlugin(entry);
    if (typeof reference !== 'string') {
      throw new CommandError('HARMONY_PLUGIN', 'Harmony plugins must use a static module request');
    }
    const { plugin, pluginFile } = resolveConfigPluginFunctionWithInfo(projectRoot, reference);
    const realFile = fs.realpathSync(pluginFile);
    if (files.has(realFile)) {
      throw new CommandError(
        'HARMONY_PLUGIN_DUPLICATE',
        `Duplicate Harmony plugin: ${reference} (${realFile})`
      );
    }
    files.add(realFile);
    const platforms = (plugin as any).harmony?.platforms;
    if (
      !Array.isArray(platforms) ||
      !platforms.length ||
      new Set(platforms).size !== platforms.length ||
      platforms.some((platform: string) => !['harmony', 'ios', 'android'].includes(platform))
    ) {
      throw new CommandError(
        'HARMONY_PLUGIN_UNSUPPORTED',
        `${reference} must declare Harmony support or explicit ios/android-only platforms with defineHarmonyPlugin`
      );
    }
    return {
      reference,
      pluginFile: realFile,
      platforms: platforms as string[],
    };
  });
}

function assertJSON(value: any, location: string, ancestors = new Set<object>()): void {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return;
  if (
    !value ||
    typeof value !== 'object' ||
    ancestors.has(value) ||
    (!Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    throw new Error(`Invalid native JSON at ${location}`);
  }
  ancestors.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key))
      throw new Error(`Invalid native JSON key at ${location}.${key}`);
    assertJSON(child, `${location}.${key}`, ancestors);
  }
  ancestors.delete(value);
}

function merge(base: JSONObject, patch: JSONObject): JSONObject {
  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'abilities' && Array.isArray(value) && Array.isArray(result[key])) {
      const abilities = [...result[key]];
      for (const ability of value) {
        const index = abilities.findIndex((existing) => existing.name === ability.name);
        if (index < 0) abilities.push(ability);
        else abilities[index] = merge(abilities[index], ability);
      }
      result[key] = abilities;
      continue;
    }
    result[key] =
      value && typeof value === 'object' && !Array.isArray(value)
        ? merge(
            result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])
              ? result[key]
              : {},
            value
          )
        : value;
  }
  return result;
}

export async function compileHarmonyConfigAsync(
  projectRoot: string,
  exp: JSONObject,
  snapshot: Snapshot
) {
  const plugins = validateHarmonyPlugins(projectRoot, exp);
  const supported = plugins.filter((plugin) => plugin.platforms.includes('harmony'));
  const mods = Object.keys(exp.mods?.harmony ?? {});
  if (supported.length && !mods.length) {
    throw new CommandError(
      'HARMONY_PLUGIN_EMPTY',
      `${supported
        .map((plugin) => plugin.reference)
        .join(', ')} declared Harmony support without a Harmony implementation`
    );
  }
  for (const mod of mods) {
    if (!['app', 'module', 'resources'].includes(mod)) {
      throw new CommandError(
        'HARMONY_PLUGIN_MOD',
        `Unsupported Harmony mod: ${mod}; expected app, module or resources`
      );
    }
  }
  const h = snapshot.harmony;
  assertJSON(h.extensions, 'harmony.extensions');
  const expoManifest = resolveFrom.silent(projectRoot, 'expo/package.json');
  const autolinkingManifest = resolveFrom(
    expoManifest ? path.dirname(expoManifest) : projectRoot,
    'expo-modules-autolinking/package.json'
  );
  const templates = path.join(path.dirname(autolinkingManifest), 'templates/harmony');
  const appTemplate = JsonFile.read(path.join(templates, 'AppScope/app.json5'), {
    json5: true,
  }) as JSONObject;
  const moduleTemplate = JsonFile.read(path.join(templates, 'entry/src/main/module.json5'), {
    json5: true,
  }) as JSONObject;
  const nativeConfig = {
    app: merge(
      merge(appTemplate.app, {
        bundleName: h.bundleName,
        versionName: h.version,
        versionCode: h.versionCode,
      }),
      h.extensions.app ?? {}
    ),
    module: merge(
      merge(moduleTemplate.module, {
        querySchemes: h.querySchemes,
        requestPermissions: [
          ...new Map(
            [
              { name: 'ohos.permission.INTERNET' },
              { name: 'ohos.permission.VIBRATE' },
              ...h.permissions,
            ].map((permission: any) => [permission.name, permission])
          ).values(),
        ],
        abilities: [
          {
            name: 'EntryAbility',
            orientation: h.orientation === 'default' ? 'unspecified' : h.orientation,
            skills: [
              {
                entities: ['entity.system.home'],
                actions: ['action.system.home'],
              },
              ...(h.scheme.length
                ? [
                    {
                      entities: ['entity.system.browsable'],
                      actions: ['ohos.want.action.viewData'],
                      uris: h.scheme.map((scheme: string) => ({ scheme })),
                    },
                  ]
                : []),
            ],
          },
        ],
      }),
      h.extensions.module ?? {}
    ),
  };
  let resources: any[] = [];
  const providers = Object.fromEntries(
    ['app', 'module'].map((mod) => [
      mod,
      {
        getFilePath: () => '',
        read: () => JSON.parse(JSON.stringify(nativeConfig[mod as keyof typeof nativeConfig])),
        write: (_file: string, config: any) => {
          assertJSON(config.modResults, `harmony.${mod}`);
          if (Array.isArray(config.modResults) || config.modResults === null)
            throw new Error(`Harmony ${mod} must be an object`);
          nativeConfig[mod as keyof typeof nativeConfig] = config.modResults;
        },
      },
    ])
  );
  providers.resources = {
    getFilePath: () => '',
    read: () => [],
    write: (_file: string, config: any) => {
      assertJSON(config.modResults, 'harmony.resources');
      if (!Array.isArray(config.modResults)) throw new Error('Harmony resources must be an array');
      resources = config.modResults;
    },
  };
  try {
    const planned = BaseMods.withGeneratedBaseMods(exp as any, {
      platform: 'harmony' as any,
      providers,
    });
    await compileModsAsync(planned, {
      projectRoot,
      platforms: ['harmony' as any],
    });
    assertJSON(nativeConfig, 'harmony');
    if ('colorMode' in nativeConfig.app) {
      throw new Error(
        'Harmony app.colorMode is not a supported manifest field; use harmony.userInterfaceStyle'
      );
    }
    for (const [key, expected] of Object.entries({
      bundleName: h.bundleName,
      versionName: h.version,
      versionCode: h.versionCode,
    })) {
      if (nativeConfig.app[key] !== expected)
        throw new Error(`Harmony app.${key} must match the resolved configuration snapshot`);
    }
    if (
      !Array.isArray(nativeConfig.module.abilities) ||
      !nativeConfig.module.abilities.some((ability: any) => ability.name === 'EntryAbility')
    ) {
      throw new Error('Harmony module.abilities must contain EntryAbility');
    }
    for (const key of ['icon', 'label']) {
      if (typeof nativeConfig.app[key] !== 'string' || !nativeConfig.app[key]) {
        throw new Error(`Harmony app.${key} must be a non-empty string`);
      }
    }
    const entry = nativeConfig.module.abilities.find(
      (ability: any) => ability.name === 'EntryAbility'
    );
    if (typeof entry.srcEntry !== 'string' || !entry.srcEntry) {
      throw new Error('Harmony EntryAbility.srcEntry must be a non-empty string');
    }
    const nativeOrientations = [
      'unspecified',
      'landscape',
      'portrait',
      'follow_recent',
      'landscape_inverted',
      'portrait_inverted',
      'auto_rotation',
      'auto_rotation_landscape',
      'auto_rotation_portrait',
      'auto_rotation_restricted',
      'auto_rotation_landscape_restricted',
      'auto_rotation_portrait_restricted',
      'locked',
      'auto_rotation_unspecified',
      'follow_desktop',
    ];
    if (
      entry.orientation !== undefined &&
      !nativeOrientations.includes(entry.orientation) &&
      !(
        typeof entry.orientation === 'string' &&
        entry.orientation.length <= 255 &&
        (/^\$string:[0-9a-zA-Z_.]+$/.test(entry.orientation) ||
          /^(?=.*\{)(?=.*\})[0-9a-zA-Z_.{}]+$/.test(entry.orientation))
      )
    ) {
      throw new Error('Invalid Harmony EntryAbility.orientation');
    }
    resolveHarmonyConfig({
      name: h.name,
      slug: exp.slug,
      harmony: {
        bundleName: nativeConfig.app.bundleName,
        version: nativeConfig.app.versionName,
        versionCode: nativeConfig.app.versionCode,
        querySchemes: nativeConfig.module.querySchemes,
        permissions: nativeConfig.module.requestPermissions,
      },
    });
    return { snapshot, nativeConfig, resources };
  } catch (error: any) {
    throw new CommandError(
      'HARMONY_PLUGIN_FAILED',
      `Harmony plugins [${supported.map((plugin) => plugin.reference).join(', ')}]: ${
        error.message
      }`
    );
  }
}
