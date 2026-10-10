import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Sdk54Template } from './create-options';
import type { Sdk54PatchManifest, RuntimeProbeSpec } from './patch-manifest';

export interface ReleasePackage {
  installName: string;
  upstreamVersion: string;
  publishName: string;
  publishVersion: string;
  installSpec: string;
  templates: Sdk54Template[];
  requiredFiles: string[];
  probes: RuntimeProbeSpec[];
}
export interface ReleaseManifest extends Pick<Sdk54PatchManifest, 'schemaVersion' | 'createExpoApp' | 'templates' | 'catalog' | 'defaultImage'> {
  release: string;
  cliVersion: string;
  packages: ReleasePackage[];
}

export function loadReleaseManifest(packageRoot = path.resolve(__dirname, '../..')): ReleaseManifest {
  const value = JSON.parse(fs.readFileSync(path.join(packageRoot, 'content/releases/sdk-54/manifest.json'), 'utf8')) as ReleaseManifest;
  if (value.schemaVersion !== 1 || !value.release || !/^\d+\.\d+\.\d+$/.test(value.cliVersion) || !Array.isArray(value.packages) || value.packages.length !== 15) throw new Error('Invalid SDK54 release manifest');
  const names = new Set<string>();
  for (const item of value.packages) {
    if (!/^(@[a-z0-9-]+\/)?[a-z0-9-]+$/.test(item.installName) || names.has(item.installName)
      || !item.publishName.startsWith('@expo-oh/') || !/^\d+\.\d+\.\d+$/.test(item.publishVersion)
      || item.installSpec !== `npm:${item.publishName}@${item.publishVersion}`) throw new Error(`Invalid release identity: ${item.installName}`);
    names.add(item.installName);
    for (const file of [...item.requiredFiles, ...item.probes.map(probe => probe.target)]) {
      if (path.isAbsolute(file) || file.includes('\\') || file.split('/').includes('..')) throw new Error(`Invalid release path: ${file}`);
    }
  }
  for (const template of ['blank-typescript', 'default'] as const) {
    for (const name of value.templates[template].expoPackages) {
      if (!value.packages.some(p => p.installName === name && p.templates.includes(template))) throw new Error(`Missing release package: ${name}`);
    }
  }
  return value;
}

export function buildReleasePackageJson(current: Record<string, unknown>, template: Sdk54Template, manifest: ReleaseManifest) {
  const contract = manifest.templates[template];
  const dependencies: Record<string, string> = { ...contract.dependencies };
  for (const name of [...contract.expoPackages, ...contract.externalPackages]) {
    dependencies[name] = manifest.packages.find(p => p.installName === name)?.installSpec
      ?? manifest.catalog.external[name];
  }
  const pins = {
    ...manifest.catalog.external,
    ...manifest.templates.default.dependencies,
    ...Object.fromEntries(manifest.packages.map(item => [item.installName, item.installSpec])),
  };
  return {
    ...current, dependencies, devDependencies: { ...contract.devDependencies },
    overrides: { ...pins, ...dependencies },
    pnpm: { overrides: pins },
  };
}
