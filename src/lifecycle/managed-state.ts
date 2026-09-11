import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { removeAppJsonPlugin } from '../injector/app-json';
import { renameAtomic } from '../utils/atomic-rename';

const STATE_PATH = '.expo-harmony/managed-state.json';
const GITIGNORE_ENTRY = '.expo-harmony/';

export type ManagedFile = {
  targetPath: string;
  contentHash?: string;
};

export type ManagedPackage = {
  harmonyPackage?: string;
  alias?: string;
  aliasTarget?: string;
  patchFiles?: ManagedFile[];
  shimFiles?: ManagedFile[];
  appPlugins?: string[];
  needsAutolink?: boolean;
  requiresCodegen?: boolean;
};

export type ManagedState = {
  version: 2;
  packages: Record<string, ManagedPackage>;
  generatedFiles?: Record<string, { contentHash: string; cliVersion: string }>;
  managedEntries?: Record<string, { path: string; dependency: string; spec: string; cliVersion: string }>;
};

export type CleanupResult = {
  found: boolean;
  needsAutolink: boolean;
  requiresCodegen: boolean;
  removedHarmonyPackage?: string;
};

function statePath(projectRoot: string): string {
  return path.join(projectRoot, STATE_PATH);
}

function dependencyExists(pkg: Record<string, any>, name: string): boolean {
  return Boolean(pkg.dependencies?.[name] || pkg.devDependencies?.[name]);
}

function removeDependency(pkg: Record<string, any>, name: string): void {
  delete pkg.dependencies?.[name];
  delete pkg.devDependencies?.[name];
}

function contentHash(filePath: string): string | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function isRelPathSafe(projectRoot: string, rel: string): boolean {
  if (!rel || path.isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) return false;
  return path.resolve(projectRoot, rel).startsWith(projectRoot + path.sep);
}

function validGenerated(projectRoot: string, value: unknown): value is ManagedState['generatedFiles'] {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, entry]) => isRelPathSafe(projectRoot, key) && !!entry && typeof entry === 'object' && typeof (entry as any).contentHash === 'string' && typeof (entry as any).cliVersion === 'string');
}

function validEntries(projectRoot: string, value: unknown): value is ManagedState['managedEntries'] {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every(entry => !!entry && typeof entry === 'object' && isRelPathSafe(projectRoot, (entry as any).path) && typeof (entry as any).dependency === 'string' && typeof (entry as any).spec === 'string' && typeof (entry as any).cliVersion === 'string');
}

function materializeFiles(projectRoot: string, files: ManagedFile[] | undefined): ManagedFile[] | undefined {
  if (!files?.length) return undefined;
  return files.map(file => ({
    targetPath: file.targetPath,
    contentHash: file.contentHash ?? contentHash(path.join(projectRoot, file.targetPath)),
  }));
}

export function readManagedState(projectRoot: string): ManagedState {
  const filePath = statePath(projectRoot);
  if (!fs.existsSync(filePath)) return { version: 2, packages: {} };
  try {
    const state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if ((state?.version === 1 || state?.version === 2) && state.packages && typeof state.packages === 'object') {
      const normalized: ManagedState = { ...state, version: 2 };
      if (!validGenerated(projectRoot, normalized.generatedFiles)) delete normalized.generatedFiles;
      if (!validEntries(projectRoot, normalized.managedEntries)) delete normalized.managedEntries;
      return normalized;
    }
  } catch {
    // 状态损坏时视为无状态，绝不据此删除用户资产。
  }
  return { version: 2, packages: {} };
}

