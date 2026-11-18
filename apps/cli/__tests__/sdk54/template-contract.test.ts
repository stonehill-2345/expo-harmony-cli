import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadSdk54PatchManifest } from '../../src/sdk54/patch-manifest';
import { validateSdk54Template } from '../../src/sdk54/template-contract';
import type { Sdk54Template } from '../../src/sdk54/create-options';

const manifest = loadSdk54PatchManifest(path.resolve(__dirname, '../..'));

describe('validateSdk54Template', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-template-contract-'));
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it.each(['blank-typescript', 'default'] as const)('accepts the exact official %s contract', template => {
    writeValidTemplate(root, template);
    expect(validateSdk54Template(root, template, manifest)).toMatchObject({
      projectRoot: root,
      template,
      appName: 'My App',
      slug: 'my-app',
      packageJson: { name: 'my-app' },
      appJson: { expo: { name: 'My App', slug: 'my-app' } },
    });
  });

  it.each([
    ['missing package.json', 'blank-typescript', (dir: string) => fs.rmSync(path.join(dir, 'package.json')), /package\.json.*存在/],
    ['missing app.json', 'blank-typescript', (dir: string) => fs.rmSync(path.join(dir, 'app.json')), /app\.json.*存在/],
    ['missing blank entry', 'blank-typescript', (dir: string) => fs.rmSync(path.join(dir, 'App.tsx')), /App\.tsx.*存在/],
    ['wrong default main', 'default', (dir: string) => mutatePackage(dir, pkg => { pkg.main = 'index.js'; }), /main.*expo-router\/entry/],
    ['missing default modal', 'default', (dir: string) => fs.rmSync(path.join(dir, 'app/modal.tsx')), /app\/modal\.tsx.*存在/],
    ['wrong template Expo version', 'default', (dir: string) => mutatePackage(dir, pkg => { pkg.dependencies.expo = '~54.0.35'; }), /expo.*~54\.0\.35.*~54\.0\.36/],
    ['wrong React version', 'blank-typescript', (dir: string) => mutatePackage(dir, pkg => { pkg.dependencies.react = '19.0.0'; }), /react.*19\.0\.0.*19\.1\.0/],
    ['wrong React Native version', 'blank-typescript', (dir: string) => mutatePackage(dir, pkg => { pkg.dependencies['react-native'] = '0.81.4'; }), /react-native.*0\.81\.4.*0\.81\.5/],
    ['default Image import drift', 'default', (dir: string) => {
      const file = path.join(dir, 'app/(tabs)/index.tsx');
      fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(manifest.defaultImage.sourceImport, "import { Image } from 'react-native';"));
    }, /index\.tsx.*expo-image import/],
  ] as const)('rejects %s without changing the fixture', (_name, template, mutate, expected) => {
    writeValidTemplate(root, template);
    mutate(root);
    const before = treeHash(root);
    expect(() => validateSdk54Template(root, template, manifest)).toThrow(expected);
    expect(treeHash(root)).toBe(before);
  });

  it.each([
    'harmony',
    'index.harmony.js',
    'shims',
    'scripts/postinstall-harmony.js',
    'metro.config.js',
  ])('rejects pre-existing legacy bypass %s before writing', relativePath => {
    writeValidTemplate(root, 'default');
    const absolute = path.join(root, relativePath);
    if (path.extname(absolute)) {
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, 'legacy');
    } else {
      fs.mkdirSync(absolute, { recursive: true });
    }
    const before = treeHash(root);
    expect(() => validateSdk54Template(root, 'default', manifest)).toThrow(/template-contract.*禁止.*legacy|template-contract.*bypass/i);
    expect(treeHash(root)).toBe(before);
  });
});

function writeValidTemplate(root: string, template: Sdk54Template): void {
  const contract = manifest.templates[template];
  const dependencies: Record<string, string> = {
    expo: contract.sourceDependencies.expo,
    react: contract.sourceDependencies.react,
    'react-native': contract.sourceDependencies['react-native'],
  };
  const pkg: Record<string, unknown> = {
    name: 'my-app',
    dependencies,
    devDependencies: {},
  };
  if (template === 'default') pkg.main = 'expo-router/entry';
  fs.writeFileSync(path.join(root, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
  fs.writeFileSync(path.join(root, 'app.json'), JSON.stringify({ expo: { name: 'My App', slug: 'my-app' } }));

  if (template === 'blank-typescript') {
    fs.writeFileSync(path.join(root, 'App.tsx'), 'export default function App() { return null; }\n');
    return;
  }

  for (const relativePath of [
    'app/(tabs)/index.tsx',
    'app/(tabs)/explore.tsx',
    'app/(tabs)/_layout.tsx',
    'app/_layout.tsx',
    'app/modal.tsx',
  ]) {
    const absolute = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    const content = manifest.defaultImage.files.includes(relativePath)
      ? `${manifest.defaultImage.sourceImport}\nexport default function Screen() { return <Image source={{ uri: 'x' }} />; }\n`
      : 'export default function Screen() { return null; }\n';
    fs.writeFileSync(absolute, content);
  }
}

function mutatePackage(root: string, mutate: (pkg: any) => void): void {
  const file = path.join(root, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
  mutate(pkg);
  fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
}

function treeHash(root: string): string {
  const hash = createHash('sha256');
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      hash.update(relative);
      if (entry.isDirectory()) visit(absolute);
      else hash.update(fs.readFileSync(absolute));
    }
  };
  visit(root);
  return hash.digest('hex');
}
