import fs from 'fs';
import path from 'path';
import JSON5 from 'json5';

import type {
  HarmonyHarConfig,
  HarmonyLifecycleDependency,
  ModuleDescriptorHarmony,
} from '../../types';
import { generatePackageListAsync } from './harmony';
import { stageHarmonyResourcesAsync } from './resourceContributions';
import type { HarmonyResourceContribution } from './resourceContributions';
import { mergeHarmonyGenerationStateAsync } from './generationState';
import { runHarmonyGenerationTransactionAsync } from './generationTransaction';
import type { HarmonyGenerationFaultPoint } from './generationTransaction';
import { copyReleasedHarmonyHarAsync, copyReleasedRnohCompatibilityHarAsync } from './releasedCompatibility';
import { validateHarmonyModuleGraph, validateHarmonyModuleSourcesAsync } from './moduleValidation';

type OwnedLifecycleDependency = HarmonyLifecycleDependency & {
  packageName: string;
};

export const RNOH_COMPATIBILITY_ID = 'expo-rnoh-0.82.30-core-v1-v4';
export const RNOH_INPUT_HAR_SHA256 =
  'cac2b5d1b9ce7d306079218931db12489aaceb240002c9c32e6c13185c577011';
export const RNOH_OUTPUT_HAR_SHA256 =
  'b6f643f3131e89f108f4d96c3ed95ca66c562d71a1dc2b88f57bbcb2a3d1f226';

export interface RunCompatibilityToolOptions {
  pythonExecutable: string;
  scriptPath: string;
  inputHarPath: string;
  outputHarPath: string;
  profile: 'core-v1-v4';
}

export type RunCompatibilityTool = (options: RunCompatibilityToolOptions) => Promise<void>;

export interface RunAppConfigGeneratorOptions {
  scriptPath: string;
  projectRoot: string;
  destinationDir: string;
}

export type RunAppConfigGenerator = (options: RunAppConfigGeneratorOptions) => Promise<void>;

export interface HarmonyNativeProjectOptions {
  projectRoot: string;
  appName: string;
  bundleName: string;
  appConfig: Record<string, any>;
  userInterfaceStyle?: 'light' | 'dark' | 'automatic';
  nativeConfig?: {
    app?: Record<string, any>;
    module?: Record<string, any>;
  };
  resources?: HarmonyResourceContribution[];
  modules: ModuleDescriptorHarmony[];
  inputHarPath: string;
  corePackageRoot: string;
  pythonExecutable?: string;
  runCompatibilityTool?: RunCompatibilityTool;
  clean?: boolean;
  finalize?: (stageRoot: string) => Promise<void>;
  generationFault?: (point: HarmonyGenerationFaultPoint) => Promise<void>;
  /** @deprecated Ignored. appConfig is the already evaluated public configuration snapshot. */
  runAppConfigGenerator?: RunAppConfigGenerator;
  templateRoot?: string;
}

type HarmonyNativeProjectResult = {
  harmonyRoot: string;
  backupPath?: string;
  rnohHarPath: string;
  generatedFiles: {
    cpp: string;
    ets: string;
    cmake: string;
    lifecycle: string;
    overlays: string;
  };
};

export async function prepareHarmonyNativeProjectAsync(
  options: HarmonyNativeProjectOptions
): Promise<HarmonyNativeProjectResult> {
  return generateHarmonyNativeProjectAsync(options, true);
}

export async function copyHarmonyTemplateMediaAsync(
  projectRoot: string,
  harmonyRoot: string,
  appConfig: Record<string, any>
): Promise<void> {
  const { media, background, darkBackground, imageWidth, resizeMode } = resolveHarmonyAppAssets(projectRoot, appConfig);
  for (const [source, relativeTarget] of media) {
    const target = path.join(harmonyRoot, relativeTarget);
    await assertHarmonyTargetPathAsync(harmonyRoot, target);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.copyFile(source, target);
  }
  const colorsPath = path.join(harmonyRoot, 'entry/src/main/resources/base/element/color.json');
  await assertHarmonyTargetPathAsync(harmonyRoot, colorsPath);
  const colors = fs.existsSync(colorsPath)
    ? JSON5.parse(await fs.promises.readFile(colorsPath, 'utf8'))
    : { color: [] };
  const existing = colors.color.find(
    (item: { name: string }) => item.name === 'start_window_background'
  );
  if (existing) existing.value = background;
  else colors.color.push({ name: 'start_window_background', value: background });
  await fs.promises.mkdir(path.dirname(colorsPath), { recursive: true });
  await fs.promises.writeFile(colorsPath, JSON.stringify(colors, null, 2) + '\n');
  const resources: [string, Record<string, { name: string; value: string }[]>][] = [
    ['base/element/float.json', { float: [{ name: 'expo_splash_image_width', value: `${imageWidth}vp` }] }],
    ['base/element/string.json', { string: [{ name: 'expo_splash_resize_mode', value: resizeMode }] }],
  ];
  if (darkBackground) resources.push(['dark/element/color.json', { color: [{ name: 'start_window_background', value: darkBackground }] }]);
  for (const [relative, additions] of resources) {
    const target = path.join(harmonyRoot, 'entry/src/main/resources', relative);
    await assertHarmonyTargetPathAsync(harmonyRoot, target);
    const contents = fs.existsSync(target) ? JSON5.parse(await fs.promises.readFile(target, 'utf8')) : {};
    for (const [type, entries] of Object.entries(additions)) {
      const names = new Set(entries.map((entry: { name: string }) => entry.name));
      contents[type] = [...(contents[type] ?? []).filter((entry: { name: string }) => !names.has(entry.name)), ...entries];
    }
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.writeFile(target, JSON.stringify(contents, null, 2) + '\n');
  }
}

