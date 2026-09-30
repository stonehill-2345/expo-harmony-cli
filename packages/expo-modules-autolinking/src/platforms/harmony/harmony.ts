import fs from 'fs';
import path from 'path';

import type {
  ExtraDependencies,
  HarmonyCppPackageConfig,
  HarmonyEtsPackageConfig,
  ModuleDescriptorHarmony,
  PackageRevision,
  RawModuleConfigHarmony,
} from '../../types';

const GENERATED_NATIVE_KINDS = new Set(['turbo-module', 'view', 'ability-lifecycle']);

export async function resolveModuleAsync(
  packageName: string,
  revision: PackageRevision
): Promise<ModuleDescriptorHarmony | null> {
  const config = revision.config?.harmonyConfig();
  if (!config) {
    return null;
  }

  const identity = {
    packageName,
    packageVersion: revision.version,
    packageRoot: revision.path,
  };

  if (config.kind === 'rnoh-reuse') {
    if (!config.reason?.trim()) {
      throw configError(packageName, 'rnoh-reuse requires a non-empty reason');
    }
    return {
      ...identity,
      kind: config.kind,
      reason: config.reason,
      lifecycleDependencies: [],
    };
  }

  if (config.kind === 'har') {
    const hars = await resolveHarConfigsAsync(packageName, revision.path, config.har);
    return {
      ...identity,
      kind: config.kind,
      hars,
      lifecycleDependencies: [],
    };
  }

  if (config.kind === 'rnoh-package') {
    const hars = await resolveHarConfigsAsync(packageName, revision.path, config.har);
    const primaryHars = hars.filter((har) => har.primary);
    if (hars.length === 1 && primaryHars.length === 0) {
      hars[0] = { ...hars[0], primary: true };
    } else if (primaryHars.length !== 1) {
      throw configError(
        packageName,
        'rnoh-package with multiple HARs requires exactly one primary HAR'
      );
    }
    const primaryHar = hars.find((har) => har.primary)!;
    const cpp = resolvePrebuiltCppConfig(packageName, config);
    const ets = resolvePrebuiltEtsConfig(packageName, config);
    if (
      ets.importPath !== primaryHar.packageName &&
      !ets.importPath.startsWith(`${primaryHar.packageName}/`)
    ) {
      throw configError(
        packageName,
        `rnoh-package ETS importPath "${ets.importPath}" must match primary HAR packageName "${primaryHar.packageName}"`
      );
    }
    const lifecycleDependencies = config.lifecycleDependencies ?? [];
    validateLifecycleDependencies(packageName, lifecycleDependencies);
    return {
      ...identity,
      kind: config.kind,
      cpp,
      ets,
      hars,
      lifecycleDependencies,
    };
  }

  if (!GENERATED_NATIVE_KINDS.has(config.kind)) {
    throw configError(packageName, `unsupported Harmony module kind "${config.kind}"`);
  }

  const cpp = await resolveCppConfigAsync(packageName, revision.path, config);
  const ets = await resolveEtsConfigAsync(packageName, revision.path, config);
  const lifecycleDependencies = config.lifecycleDependencies ?? [];

  if (config.kind === 'ability-lifecycle' && lifecycleDependencies.length === 0) {
    throw configError(packageName, 'ability-lifecycle requires lifecycleDependencies');
  }

  validateLifecycleDependencies(packageName, lifecycleDependencies);
  await validateLifecycleExportsAsync(packageName, ets.entrypoint, lifecycleDependencies);

  return {
    ...identity,
    kind: config.kind,
    cpp,
    ets,
    lifecycleDependencies,
  };
}

async function resolveHarConfigsAsync(
  packageName: string,
  packageRoot: string,
  config: RawModuleConfigHarmony['har']
) {
  const rawHars = config ? (Array.isArray(config) ? config : [config]) : [];
  if (rawHars.length === 0) {
    throw configError(packageName, 'har metadata requires packageName and packagePath');
  }
  const packageNames = new Set<string>();
  const packagePaths = new Set<string>();
  const hars = [];
  for (const har of rawHars) {
    if (!har.packageName?.trim() || !har.packagePath?.trim()) {
      throw configError(packageName, 'har metadata requires packageName and packagePath');
    }
    if (packageNames.has(har.packageName)) {
      throw configError(packageName, `duplicate HAR packageName "${har.packageName}"`);
    }
    packageNames.add(har.packageName);
    const packagePath = path.resolve(packageRoot, har.packagePath);
    if (packagePaths.has(packagePath)) {
      throw configError(packageName, `duplicate HAR packagePath "${har.packagePath}"`);
    }
    packagePaths.add(packagePath);
    await assertFileAsync(packageName, packagePath, `HAR "${har.packagePath}"`);
    hars.push({ ...har, packagePath });
  }
  return hars;
}

