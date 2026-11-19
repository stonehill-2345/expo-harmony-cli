import fs from 'fs';
import path from 'path';

import { ExpoModuleConfig } from '../../ExpoModuleConfig';
import type { HarmonyHarConfig } from '../../types';

type RnohHarMapping = { harName: string; packageName: string; version?: string };

type NavigationCompatibility = {
  version: string;
  harName: string;
  cppPackageClass: string;
  cppHeader: string;
  cmakeTarget: string;
  etsPackageClass: string;
  etsImportPath: string;
  importKind?: 'named' | 'default';
  transform?: HarmonyHarConfig['transform'];
};

const NAVIGATION_COMPATIBILITY: Record<string, NavigationCompatibility> = {
  '@react-native-ohos/react-native-screens': {
    version: '4.9.0',
    harName: 'screens.har',
    cppPackageClass: 'ScreensPackage',
    cppHeader: 'ScreensPackage.h',
    cmakeTarget: 'rnoh_screens',
    etsPackageClass: 'RNOHScreensPackage',
    etsImportPath: '@react-native-ohos/react-native-screens',
    importKind: 'default',
    transform: 'screens-content-wrapper-v1',
  },
  '@react-native-ohos/react-native-safe-area-context': {
    version: '5.6.3',
    harName: 'safe_area.har',
    cppPackageClass: 'rnoh::SafeAreaViewPackage',
    cppHeader: 'SafeAreaViewPackage.h',
    cmakeTarget: 'rnoh_safe_area',
    etsPackageClass: 'SafeAreaViewPackage',
    etsImportPath: '@react-native-ohos/react-native-safe-area-context/ts',
    importKind: 'named',
  },
  '@react-native-ohos/react-native-gesture-handler': {
    version: '2.30.1',
    harName: 'gesture_handler.har',
    cppPackageClass: 'rnoh::GestureHandlerPackage',
    cppHeader: 'GestureHandlerPackage.h',
    cmakeTarget: 'rnoh_gesture_handler',
    etsPackageClass: 'GestureHandlerPackage',
    etsImportPath: '@react-native-ohos/react-native-gesture-handler',
    importKind: 'default',
  },
  '@react-native-ohos/react-native-worklets': {
    version: '1.0.0',
    harName: 'worklets.har',
    cppPackageClass: 'rnoh::ReanimatedWorkletPackage',
    cppHeader: 'ReanimatedWorkletPackage.h',
    cmakeTarget: 'rnoh_worklets',
    etsPackageClass: 'ReanimatedWorkletPackage',
    etsImportPath: '@react-native-ohos/react-native-worklets/ts',
    importKind: 'named',
    transform: 'worklets-private-symbols-v2',
  },
  '@react-native-ohos/react-native-reanimated': {
    version: '4.0.1',
    harName: 'reanimated.har',
    cppPackageClass: 'rnoh::ReanimatedPackage',
    cppHeader: 'ReanimatedPackage.h',
    cmakeTarget: 'rnoh_reanimated',
    etsPackageClass: 'ReanimatedPackage',
    etsImportPath: '@react-native-ohos/react-native-reanimated/ts',
    importKind: 'named',
  },
};

function createNavigationCompatibilityConfig(
  packageRoot: string,
  packageJson: any
): ExpoModuleConfig | null {
  const nativePackageName = packageJson.name === '@expo-oh/react-native-screens'
    ? '@react-native-ohos/react-native-screens'
    : packageJson.name;
  const entry = NAVIGATION_COMPATIBILITY[nativePackageName];
  if (!entry) return null;
  const supportedVersion = packageJson.name === '@expo-oh/react-native-screens'
    ? '4.9.1'
    : entry.version;
  if (packageJson.version !== supportedVersion) {
    throw new Error(`Invalid Harmony navigation compatibility for "${packageJson.name}" at "${packageRoot}": installed ${packageJson.version}, supported ${supportedVersion}; provide explicit Harmony metadata`);
  }
  return new ExpoModuleConfig({
    platforms: ['harmony'],
    harmony: {
      kind: 'rnoh-package',
      cpp: {
        packageClass: entry.cppPackageClass,
        header: entry.cppHeader,
        cmakeTarget: entry.cmakeTarget,
        cmakePath: 'src/main/cpp',
      },
      ets: {
        packageClass: entry.etsPackageClass,
        importPath: entry.etsImportPath,
        entrypoint: 'index.ets',
        importKind: entry.importKind,
      },
      har: {
        packageName: nativePackageName,
        packagePath: path.join('harmony', entry.harName),
        primary: true,
        transform: entry.transform,
      },
    },
  });
}
type RnohAutolinkingConfig =
  | true
  | {
      etsPackageClassName?: string;
      cppPackageClassName?: string;
      cmakeLibraryTargetName?: string;
      ohPackageName?: string | RnohHarMapping[];
      mainHarPath?: string;
    };

