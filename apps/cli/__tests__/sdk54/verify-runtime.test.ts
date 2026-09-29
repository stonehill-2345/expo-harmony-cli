import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { assertSdk54Runtime, collectSdk54RuntimeFailures } from '../../src/sdk54/verify-runtime';
import type { Sdk54PatchManifest } from '../../src/sdk54/patch-manifest';

const packages = [
  ['@expo/cli', '54.0.27', 'build/bin/cli.js', "module.exports = { commands: ['run:harmony', 'prebuild'] };\n", 'run:harmony'],
  ['@expo/metro-config', '54.0.17', 'build/withHarmony.js', "module.exports = { platforms: ['harmony'] };\n", 'export:platforms'],
  ['expo-modules-autolinking', '3.0.27', 'build/platforms/harmony/index.js', "module.exports = { platform: 'harmony' };\n", 'export:platform'],
] as const;

describe('SDK54 runtime probes', () => {
  let root: string;
  let manifest: Sdk54PatchManifest;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-runtime-'));
    const dependencies: Record<string, string> = {};
    const patches: Sdk54PatchManifest['patches'] = [];
    for (const [name, version, requiredFile, source, expected] of packages) {
      dependencies[name] = version;
      const packageRoot = path.join(root, 'node_modules', name);
      fs.mkdirSync(path.join(packageRoot, path.dirname(requiredFile)), { recursive: true });
      fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ name, version }));
      fs.writeFileSync(path.join(packageRoot, requiredFile), source);
      patches.push({
        name, version, file: `${name.replaceAll('/', '+')}+${version}.patch`, sha256: 'a'.repeat(64),
        templates: ['default'], requiredFiles: [requiredFile],
        probes: [{ kind: 'require', target: requiredFile, expected }], licenses: ['licenses/x/LICENSE'],
      });
    }
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies }));
    manifest = {
      schemaVersion: 1, patchSet: 'sdk54-mvp-1', createExpoApp: '5.0.0', patchPackageVersion: '8.0.0',
      catalog: { expo: Object.fromEntries(packages.map(([name, version]) => [name, version])), external: {} },
      templates: {
        'blank-typescript': { expoPackages: [], externalPackages: [], dependencies: {}, devDependencies: {} },
        default: { expoPackages: packages.map(([name]) => name), externalPackages: [], dependencies: {}, devDependencies: {} },
      },
      defaultImage: { files: [], sourceImport: 'x', replacementImport: 'y' }, patches,
    };
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('passes exact versions, files, and executable probes', () => {
    expect(collectSdk54RuntimeFailures(root, manifest)).toEqual([]);
    expect(() => assertSdk54Runtime(root, manifest)).not.toThrow();
  });

  it('reports an exact version mismatch', () => {
    fs.writeFileSync(path.join(root, 'node_modules/@expo/cli/package.json'), JSON.stringify({ name: '@expo/cli', version: '54.0.26' }));
    expect(collectSdk54RuntimeFailures(root, manifest)).toContainEqual(expect.objectContaining({
      stage: 'version', packageName: '@expo/cli', expected: '54.0.27', actual: '54.0.26',
    }));
  });

  it('reports a missing patched runtime file', () => {
    fs.rmSync(path.join(root, 'node_modules/@expo/metro-config/build/withHarmony.js'));
    expect(collectSdk54RuntimeFailures(root, manifest)).toContainEqual(expect.objectContaining({
      stage: 'file', packageName: '@expo/metro-config',
    }));
  });

  it('rejects comment-only or dead Harmony markers by executing require probes', () => {
    fs.writeFileSync(
      path.join(root, 'node_modules/@expo/cli/build/bin/cli.js'),
      "// run:harmony\nif (false) module.exports = { commands: ['run:harmony'] };\nmodule.exports = { commands: [] };\n",
    );
    expect(collectSdk54RuntimeFailures(root, manifest)).toContainEqual(expect.objectContaining({
      stage: 'probe', packageName: '@expo/cli', detail: expect.stringContaining('postinstall'),
    }));
  });

  it.each(['index.harmony.js', 'shims', 'scripts/postinstall-harmony.js', 'metro.config.js'])
  ('rejects legacy bypass %s', relativePath => {
    const absolute = path.join(root, relativePath);
    if (path.extname(absolute)) { fs.mkdirSync(path.dirname(absolute), { recursive: true }); fs.writeFileSync(absolute, 'legacy'); }
    else fs.mkdirSync(absolute, { recursive: true });
    expect(collectSdk54RuntimeFailures(root, manifest)).toContainEqual(expect.objectContaining({
      stage: 'bypass', detail: expect.stringContaining(relativePath),
    }));
  });

  it('assert error includes recovery guidance', () => {
    fs.rmSync(path.join(root, 'node_modules/@expo/cli/build/bin/cli.js'));
    expect(() => assertSdk54Runtime(root, manifest)).toThrow(/重新安装.*postinstall/);
  });
});
