import { expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildReleasePackageJson, loadReleaseManifest } from '../../src/sdk54/release-manifest';
import { classifyHarmonyProject } from '../../src/sdk54/project-state';
import { detectSdkVersion } from '../../src/version-matrix';

it('installs all selected release packages via aliases without patch-package', () => {
  const m = loadReleaseManifest();
  const pkg = buildReleasePackageJson({ name: 'test' }, 'default', m);
  expect(pkg.dependencies.expo).toBe('npm:@expo-oh/expo@54.0.37');
  expect(pkg.dependencies['@react-native-ohos/react-native-screens']).toBe('npm:@expo-oh/react-native-screens@4.9.0');
  expect(pkg.devDependencies['patch-package']).toBeUndefined();
  expect(pkg.overrides.expo).toBe('npm:@expo-oh/expo@54.0.37');
  expect(pkg.pnpm.overrides.expo).toBe('npm:@expo-oh/expo@54.0.37');
  expect(pkg.pnpm.overrides['@expo/metro-runtime']).toBe('6.1.2');
});

it('keeps npm override specs identical to direct dependencies without unresolved references', () => {
  for (const template of ['blank-typescript', 'default'] as const) {
    const pkg = buildReleasePackageJson({}, template, loadReleaseManifest());
    for (const [name, spec] of Object.entries(pkg.dependencies)) {
      expect(pkg.overrides[name]).toBe(spec);
    }
    expect(Object.values(pkg.overrides).some(spec => spec.startsWith('$'))).toBe(false);
  }
});

it('recognizes aliases and prevents falling through to legacy injector without state', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-test-'));
  try {
    for (const scope of ['expo-oh', 'scope-2345']) {
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { expo: `npm:@${scope}/expo@54.0.37` } }));
      expect(detectSdkVersion(dir)).toBe('sdk-54');
    }
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { expo: 'npm:@expo-oh/expo@54.0.37' } }));
    expect(classifyHarmonyProject(dir)).toBe('sdk54-scoped-packages');
    for (const version of ['53.0.0', '55.0.0']) {
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { expo: `npm:@expo-oh/expo@${version}` } }));
      expect(() => detectSdkVersion(dir)).toThrow(/不支持/);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

import { releaseRuntimeFailures } from '../../src/sdk54/release-runtime';

it('rejects an official package even if it claims the adapted version', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-identity-'));
  try {
    const m = loadReleaseManifest();
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(buildReleasePackageJson({}, 'blank-typescript', m)));
    for (const item of m.packages.filter(p => p.templates.includes('blank-typescript'))) {
      const root = path.join(dir, 'node_modules', item.installName);
      fs.mkdirSync(root, { recursive: true });
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: item.publishName, version: item.publishVersion }));
      item.requiredFiles = [];
      item.probes = [];
    }
    expect(releaseRuntimeFailures(dir, m, 'blank-typescript')).toEqual([]);
    const file = path.join(dir, 'node_modules/expo/package.json');
    fs.writeFileSync(file, JSON.stringify({ name: 'expo', version: '54.0.37' }));
    expect(releaseRuntimeFailures(dir, m, 'blank-typescript')).toContain('expo: unexpected identity expo@54.0.37');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
