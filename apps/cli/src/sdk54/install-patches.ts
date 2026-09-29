import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Sdk54Template } from './create-options';
import { commitTextFileTransaction, type TextFileChange } from './file-transaction';
import { buildSdk54PackageJson } from './package-json';
import type { PatchDescriptor, Sdk54PatchManifest } from './patch-manifest';

const PATCH_COMMAND = 'patch-package --error-on-fail --error-on-warn';

export function mergePatchPostinstall(existing: unknown): string {
  if (existing === undefined || existing === null || existing === '') return PATCH_COMMAND;
  if (typeof existing !== 'string') throw new Error('postinstall patch 管理冲突：scripts.postinstall 必须是字符串');
  const command = existing.trim();
  const segments = command.split('&&').map(segment => segment.trim()).filter(Boolean);
  const patchSegments = segments.filter(segment => segment.includes('patch-package'));
  if (patchSegments.length === 0) return `${command} && ${PATCH_COMMAND}`;
  if (patchSegments.length === 1 && patchSegments[0] === PATCH_COMMAND) return command;
  throw new Error(`postinstall patch 管理冲突：只允许 ${PATCH_COMMAND}`);
}

function sha256(contents: Buffer): string {
  return createHash('sha256').update(contents).digest('hex');
}

function expectedVersion(manifest: Sdk54PatchManifest, patch: PatchDescriptor): string | undefined {
  return manifest.catalog.expo[patch.name] ?? manifest.catalog.external[patch.name];
}

function assertNoPatchManagerConflict(pkg: Record<string, any>): void {
  if (pkg.pnpm?.patchedDependencies && Object.keys(pkg.pnpm.patchedDependencies).length > 0) {
    throw new Error('patch 管理冲突：不支持 pnpm.patchedDependencies');
  }
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'resolutions']) {
    for (const value of Object.values(pkg[section] ?? {})) {
      if (typeof value === 'string' && value.startsWith('patch:')) {
        throw new Error(`patch 管理冲突：不支持 ${section} 中的 Yarn patch 协议`);
      }
    }
  }
}

function safeSource(root: string, relativePath: string): string {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes('..')) {
    throw new Error(`patch 路径不安全：${relativePath}`);
  }
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) throw new Error(`patch 路径越界：${relativePath}`);
  return resolved;
}

export function prepareSdk54PatchInstall(
  projectRoot: string,
  template: Sdk54Template,
  manifest: Sdk54PatchManifest,
  packageRoot = path.resolve(__dirname, '../..'),
): { patchFiles: string[]; packageJsonChanged: boolean } {
  const packageFile = path.join(projectRoot, 'package.json');
  const originalText = fs.readFileSync(packageFile, 'utf8');
  const current = JSON.parse(originalText) as Record<string, any>;
  assertNoPatchManagerConflict(current);

  const sourceRoot = path.join(packageRoot, 'content/patches/sdk-54');
  const changes = new Map<string, TextFileChange>();
  const patchFiles: string[] = [];

  for (const patch of manifest.patches.filter(item => item.templates.includes(template))) {
    const catalogVersion = expectedVersion(manifest, patch);
    if (catalogVersion !== patch.version) {
      throw new Error(`patch 版本不匹配：${patch.name}@${patch.version}，预期 ${catalogVersion ?? 'catalog 缺失'}`);
    }
    const source = safeSource(sourceRoot, patch.file);
    if (!fs.existsSync(source)) throw new Error(`patch source 缺失：${patch.file}`);
    const contents = fs.readFileSync(source);
    if (sha256(contents) !== patch.sha256) throw new Error(`patch checksum 不匹配：${patch.file}`);
    const targetRelative = `patches/${patch.file}`;
    changes.set(targetRelative, {
      path: path.join(projectRoot, targetRelative),
      contents: contents.toString('utf8'),
    });
    patchFiles.push(targetRelative);

    for (const license of patch.licenses) {
      const licenseSource = safeSource(sourceRoot, license);
      if (!fs.existsSync(licenseSource)) throw new Error(`patch license 缺失：${license}`);
      const target = `patches/${license}`;
      changes.set(target, {
        path: path.join(projectRoot, target),
        contents: fs.readFileSync(licenseSource, 'utf8'),
      });
    }
  }

  const next = buildSdk54PackageJson(current, template, manifest) as Record<string, any>;
  next.scripts = { ...(next.scripts ?? {}) };
  next.scripts.postinstall = mergePatchPostinstall(current.scripts?.postinstall);
  const nextText = `${JSON.stringify(next, null, 2)}\n`;
  changes.set('package.json', { path: packageFile, contents: nextText });

  commitTextFileTransaction([...changes.values()]);
  patchFiles.sort((left, right) => left.localeCompare(right, 'en'));
  return { patchFiles, packageJsonChanged: nextText !== originalText };
}
