import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { spawn } from 'child_process';

import type {
  HarmonyHarConfig,
  HarmonyLifecycleDependency,
  ModuleDescriptorHarmony,
} from '../../types';
import { generatePackageListAsync } from './harmony';

type OwnedLifecycleDependency = HarmonyLifecycleDependency & {
  packageName: string;
};

export const RNOH_COMPATIBILITY_ID = 'expo-rnoh-0.82.30-core-v1-v3';
export const RNOH_INPUT_HAR_SHA256 =
  'cac2b5d1b9ce7d306079218931db12489aaceb240002c9c32e6c13185c577011';
export const RNOH_OUTPUT_HAR_SHA256 =
  '0e0cf3dbb5b2e510f49c819ff5db2f43ad5a5918d38e840cc2714055c9f6fd83';

export interface RunCompatibilityToolOptions {
  pythonExecutable: string;
  scriptPath: string;
  inputHarPath: string;
  outputHarPath: string;
  profile: 'core-v1-v3';
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
  modules: ModuleDescriptorHarmony[];
  inputHarPath: string;
  corePackageRoot: string;
  pythonExecutable?: string;
  runCompatibilityTool?: RunCompatibilityTool;
  runAppConfigGenerator?: RunAppConfigGenerator;
  templateRoot?: string;
}