export async function discoverRnohHarmonyConfigAsync(
  packageRoot: string,
  fallbackPackageName: string
): Promise<ExpoModuleConfig | null> {
  let packageJson: any;
  try {
    packageJson = JSON.parse(
      await fs.promises.readFile(path.join(packageRoot, 'package.json'), 'utf8')
    );
  } catch {
    return null;
  }
  const provided = packageJson.harmony?.autolinking;
  if (!Object.prototype.hasOwnProperty.call(packageJson.harmony ?? {}, 'autolinking')) {
    return createNavigationCompatibilityConfig(packageRoot, packageJson);
  }
  // RNOH itself publishes null to opt out of linking its host package.
  if (provided === false || provided === null) return null;
  const fail = (message: string): never => { throw new Error(`Invalid Harmony autolinking config for "${packageJson.name ?? fallbackPackageName}" at "${packageRoot}": ${message}`); };
  if (provided !== true && (!provided || typeof provided !== 'object' || Array.isArray(provided))) fail('autolinking must be true, false, null, or an object');
  const config: Exclude<RnohAutolinkingConfig, true> = provided === true ? {} : provided;
  for (const field of ['etsPackageClassName', 'cppPackageClassName', 'cmakeLibraryTargetName', 'mainHarPath'] as const) {
    if (config[field] !== undefined && (typeof config[field] !== 'string' || !config[field]!.trim())) fail(`${field} must be a non-empty string`);
  }
  if (config.ohPackageName !== undefined && typeof config.ohPackageName !== 'string' && !Array.isArray(config.ohPackageName)) fail('ohPackageName must be a string or mapping array');
  const packageName = packageJson.name ?? fallbackPackageName;
  const harRoot = path.join(packageRoot, config.mainHarPath ?? 'harmony');
  if (config.mainHarPath && (path.isAbsolute(config.mainHarPath) || config.mainHarPath.split(/[\\/]/).includes('..'))) fail('mainHarPath must be package-relative and cannot escape its root');
  const harPaths = await findHarFilesAsync(harRoot);
  if (harPaths.length === 0) {
    fail(`HAR files do not exist at "${harRoot}"`);
  }
  const hars = resolveRnohHars(packageName, harPaths, config.ohPackageName);
  hars[0] = { ...hars[0], primary: true };
  const defaultClass = `${pascalCase(packageName.replace(/^@/, '').replace('/', '-'))}Package`;
  const etsPackageClassName = config.etsPackageClassName ?? defaultClass;
  const cppPackageClassName = config.cppPackageClassName ?? defaultClass;
  return new ExpoModuleConfig({
    platforms: ['harmony'],
    harmony: {
      kind: 'rnoh-package',
      cpp: {
        packageClass: `rnoh::${cppPackageClassName}`,
        header: `${cppPackageClassName}.h`,
        cmakeTarget: config.cmakeLibraryTargetName ?? rnohCmakeTarget(packageName),
        cmakePath: 'src/main/cpp',
      },
      ets: {
        packageClass: etsPackageClassName,
        importPath: hars[0].packageName,
        entrypoint: 'index.ets',
      },
      har: hars.map(({ packageName, packagePath, primary, version }) => ({
        packageName,
        packagePath: path.relative(packageRoot, packagePath),
        primary,
        version,
      })),
    },
  });
}

async function findHarFilesAsync(root: string): Promise<string[]> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = (
    await Promise.all(
      entries.map((entry) => {
        const target = path.join(root, entry.name);
        return entry.isDirectory()
          ? findHarFilesAsync(target)
          : Promise.resolve(entry.isFile() && entry.name.endsWith('.har') ? [target] : []);
      })
    )
  ).flat();
  return files.sort();
}

function resolveRnohHars(
  npmPackageName: string,
  harPaths: string[],
  names: string | RnohHarMapping[] | undefined
): HarmonyHarConfig[] {
  const defaultName = rnohOhPackageName(npmPackageName);
  if (new Set(harPaths.map((file) => path.basename(file))).size !== harPaths.length) {
    throw new Error(`Invalid Harmony HAR config for "${npmPackageName}": duplicate HAR basename`);
  }
  const createHar = (packagePath: string, mapping?: RnohHarMapping): HarmonyHarConfig => {
    const harName = path.basename(packagePath);
    const suffix = harPaths.length > 1 ? `--${path.basename(harName, '.har')}` : '';
    return {
      packageName:
        mapping?.packageName ?? (typeof names === 'string' ? names : defaultName) + suffix,
      packagePath,
      version: mapping?.version,
    };
  };
  if (!Array.isArray(names)) {
    return harPaths.map((packagePath) => createHar(packagePath));
  }
  const harByName = new Map(
    harPaths.map((packagePath) => [path.basename(packagePath), packagePath])
  );
  if (harByName.size !== harPaths.length) throw new Error(`Invalid Harmony HAR config for "${npmPackageName}": duplicate HAR basename`);
  const processed = new Set<string>();
  const resolved: HarmonyHarConfig[] = [];
  for (const mapping of names) {
    if (!mapping || typeof mapping.harName !== 'string' || typeof mapping.packageName !== 'string' || !mapping.packageName.trim() || (mapping.version !== undefined && typeof mapping.version !== 'string')) throw new Error(`Invalid Harmony HAR mapping for "${npmPackageName}"`);
    const packagePath = harByName.get(mapping.harName);
    if (!packagePath || processed.has(mapping.harName)) throw new Error(`Invalid Harmony HAR mapping for "${npmPackageName}": missing or duplicate HAR "${mapping.harName}"`);
    if (packagePath) {
      resolved.push(createHar(packagePath, mapping));
      processed.add(mapping.harName);
    }
  }
  for (const packagePath of harPaths) {
    if (!processed.has(path.basename(packagePath))) {
      resolved.push(createHar(packagePath));
    }
  }
  return resolved;
}

function pascalCase(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');
}

function snakeCase(value: string): string {
  return value
    .replace(/^@/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function kebabCase(value: string): string {
  return snakeCase(value).replaceAll('_', '-');
}

function rnohCmakeTarget(packageName: string): string {
  if (packageName.startsWith('@')) {
    const [scope, name] = packageName.slice(1).split('/');
    return `rnoh__${snakeCase(scope)}__${snakeCase(name)}`;
  }
  return `rnoh__${snakeCase(packageName)}`;
}

function rnohOhPackageName(packageName: string): string {
  if (packageName.startsWith('@')) {
    const [scope, name] = packageName.slice(1).split('/');
    return `@rnoh/${kebabCase(scope)}--${kebabCase(name)}`;
  }
  return `@rnoh/${kebabCase(packageName)}`;
}
