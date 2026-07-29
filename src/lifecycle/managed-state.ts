import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { removeAppJsonPlugin } from '../injector/app-json';

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
  version: 1;
  packages: Record<string, ManagedPackage>;
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

function materializeFiles(projectRoot: string, files: ManagedFile[] | undefined): ManagedFile[] | undefined {
  if (!files?.length) return undefined;
  return files.map(file => ({
    targetPath: file.targetPath,
    contentHash: file.contentHash ?? contentHash(path.join(projectRoot, file.targetPath)),
  }));
}

export function readManagedState(projectRoot: string): ManagedState {
  const filePath = statePath(projectRoot);
  if (!fs.existsSync(filePath)) return { version: 1, packages: {} };
  try {
    const state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (state?.version === 1 && state.packages && typeof state.packages === 'object') return state;
  } catch {
    // 状态损坏时视为无状态，绝不据此删除用户资产。
  }
  return { version: 1, packages: {} };
}

export function writeManagedState(projectRoot: string, state: ManagedState): void {
  ensureManagedStateIgnored(projectRoot);
  const filePath = statePath(projectRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2) + '\n');
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