export async function validateHarmonyAppAssetsAsync(
  projectRoot: string,
  appConfig: Record<string, any>
): Promise<void> {
  resolveHarmonyAppAssets(projectRoot, appConfig);
}

function resolveHarmonyAppAssets(projectRoot: string, appConfig: Record<string, any>) {
  assertAppConfigSnapshot(appConfig);
  JSON.stringify(appConfig);
  const harmony = appConfig.harmony ?? {};
  const icon = harmony.icon ?? appConfig.icon;
  if (typeof icon !== 'string' || !icon) {
    throw new Error(
      'Harmony configuration snapshot must define harmony.icon or expo.icon for media generation'
    );
  }
  const foreground =
    harmony.foregroundImage ??
    harmony.icon ??
    appConfig.android?.adaptiveIcon?.foregroundImage ??
    icon;
  const splash = harmony.splash?.image ?? appConfig.splash?.image ?? icon;
  const background =
    harmony.splash?.backgroundColor ?? appConfig.splash?.backgroundColor ?? '#FFFFFF';
  if (typeof background !== 'string' || !/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(background)) {
    throw new Error('Harmony splash.backgroundColor must be a six or eight digit hex color');
  }
  const darkBackground = harmony.splash?.dark?.backgroundColor;
  if (darkBackground !== undefined && (typeof darkBackground !== 'string' || !/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(darkBackground))) {
    throw new Error('Harmony splash.dark.backgroundColor must be a six or eight digit hex color');
  }
  const imageWidth = harmony.splash?.imageWidth ?? 100;
  const resizeMode = harmony.splash?.resizeMode ?? 'contain';
  if (typeof imageWidth !== 'number' || !Number.isFinite(imageWidth) || imageWidth <= 0) throw new Error('Invalid Harmony splash.imageWidth');
  if (!['contain', 'cover', 'native'].includes(resizeMode)) throw new Error('Invalid Harmony splash.resizeMode');
  const realProjectRoot = fs.realpathSync(projectRoot);
  const resolveAsset = (relativePath: unknown, field: string): string => {
    if (typeof relativePath !== 'string' || !relativePath)
      throw new Error(`${field} must be a project-relative asset path`);
    const absolute = path.resolve(projectRoot, relativePath);
    const relative = path.relative(projectRoot, absolute);
    if (
      !relative ||
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    )
      throw new Error(`${field} must stay inside the project`);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile())
      throw new Error(`${field} asset is missing: ${relativePath}`);
    const realRelative = path.relative(realProjectRoot, fs.realpathSync(absolute));
    if (
      !realRelative ||
      realRelative === '..' ||
      realRelative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(realRelative)
    )
      throw new Error(`${field} must stay inside the project`);
    return absolute;
  };
  const media: [string, string][] = [
    [resolveAsset(icon, 'expo.icon'), 'entry/src/main/resources/base/media/background.png'],
    [
      resolveAsset(foreground, 'expo.android.adaptiveIcon.foregroundImage'),
      'entry/src/main/resources/base/media/foreground.png',
    ],
    [
      resolveAsset(splash, 'expo.splash.image'),
      'entry/src/main/resources/base/media/startIcon.png',
    ],
    [resolveAsset(icon, 'expo.icon'), 'AppScope/resources/base/media/app_icon.png'],
  ];
  if (harmony.splash?.dark?.image) {
    media.push([resolveAsset(harmony.splash.dark.image, 'harmony.splash.dark.image'), 'entry/src/main/resources/dark/media/startIcon.png']);
  }
  return { media, background, darkBackground, imageWidth, resizeMode };
}

