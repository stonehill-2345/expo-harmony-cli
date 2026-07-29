import * as fs from 'fs';
import * as path from 'path';
import { COMPAT_TABLE } from './compat-table';
import { copyFromLibrary } from '../utils/content-library';
import { applyCompatPatch, applyCompatibleVersionPair, lockAllDependencyVersions } from './compat-patch';
import { syncAppJsonPlugins } from '../injector/app-json';
import { reconcileManagedState, recordManagedPackage, type ManagedPackage } from '../lifecycle/managed-state';
import { VERSION_MATRIX as V } from '../version-matrix';

export interface ScanReport {
  bumped: Array<{ from: string; to: string; harmonyPackage: string }>;
  addedNative: Array<{ original: string; harmonyPackage: string; alias?: string }>;
  addedAliasOnly: Array<{ original: string; harmonyPackage: string; alias?: string }>;
  shimmed: Array<{ original: string; shimPath: string }>;
  patched: Array<{ original: string; patchPath: string }>;
  removed: string[];
  replaced: Array<{ from: string; to: string }>;
  unsupported: string[];
  skipped: string[];
  reconciled: string[];
}

export function scanAndAdapt(targetDir: string): ScanReport {
  // 先根据 managed-state 回收用户绕过 CLI 卸载后的残留资产；无状态资产一律不碰。
  const reconciled = reconcileManagedState(targetDir);
  const pkgPath = path.join(targetDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

  const report: ScanReport = { bumped: [], addedNative: [], addedAliasOnly: [], shimmed: [], patched: [], removed: [], replaced: [], unsupported: [], skipped: [], reconciled };
  let aliasMap: Record<string, string> = {};
  const managedEntries: Array<[string, ManagedPackage]> = [];

  // ★ 读 injector 写的初始 alias-map（合并式，保留 @expo/metro-runtime）
  const aliasMapPath = path.join(targetDir, 'shims', '.alias-map.json');
  if (fs.existsSync(aliasMapPath)) {
    aliasMap = JSON.parse(fs.readFileSync(aliasMapPath, 'utf8'));
  }

  for (const depName of Object.keys(deps)) {
    const entry = COMPAT_TABLE[depName];
    if (!entry) { report.skipped.push(depName); continue; }

    let patchPath: string | undefined;
    let shimPath: string | undefined;
    switch (entry.status) {
      case 'bump-native': {
        applyCompatibleVersionPair(pkg, entry);
        report.bumped.push({ from: depName, to: entry.bumpTo!, harmonyPackage: entry.harmony!.package });
        if (entry.harmony!.alias) aliasMap[depName] = entry.harmony!.package;
        break;
      }
      case 'native': {
        applyCompatibleVersionPair(pkg, entry);
        report.addedNative.push({ original: depName, harmonyPackage: entry.harmony!.package, alias: entry.harmony!.alias });
        if (entry.harmony!.alias) aliasMap[entry.harmony!.alias] = entry.harmony!.package;
        break;
      }
      case 'alias-only': {
        applyCompatibleVersionPair(pkg, entry);
        report.addedAliasOnly.push({ original: depName, harmonyPackage: entry.harmony!.package, alias: entry.harmony!.alias });
        if (entry.harmony!.alias) aliasMap[entry.harmony!.alias] = entry.harmony!.package;
        break;
      }
      case 'shim': {
        copyFromLibrary(entry.shim!.sourceFile, targetDir, entry.shim!.targetPath);
        aliasMap[depName] = entry.shim!.targetPath;
        shimPath = entry.shim!.targetPath;
        report.shimmed.push({ original: depName, shimPath: entry.shim!.targetPath });
        break;
      }
      case 'patch-only': {
        const applied = applyCompatPatch(targetDir, pkg, depName, entry.patch!);
        patchPath = applied.patchPath;
        report.patched.push({ original: depName, patchPath: applied.patchPath });
        break;
      }
      case 'remove': {
        delete pkg.dependencies[depName];
        delete pkg.devDependencies?.[depName];
        report.removed.push(depName);
        break;
      }
      case 'replace': {
        delete pkg.dependencies[depName];
        pkg.dependencies[entry.replaceWith!.package] = entry.replaceWith!.version;
        report.replaced.push({ from: depName, to: entry.replaceWith!.package });
        // 保持 replace 类包的 app.json 插件名与 package.json 依赖一致，
        // 否则后续 prebuild 可能指向已经移除的包。
        syncAppJsonPlugins(targetDir, depName, entry.replaceWith!.package);
        break;
      }
      case 'unsupported': {
        report.unsupported.push(depName);
        break;
      }
    }

    // patch 字段与 status 正交（非 patch-only 的 patch）
    if (entry.patch && entry.status !== 'patch-only') {
      const applied = applyCompatPatch(targetDir, pkg, depName, entry.patch);
      patchPath = applied.patchPath;
      report.patched.push({ original: depName, patchPath: applied.patchPath });
    }

    if (entry.status !== 'unsupported' && entry.status !== 'remove' && entry.status !== 'replace') {
      managedEntries.push([depName, {
        harmonyPackage: entry.harmony?.package,
        alias: entry.status === 'shim' ? depName : entry.harmony?.alias,
        patchFiles: patchPath ? [{ targetPath: patchPath }] : undefined,
        shimFiles: shimPath ? [{ targetPath: shimPath }] : undefined,
        needsAutolink: entry.status === 'native' || entry.status === 'bump-native',
        requiresCodegen: entry.harmony?.requiresCodegen,
      }]);
    }
  }

  // ★ 强制注入 RNOH 核心 patch（传递依赖，扫不到）
  const rnohPatchPath = `patches/@react-native-oh+react-native-harmony+${V.rnoh}.patch`;
  copyFromLibrary(`content/${rnohPatchPath}`, targetDir, rnohPatchPath);
  report.patched.push({ original: '@react-native-oh/react-native-harmony', patchPath: rnohPatchPath });

  // expo-modules-core 是 Expo 传递依赖，pnpm 下通常不是顶层 node_modules 包。
  // 不再复制 patch-package patch，运行时由 Metro shim 与 postinstall/start-harmony fallback 处理。
  // 兼容旧 CLI 已生成项目：清理过去强制注入的传递依赖 patch，避免 patch-package 失败。
  const legacyExpoModulesCorePatch = path.join(targetDir, 'patches/expo-modules-core+2.2.3.patch');
  if (fs.existsSync(legacyExpoModulesCorePatch)) fs.rmSync(legacyExpoModulesCorePatch, { force: true });

  // 注：@expo/metro-runtime shim 由 injector（Task 4）copy + 写初始 alias-map，此处不重复

  lockAllDependencyVersions(pkg);

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  fs.mkdirSync(path.dirname(aliasMapPath), { recursive: true });
  fs.writeFileSync(aliasMapPath, JSON.stringify(aliasMap, null, 2));
  for (const [name, managed] of managedEntries) recordManagedPackage(targetDir, name, managed);

  return report;
}