export async function prepareHarmonyNativeProjectAsync({
  projectRoot,
  appName,
  bundleName,
  modules,
  inputHarPath,
  corePackageRoot,
  pythonExecutable,
  runCompatibilityTool,
  runAppConfigGenerator = runAppConfigGeneratorAsync,
  templateRoot = path.resolve(__dirname, '../../../templates/harmony'),
}: HarmonyNativeProjectOptions): Promise<{
  harmonyRoot: string;
  rnohHarPath: string;
  generatedFiles: {
    cpp: string;
    ets: string;
    cmake: string;
    lifecycle: string;
    overlays: string;
  };
}> {
  const harmonyRoot = path.join(projectRoot, 'harmony');
  if (fs.existsSync(harmonyRoot)) {
    throw new Error(`Harmony native project already exists at "${harmonyRoot}"`);
  }

  try {
    await fs.promises.cp(templateRoot, harmonyRoot, { recursive: true });
    await copyHarmonyTemplateMediaAsync(projectRoot, harmonyRoot);
    await replaceTemplatePlaceholdersAsync(harmonyRoot, {
      __EXPO_APP_NAME__: appName,
      __EXPO_BUNDLE_NAME__: bundleName,
    });
    const { rnohHarPath, generatedFiles } = await assembleHarmonyGeneratedAreasAsync({
      projectRoot,
      harmonyRoot,
      modules,
      inputHarPath,
      corePackageRoot,
      pythonExecutable,
      runCompatibilityTool,
      runAppConfigGenerator,
    });
    return { harmonyRoot, rnohHarPath, generatedFiles };
  } catch (error) {
    await fs.promises.rm(harmonyRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function copyHarmonyTemplateMediaAsync(
  projectRoot: string,
  harmonyRoot: string
): Promise<void> {
  const appJsonPath = path.join(projectRoot, 'app.json');
  const app = JSON.parse(await fs.promises.readFile(appJsonPath, 'utf8'));
  const expo = app?.expo ?? {};
  const icon = expo.icon;
  if (typeof icon !== 'string' || !icon) {
    throw new Error('Expo app.json must define expo.icon for Harmony media generation');
  }
  const foreground = expo.android?.adaptiveIcon?.foregroundImage ?? icon;
  const splash = expo.splash?.image ?? icon;
  const resolveAsset = (relativePath: unknown, field: string): string => {
    if (typeof relativePath !== 'string' || !relativePath) throw new Error(`${field} must be a project-relative asset path`);
    const absolute = path.resolve(projectRoot, relativePath);
    const relative = path.relative(projectRoot, absolute);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${field} must stay inside the project`);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw new Error(`${field} asset is missing: ${relativePath}`);
    return absolute;
  };
  const media = [
    [resolveAsset(icon, 'expo.icon'), 'entry/src/main/resources/base/media/background.png'],
    [resolveAsset(foreground, 'expo.android.adaptiveIcon.foregroundImage'), 'entry/src/main/resources/base/media/foreground.png'],
    [resolveAsset(splash, 'expo.splash.image'), 'entry/src/main/resources/base/media/startIcon.png'],
    [resolveAsset(icon, 'expo.icon'), 'AppScope/resources/base/media/app_icon.png'],
  ] as const;
  for (const [source, relativeTarget] of media) {
    const target = path.join(harmonyRoot, relativeTarget);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.copyFile(source, target);
  }
}

export async function syncHarmonyNativeProjectAsync(
  options: HarmonyNativeProjectOptions
): ReturnType<typeof prepareHarmonyNativeProjectAsync> {
  const harmonyRoot = path.join(options.projectRoot, 'harmony');
  if (!fs.existsSync(harmonyRoot)) {
    return await prepareHarmonyNativeProjectAsync(options);
  }

  await writeHarmonyAppIdentityAsync(harmonyRoot, options.appName, options.bundleName);
  await Promise.all([
    fs.promises.rm(path.join(harmonyRoot, 'expo-modules'), { recursive: true, force: true }),
    fs.promises.rm(path.join(harmonyRoot, 'dependencies/expo-modules'), {
      recursive: true,
      force: true,
    }),
    fs.promises.rm(path.join(harmonyRoot, 'entry/src/main/cpp/generated'), {
      recursive: true,
      force: true,
    }),
    fs.promises.rm(path.join(harmonyRoot, 'entry/src/main/ets/generated'), {
      recursive: true,
      force: true,
    }),
    fs.promises.rm(path.join(harmonyRoot, '.expo-autolinking'), {
      recursive: true,
      force: true,
    }),
  ]);
  const { rnohHarPath, generatedFiles } = await assembleHarmonyGeneratedAreasAsync({
    ...options,
    harmonyRoot,
  });
  return { harmonyRoot, rnohHarPath, generatedFiles };
}

async function assembleHarmonyGeneratedAreasAsync({
  projectRoot,
  harmonyRoot,
  modules,
  inputHarPath,
  corePackageRoot,
  pythonExecutable,
  runCompatibilityTool,
  runAppConfigGenerator,
}: Omit<HarmonyNativeProjectOptions, 'appName' | 'bundleName' | 'templateRoot'> & {
  harmonyRoot: string;
}) {
  await generateHarmonyAppConfigAsync({ projectRoot, harmonyRoot, runAppConfigGenerator });
  const rnohHarPath = await prepareRnohCompatibilityHarAsync({
    harmonyRoot,
    inputHarPath,
    corePackageRoot,
    pythonExecutable,
    runCompatibilityTool,
  });
  await stageHarmonyEtsPackagesAsync(modules, harmonyRoot);

  const scratch = path.join(harmonyRoot, '.expo-autolinking');
  await generatePackageListAsync(modules, scratch, 'expo.modules');
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
  return { rnohHarPath, generatedFiles };
}

async function writeHarmonyAppIdentityAsync(
  harmonyRoot: string,
  appName: string,
  bundleName: string
): Promise<void> {
  const appPath = path.join(harmonyRoot, 'AppScope/app.json5');
  const app = JSON.parse(await fs.promises.readFile(appPath, 'utf8'));
  app.app.bundleName = bundleName;
  await fs.promises.writeFile(appPath, JSON.stringify(app, null, 2) + '\n');
  for (const relativePath of [
    'AppScope/resources/base/element/string.json',
    'entry/src/main/resources/base/element/string.json',
  ]) {
    const filePath = path.join(harmonyRoot, relativePath);
    const resource = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
    for (const item of resource.string ?? []) {
      item.value = appName;
    }
    await fs.promises.writeFile(filePath, JSON.stringify(resource, null, 2) + '\n');
  }
}

export async function generateHarmonyAppConfigAsync({
  projectRoot,
  harmonyRoot,
  runAppConfigGenerator = runAppConfigGeneratorAsync,
}: {
  projectRoot: string;
  harmonyRoot: string;
  runAppConfigGenerator?: RunAppConfigGenerator;
}): Promise<string> {
  const scriptPath = path.join(
    projectRoot,
    'node_modules',
    'expo-constants',
    'scripts',
    'getAppConfig.js'
  );
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`expo-constants app config generator does not exist at "${scriptPath}"`);
  }
  const destinationDir = path.join(harmonyRoot, 'entry', 'src', 'main', 'resources', 'rawfile');
  await fs.promises.mkdir(destinationDir, { recursive: true });
  await runAppConfigGenerator({ scriptPath, projectRoot, destinationDir });
  const outputPath = path.join(destinationDir, 'app.config');
  let config: unknown;
  try {
    config = JSON.parse(await fs.promises.readFile(outputPath, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid generated Harmony app.config at "${outputPath}": ${String(error)}`);
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error(`Generated Harmony app.config must contain a JSON object at "${outputPath}"`);
  }
  return outputPath;
}

export async function prepareRnohCompatibilityHarAsync({
  harmonyRoot,
  inputHarPath,
  corePackageRoot,
  pythonExecutable = resolveHarmonyPythonExecutable(),
  runCompatibilityTool = runCompatibilityToolAsync,
}: {
  harmonyRoot: string;
  inputHarPath: string;
  corePackageRoot: string;
  pythonExecutable?: string;
  runCompatibilityTool?: RunCompatibilityTool;
}): Promise<string> {
  await assertSha256Async(inputHarPath, RNOH_INPUT_HAR_SHA256, 'input');
  const outputHarPath = path.join(harmonyRoot, 'dependencies', 'react_native_openharmony.har');
  if (fs.existsSync(outputHarPath)) {
    await assertSha256Async(outputHarPath, RNOH_OUTPUT_HAR_SHA256, 'output');
    return outputHarPath;
  }

  const scriptPath = path.join(corePackageRoot, 'harmony', 'rnoh-compat', 'prepare_har.py');
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`RNOH compatibility tool does not exist at "${scriptPath}"`);
  }
  await fs.promises.mkdir(path.dirname(outputHarPath), { recursive: true });
  try {
    await runCompatibilityTool({
      pythonExecutable,
      scriptPath,
      inputHarPath,
      outputHarPath,
      profile: 'core-v1-v3',
    });
    await assertSha256Async(outputHarPath, RNOH_OUTPUT_HAR_SHA256, 'output');
    const manifestPath = `${outputHarPath}.manifest.json`;
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`RNOH compatibility manifest does not exist at "${manifestPath}"`);
    }
    return outputHarPath;
  } catch (error) {
    await Promise.all([
      fs.promises.rm(outputHarPath, { force: true }),
      fs.promises.rm(`${outputHarPath}.manifest.json`, { force: true }),
    ]);
    throw error;
  }
}

