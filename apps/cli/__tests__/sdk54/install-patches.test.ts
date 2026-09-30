import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadSdk54PatchManifest, type Sdk54PatchManifest } from '../../src/sdk54/patch-manifest';
import { mergePatchPostinstall, prepareSdk54PatchInstall } from '../../src/sdk54/install-patches';

const baseManifest = loadSdk54PatchManifest(path.resolve(__dirname, '../..'));
const PATCH_COMMAND = 'patch-package --error-on-fail --error-on-warn';

describe('mergePatchPostinstall', () => {
  it('adds the exact command when postinstall is absent', () => {
    expect(mergePatchPostinstall(undefined)).toBe(PATCH_COMMAND);
  });

  it('preserves an existing command before patch-package', () => {
    expect(mergePatchPostinstall('echo ready')).toBe(`echo ready && ${PATCH_COMMAND}`);
  });

  it('is idempotent when the exact command is already present', () => {
    expect(mergePatchPostinstall(PATCH_COMMAND)).toBe(PATCH_COMMAND);
    expect(mergePatchPostinstall(`echo ready && ${PATCH_COMMAND}`)).toBe(`echo ready && ${PATCH_COMMAND}`);
  });

  it.each([
    'patch-package',
    'patch-package --partial',
    'echo ready && patch-package --error-on-fail --error-on-warn --reverse',
  ])('rejects conflicting patch-package command %s', existing => {
    expect(() => mergePatchPostinstall(existing)).toThrow(/postinstall.*冲突/);
  });
});

describe('prepareSdk54PatchInstall', () => {
  let projectRoot: string;
  let packageRoot: string;
  let manifest: Sdk54PatchManifest;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-patch-project-'));
    packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-patch-source-'));
    const sourceDir = path.join(packageRoot, 'content/patches/sdk-54');
    fs.mkdirSync(path.join(sourceDir, 'licenses/expo'), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'expo+54.0.37.patch'), 'diff --git a/build/a.js b/build/a.js\n');
    fs.writeFileSync(path.join(sourceDir, 'licenses/expo/LICENSE'), 'MIT\n');
    fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({
      name: 'my-app',
      scripts: { postinstall: 'echo ready' },
      dependencies: { expo: '54.0.37', react: '19.1.1', 'react-native': '0.82.1' },
    }, null, 2) + '\n');
    manifest = manifestWithPatch(packageRoot);
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(packageRoot, { recursive: true, force: true });
  });

  it('copies applicable checked patches and licenses while updating package.json atomically', () => {
    const first = prepareSdk54PatchInstall(projectRoot, 'default', manifest, packageRoot);
    expect(first).toEqual({ patchFiles: ['patches/expo+54.0.37.patch'], packageJsonChanged: true });
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
    expect(pkg.scripts.postinstall).toBe(`echo ready && ${PATCH_COMMAND}`);
    expect(pkg.devDependencies['patch-package']).toBe('8.0.0');
    expect(fs.readFileSync(path.join(projectRoot, 'patches/expo+54.0.37.patch'), 'utf8')).toContain('build/a.js');
    expect(fs.readFileSync(path.join(projectRoot, 'patches/licenses/expo/LICENSE'), 'utf8')).toBe('MIT\n');
    expect(fs.existsSync(path.join(projectRoot, 'scripts/postinstall-harmony.js'))).toBe(false);

    const before = snapshot(projectRoot);
    const second = prepareSdk54PatchInstall(projectRoot, 'default', manifest, packageRoot);
    expect(second).toEqual({ patchFiles: ['patches/expo+54.0.37.patch'], packageJsonChanged: false });
    expect(snapshot(projectRoot)).toBe(before);
  });

  it.each([
    ['missing source', (value: Sdk54PatchManifest) => { value.patches[0].file = 'missing.patch'; }],
    ['checksum mismatch', (value: Sdk54PatchManifest) => { value.patches[0].sha256 = '0'.repeat(64); }],
    ['version mismatch', (value: Sdk54PatchManifest) => { value.patches[0].version = '54.0.36'; }],
  ])('fails closed for %s before changing the project', (_name, mutate) => {
    mutate(manifest);
    const before = snapshot(projectRoot);
    expect(() => prepareSdk54PatchInstall(projectRoot, 'default', manifest, packageRoot)).toThrow(/patch|版本|checksum|缺失/i);
    expect(snapshot(projectRoot)).toBe(before);
  });

  it.each([
    ['pnpm patchedDependencies', (pkg: any) => { pkg.pnpm = { patchedDependencies: { expo: 'patches/expo.patch' } }; }],
    ['Yarn patch protocol', (pkg: any) => { pkg.dependencies.foo = 'patch:foo@npm%3A1.0.0#./foo.patch'; }],
  ])('rejects conflicting patch manager: %s', (_name, mutate) => {
    const packageFile = path.join(projectRoot, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
    mutate(pkg);
    fs.writeFileSync(packageFile, JSON.stringify(pkg, null, 2) + '\n');
    const before = snapshot(projectRoot);
    expect(() => prepareSdk54PatchInstall(projectRoot, 'default', manifest, packageRoot)).toThrow(/patch.*冲突/i);
    expect(snapshot(projectRoot)).toBe(before);
  });
});

function manifestWithPatch(packageRoot: string): Sdk54PatchManifest {
  const patch = fs.readFileSync(path.join(packageRoot, 'content/patches/sdk-54/expo+54.0.37.patch'));
  return structuredClone({
    ...baseManifest,
    patches: [{
      name: 'expo',
      version: '54.0.37',
      file: 'expo+54.0.37.patch',
      sha256: createHash('sha256').update(patch).digest('hex'),
      templates: ['blank-typescript', 'default'],
      requiredFiles: [],
      probes: [],
      licenses: ['licenses/expo/LICENSE'],
    }],
  });
}

function snapshot(root: string): string {
  const entries: string[] = [];
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else entries.push(`${path.relative(root, absolute)}\0${fs.readFileSync(absolute).toString('base64')}`);
    }
  };
  visit(root);
  return entries.join('\n');
}
