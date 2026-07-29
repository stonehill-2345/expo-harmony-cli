import * as path from 'path';
import type { CompatEntry } from './compat-table';
import { copyFromLibrary } from '../utils/content-library';

export type PackageJsonLike = {
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
};

export type CompatPatch = {
  sourceFile: string;
  targetPath: string;
  /** 补丁文件名的版本与原 npm 包版本不同时，显式指定原包版本。 */
  dependencyVersion?: string;
};

export function lockVersion(version: unknown): unknown {
  return typeof version === 'string' ? version.replace(/^[~^]/, '') : version;
}

export function lockDependencyVersions(deps: Record<string, unknown> | undefined): void {
  if (!deps) return;
  for (const name of Object.keys(deps)) {
    deps[name] = lockVersion(deps[name]);
  }
}

export function lockAllDependencyVersions(pkg: PackageJsonLike): void {
  lockDependencyVersions(pkg.dependencies);
  lockDependencyVersions(pkg.devDependencies);
}

export function getPatchVersion(patchPath: string): string | null {
  const fileName = path.basename(patchPath);
  const match = fileName.match(/\+([^+]+)\.patch$/);
  return match ? match[1] : null;
}

export function setDependencyVersion(pkg: PackageJsonLike, depName: string, version: string): void {
  if (pkg.devDependencies && Object.prototype.hasOwnProperty.call(pkg.devDependencies, depName)) {
    pkg.devDependencies[depName] = version;
    return;
  }

  if (!pkg.dependencies) pkg.dependencies = {};
  pkg.dependencies[depName] = version;
}

/** 同时写入一组已验证的原包与鸿蒙包版本，供 scan/install 共用。 */
export function applyCompatibleVersionPair(pkg: PackageJsonLike, entry: CompatEntry): void {
  if (!entry.harmony) return;

  const originalVersion = entry.bumpTo ?? entry.originalVersion;
  if (!originalVersion) {
    throw new Error(`${entry.original} 配置了鸿蒙包，但缺少 originalVersion`);
  }

  setDependencyVersion(pkg, entry.original, originalVersion);
  if (!pkg.dependencies) pkg.dependencies = {};
  pkg.dependencies[entry.harmony.package] = entry.harmony.version;
}

export function applyCompatPatch(
  targetDir: string,
  pkg: PackageJsonLike,
  depName: string,
  patch: CompatPatch,
): { patchPath: string; version: string | null } {
  const patchVersion = patch.dependencyVersion ?? getPatchVersion(patch.targetPath);
  if (patchVersion) setDependencyVersion(pkg, depName, patchVersion);
  copyFromLibrary(patch.sourceFile, targetDir, patch.targetPath);
  return { patchPath: patch.targetPath, version: patchVersion };
}
