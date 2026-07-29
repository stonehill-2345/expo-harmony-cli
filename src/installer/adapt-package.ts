import * as fs from 'fs';
import * as path from 'path';
import { COMPAT_TABLE, CompatStatus } from '../scanner/compat-table';
import { copyFromLibrary } from '../utils/content-library';
import { applyCompatPatch, applyCompatibleVersionPair, lockAllDependencyVersions } from '../scanner/compat-patch';
import { ensureAppJsonPlugin, syncAppJsonPlugins } from '../injector/app-json';
import { recordManagedPackage } from '../lifecycle/managed-state';

export interface AdaptResult {
  status: CompatStatus | 'skipped';
  harmonyPackage?: string;
  needsAutolink?: boolean;
  alias?: string;
  patchPath?: string;
  shimPath?: string;
  requiresCodegen?: boolean;
}

export interface AdaptOptions {
  /** 仅记录本次由 CLI 新建的 Expo config plugin，卸载时才可安全移除。 */
  appPlugins?: string[];
}

/** install 单包查表（§7.2 步骤3）。改 package.json + copy patch/shim + 更新 alias-map。*/
export function adaptPackage(pkgName: string, targetDir: string, options: AdaptOptions = {}): AdaptResult {
  // strip @version（scoped 包名 @scope/pkg@version → @scope/pkg；pkg@version → pkg）。
  // 跳过开头的 @（scoped 包名），从 index 1 开始查 @version 分隔符。
  const scopeAt = pkgName.indexOf('@', 1);
  const baseName = scopeAt === -1 ? pkgName : pkgName.slice(0, scopeAt);
  const entry = COMPAT_TABLE[baseName];
  if (!entry) {
    return { status: 'skipped' };
  }

  const pkgPath = path.join(targetDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const aliasMapPath = path.join(targetDir, 'shims', '.alias-map.json');
  let aliasMap: Record<string, string> = {};
  if (fs.existsSync(aliasMapPath)) {
    aliasMap = JSON.parse(fs.readFileSync(aliasMapPath, 'utf8'));
  }

  const result: AdaptResult = {
    status: entry.status,
    requiresCodegen: entry.harmony?.requiresCodegen,
  };

  switch (entry.status) {
    case 'bump-native':
      applyCompatibleVersionPair(pkg, entry);
      result.harmonyPackage = entry.harmony!.package;
      result.needsAutolink = true;
      if (entry.harmony!.alias) {
        aliasMap[entry.harmony!.alias] = entry.harmony!.package;
        result.alias = entry.harmony!.alias;
      }
      break;
    case 'native':
      applyCompatibleVersionPair(pkg, entry);
      result.harmonyPackage = entry.harmony!.package;
      result.needsAutolink = true;
      if (entry.harmony!.alias) {
        aliasMap[entry.harmony!.alias] = entry.harmony!.package;
        result.alias = entry.harmony!.alias;
      }
      break;
    case 'alias-only':
      applyCompatibleVersionPair(pkg, entry);
      result.harmonyPackage = entry.harmony!.package;
      result.needsAutolink = false;
      if (entry.harmony!.alias) {
        aliasMap[entry.harmony!.alias] = entry.harmony!.package;
        result.alias = entry.harmony!.alias;
      }
      break;
    case 'shim':
      copyFromLibrary(entry.shim!.sourceFile, targetDir, entry.shim!.targetPath);
      aliasMap[baseName] = entry.shim!.targetPath;
      result.shimPath = entry.shim!.targetPath;
      break;
    case 'patch-only':
      result.patchPath = applyCompatPatch(targetDir, pkg, baseName, entry.patch!).patchPath;
      break;
    case 'remove':
      delete pkg.dependencies[baseName];
      delete pkg.devDependencies?.[baseName];
      break;
    case 'replace':
      delete pkg.dependencies[baseName];
      pkg.dependencies[entry.replaceWith!.package] = entry.replaceWith!.version;
      // 保持 replace 类包的 app.json 插件名与 package.json 依赖一致，
      // 否则后续 prebuild 可能指向已经移除的包。
      syncAppJsonPlugins(targetDir, baseName, entry.replaceWith!.package);
      break;
  }

  // patch 字段与 status 正交（如 expo-router 是 native + patch）
  if (entry.patch && entry.status !== 'patch-only') {
    result.patchPath = applyCompatPatch(targetDir, pkg, baseName, entry.patch).patchPath;
  }

  // react-native-permissions 的 Expo 插件会直接读取 props.iosPermissions。
  // 显式提供空数组，避免下一次 expo install 解析配置插件时因 props 为 undefined 崩溃。
  if (baseName === 'react-native-permissions') {
    ensureAppJsonPlugin(targetDir, baseName, { iosPermissions: [] });
  }

  lockAllDependencyVersions(pkg);

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  fs.writeFileSync(aliasMapPath, JSON.stringify(aliasMap, null, 2));

  if (entry.status !== 'unsupported' && entry.status !== 'remove' && entry.status !== 'replace') {
    recordManagedPackage(targetDir, baseName, {
      harmonyPackage: result.harmonyPackage,
      alias: result.alias,
      patchFiles: result.patchPath ? [{ targetPath: result.patchPath }] : undefined,
      shimFiles: result.shimPath ? [{ targetPath: result.shimPath }] : undefined,
      appPlugins: options.appPlugins,
      needsAutolink: result.needsAutolink,
      requiresCodegen: result.requiresCodegen,
    });
  }
  return result;
}
