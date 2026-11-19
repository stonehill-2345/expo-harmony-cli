import fs from 'fs';
import path from 'path';

import type { ModuleDescriptorHarmony } from '../../types';

type Claim = { module: ModuleDescriptorHarmony; source: string };

// ArkTS extends the ECMAScript/TypeScript keyword set with struct declarations.
const ETS_RESERVED_WORDS = new Set((
  'abstract accessor any as assert asserts async await bigint boolean break case catch class const ' +
  'constructor continue debugger declare default delete do else enum export extends false final finally ' +
  'for from function get global if implements import in infer instanceof interface intrinsic is keyof ' +
  'let module namespace native never new null number object of out override package private protected ' +
  'public readonly require return satisfies set static string struct super switch symbol synchronized ' +
  'this throw throws transient true try type typeof undefined unique unknown using var void volatile ' +
  'while with yield'
).split(' '));
const LIFECYCLE_METHODS = new Set(['onCreate', 'onNewWant', 'onDestroy']);
const CPP_RESERVED_WORDS = new Set((
  'alignas alignof and and_eq asm atomic_cancel atomic_commit atomic_noexcept auto bitand bitor bool ' +
  'break case catch char char8_t char16_t char32_t class compl concept const consteval constexpr constinit ' +
  'const_cast continue co_await co_return co_yield decltype default delete do double dynamic_cast else ' +
  'enum explicit export extern false float for friend goto if inline int long mutable namespace new ' +
  'noexcept not not_eq nullptr operator or or_eq private protected public reflexpr register reinterpret_cast ' +
  'requires return short signed sizeof static static_assert static_cast struct switch synchronized template ' +
  'this thread_local throw true try typedef typeid typename union unsigned using virtual void volatile ' +
  'wchar_t while xor xor_eq'
).split(' '));

function owner(module: ModuleDescriptorHarmony): string {
  return `"${module.packageName}" (${module.packageRoot}, version ${module.packageVersion ?? 'unknown'})`;
}

