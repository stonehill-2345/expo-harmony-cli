import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SDK54_PACKAGES, SDK54_EXTERNAL_PATCHES } from './catalog.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const SCREENS_UPSTREAM_INTEGRITY = 'sha512-eBvNhA0KU/o9MCoGXjP/xtQbd2IuCLfoQwEFL5+gZlXFLqWGZBUg/tRmpF1vhc0oTkdRVR5tzYp8nMr5mr/8YA==';
export const RELEASE_ID = 'sdk54-expo-oh-harmony.0';
const batches = {
  expo: 'C', 'expo-router': 'C', 'expo-asset': 'B', 'expo-linking': 'B', '@expo/cli': 'B',
};
export const RELEASE_PACKAGES = Object.freeze([
  ...SDK54_PACKAGES.map(p => ({ ...p, batch: batches[p.name] ?? 'A' })),
  { ...SDK54_EXTERNAL_PATCHES[0], batch: 'A' },
].map(p => {
  const publishName = `@expo-oh/${p.name.startsWith('@expo/') ? p.name.replace('@expo/', 'expo-') : p.name.split('/').at(-1)}`;
  const publishVersion = p.version;
  return Object.freeze({ ...p, installName: p.name, upstreamVersion: p.version, publishName, publishVersion, installSpec: `npm:${publishName}@${publishVersion}` });
}));

export function rewriteReleaseManifest(source) {
  const descriptor = RELEASE_PACKAGES.find(p => p.installName === source.name);
  if (!descriptor || source.version !== descriptor.upstreamVersion) throw new Error(`Unexpected upstream identity: ${source.name}@${source.version}`);
  const manifest = structuredClone(source);
  Object.assign(manifest, {
    name: descriptor.publishName,
    version: descriptor.publishVersion,
    private: false,
    publishConfig: { access: 'public', registry: 'https://registry.npmjs.org/' },
    repository: { type: 'git', url: 'https://github.com/stonehill-2345/expo-harmony-cli.git', ...(descriptor.relativePath ? { directory: descriptor.relativePath } : {}) },
    bugs: { url: 'https://github.com/stonehill-2345/expo-harmony-cli/issues' },
    homepage: 'https://github.com/stonehill-2345/expo-harmony-cli#readme',
  });
  for (const section of ['dependencies', 'optionalDependencies']) {
    for (const p of RELEASE_PACKAGES) {
      if (manifest[section]?.[p.installName]) manifest[section][p.installName] = p.installSpec;
    }
  }
  // The tarball is fully built before publication. Never require build tooling on installation.
  for (const script of ['prepare', 'prepack', 'postpack', 'prepublishOnly']) delete manifest.scripts?.[script];
  return manifest;
}

export function createReleaseManifest() {
  const baseline = JSON.parse(fs.readFileSync(path.join(root, 'apps/cli/content/patches/sdk-54/manifest.json')));
  const cliPackage = JSON.parse(fs.readFileSync(path.join(root, 'apps/cli/package.json')));
  return {
    schemaVersion: 1,
    release: RELEASE_ID,
    cliVersion: cliPackage.version,
    createExpoApp: baseline.createExpoApp,
    templates: baseline.templates,
    defaultImage: baseline.defaultImage,
    catalog: baseline.catalog,
    packages: RELEASE_PACKAGES.map(p => {
      const patch = baseline.patches.find(patch => patch.name === p.installName);
      if (!patch) throw new Error(`Missing runtime contract: ${p.installName}`);
      return {
        installName: p.installName, upstreamVersion: p.upstreamVersion,
        publishName: p.publishName, publishVersion: p.publishVersion, installSpec: p.installSpec,
        templates: patch.templates, requiredFiles: [...patch.requiredFiles, ...(p.installName === '@expo/cli' ? ['build/src/harmony/release.js'] : p.installName === 'expo' ? ['harmony-release.json'] : [])], probes: patch.probes,
      };
    }),
  };
}