async function assertHarmonyTargetPathAsync(harmonyRoot: string, target: string): Promise<void> {
  await fs.promises.mkdir(harmonyRoot, { recursive: true });
  const realRoot = await fs.promises.realpath(harmonyRoot);
  let ancestor = target;
  while (true) {
    try {
      await fs.promises.lstat(ancestor);
      break;
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error;
      const parent = path.dirname(ancestor);
      if (ancestor === parent) throw new Error('Resource must stay inside the Harmony project');
      ancestor = parent;
    }
  }
  let realAncestor: string;
  try {
    realAncestor = await fs.promises.realpath(ancestor);
  } catch (error: any) {
    if (error?.code === 'ENOENT') throw new Error(`Resource symbolic link is dangling: ${ancestor}`);
    throw error;
  }
  const relative = path.relative(realRoot, realAncestor);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Resource must stay inside the Harmony project: ${target}`);
  }
}

export async function syncHarmonyNativeProjectAsync(
  options: HarmonyNativeProjectOptions
): ReturnType<typeof prepareHarmonyNativeProjectAsync> {
  return generateHarmonyNativeProjectAsync(options, false);
}

async function generateHarmonyNativeProjectAsync(
  options: HarmonyNativeProjectOptions,
  prepareOnly: boolean
): Promise<HarmonyNativeProjectResult> {
  const currentRoot = path.join(options.projectRoot, 'harmony');
  await validateHarmonyModuleSourcesAsync(options.modules);
  resolveHarmonyUserInterfaceStyle(options.appConfig, options.userInterfaceStyle);
  assertHarmonyThemeManifestPlan(options.nativeConfig);
  await validateHarmonyAppAssetsAsync(options.projectRoot, options.appConfig);
  const transaction = await runHarmonyGenerationTransactionAsync({
    projectRoot: options.projectRoot,
    clean: options.clean,
    prepareOnly,
    fault: options.generationFault,
    generate: async (stageRoot, hash) => {
      if (!options.clean && fs.existsSync(currentRoot)) await validateHarmonyAppConfigurationAsync(currentRoot);
      const templateRoot = options.templateRoot ?? path.resolve(__dirname, '../../../templates/harmony');
      await assertHarmonyPackageSourceAsync(templateRoot, templateRoot);
      await fs.promises.cp(templateRoot, stageRoot, { recursive: true });
      await copyHarmonyTemplateMediaAsync(options.projectRoot, stageRoot, options.appConfig);
      await replaceTemplatePlaceholdersAsync(stageRoot, {
        __EXPO_APP_NAME__: options.appName,
        __EXPO_BUNDLE_NAME__: options.bundleName,
      });
      await writeHarmonyAppIdentityAsync(stageRoot, options.appName, options.bundleName, options.nativeConfig);
      const modules = [...options.modules].sort((a, b) => a.packageName.localeCompare(b.packageName));
      const generated = await assembleHarmonyGeneratedAreasAsync({ ...options, modules, harmonyRoot: stageRoot });
      const owners = await stageHarmonyResourcesAsync({ projectRoot: options.projectRoot, stageRoot, currentRoot,
        resources: options.resources, clean: options.clean });
      await options.finalize?.(stageRoot);
      const merge = await mergeHarmonyGenerationStateAsync({
        stageRoot,
        currentRoot,
        clean: options.clean,
        detectUnchanged: true,
        owners,
      });
      if (merge.unchanged) hash.reuseCurrentTree();
      else if (merge.managedPatch) hash.applyManagedPatch(merge.managedPatch);
      else for (const root of merge.clonedRoots) hash.reuseClonedRoot(root);
      // Restore the documented insertion when users have removed only the theme wiring.
      const ability = await getHarmonyAppConfigurationEntryAsync(stageRoot);
      if (await fs.promises.readFile(ability.abilityPath, 'utf8') !== ability.contents) {
        await fs.promises.writeFile(ability.abilityPath, ability.contents, 'utf8');
      }
      return {
        rnohHarPath: path.relative(stageRoot, generated.rnohHarPath),
        generatedFiles: Object.fromEntries(Object.entries(generated.generatedFiles).map(([key, file]) => [key, path.relative(stageRoot, file)])),
      };
    },
    validate: validateHarmonyAppConfigurationAsync,
  });
  return {
    harmonyRoot: transaction.harmonyRoot,
    ...(transaction.backupPath ? { backupPath: transaction.backupPath } : {}),
    rnohHarPath: path.join(transaction.harmonyRoot, transaction.value.rnohHarPath),
    generatedFiles: Object.fromEntries(Object.entries(transaction.value.generatedFiles).map(([key, file]) => [key, path.join(transaction.harmonyRoot, file)])) as HarmonyNativeProjectResult['generatedFiles'],
  };
}

async function assembleHarmonyGeneratedAreasAsync({
  projectRoot,
  appConfig,
  userInterfaceStyle,
  harmonyRoot,
  modules,
  inputHarPath,
  corePackageRoot,
  pythonExecutable,
  runCompatibilityTool,
}: Omit<HarmonyNativeProjectOptions, 'appName' | 'bundleName' | 'templateRoot'> & {
  harmonyRoot: string;
}) {
  await generateHarmonyAppConfigAsync({ projectRoot, harmonyRoot, appConfig });
  const rnohHarPath = await prepareRnohCompatibilityHarAsync({
    harmonyRoot,
    inputHarPath,
    corePackageRoot,
    pythonExecutable,
    runCompatibilityTool,
  });
  await stageHarmonyEtsPackagesAsync(modules, harmonyRoot, (transform, inputHarPath, outputHarPath) =>
    copyReleasedHarmonyHarAsync({ transform, inputHarPath, outputHarPath, corePackageRoot })
  );

  const scratch = path.join(harmonyRoot, '.expo-autolinking');
  const finalCppRoot = path.join(projectRoot, 'harmony/entry/src/main/cpp');
  const relativeModules = modules.map((module) => ({
    ...module,
    ...(module.cpp && module.kind !== 'rnoh-package' ? {
      cpp: { ...module.cpp, cmakePath: path.relative(finalCppRoot, module.cpp.cmakePath).split(path.sep).join('/') },
    } : {}),
  }));
  await generatePackageListAsync(relativeModules, scratch, 'expo.modules');
  const generatedFiles = {
    cpp: path.join(harmonyRoot, 'entry/src/main/cpp/generated/ExpoModulesPackages.cpp'),
    ets: path.join(harmonyRoot, 'entry/src/main/ets/generated/ExpoModulesPackages.ets'),
    cmake: path.join(harmonyRoot, 'entry/src/main/cpp/generated/expo-modules.cmake'),
    lifecycle: path.join(harmonyRoot, 'entry/src/main/ets/generated/ExpoModulesLifecycle.ets'),
    overlays: path.join(harmonyRoot, 'entry/src/main/ets/generated/ExpoModulesAppOverlays.ets'),
  };
  await Promise.all([
    copyFileAsync(path.join(scratch, 'ExpoModulesPackages.cpp'), generatedFiles.cpp),
    copyFileAsync(path.join(scratch, 'ExpoModulesPackages.ets'), generatedFiles.ets),
    copyFileAsync(path.join(scratch, 'expo-modules.cmake'), generatedFiles.cmake),
    fs.promises
      .mkdir(path.dirname(generatedFiles.lifecycle), { recursive: true })
      .then(() =>
        fs.promises.writeFile(generatedFiles.lifecycle, renderExpoModulesLifecycle(modules), 'utf8')
      ),
    fs.promises
      .mkdir(path.dirname(generatedFiles.overlays), { recursive: true })
      .then(() =>
        fs.promises.writeFile(
          generatedFiles.overlays,
          renderExpoModulesAppOverlays(modules),
          'utf8'
        )
      ),
  ]);
  await fs.promises.rm(scratch, { recursive: true, force: true });
  await writeHarmonyAppConfigurationAsync(harmonyRoot, resolveHarmonyUserInterfaceStyle(appConfig, userInterfaceStyle));
  return { rnohHarPath, generatedFiles };
}

function assertHarmonyThemeManifestPlan(nativeConfig?: HarmonyNativeProjectOptions['nativeConfig']): void {
  if (nativeConfig?.app && Object.prototype.hasOwnProperty.call(nativeConfig.app, 'colorMode')) {
    throw new Error('Harmony app.colorMode is not supported; use userInterfaceStyle');
  }
}

function resolveHarmonyUserInterfaceStyle(
  appConfig: Record<string, any>,
  explicit?: HarmonyNativeProjectOptions['userInterfaceStyle']
): NonNullable<HarmonyNativeProjectOptions['userInterfaceStyle']> {
  const style = explicit ?? appConfig.harmony?.userInterfaceStyle ?? appConfig.userInterfaceStyle ?? 'light';
  if (!['light', 'dark', 'automatic'].includes(style)) {
    throw new Error('Harmony userInterfaceStyle must be light, dark or automatic');
  }
  return style;
}

export function renderExpoAppConfiguration(
  style: NonNullable<HarmonyNativeProjectOptions['userInterfaceStyle']>
): string {
  const modes = { light: 'COLOR_MODE_LIGHT', dark: 'COLOR_MODE_DARK', automatic: 'COLOR_MODE_NOT_SET' };
  return '// @generated by expo-modules-autolinking. Do not edit.\n' +
    "import { common, ConfigurationConstant } from '@kit.AbilityKit';\n\n" +
    'export function applyExpoAppConfiguration(context: common.UIAbilityContext): void {\n' +
    `  context.getApplicationContext().setColorMode(ConfigurationConstant.ColorMode.${modes[style]});\n` +
    '}\n';
}

const APP_CONFIGURATION_IMPORT = "import { applyExpoAppConfiguration } from '../generated/ExpoAppConfiguration';";
const APP_CONFIGURATION_CALL = 'applyExpoAppConfiguration(this.context);';

async function getHarmonyAppConfigurationEntryAsync(harmonyRoot: string): Promise<{ abilityPath: string; contents: string }> {
  const abilityPath = path.join(harmonyRoot, 'entry/src/main/ets/entryability/EntryAbility.ets');
  await assertHarmonyTargetPathAsync(harmonyRoot, abilityPath);
  let contents = await fs.promises.readFile(abilityPath, 'utf8');
  const calls = contents.match(/^[ \t]*applyExpoAppConfiguration\(this\.context\);[ \t]*$/gm) ?? [];
  const imports = contents.split(APP_CONFIGURATION_IMPORT).length - 1;
  if (calls.length > 1 || imports > 1) {
    throw new Error('EntryAbility contains duplicate Expo app configuration wiring');
  }
  if (calls.length === 0) {
    const anchor = /^([ \t]*)this\.expoModulesLifecycle\.onCreate\(want\);[ \t]*$/m;
    if (!anchor.test(contents)) {
      throw new Error('EntryAbility has no supported app configuration insertion anchor');
    }
    contents = contents.replace(anchor, (_line, indent) => `${indent}${APP_CONFIGURATION_CALL}\n${_line}`);
  }
  if (imports === 0) contents = `${APP_CONFIGURATION_IMPORT}\n${contents}`;
  return { abilityPath, contents };
}

export async function validateHarmonyAppConfigurationAsync(harmonyRoot: string): Promise<void> {
  if (!fs.existsSync(harmonyRoot)) return;
  await getHarmonyAppConfigurationEntryAsync(harmonyRoot);
}

async function writeHarmonyAppConfigurationAsync(
  harmonyRoot: string,
  style: NonNullable<HarmonyNativeProjectOptions['userInterfaceStyle']>
): Promise<void> {
  const { abilityPath, contents } = await getHarmonyAppConfigurationEntryAsync(harmonyRoot);
  const configPath = path.join(harmonyRoot, 'entry/src/main/ets/generated/ExpoAppConfiguration.ets');
  await assertHarmonyTargetPathAsync(harmonyRoot, configPath);
  await fs.promises.mkdir(path.dirname(configPath), { recursive: true });
  await fs.promises.writeFile(configPath, renderExpoAppConfiguration(style), 'utf8');
  await fs.promises.writeFile(abilityPath, contents, 'utf8');
}

async function writeHarmonyAppIdentityAsync(
  harmonyRoot: string,
  appName: string,
  bundleName: string,
  nativeConfig?: HarmonyNativeProjectOptions['nativeConfig']
): Promise<void> {
  const appPath = path.join(harmonyRoot, 'AppScope/app.json5');
  await assertHarmonyTargetPathAsync(harmonyRoot, appPath);
  const app = JSON5.parse(await fs.promises.readFile(appPath, 'utf8'));
  app.app = mergeHarmonyManifest(app.app, { bundleName, ...nativeConfig?.app });
  delete app.app.colorMode;
  await fs.promises.writeFile(appPath, JSON.stringify(app, null, 2) + '\n');
  const modulePath = path.join(harmonyRoot, 'entry/src/main/module.json5');
  await assertHarmonyTargetPathAsync(harmonyRoot, modulePath);
  const module = JSON5.parse(await fs.promises.readFile(modulePath, 'utf8'));
  module.module = mergeHarmonyManifest(module.module, nativeConfig?.module ?? {});
  await fs.promises.writeFile(modulePath, JSON.stringify(module, null, 2) + '\n');
  for (const relativePath of [
    'AppScope/resources/base/element/string.json',
    'entry/src/main/resources/base/element/string.json',
  ]) {
    const filePath = path.join(harmonyRoot, relativePath);
    await assertHarmonyTargetPathAsync(harmonyRoot, filePath);
    const resource = JSON5.parse(await fs.promises.readFile(filePath, 'utf8'));
    for (const item of resource.string ?? []) {
      if (
        ['app_name', 'module_desc', 'EntryAbility_desc', 'EntryAbility_label'].includes(item.name)
      ) {
        item.value = appName;
      }
    }
    await fs.promises.writeFile(filePath, JSON.stringify(resource, null, 2) + '\n');
  }
}

function mergeHarmonyManifest(
  current: Record<string, any>,
  planned: Record<string, any>
): Record<string, any> {
  const merged = { ...current };
  for (const [key, value] of Object.entries(planned)) {
    if (key === 'abilities' && Array.isArray(value) && Array.isArray(merged[key])) {
      const abilities = [...merged[key]];
      for (const ability of value) {
        const index = abilities.findIndex((existing) => existing.name === ability.name);
        if (index < 0) abilities.push(ability);
        else abilities[index] = mergeHarmonyManifest(abilities[index], ability);
      }
      merged[key] = abilities;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      merged[key] = mergeHarmonyManifest(
        merged[key] && typeof merged[key] === 'object' && !Array.isArray(merged[key])
          ? merged[key]
          : {},
        value
      );
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function assertAppConfigSnapshot(appConfig: unknown): asserts appConfig is Record<string, any> {
  if (!appConfig || typeof appConfig !== 'object' || Array.isArray(appConfig)) {
    throw new Error('Harmony appConfig snapshot must be a JSON object');
  }
}

export async function generateHarmonyAppConfigAsync({
  harmonyRoot,
  appConfig,
}: {
  projectRoot: string;
  harmonyRoot: string;
  appConfig: Record<string, any>;
  /** @deprecated Ignored. The provided snapshot is written without evaluating configuration again. */
  runAppConfigGenerator?: RunAppConfigGenerator;
}): Promise<string> {
  assertAppConfigSnapshot(appConfig);
  const serialized = JSON.stringify(appConfig);
  const destinationDir = path.join(harmonyRoot, 'entry', 'src', 'main', 'resources', 'rawfile');
  const outputPath = path.join(destinationDir, 'app.config');
  await assertHarmonyTargetPathAsync(harmonyRoot, outputPath);
  await fs.promises.mkdir(destinationDir, { recursive: true });
  await fs.promises.writeFile(outputPath, serialized, 'utf8');
  return outputPath;
}

export async function prepareRnohCompatibilityHarAsync({
  harmonyRoot,
  inputHarPath,
  corePackageRoot,
}: {
  harmonyRoot: string;
  inputHarPath: string;
  corePackageRoot: string;
  pythonExecutable?: string;
  runCompatibilityTool?: RunCompatibilityTool;
}): Promise<string> {
  const outputHarPath = path.join(harmonyRoot, 'dependencies', 'react_native_openharmony.har');
  return copyReleasedRnohCompatibilityHarAsync({ inputHarPath, outputHarPath, corePackageRoot });
}

export type RunHarmonyHarTransform = (
  transform: NonNullable<HarmonyHarConfig['transform']>,
  input: string,
  output: string
) => Promise<void>;

export async function stageHarmonyEtsPackagesAsync(
  modules: ModuleDescriptorHarmony[],
  harmonyRoot: string,
  runHarTransform: RunHarmonyHarTransform = async (transform) => {
    throw new Error(`Released Harmony compatibility artifact lookup requires Core package root for ${transform}`);
  }
): Promise<Record<string, string>> {
  await validateHarmonyModuleSourcesAsync(modules);
  const packages = new Map<
    string,
    ModuleDescriptorHarmony & { ets: NonNullable<ModuleDescriptorHarmony['ets']> }
  >();
  for (const module of modules) {
    if (!module.ets || module.kind === 'rnoh-package') {
      continue;
    }
    const ohPackageName = getOhPackageName(module.ets.importPath);
    const existing = packages.get(ohPackageName);
    if (existing && existing.packageRoot !== module.packageRoot) {
      throw new Error(
        `Harmony OHPM package "${ohPackageName}" resolves to both "${existing.packageRoot}" and "${module.packageRoot}"`
      );
    }
    packages.set(ohPackageName, { ...module, ets: module.ets });
  }

  const dependencies = new Map<string, { specifier: string; owner: string }>();
  const harEntries = modules
    .flatMap((module) => (module.hars ?? []).map((har) => ({ har, owner: module.packageName })))
    .sort((a, b) => a.har.packageName.localeCompare(b.har.packageName));
  const etsPaths = new Map<string, string>();
  const moduleNames = new Map<string, string>();
  const harPaths = new Map<string, string>();
  const claimName = (claims: Map<string, string>, generatedName: string, ohName: string) => {
    const existing = claims.get(generatedName);
    if (existing && existing !== ohName) {
      throw new Error(`Harmony generated path collision: "${existing}" and "${ohName}" both resolve to "${generatedName}"`);
    }
    claims.set(generatedName, ohName);
  };
  for (const name of packages.keys()) {
    const stagingName = sanitizeOhPackageName(name);
    claimName(etsPaths, stagingName, name);
    claimName(moduleNames, stagingName.replace(/[^A-Za-z0-9_.]/g, '_'), name);
  }
  for (const { har } of harEntries) {
    if (!har.version) claimName(harPaths, sanitizeOhPackageName(har.packageName), har.packageName);
  }
  const projectModules: Array<{
    name: string;
    srcPath: string;
    targets: Array<{ name: string; applyToProducts: string[] }>;
  }> = [];
  for (const [ohPackageName, module] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
    const stagingName = sanitizeOhPackageName(ohPackageName);
    const moduleName = stagingName.replace(/[^A-Za-z0-9_.]/g, '_');
    const stagingRoot = path.join(harmonyRoot, 'expo-modules', stagingName);
    const entrypointRelative = path.relative(module.packageRoot, module.ets.entrypoint);
    if (entrypointRelative.startsWith('..') || path.isAbsolute(entrypointRelative)) {
      throw new Error(
        `Harmony ETS entrypoint for "${module.packageName}" is outside its package root`
      );
    }
    await assertHarmonyPackageSourceAsync(module.packageRoot, module.ets.entrypoint);

    await fs.promises.mkdir(stagingRoot, { recursive: true });
    await copyFileAsync(module.ets.entrypoint, path.join(stagingRoot, entrypointRelative));
    const sourceHarmonyRoot = path.dirname(module.ets.entrypoint);
    const sourceEtsRoot = path.join(sourceHarmonyRoot, 'src', 'main', 'ets');
    try {
      const stats = await fs.promises.stat(sourceEtsRoot);
      if (stats.isDirectory()) {
        await assertHarmonyPackageSourceAsync(module.packageRoot, sourceEtsRoot);
        await fs.promises.cp(
          sourceEtsRoot,
          path.join(stagingRoot, path.relative(module.packageRoot, sourceEtsRoot)),
          { recursive: true }
        );
      }
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }

    await fs.promises.writeFile(
      path.join(stagingRoot, 'oh-package.json5'),
      JSON.stringify(
        {
          name: ohPackageName,
          version: module.packageVersion ?? '0.0.0',
          main: entrypointRelative.split(path.sep).join('/'),
          dependencies: {
            '@rnoh/react-native-openharmony':
              'file:../../dependencies/react_native_openharmony.har',
          },
        },
        null,
        2
      ) + '\n'
    );
    await fs.promises.mkdir(path.join(stagingRoot, 'src', 'main'), { recursive: true });
    await Promise.all([
      fs.promises.writeFile(
        path.join(stagingRoot, 'src', 'main', 'module.json5'),
        JSON.stringify(
          { module: { name: moduleName, type: 'har', deviceTypes: ['default'] } },
          null,
          2
        ) + '\n'
      ),
      fs.promises.writeFile(
        path.join(stagingRoot, 'build-profile.json5'),
        JSON.stringify(
          { apiType: 'stageMode', targets: [{ name: 'default', runtimeOS: 'HarmonyOS' }] },
          null,
          2
        ) + '\n'
      ),
      fs.promises.writeFile(
        path.join(stagingRoot, 'hvigorfile.ts'),
        "import { harTasks } from '@ohos/hvigor-ohos-plugin';\nexport default { system: harTasks, plugins: [] };\n"
      ),
    ]);
    registerHarmonyDependency(
      dependencies,
      ohPackageName,
      `file:../expo-modules/${stagingName}`,
      module.packageName
    );
    projectModules.push({
      name: moduleName,
      srcPath: `./expo-modules/${stagingName}`,
      targets: [{ name: 'default', applyToProducts: ['default'] }],
    });
  }

  const managedHarRoot = path.join(harmonyRoot, 'dependencies', 'expo-modules');
  const managedHarScratch = path.join(harmonyRoot, '.expo-har-staging');
  await fs.promises.rm(managedHarScratch, { recursive: true, force: true });
  let hasLocalHars = false;
  try {
    for (const { har, owner } of harEntries) {
      if (har.version) {
        registerHarmonyDependency(dependencies, har.packageName, har.version, owner);
        continue;
      }
      hasLocalHars = true;
      const stagingName = sanitizeOhPackageName(har.packageName);
      const fileName = path.basename(har.packagePath);
      const target = path.join(managedHarScratch, stagingName, fileName);
      registerHarmonyDependency(
        dependencies,
        har.packageName,
        `file:../dependencies/expo-modules/${stagingName}/${fileName}`,
        owner
      );
      if (har.transform) {
        await runHarTransform(har.transform, har.packagePath, target);
      } else {
        await copyFileAsync(har.packagePath, target);
      }
    }

    if (hasLocalHars) {
      await fs.promises.mkdir(path.dirname(managedHarRoot), { recursive: true });
      const backup = path.join(harmonyRoot, '.expo-har-backup');
      await fs.promises.rm(backup, { recursive: true, force: true });
      if (fs.existsSync(managedHarRoot)) await fs.promises.rename(managedHarRoot, backup);
      try {
        await fs.promises.rename(managedHarScratch, managedHarRoot);
        await fs.promises.rm(backup, { recursive: true, force: true });
      } catch (error) {
        await fs.promises.rm(managedHarRoot, { recursive: true, force: true });
        if (fs.existsSync(backup)) await fs.promises.rename(backup, managedHarRoot);
        throw error;
      }
    } else {
      await fs.promises.rm(managedHarRoot, { recursive: true, force: true });
    }
  } catch (error) {
    await fs.promises.rm(managedHarScratch, { recursive: true, force: true });
    throw error;
  }

  const rootManifestPath = path.join(harmonyRoot, 'oh-package.json5');
  if (fs.existsSync(rootManifestPath)) {
    const rootManifest = JSON5.parse(await fs.promises.readFile(rootManifestPath, 'utf8'));
    const harOverrides = Object.fromEntries(
      harEntries.map(({ har }) => [
        har.packageName,
        har.version ??
          `file:./dependencies/expo-modules/${sanitizeOhPackageName(
            har.packageName
          )}/${path.basename(har.packagePath)}`,
      ])
    );
    const unmanagedOverrides = Object.fromEntries(
      Object.entries(rootManifest.overrides ?? {}).filter(
        ([, specifier]) => !String(specifier).startsWith('file:./dependencies/expo-modules/')
      )
    );
    rootManifest.overrides = {
      ...unmanagedOverrides,
      '@rnoh/react-native-openharmony': 'file:./dependencies/react_native_openharmony.har',
      ...harOverrides,
    };
    await fs.promises.writeFile(rootManifestPath, JSON.stringify(rootManifest, null, 2) + '\n');
  }

  const dependencySpecifiers = Object.fromEntries(
    [...dependencies]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value]) => [name, value.specifier])
  );

  const entryManifestPath = path.join(harmonyRoot, 'entry', 'oh-package.json5');
  const entryManifest = JSON5.parse(await fs.promises.readFile(entryManifestPath, 'utf8'));
  entryManifest.dependencies = {
    '@rnoh/react-native-openharmony': 'file:../dependencies/react_native_openharmony.har',
    ...dependencySpecifiers,
  };
  await fs.promises.writeFile(entryManifestPath, JSON.stringify(entryManifest, null, 2) + '\n');
  const buildProfilePath = path.join(harmonyRoot, 'build-profile.json5');
  const buildProfile = JSON5.parse(await fs.promises.readFile(buildProfilePath, 'utf8'));
  buildProfile.modules = [
    ...(buildProfile.modules ?? []).filter(
      (module: { srcPath?: string }) => !module.srcPath?.startsWith('./expo-modules/')
    ),
    ...projectModules,
  ];
  await fs.promises.writeFile(buildProfilePath, JSON.stringify(buildProfile, null, 2) + '\n');
  return dependencySpecifiers;
}

async function assertHarmonyPackageSourceAsync(packageRoot: string, source: string): Promise<void> {
  const info = await fs.promises.lstat(source);
  if (info.isSymbolicLink()) throw new Error(`Harmony package source must not be a symbolic link: ${source}`);
  const realRoot = await fs.promises.realpath(packageRoot);
  const realSource = await fs.promises.realpath(source);
  const relative = path.relative(realRoot, realSource);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Harmony source is outside its package root: ${source}`);
  }
  if (info.isDirectory()) {
    for (const entry of (await fs.promises.readdir(source)).sort()) {
      await assertHarmonyPackageSourceAsync(packageRoot, path.join(source, entry));
    }
  }
}