function resolvePrebuiltCppConfig(
  packageName: string,
  config: RawModuleConfigHarmony
): HarmonyCppPackageConfig {
  const cpp = config.cpp;
  if (!cpp?.packageClass || !cpp.header || !cpp.cmakeTarget || !cpp.cmakePath) {
    throw configError(packageName, 'rnoh-package requires complete cpp metadata');
  }
  assertPackageRelativePath(packageName, 'CMake path', cpp.cmakePath);
  return cpp;
}

function resolvePrebuiltEtsConfig(
  packageName: string,
  config: RawModuleConfigHarmony
): HarmonyEtsPackageConfig {
  const ets = config.ets;
  if (!ets?.packageClass || !ets.importPath || !ets.entrypoint) {
    throw configError(packageName, 'rnoh-package requires complete ets metadata');
  }
  assertPackageRelativePath(packageName, 'ETS entrypoint', ets.entrypoint);
  return ets;
}

function assertPackageRelativePath(packageName: string, label: string, value: string): void {
  if (path.isAbsolute(value) || value.split(/[\\/]/).includes('..')) {
    throw configError(packageName, `${label} must be relative to the primary HAR package`);
  }
}

async function resolveCppConfigAsync(
  packageName: string,
  packageRoot: string,
  config: RawModuleConfigHarmony
): Promise<HarmonyCppPackageConfig> {
  const cpp = config.cpp;
  if (!cpp?.packageClass || !cpp.header || !cpp.cmakeTarget || !cpp.cmakePath) {
    throw configError(packageName, `${config.kind} requires complete cpp metadata`);
  }

  const cmakePath = path.resolve(packageRoot, cpp.cmakePath);
  const headerPath = path.join(cmakePath, cpp.header);
  const cmakeFile = path.join(cmakePath, 'CMakeLists.txt');

  await assertFileAsync(packageName, headerPath, `C++ header "${cpp.header}"`);
  await assertFileAsync(packageName, cmakeFile, 'CMakeLists.txt');

  const cmakeContents = await fs.promises.readFile(cmakeFile, 'utf8');
  const targetPattern = new RegExp(
    `\\badd_library\\s*\\(\\s*${escapeRegExp(cpp.cmakeTarget)}(?:\\s|\\))`
  );
  if (!targetPattern.test(cmakeContents)) {
    throw configError(packageName, `CMake target "${cpp.cmakeTarget}" is not declared`);
  }

  return { ...cpp, cmakePath };
}

async function resolveEtsConfigAsync(
  packageName: string,
  packageRoot: string,
  config: RawModuleConfigHarmony
): Promise<HarmonyEtsPackageConfig> {
  const ets = config.ets;
  if (!ets?.packageClass || !ets.importPath || !ets.entrypoint) {
    throw configError(packageName, `${config.kind} requires complete ets metadata`);
  }

  const entrypoint = path.resolve(packageRoot, ets.entrypoint);
  await assertFileAsync(packageName, entrypoint, `ETS entrypoint "${ets.entrypoint}"`);
  const contents = await fs.promises.readFile(entrypoint, 'utf8');
  assertEtsExport(packageName, contents, ets.packageClass);

  return { ...ets, entrypoint };
}

async function validateLifecycleExportsAsync(
  packageName: string,
  entrypoint: string,
  dependencies: NonNullable<RawModuleConfigHarmony['lifecycleDependencies']>
): Promise<void> {
  if (dependencies.length === 0) {
    return;
  }
  const contents = await fs.promises.readFile(entrypoint, 'utf8');
  for (const dependency of dependencies) {
    assertEtsExport(packageName, contents, dependency.className);
    if (dependency.arkUIOverlay) {
      assertEtsExport(packageName, contents, dependency.arkUIOverlay.className);
    }
  }
}