export function writeManagedState(projectRoot: string, state: ManagedState): void {
  ensureManagedStateIgnored(projectRoot);
  const filePath = statePath(projectRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.cli-tmp`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify({ ...state, version: 2 }, null, 2) + '\n');
    renameAtomic(tmpPath, filePath);
  } catch (err) {
    fs.rmSync(tmpPath, { force: true });
    throw err;
  }
}

/** 状态文件是 CLI 运行产物，不要求业务项目提交。 */
function ensureManagedStateIgnored(projectRoot: string): void {
  const gitignorePath = path.join(projectRoot, '.gitignore');
  const content = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
  if (content.split(/\r?\n/).includes(GITIGNORE_ENTRY)) return;
  const separator = content && !content.endsWith('\n') ? '\n' : '';
  fs.writeFileSync(gitignorePath, `${content}${separator}${GITIGNORE_ENTRY}\n`);
}

export function recordManagedPackage(
  projectRoot: string,
  originalPackage: string,
  managed: ManagedPackage,
): void {
  const state = readManagedState(projectRoot);
  const aliasMapPath = path.join(projectRoot, 'shims', '.alias-map.json');
  const aliases = fs.existsSync(aliasMapPath)
    ? JSON.parse(fs.readFileSync(aliasMapPath, 'utf8')) as Record<string, string>
    : {};
  state.packages[originalPackage] = {
    ...managed,
    aliasTarget: managed.alias ? aliases[managed.alias] : undefined,
    patchFiles: materializeFiles(projectRoot, managed.patchFiles),
    shimFiles: materializeFiles(projectRoot, managed.shimFiles),
  };
  writeManagedState(projectRoot, state);
}

function deleteManagedFile(projectRoot: string, file: ManagedFile): void {
  const absolutePath = path.join(projectRoot, file.targetPath);
  if (!fs.existsSync(absolutePath)) return;
  if (file.contentHash && contentHash(absolutePath) !== file.contentHash) return;
  fs.rmSync(absolutePath, { force: true });
}

function isHarmonyPackageReferenced(state: ManagedState, harmonyPackage: string): boolean {
  return Object.values(state.packages).some(entry => entry.harmonyPackage === harmonyPackage);
}

/**
 * 仅清理 managed-state 中明确记录的资产。没有状态时不猜测用户手工配置。
 */
export function cleanupManagedPackage(projectRoot: string, originalPackage: string): CleanupResult {
  const state = readManagedState(projectRoot);
  const managed = state.packages[originalPackage];
  if (!managed) {
    return { found: false, needsAutolink: false, requiresCodegen: false };
  }

  const pkgPath = path.join(projectRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  removeDependency(pkg, originalPackage);
  delete state.packages[originalPackage];

  // 规范 §5：确认卸载的包清除旧项——含两级 oh-package 受管条目。
  // withManagedEntries 为合并语义（sync 不删旧键），残留条目会随卸载累积为脏数据。
  const removedDeps = new Set([originalPackage, managed.harmonyPackage].filter(Boolean) as string[]);
  for (const key of Object.keys(state.managedEntries ?? {})) {
    const dep = key.slice(key.lastIndexOf(':') + 1);
    if (removedDeps.has(dep)) delete state.managedEntries![key];
  }

  let removedHarmonyPackage: string | undefined;
  if (managed.harmonyPackage && !isHarmonyPackageReferenced(state, managed.harmonyPackage)) {
    removeDependency(pkg, managed.harmonyPackage);
    removedHarmonyPackage = managed.harmonyPackage;
  }
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

  const aliasMapPath = path.join(projectRoot, 'shims', '.alias-map.json');
  if (managed.alias && fs.existsSync(aliasMapPath)) {
    const aliases = JSON.parse(fs.readFileSync(aliasMapPath, 'utf8'));
    if (managed.aliasTarget && aliases[managed.alias] === managed.aliasTarget) {
      delete aliases[managed.alias];
      fs.writeFileSync(aliasMapPath, JSON.stringify(aliases, null, 2));
    }
  }

  for (const file of [...(managed.patchFiles || []), ...(managed.shimFiles || [])]) {
    deleteManagedFile(projectRoot, file);
  }
  for (const plugin of managed.appPlugins || []) removeAppJsonPlugin(projectRoot, plugin);

  writeManagedState(projectRoot, state);
  return {
    found: true,
    needsAutolink: Boolean(managed.needsAutolink),
    requiresCodegen: Boolean(managed.requiresCodegen),
    removedHarmonyPackage,
  };
}

/** 对账用户绕过 CLI 删除原包后的遗留 HarmonyOS 资产。 */
export function reconcileManagedState(projectRoot: string): string[] {
  const state = readManagedState(projectRoot);
  const pkgPath = path.join(projectRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const stalePackages = Object.keys(state.packages).filter(name => !dependencyExists(pkg, name));
  for (const name of stalePackages) cleanupManagedPackage(projectRoot, name);
  return stalePackages;
}

export function findGeneratedFileDrift(projectRoot: string, relPaths: string[]): string[] {
  const state = readManagedState(projectRoot);
  return relPaths.filter(rel => {
    const baseline = state.generatedFiles?.[rel];
    if (!baseline) return false;
    const current = contentHash(path.join(projectRoot, rel));
    return current !== baseline.contentHash;
  });
}

export function withGeneratedFileBaselines(projectRoot: string, state: ManagedState, relPaths: string[], cliVersion: string): ManagedState {
  state.generatedFiles = state.generatedFiles ?? {};
  for (const rel of relPaths) {
    const hash = contentHash(path.join(projectRoot, rel));
    if (hash) state.generatedFiles[rel] = { contentHash: hash, cliVersion };
  }
  return state;
}

export function withManagedEntries(state: ManagedState, entries: Array<{ path: string; dependency: string; spec: string }>, cliVersion: string): ManagedState {
  state.managedEntries = state.managedEntries ?? {};
  for (const entry of entries) state.managedEntries[`${entry.path}:${entry.dependency}`] = { ...entry, cliVersion };
  return state;
}

export function readManagedEntries(projectRoot: string) {
  return readManagedState(projectRoot).managedEntries ?? {};
}

export function recordGeneratedFileBaselines(projectRoot: string, relPaths: string[], cliVersion: string): void {
  writeManagedState(projectRoot, withGeneratedFileBaselines(projectRoot, readManagedState(projectRoot), relPaths, cliVersion));
}

export function recordManagedEntries(projectRoot: string, entries: Array<{ path: string; dependency: string; spec: string }>, cliVersion: string): void {
  writeManagedState(projectRoot, withManagedEntries(readManagedState(projectRoot), entries, cliVersion));
}