function registerHarmonyDependency(
  dependencies: Map<string, { specifier: string; owner: string }>,
  packageName: string,
  specifier: string,
  owner: string
): void {
  const existing = dependencies.get(packageName);
  if (existing) {
    throw new Error(
      `duplicate Harmony OHPM package name "${packageName}" in "${existing.owner}" and "${owner}"`
    );
  }
  dependencies.set(packageName, { specifier, owner });
}

function sanitizeOhPackageName(packageName: string): string {
  return packageName.replace(/^@/, '').replace(/[^A-Za-z0-9._-]+/g, '__');
}

export function renderExpoModulesLifecycle(modules: ModuleDescriptorHarmony[]): string {
  validateHarmonyModuleGraph(modules);
  const dependencies = collectLifecycleDependencies(modules);
  const imports = deduplicateLifecycleImports(dependencies)
    .map(
      ({ className, importPath }) =>
        `import { ${className} } from '${escapeEtsString(importPath)}';`
    )
    .join('\n');

  if (dependencies.length === 0) {
    return (
      `// @generated by expo-modules-autolinking. Do not edit.\n` +
      `import { Want } from '@kit.AbilityKit';\n\n` +
      `export class ExpoModulesLifecycle {\n` +
      `  public onCreate(_want: Want): void {}\n` +
      `  public onNewWant(_want: Want): void {}\n` +
      `  public onDestroy(): void {}\n` +
      `}\n`
    );
  }

  const fields = dependencies
    .map(({ localName, className }) => `  private readonly ${localName} = new ${className}();`)
    .join('\n');
  const onCreate = dependencies
    .flatMap(({ localName, appStorageKey }) => [
      `    this.${localName}.onCreate(want);`,
      `    AppStorage.setOrCreate('${escapeEtsString(appStorageKey)}', this.${localName});`,
    ])
    .join('\n');
  const onNewWant = dependencies
    .map(({ localName }) => `    this.${localName}.onNewWant(want);`)
    .join('\n');
  const onDestroy = dependencies
    .flatMap(({ localName, appStorageKey }) => [
      `    this.${localName}.onDestroy();`,
      `    AppStorage.delete('${escapeEtsString(appStorageKey)}');`,
    ])
    .join('\n');

  return (
    `// @generated by expo-modules-autolinking. Do not edit.\n` +
    `import { Want } from '@kit.AbilityKit';\n` +
    `${imports}\n\n` +
    `export class ExpoModulesLifecycle {\n` +
    `${fields}\n\n` +
    `  public onCreate(want: Want): void {\n${onCreate}\n  }\n\n` +
    `  public onNewWant(want: Want): void {\n${onNewWant}\n  }\n\n` +
    `  public onDestroy(): void {\n${onDestroy}\n  }\n` +
    `}\n`
  );
}