function validateLifecycleDependencies(
  packageName: string,
  dependencies: NonNullable<RawModuleConfigHarmony['lifecycleDependencies']>
): void {
  const localNames = new Set<string>();
  for (const dependency of dependencies) {
    if (
      !dependency.localName ||
      !dependency.className ||
      !dependency.importPath ||
      !dependency.appStorageKey
    ) {
      throw configError(packageName, 'lifecycleDependencies entries must be complete');
    }
    if (localNames.has(dependency.localName)) {
      throw configError(packageName, `duplicate lifecycle localName "${dependency.localName}"`);
    }
    if (
      dependency.arkUIOverlay &&
      (!dependency.arkUIOverlay.className ||
        !dependency.arkUIOverlay.importPath ||
        !dependency.arkUIOverlay.controllerProperty)
    ) {
      throw configError(packageName, 'arkUIOverlay entries must be complete');
    }
    localNames.add(dependency.localName);
  }
}

function assertEtsExport(packageName: string, contents: string, exportName: string): void {
  const exportPattern = new RegExp(
    `\\bexport\\s*\\{[^}]*\\b${escapeRegExp(exportName)}\\b[^}]*\\}`,
    'm'
  );
  if (!exportPattern.test(contents)) {
    throw configError(packageName, `ETS export "${exportName}" is not declared`);
  }
}

async function assertFileAsync(
  packageName: string,
  filePath: string,
  description: string
): Promise<void> {
  try {
    const stats = await fs.promises.stat(filePath);
    if (!stats.isFile()) {
      throw new Error('not a file');
    }
  } catch {
    throw configError(packageName, `${description} does not exist at "${filePath}"`);
  }
}

