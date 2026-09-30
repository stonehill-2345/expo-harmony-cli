import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Sdk54Template } from './create-options';
import type { Sdk54PatchManifest } from './patch-manifest';

export interface ValidatedSdk54Template {
  projectRoot: string;
  template: Sdk54Template;
  packageJson: Record<string, unknown>;
  appJson: Record<string, unknown>;
  appName: string;
  slug: string;
}

const FORBIDDEN_BYPASSES = [
  'harmony',
  'index.harmony.js',
  'shims',
  'scripts/postinstall-harmony.js',
  'metro.config.js',
] as const;

function fail(field: string, actual: unknown, expected: string): never {
  throw new Error(
    `[template-contract] ${field}: 实际 ${JSON.stringify(actual)}；预期 ${expected}`,
  );
}

function requireFile(projectRoot: string, relativePath: string): string {
  const absolute = path.join(projectRoot, relativePath);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(absolute);
  } catch {
    fail(relativePath, 'missing', '文件存在');
  }
  if (!stat.isFile()) fail(relativePath, 'not-file', '文件存在');
  return absolute;
}

function readJson(projectRoot: string, relativePath: string): Record<string, unknown> {
  const absolute = requireFile(projectRoot, relativePath);
  try {
    const value: unknown = JSON.parse(fs.readFileSync(absolute, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(relativePath, typeof value, 'JSON 对象');
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('[template-contract]')) throw error;
    fail(relativePath, error instanceof Error ? error.message : String(error), '可解析 JSON 对象');
  }
}

function dependencyVersion(pkg: Record<string, any>, name: string): unknown {
  return pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
}

function requireExactVersion(pkg: Record<string, any>, name: string, expected: string): void {
  const actual = dependencyVersion(pkg, name);
  if (actual !== expected) fail(`package.json ${name}`, actual ?? 'missing', expected);
}

function countOccurrences(contents: string, value: string): number {
  return contents.split(value).length - 1;
}

export function validateSdk54Template(
  projectRoot: string,
  template: Sdk54Template,
  manifest: Sdk54PatchManifest,
): ValidatedSdk54Template {
  for (const relativePath of FORBIDDEN_BYPASSES) {
    if (fs.existsSync(path.join(projectRoot, relativePath))) {
      throw new Error(`[template-contract] 禁止 legacy bypass：${relativePath}`);
    }
  }

  const packageJson = readJson(projectRoot, 'package.json') as Record<string, any>;
  const appJson = readJson(projectRoot, 'app.json') as Record<string, any>;
  const expoConfig = appJson.expo;
  if (!expoConfig || typeof expoConfig !== 'object' || Array.isArray(expoConfig)) {
    fail('app.json expo', expoConfig ?? 'missing', '对象');
  }
  if (typeof expoConfig.name !== 'string' || !expoConfig.name) {
    fail('app.json expo.name', expoConfig.name ?? 'missing', '非空字符串');
  }
  if (typeof expoConfig.slug !== 'string' || !expoConfig.slug) {
    fail('app.json expo.slug', expoConfig.slug ?? 'missing', '非空字符串');
  }

  const contract = manifest.templates[template];
  requireExactVersion(packageJson, 'expo', contract.sourceDependencies.expo);
  requireExactVersion(packageJson, 'react', contract.sourceDependencies.react);
  requireExactVersion(packageJson, 'react-native', contract.sourceDependencies['react-native']);

  if (template === 'blank-typescript') {
    requireFile(projectRoot, 'App.tsx');
  } else {
    if (packageJson.main !== 'expo-router/entry') {
      fail('package.json main', packageJson.main ?? 'missing', 'expo-router/entry');
    }
    for (const relativePath of [
      'app/(tabs)/index.tsx',
      'app/(tabs)/explore.tsx',
      'app/(tabs)/_layout.tsx',
      'app/_layout.tsx',
      'app/modal.tsx',
    ]) {
      const absolute = requireFile(projectRoot, relativePath);
      if (!manifest.defaultImage.files.includes(relativePath)) continue;
      const contents = fs.readFileSync(absolute, 'utf8');
      if (
        countOccurrences(contents, manifest.defaultImage.sourceImport) !== 1
        || countOccurrences(contents, "from 'expo-image'") !== 1
      ) {
        fail(relativePath, 'drifted', '已验收的 expo-image import 恰好出现一次');
      }
    }
  }

  return {
    projectRoot,
    template,
    packageJson,
    appJson,
    appName: expoConfig.name,
    slug: expoConfig.slug,
  };
}