export function renderExpoModulesAppOverlays(modules: ModuleDescriptorHarmony[]): string {
  validateHarmonyModuleGraph(modules);
  const overlays = collectLifecycleDependencies(modules)
    .filter((dependency) => dependency.arkUIOverlay != null)
    .map((dependency) => ({ ...dependency, overlay: dependency.arkUIOverlay! }));

  if (overlays.length === 0) {
    return (
      `// @generated by expo-modules-autolinking. Do not edit.\n\n` +
      `@Component\n` +
      `export struct ExpoModulesAppOverlays {\n` +
      `  build() {\n` +
      `    Column() {}\n` +
      `      .width(0)\n` +
      `      .height(0)\n` +
      `  }\n` +
      `}\n`
    );
  }

  const importsByPath = new Map<string, Set<string>>();
  for (const dependency of overlays) {
    for (const [importPath, className] of [
      [dependency.importPath, dependency.className],
      [dependency.overlay.importPath, dependency.overlay.className],
    ]) {
      const classNames = importsByPath.get(importPath) ?? new Set<string>();
      classNames.add(className);
      importsByPath.set(importPath, classNames);
    }
  }
  const imports = [...importsByPath]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([importPath, classNames]) =>
        `import { ${[...classNames].sort().join(', ')} } from '${escapeEtsString(importPath)}';`
    )
    .join('\n');
  const fields = overlays
    .map(
      (dependency) =>
        `  @StorageLink('${escapeEtsString(dependency.appStorageKey)}') private ${dependency.localName}: ${dependency.className} | undefined = undefined;`
    )
    .join('\n');
  const views = overlays
    .map(
      (dependency) =>
        `    if (this.${dependency.localName}) {\n` +
        `      ${dependency.overlay.className}({ ${dependency.overlay.controllerProperty}: this.${dependency.localName} })\n` +
        `    }`
    )
    .join('\n');

  // ArkTS requires a single root. The container delegates hit testing to its
  // children so an empty/dismissed overlay does not block the RN surface.
  const body = overlays.length === 1
    ? views
    : `    Stack() {\n${views.split('\n').map((line) => `  ${line}`).join('\n')}\n` +
      `    }\n` +
      `    .width('100%')\n` +
      `    .height('100%')\n` +
      `    .hitTestBehavior(HitTestMode.None)`;

  return (
    `// @generated by expo-modules-autolinking. Do not edit.\n` +
    `${imports}\n\n` +
    `@Component\n` +
    `export struct ExpoModulesAppOverlays {\n` +
    `${fields}\n\n` +
    `  build() {\n${body}\n  }\n` +
    `}\n`
  );
}

