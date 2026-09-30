import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  BLANK_DEV_DEPENDENCIES,
  BLANK_EXPO_PACKAGES,
  BLANK_PLAIN_DEPENDENCIES,
  DEFAULT_DEV_DEPENDENCIES,
  DEFAULT_EXPO_PACKAGES,
  DEFAULT_EXTERNAL_PACKAGES,
  DEFAULT_IMAGE_FILES,
  DEFAULT_IMAGE_IMPORT,
  DEFAULT_PLAIN_DEPENDENCIES,
  DEFAULT_REACT_NATIVE_IMAGE_IMPORT,
  EXPO_ARCHIVE_VERSIONS,
  EXTERNAL_ARCHIVE_VERSIONS,
  OFFICIAL_TEMPLATE_DEPENDENCIES,
} from './fixture-contract.mjs';

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort((left, right) => left.localeCompare(right, 'en'))
      .map(key => [key, stableValue(value[key])]),
  );
}

export function buildCliPatchManifest({ patches = [] } = {}) {
  return {
    schemaVersion: 1,
    patchSet: 'sdk54-mvp-1',
    createExpoApp: '5.0.0',
    patchPackageVersion: '8.0.0',
    catalog: {
      expo: { ...EXPO_ARCHIVE_VERSIONS },
      external: { ...EXTERNAL_ARCHIVE_VERSIONS },
    },
    templates: {
      'blank-typescript': {
        sourceDependencies: { ...OFFICIAL_TEMPLATE_DEPENDENCIES['blank-typescript'] },
        expoPackages: [...BLANK_EXPO_PACKAGES],
        externalPackages: ['@react-native-oh/react-native-harmony'],
        dependencies: { ...BLANK_PLAIN_DEPENDENCIES },
        devDependencies: { ...BLANK_DEV_DEPENDENCIES },
      },
      default: {
        sourceDependencies: { ...OFFICIAL_TEMPLATE_DEPENDENCIES.default },
        expoPackages: [...DEFAULT_EXPO_PACKAGES],
        externalPackages: [...DEFAULT_EXTERNAL_PACKAGES],
        dependencies: { ...DEFAULT_PLAIN_DEPENDENCIES },
        devDependencies: { ...DEFAULT_DEV_DEPENDENCIES },
      },
    },
    defaultImage: {
      files: [...DEFAULT_IMAGE_FILES],
      sourceImport: DEFAULT_IMAGE_IMPORT,
      replacementImport: DEFAULT_REACT_NATIVE_IMAGE_IMPORT,
    },
    patches: [...patches],
  };
}

export function stableManifestText(manifest) {
  return `${JSON.stringify(stableValue(manifest), null, 2)}\n`;
}

export function writeCliPatchManifest(outputFile, manifest = buildCliPatchManifest()) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, stableManifestText(manifest));
}

function argumentValue(args, name) {
  const inline = args.find(arg => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function main() {
  const output = argumentValue(process.argv.slice(2), '--output');
  if (!output) {
    console.error('Usage: node scripts/sdk54/generate-cli-patch-manifest.mjs --output <manifest.json>');
    process.exitCode = 1;
    return;
  }
  writeCliPatchManifest(path.resolve(output));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