export type RunHarmonyHarTransform = (
  transform: NonNullable<HarmonyHarConfig['transform']>,
  input: string,
  output: string
) => Promise<void>;

export async function stageHarmonyEtsPackagesAsync(
  modules: ModuleDescriptorHarmony[],
  harmonyRoot: string,
  runHarTransform: RunHarmonyHarTransform = runHarmonyHarTransformAsync
): Promise<Record<string, string>> {
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

    await fs.promises.mkdir(stagingRoot, { recursive: true });
    await copyFileAsync(module.ets.entrypoint, path.join(stagingRoot, entrypointRelative));
    const sourceHarmonyRoot = path.dirname(module.ets.entrypoint);
    const sourceEtsRoot = path.join(sourceHarmonyRoot, 'src', 'main', 'ets');
    try {
      const stats = await fs.promises.stat(sourceEtsRoot);
      if (stats.isDirectory()) {
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
  const harEntries = modules
    .flatMap((module) => (module.hars ?? []).map((har) => ({ har, owner: module.packageName })))
    .sort((a, b) => a.har.packageName.localeCompare(b.har.packageName));
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
    const rootManifest = JSON.parse(await fs.promises.readFile(rootManifestPath, 'utf8'));
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
  const entryManifest = JSON.parse(await fs.promises.readFile(entryManifestPath, 'utf8'));
  entryManifest.dependencies = {
    '@rnoh/react-native-openharmony': 'file:../dependencies/react_native_openharmony.har',
    ...dependencySpecifiers,
  };
  await fs.promises.writeFile(entryManifestPath, JSON.stringify(entryManifest, null, 2) + '\n');
  const buildProfilePath = path.join(harmonyRoot, 'build-profile.json5');
  const buildProfile = JSON.parse(await fs.promises.readFile(buildProfilePath, 'utf8'));
  buildProfile.modules = [
    ...(buildProfile.modules ?? []).filter(
      (module: { srcPath?: string }) => !module.srcPath?.startsWith('./expo-modules/')
    ),
    ...projectModules,
  ];
  await fs.promises.writeFile(buildProfilePath, JSON.stringify(buildProfile, null, 2) + '\n');
  return dependencySpecifiers;
}

async function runHarmonyHarTransformAsync(
  transform: NonNullable<HarmonyHarConfig['transform']>,
  input: string,
  output: string
): Promise<void> {
  await fs.promises.mkdir(path.dirname(output), { recursive: true });
  const script = path.resolve(
    __dirname,
    `../../../scripts/harmony/${
      transform === 'screens-content-wrapper-v1' ? 'prepare-screens.py' : 'prepare-worklets.py'
    }`
  );
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      resolveHarmonyPythonExecutable(),
      [script, '--input-har', input, '--output-har', output],
      { stdio: 'inherit' }
    );
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Harmony HAR transform ${transform} failed with exit code ${code}`))
    );
  });
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
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
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

async function assertSha256Async(
  filePath: string,
  expected: string,
  label: 'input' | 'output'
): Promise<void> {
  let data: Buffer;
  try {
    data = await fs.promises.readFile(filePath);
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      throw new Error(`RNOH compatibility ${label} HAR does not exist at "${filePath}"`);
    }
    throw error;
  }
  const actual = createHash('sha256').update(data).digest('hex');
  if (actual !== expected) {
    throw new Error(
      `RNOH compatibility ${label} SHA256 mismatch for "${filePath}": expected ${expected}, got ${actual}`
    );
  }
}

function runCompatibilityToolAsync(options: RunCompatibilityToolOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      options.pythonExecutable,
      [
        options.scriptPath,
        '--input-har',
        options.inputHarPath,
        '--output-har',
        options.outputHarPath,
        '--profile',
        options.profile,
      ],
      { stdio: 'inherit' }
    );
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `RNOH compatibility tool failed with ${
              signal ? `signal ${signal}` : `exit code ${code}`
            }`
          )
        );
      }
    });
  });
}

function resolveHarmonyPythonExecutable(): string {
  if (process.env.EXPO_HARMONY_PYTHON) {
    return process.env.EXPO_HARMONY_PYTHON;
  }
  const candidates =
    process.platform === 'darwin' ? ['/opt/homebrew/bin/python3', '/usr/local/bin/python3'] : [];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? 'python3';
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
    let contents = await fs.promises.readFile(entryPath, 'utf8');
    for (const [placeholder, value] of Object.entries(replacements)) {
      contents = contents.split(placeholder).join(value);
    }
    await fs.promises.writeFile(entryPath, contents, 'utf8');
  }
}

function runAppConfigGeneratorAsync(options: RunAppConfigGeneratorOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [options.scriptPath, options.projectRoot, options.destinationDir],
      { stdio: 'inherit' }
    );
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `expo-constants app config generator failed with ${
              signal ? `signal ${signal}` : `exit code ${code}`
            }`
          )
        );
      }
    });
  });
}