function configError(packageName: string, message: string): Error {
  return new Error(`Invalid Harmony autolinking config for "${packageName}": ${message}`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function generatePackageListAsync(
  modules: ModuleDescriptorHarmony[],
  targetDirectory: string,
  _namespace: string
): Promise<void> {
  const sortedModules = [...modules].sort((a, b) => a.packageName.localeCompare(b.packageName));
  const nativeModules = sortedModules.filter(hasGeneratedNativePackage);
  const skippedModules = sortedModules.filter((module) => !hasGeneratedNativePackage(module));
  const cpp = renderCpp(nativeModules, skippedModules);
  const ets = renderEts(nativeModules, skippedModules);
  const cmake = renderCmake(nativeModules, skippedModules);

  await fs.promises.mkdir(targetDirectory, { recursive: true });
  await Promise.all([
    fs.promises.writeFile(path.join(targetDirectory, 'ExpoModulesPackages.cpp'), cpp, 'utf8'),
    fs.promises.writeFile(path.join(targetDirectory, 'ExpoModulesPackages.ets'), ets, 'utf8'),
    fs.promises.writeFile(path.join(targetDirectory, 'expo-modules.cmake'), cmake, 'utf8'),
  ]);
}

type GeneratedNativeModule = ModuleDescriptorHarmony & {
  cpp: HarmonyCppPackageConfig;
  ets: HarmonyEtsPackageConfig;
};

function hasGeneratedNativePackage(
  module: ModuleDescriptorHarmony
): module is GeneratedNativeModule {
  return module.cpp != null && module.ets != null;
}

function renderCpp(
  modules: GeneratedNativeModule[],
  skippedModules: ModuleDescriptorHarmony[]
): string {
  const includes = modules.map((module) => `#include "${module.cpp.header}"`).join('\n');
  const packages = modules
    .map((module) => `    std::make_shared<${module.cpp.packageClass}>(ctx)`)
    .join(',\n');

  return (
    `// @generated by expo-modules-autolinking. Do not edit.\n` +
    `#include "RNOH/PackageProvider.h"\n` +
    (includes ? `${includes}\n` : '') +
    `\nusing namespace rnoh;\n\n` +
    `std::vector<std::shared_ptr<Package>> PackageProvider::getPackages(Package::Context ctx) {\n` +
    `  return {${packages ? `\n${packages}\n  ` : ''}};\n` +
    `}\n` +
    renderSkippedComments(skippedModules, '//')
  );
}

function renderEts(
  modules: GeneratedNativeModule[],
  skippedModules: ModuleDescriptorHarmony[]
): string {
  const imports = modules
    .flatMap((module) => [
      {
        className: module.ets.packageClass,
        importPath: module.ets.importPath,
        importKind: module.ets.importKind,
      },
      ...module.lifecycleDependencies.map((dependency) => ({
        className: dependency.className,
        importPath: dependency.importPath,
        importKind: 'named' as const,
      })),
    ])
    .sort((a, b) => {
      const importPathComparison = a.importPath.localeCompare(b.importPath);
      return importPathComparison || a.className.localeCompare(b.className);
    })
    .map(({ className, importPath, importKind }) =>
      importKind === 'default'
        ? `import ${className} from '${importPath}';`
        : `import { ${className} } from '${importPath}';`
    )
    .join('\n');

  const lifecycleSetup = modules
    .flatMap((module) =>
      module.lifecycleDependencies.flatMap((dependency) => [
        `  const ${dependency.localName} = AppStorage.get<${
          dependency.className
        }>('${escapeEtsString(dependency.appStorageKey)}');`,
        `  if (!${dependency.localName}) {`,
        `    throw new Error('Missing required Harmony lifecycle dependency "${escapeEtsString(
          dependency.appStorageKey
        )}" for ${escapeEtsString(module.packageName)}');`,
        `  }`,
      ])
    )
    .join('\n');

  const packages = modules
    .map((module) => {
      const argumentsList = [
        'ctx',
        ...module.lifecycleDependencies.map(({ localName }) => localName),
      ];
      return `    new ${module.ets.packageClass}(${argumentsList.join(', ')})`;
    })
    .join(',\n');

  return (
    `// @generated by expo-modules-autolinking. Do not edit.\n` +
    `import type { RNPackage, RNPackageContext } from '@rnoh/react-native-openharmony';\n` +
    (imports ? `${imports}\n` : '') +
    `\nexport function getExpoModulesPackages(ctx: RNPackageContext): RNPackage[] {\n` +
    (lifecycleSetup ? `${lifecycleSetup}\n` : '') +
    `  return [${packages ? `\n${packages}\n  ` : ''}];\n` +
    `}\n` +
    renderSkippedComments(skippedModules, '//')
  );
}

function renderCmake(
  modules: GeneratedNativeModule[],
  skippedModules: ModuleDescriptorHarmony[]
): string {
  const cmakeEntries = deduplicateCmakeEntries(modules);
  const addSubdirectories = cmakeEntries
    .map(
      ({ packageName, cmakeSource }) =>
        `add_subdirectory("${cmakeSource}" ${cmakeBuildDirectory(packageName)})`
    )
    .join('\n');
  const targets = cmakeEntries.map(({ cmakeTarget }) => `  ${cmakeTarget}`).join('\n');

  return (
    `# @generated by expo-modules-autolinking. Do not edit.\n` +
    (addSubdirectories ? `${addSubdirectories}\n\n` : '\n') +
    `target_link_libraries(rnoh_app PUBLIC${targets ? `\n${targets}\n` : ''})\n` +
    renderSkippedComments(skippedModules, '#')
  );
}

function deduplicateCmakeEntries(modules: GeneratedNativeModule[]) {
  const entries = new Map<
    string,
    { packageName: string; cmakeSource: string; cmakeTarget: string }
  >();
  for (const module of modules) {
    const cmakeSource = getCmakeSource(module);
    const existing = entries.get(module.cpp.cmakeTarget);
    if (existing && existing.cmakeSource !== cmakeSource) {
      throw configError(
        module.packageName,
        `CMake target "${module.cpp.cmakeTarget}" resolves to multiple source directories`
      );
    }
    entries.set(module.cpp.cmakeTarget, {
      packageName: existing?.packageName ?? module.packageName,
      cmakeSource,
      cmakeTarget: module.cpp.cmakeTarget,
    });
  }
  return [...entries.values()];
}

function getCmakeSource(module: GeneratedNativeModule): string {
  if (module.kind !== 'rnoh-package') {
    return module.cpp.cmakePath;
  }
  const primaryHar = module.hars?.find((har) => har.primary);
  if (!primaryHar) {
    throw configError(module.packageName, 'rnoh-package primary HAR is missing');
  }
  return `\${OH_MODULES_DIR}/${primaryHar.packageName}/${module.cpp.cmakePath}`;
}

function cmakeBuildDirectory(packageName: string): string {
  return `expo_modules_${packageName.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
}

function renderSkippedComments(
  modules: ModuleDescriptorHarmony[],
  commentPrefix: '//' | '#'
): string {
  if (modules.length === 0) {
    return '';
  }
  return `\n${modules
    .map((module) => {
      const reason =
        module.reason ??
        (module.kind === 'har'
          ? 'provided by a prebuilt HAR'
          : `kind ${module.kind} has no generated package`);
      return `${commentPrefix} ${module.packageName}: skipped native package generation (${reason})`;
    })
    .join('\n')}\n`;
}

function escapeEtsString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export async function resolveExtraBuildDependenciesAsync(
  _projectNativeRoot: string
): Promise<ExtraDependencies | null> {
  return null;
}