function collectLifecycleDependencies(
  modules: ModuleDescriptorHarmony[]
): OwnedLifecycleDependency[] {
  const dependencies = modules
    .flatMap((module) =>
      module.lifecycleDependencies.map((dependency) => ({
        ...dependency,
        packageName: module.packageName,
      }))
    )
    .sort((a, b) =>
      [a.importPath, a.className, a.localName]
        .join('\0')
        .localeCompare([b.importPath, b.className, b.localName].join('\0'))
    );
  const localNameOwners = new Map<string, string>();
  const appStorageKeyOwners = new Map<string, string>();

  for (const dependency of dependencies) {
    assertUniqueLifecycleValue(
      'localName',
      dependency.localName,
      dependency.packageName,
      localNameOwners
    );
    assertUniqueLifecycleValue(
      'appStorageKey',
      dependency.appStorageKey,
      dependency.packageName,
      appStorageKeyOwners
    );
  }
  return dependencies;
}

function assertUniqueLifecycleValue(
  field: 'localName' | 'appStorageKey',
  value: string,
  packageName: string,
  owners: Map<string, string>
): void {
  const existingOwner = owners.get(value);
  if (existingOwner) {
    throw new Error(
      `Invalid Harmony lifecycle metadata: duplicate lifecycle ${field} "${value}" in "${existingOwner}" and "${packageName}"`
    );
  }
  owners.set(value, packageName);
}

