import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Sdk54Template } from './create-options';

export interface RuntimeProbeSpec {
  kind: 'file' | 'require' | 'command';
  target: string;
  args?: string[];
  expected?: string;
}

export interface PatchDescriptor {
  name: string;
  version: string;
  file: string;
  sha256: string;
  templates: Sdk54Template[];
  requiredFiles: string[];
  probes: RuntimeProbeSpec[];
  licenses: string[];
}

export interface TemplatePackageContract {
  sourceDependencies: Record<string, string>;
  expoPackages: string[];
  externalPackages: string[];
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

export interface Sdk54PatchManifest {
  schemaVersion: 1;
  patchSet: string;
  createExpoApp: string;
  patchPackageVersion: string;
  catalog: {
    expo: Record<string, string>;
    external: Record<string, string>;
  };
  templates: Record<Sdk54Template, TemplatePackageContract>;
  defaultImage: {
    files: string[];
    sourceImport: string;
    replacementImport: string;
  };
  patches: PatchDescriptor[];
}

function invalid(field: string, detail: string): never {
  throw new Error(`SDK54 patch manifest 无效：${field} ${detail}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertSafeRelative(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !value || path.isAbsolute(value) || value.includes('\\')) {
    invalid(field, '必须是安全相对路径');
  }
  const parts = value.split('/');
  if (parts.includes('..') || parts.includes('.') || parts.some(part => !part)) {
    invalid(field, '必须是安全相对路径');
  }
}

function assertStringRecord(value: unknown, field: string): asserts value is Record<string, string> {
  if (!isObject(value)) invalid(field, '必须是对象');
  for (const [key, item] of Object.entries(value)) {
    if (!key || typeof item !== 'string' || !item) invalid(`${field}.${key}`, '必须是非空字符串');
  }
}

function assertStringArray(value: unknown, field: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item)) {
    invalid(field, '必须是非空字符串数组');
  }
}

function assertTemplate(value: unknown, field: string): asserts value is Sdk54Template {
  if (value !== 'blank-typescript' && value !== 'default') invalid(field, '包含未知模板');
}

function validateTemplateContract(value: unknown, field: string): asserts value is TemplatePackageContract {
  if (!isObject(value)) invalid(field, '必须是对象');
  assertStringRecord(value.sourceDependencies, `${field}.sourceDependencies`);
  assertStringArray(value.expoPackages, `${field}.expoPackages`);
  assertStringArray(value.externalPackages, `${field}.externalPackages`);
  assertStringRecord(value.dependencies, `${field}.dependencies`);
  assertStringRecord(value.devDependencies, `${field}.devDependencies`);
}

function validateManifest(value: unknown): asserts value is Sdk54PatchManifest {
  if (!isObject(value)) invalid('root', '必须是对象');
  if (value.schemaVersion !== 1) invalid('schemaVersion', '必须为 1');
  if (typeof value.patchSet !== 'string' || !/^[a-z0-9._-]+$/.test(value.patchSet)) {
    invalid('patchSet', '必须是稳定标识且不能包含 URL');
  }
  if (value.createExpoApp !== '5.0.0') invalid('createExpoApp', '必须为 5.0.0');
  if (value.patchPackageVersion !== '8.0.0') invalid('patchPackageVersion', '必须为 8.0.0');

  if (!isObject(value.catalog)) invalid('catalog', '必须是对象');
  assertStringRecord(value.catalog.expo, 'catalog.expo');
  assertStringRecord(value.catalog.external, 'catalog.external');

  if (!isObject(value.templates)) invalid('templates', '必须是对象');
  validateTemplateContract(value.templates['blank-typescript'], 'templates.blank-typescript');
  validateTemplateContract(value.templates.default, 'templates.default');

  if (!isObject(value.defaultImage)) invalid('defaultImage', '必须是对象');
  assertStringArray(value.defaultImage.files, 'defaultImage.files');
  for (const [index, file] of value.defaultImage.files.entries()) {
    assertSafeRelative(file, `defaultImage.files[${index}]`);
  }
  if (typeof value.defaultImage.sourceImport !== 'string' || !value.defaultImage.sourceImport) {
    invalid('defaultImage.sourceImport', '必须是非空字符串');
  }
  if (typeof value.defaultImage.replacementImport !== 'string' || !value.defaultImage.replacementImport) {
    invalid('defaultImage.replacementImport', '必须是非空字符串');
  }

  if (!Array.isArray(value.patches)) invalid('patches', '必须是数组');
  const packageNames = new Set<string>();
  for (const [index, candidate] of value.patches.entries()) {
    const field = `patches[${index}]`;
    if (!isObject(candidate)) invalid(field, '必须是对象');
    if (typeof candidate.name !== 'string' || !candidate.name) invalid(`${field}.name`, '必须是非空字符串');
    if (packageNames.has(candidate.name)) invalid(field, `包含重复包 ${candidate.name}`);
    packageNames.add(candidate.name);
    if (typeof candidate.version !== 'string' || !candidate.version) invalid(`${field}.version`, '必须是非空字符串');
    assertSafeRelative(candidate.file, `${field}.file`);
    if (!candidate.file.endsWith('.patch')) invalid(`${field}.file`, '必须以 .patch 结尾');
    if (typeof candidate.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(candidate.sha256)) {
      invalid(`${field}.sha256`, '必须是 64 位小写十六进制');
    }
    if (!Array.isArray(candidate.templates) || candidate.templates.length === 0) invalid(`${field}.templates`, '不能为空');
    candidate.templates.forEach((template, templateIndex) => assertTemplate(template, `${field}.templates[${templateIndex}]`));
    assertStringArray(candidate.requiredFiles, `${field}.requiredFiles`);
    candidate.requiredFiles.forEach((file, fileIndex) => assertSafeRelative(file, `${field}.requiredFiles[${fileIndex}]`));
    if (!Array.isArray(candidate.probes)) invalid(`${field}.probes`, '必须是数组');
    for (const [probeIndex, probe] of candidate.probes.entries()) {
      if (!isObject(probe) || !['file', 'require', 'command'].includes(String(probe.kind)) || typeof probe.target !== 'string' || !probe.target) {
        invalid(`${field}.probes[${probeIndex}]`, '格式错误');
      }
    }
    assertStringArray(candidate.licenses, `${field}.licenses`);
    candidate.licenses.forEach((license, licenseIndex) => assertSafeRelative(license, `${field}.licenses[${licenseIndex}]`));
  }
}

export function loadSdk54PatchManifest(packageRoot = path.resolve(__dirname, '../..')): Sdk54PatchManifest {
  const manifestPath = path.join(packageRoot, 'content/patches/sdk-54/manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`SDK54 patch manifest 缺失：${manifestPath}`);
  }
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`SDK54 patch manifest 无法解析：${error instanceof Error ? error.message : String(error)}`);
  }
  validateManifest(value);
  return value;
}

export function assertManifestReadyForTemplate(
  manifest: Sdk54PatchManifest,
  template: Sdk54Template,
): void {
  if (!manifest.patches.some(patch => patch.templates.includes(template))) {
    throw new Error(`SDK54 patch-set ${manifest.patchSet} 未包含 ${template} 模板所需 patch`);
  }
}