/** Validate the effective registration graph before any generator writes files. */
export function validateHarmonyModuleGraph(modules: ModuleDescriptorHarmony[]): void {
  const claims = new Map<string, Claim>();
  const identities = new Map<string, Claim>();
  const claim = (field: string, name: string, module: ModuleDescriptorHarmony, source: string, share = false) => {
    const key = `${field}\0${name}`;
    const previous = claims.get(key);
    if (previous && !(share && previous.source === source)) {
      throw new Error(`Harmony conflict ${field} "${name}": ${owner(previous.module)} source "${previous.source}" and ${owner(module)} source "${source}"`);
    }
    claims.set(key, { module, source });
  };
  const text = (value: unknown, field: string, module: ModuleDescriptorHarmony): string => {
    if (typeof value !== 'string' || !value || /[\x00-\x1f\x7f'"`]/.test(value)) {
      throw new Error(`Invalid Harmony ${field} for ${owner(module)}: expected non-empty text without control characters or quotes`);
    }
    return value;
  };
  const identifier = (value: string, field: string, module: ModuleDescriptorHarmony, cpp = false) => {
    text(value, field, module);
    if (!(cpp ? /^[A-Za-z_]\w*(?:::[A-Za-z_]\w*)*$/ : /^[A-Za-z_$][\w$]*$/).test(value) ||
        (cpp ? value.split('::').some(part => CPP_RESERVED_WORDS.has(part)) : ETS_RESERVED_WORDS.has(value))) {
      throw new Error(`Invalid Harmony ${field} "${value}" for ${owner(module)}: invalid identifier`);
    }
  };
  const etsSymbol = (name: string, importPath: string, field: string, module: ModuleDescriptorHarmony, kind = 'named') => {
    identifier(name, field, module);
    text(importPath, `${field}.importPath`, module);
    if (!/^(?:@[A-Za-z0-9_][A-Za-z0-9_.-]*\/)?[A-Za-z0-9_][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9_][A-Za-z0-9_.-]*)*$/.test(importPath)) {
      throw new Error(`Invalid Harmony ${field}.importPath "${importPath}" for ${owner(module)}: expected an OHPM package import path`);
    }
    if (['RNPackage', 'RNPackageContext', 'Want', 'ExpoModulesLifecycle', 'ExpoModulesAppOverlays', 'getExpoModulesPackages', 'ctx', 'AppStorage', 'Error', 'Column', 'Stack', 'HitTestMode', 'Component', 'StorageLink'].includes(name)) {
      throw new Error(`Invalid Harmony ${field} "${name}" for ${owner(module)}: reserved generated symbol`);
    }
    // Imports share a namespace even when used by different generated areas.
    claim('ETS className/ets.packageClass/arkUIOverlay.className', name, module, `${kind}:${importPath}`, true);
  };
  for (const module of modules) {
    text(module.packageName, 'packageName', module);
    text(module.packageRoot, 'packageRoot', module);
    if (module.reason !== undefined) text(module.reason, 'reason', module);
    const identity = module.npmPackageName ?? module.packageName;
    const realRoot = fs.existsSync(module.packageRoot) ? fs.realpathSync(module.packageRoot) : path.resolve(module.packageRoot);
    const identitySource = `${realRoot}@${module.npmPackageVersion ?? module.packageVersion ?? 'unknown'}`;
    const previousIdentity = identities.get(identity);
    if (previousIdentity && previousIdentity.source !== identitySource) {
      throw new Error(`Harmony conflict npmPackageName "${identity}": ${owner(previousIdentity.module)} source "${previousIdentity.source}" and ${owner(module)} source "${identitySource}"`);
    }
    identities.set(identity, { module, source: identitySource });
    if (module.cpp) {
      const cpp = module.cpp;
      identifier(cpp.packageClass, 'cpp.packageClass', module, true);
      text(cpp.header, 'cpp.header', module);
      text(cpp.cmakePath, 'cpp.cmakePath', module);
      text(cpp.cmakeTarget, 'cpp.cmakeTarget', module);
      if (!/^[A-Za-z_][A-Za-z0-9_.+-]*$/.test(cpp.cmakeTarget) || /[;$()]/.test(cpp.cmakePath) || /[<>]/.test(cpp.header)) {
        throw new Error(`Invalid Harmony cpp.cmakeTarget/cpp.cmakePath/cpp.header for ${owner(module)}`);
      }
      const source = module.kind === 'rnoh-package'
        ? `${module.hars?.find(har => har.primary)?.packageName}:${cpp.cmakePath}`
        : path.resolve(cpp.cmakePath);
      claim('cpp.packageClass', cpp.packageClass, module, source);
      claim('cpp.header', cpp.header, module, source, true);
      claim('cpp.cmakeTarget', cpp.cmakeTarget, module, source, true);
      const buildName = module.packageName.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      claim('cpp.cmakeBuildDirectory', buildName, module, source, true);
    }
    if (module.ets) {
      text(module.ets.entrypoint, 'ets.entrypoint', module);
      etsSymbol(module.ets.packageClass, module.ets.importPath, 'ets.packageClass', module, module.ets.importKind ?? 'named');
      if (module.kind !== 'rnoh-package') {
        const pieces = module.ets.importPath.split('/');
        const ohName = module.ets.importPath.startsWith('@') ? pieces.slice(0, 2).join('/') : pieces[0];
        claim('OHPM packageName', ohName, module, `ets:${realRoot}`, true);
      }
    }
    for (const dependency of module.lifecycleDependencies ?? []) {
      identifier(dependency.localName, 'lifecycleDependencies.localName', module);
      if (LIFECYCLE_METHODS.has(dependency.localName) ||
          (dependency.arkUIOverlay && dependency.localName === 'build')) {
        throw new Error(`Invalid Harmony lifecycleDependencies.localName "${dependency.localName}" for ${owner(module)}: reserved generated member`);
      }
      text(dependency.appStorageKey, 'lifecycleDependencies.appStorageKey', module);
      claim('lifecycleDependencies.localName', dependency.localName, module, dependency.importPath);
      claim('lifecycleDependencies.appStorageKey', dependency.appStorageKey, module, dependency.importPath);
      etsSymbol(dependency.className, dependency.importPath, 'lifecycleDependencies.className', module);
      if (dependency.arkUIOverlay) {
        const overlay = dependency.arkUIOverlay;
        identifier(overlay.controllerProperty, 'arkUIOverlay.controllerProperty', module);
        etsSymbol(overlay.className, overlay.importPath, 'arkUIOverlay.className', module);
      }
    }
    for (const har of module.hars ?? []) {
      text(har.packageName, 'har.packageName', module);
      if (!/^(?:@[A-Za-z0-9_][A-Za-z0-9_.-]*\/)?[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(har.packageName)) {
        throw new Error(`Invalid Harmony har.packageName "${har.packageName}" for ${owner(module)}: expected an OHPM package name without a subpath`);
      }
      text(har.packagePath, 'har.packagePath', module);
      const source = har.version ? `version:${har.version}` : path.resolve(har.packagePath);
      claim('har.packageName', har.packageName, module, source);
      claim('OHPM packageName', har.packageName, module, `har:${source}`);
    }
  }

  // Factory const declarations share one function scope across every native package.
  // Collect all imports first so a later package cannot be shadowed by an earlier local.
  const factoryModules = modules.filter(module => module.cpp != null && module.ets != null);
  const factoryBindings = new Map<string, ModuleDescriptorHarmony | undefined>([
    ['ctx', undefined], ['AppStorage', undefined], ['Error', undefined],
    ['RNPackage', undefined], ['RNPackageContext', undefined], ['getExpoModulesPackages', undefined],
  ]);
  for (const module of factoryModules) {
    factoryBindings.set(module.ets!.packageClass, module);
    for (const dependency of module.lifecycleDependencies ?? []) {
      factoryBindings.set(dependency.className, module);
    }
  }
  for (const module of factoryModules) {
    for (const dependency of module.lifecycleDependencies ?? []) {
      if (factoryBindings.has(dependency.localName)) {
        const bindingOwner = factoryBindings.get(dependency.localName);
        throw new Error(`Invalid Harmony lifecycleDependencies.localName "${dependency.localName}" for ${owner(module)}: shadows a factory binding${bindingOwner ? ` imported by ${owner(bindingOwner)}` : ' generated by autolinking'}`);
      }
    }
  }
}

/** Prebuilt HAR internals are opaque; local source descriptors must name real package files. */
export async function validateHarmonyModuleSourcesAsync(modules: ModuleDescriptorHarmony[]): Promise<void> {
  validateHarmonyModuleGraph(modules);
  const source = async (module: ModuleDescriptorHarmony, file: string, field: string) => {
    try {
      if (!(await fs.promises.stat(file)).isFile()) throw new Error('not a file');
      const relative = path.relative(await fs.promises.realpath(module.packageRoot), await fs.promises.realpath(file));
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('outside its package root');
    } catch (error: any) {
      throw new Error(`Invalid Harmony ${field} for ${owner(module)}: source "${file}" missing or outside package root (${error.message})`);
    }
  };
  for (const module of modules) {
    if (module.kind !== 'rnoh-package') {
      if (module.ets) await source(module, module.ets.entrypoint, 'ets.entrypoint');
      if (module.cpp) {
        await source(module, path.join(module.cpp.cmakePath, module.cpp.header), 'cpp.header');
        await source(module, path.join(module.cpp.cmakePath, 'CMakeLists.txt'), 'cpp.cmakePath');
      }
    }
    for (const har of module.hars ?? []) {
      if (!har.version) await source(module, har.packagePath, 'har.packagePath');
    }
  }
}