function deduplicateLifecycleImports(dependencies: OwnedLifecycleDependency[]) {
  const imports = new Map<string, { className: string; importPath: string }>();
  for (const dependency of dependencies) {
    imports.set(`${dependency.importPath}\0${dependency.className}`, {
      className: dependency.className,
      importPath: dependency.importPath,
    });
  }
  return [...imports.values()];
}

function escapeEtsString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function getOhPackageName(importPath: string): string {
  const segments = importPath.split('/');
  const packageName = importPath.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
  if (!packageName) {
    throw new Error(`Invalid Harmony ETS import path "${importPath}"`);
  }
  return packageName;
}

async function copyFileAsync(source: string, target: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.copyFile(source, target);
}

async function replaceTemplatePlaceholdersAsync(
  root: string,
  replacements: Record<string, string>
): Promise<void> {
  for (const entry of await fs.promises.readdir(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await replaceTemplatePlaceholdersAsync(entryPath, replacements);
      continue;
    }
    if (!/\.(?:cmake|ets|json|json5|ts|txt)$/.test(entry.name) && entry.name !== 'CMakeLists.txt') {
      continue;
    }
    // JSON identities and labels are written through their structured documents.
    if (/\.json5?$/.test(entry.name)) continue;
    let contents = await fs.promises.readFile(entryPath, 'utf8');
    for (const [placeholder, value] of Object.entries(replacements)) {
      contents = contents.split(placeholder).join(/\.(?:ets|ts)$/.test(entry.name) ? escapeEtsString(value) : value);
    }
    await fs.promises.writeFile(entryPath, contents, 'utf8');
  }
}
