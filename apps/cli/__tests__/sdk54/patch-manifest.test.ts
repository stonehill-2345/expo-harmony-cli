import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  assertManifestReadyForTemplate,
  loadSdk54PatchManifest,
  type Sdk54PatchManifest,
} from '../../src/sdk54/patch-manifest';

const validManifest: Sdk54PatchManifest = {
  schemaVersion: 1,
  patchSet: 'sdk54-mvp-1',
  createExpoApp: '5.0.0',
  patchPackageVersion: '8.0.0',
  catalog: {
    expo: { '@expo/cli': '54.0.27' },
    external: { '@react-native-oh/react-native-harmony': '0.82.30' },
  },
  templates: {
    'blank-typescript': {
      sourceDependencies: { expo: '~54.0.36', react: '19.1.0', 'react-native': '0.81.5' },
      expoPackages: ['@expo/cli'],
      externalPackages: ['@react-native-oh/react-native-harmony'],
      dependencies: { react: '19.1.1' },
      devDependencies: { typescript: '5.9.2' },
    },
    default: {
      sourceDependencies: { expo: '~54.0.36', react: '19.1.0', 'react-native': '0.81.5' },
      expoPackages: ['@expo/cli'],
      externalPackages: ['@react-native-oh/react-native-harmony'],
      dependencies: { react: '19.1.1' },
      devDependencies: { typescript: '5.9.2' },
    },
  },
  defaultImage: {
    files: ['app/(tabs)/explore.tsx', 'app/(tabs)/index.tsx'],
    sourceImport: "import { Image } from 'expo-image';",
    replacementImport: "import { Image } from 'react-native';",
  },
  patches: [],
};

describe('loadSdk54PatchManifest', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-cli-manifest-'));
    fs.mkdirSync(path.join(root, 'content/patches/sdk-54'), { recursive: true });
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function write(value: unknown): void {
    fs.writeFileSync(
      path.join(root, 'content/patches/sdk-54/manifest.json'),
      `${JSON.stringify(value, null, 2)}\n`,
    );
  }

  it('loads a valid generated manifest', () => {
    write(validManifest);
    expect(loadSdk54PatchManifest(root)).toEqual(validManifest);
  });

  it('fails closed when the manifest is missing', () => {
    expect(() => loadSdk54PatchManifest(root)).toThrow(/manifest.*缺失.*sdk-54/i);
  });

  it.each([
    ['wrong schema', { ...validManifest, schemaVersion: 2 }, /schemaVersion/],
    ['unsafe patch path', {
      ...validManifest,
      patches: [{
        name: '@expo/cli', version: '54.0.27', file: '../cli.patch', sha256: 'a'.repeat(64),
        templates: ['default'], requiredFiles: [], probes: [], licenses: ['licenses/cli/LICENSE'],
      }],
    }, /patches\[0\]\.file/],
    ['invalid checksum', {
      ...validManifest,
      patches: [{
        name: '@expo/cli', version: '54.0.27', file: '@expo+cli+54.0.27.patch', sha256: 'bad',
        templates: ['default'], requiredFiles: [], probes: [], licenses: ['licenses/cli/LICENSE'],
      }],
    }, /sha256/],
    ['unknown template', {
      ...validManifest,
      patches: [{
        name: '@expo/cli', version: '54.0.27', file: '@expo+cli+54.0.27.patch', sha256: 'a'.repeat(64),
        templates: ['tabs'], requiredFiles: [], probes: [], licenses: ['licenses/cli/LICENSE'],
      }],
    }, /templates/],
    ['registry address', { ...validManifest, patchSet: 'https://registry.example/private' }, /patchSet/],
  ] as const)('rejects %s', (_name, manifest, expected) => {
    write(manifest);
    expect(() => loadSdk54PatchManifest(root)).toThrow(expected);
  });

  it('rejects duplicate patch packages', () => {
    const patch = {
      name: '@expo/cli', version: '54.0.27', file: '@expo+cli+54.0.27.patch', sha256: 'a'.repeat(64),
      templates: ['default'] as const, requiredFiles: [], probes: [], licenses: ['licenses/cli/LICENSE'],
    };
    write({ ...validManifest, patches: [patch, { ...patch, file: '@expo+cli+54.0.27-2.patch' }] });
    expect(() => loadSdk54PatchManifest(root)).toThrow(/重复.*@expo\/cli/);
  });
});

describe('assertManifestReadyForTemplate', () => {
  it('rejects a generation-stage manifest with no applicable patches', () => {
    expect(() => assertManifestReadyForTemplate(validManifest, 'default')).toThrow(/sdk54-mvp-1.*default.*patch/i);
  });
});
