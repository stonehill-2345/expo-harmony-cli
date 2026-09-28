jest.unmock('fs');
jest.unmock('fs/promises');
jest.unmock('node:fs');
jest.unmock('node:fs/promises');

import fs from 'fs';
import os from 'os';
import path from 'path';

import { ExpoModuleConfig } from '../../ExpoModuleConfig';
import { generatePackageListAsync, resolveModuleAsync } from '../harmony/harmony';
import { renderExpoModulesAppOverlays } from '../harmony/nativeProject';

const repoRoot = path.resolve(__dirname, '../../../../..');

const expectedPackages = [
  {
    packageName: 'expo-web-browser',
    kind: 'ability-lifecycle',
    cppPackageClass: 'expo::webbrowser::harmony::ExpoWebBrowserPackage',
    etsPackageClass: 'ExpoWebBrowserPackage',
    cmakeTarget: 'rnoh_expo_web_browser',
  },
  {
    packageName: 'expo-modules-core',
    kind: 'turbo-module',
    cppPackageClass: 'expo::harmony::ExpoModulesCorePackage',
    etsPackageClass: 'ExpoModulesCorePackage',
    cmakeTarget: 'rnoh_expo_modules_core',
  },
  {
    packageName: 'expo-constants',
    kind: 'turbo-module',
    cppPackageClass: 'expo::constants::harmony::ExponentConstantsPackage',
    etsPackageClass: 'ExponentConstantsPackage',
    cmakeTarget: 'rnoh_expo_constants',
  },
  {
    packageName: 'expo-asset',
    kind: 'turbo-module',
    cppPackageClass: 'expo::asset::harmony::ExpoAssetPackage',
    etsPackageClass: 'ExpoAssetPackage',
    cmakeTarget: 'rnoh_expo_asset',
  },
  {
    packageName: 'expo-linking',
    kind: 'ability-lifecycle',
    cppPackageClass: 'expo::linking::harmony::ExpoLinkingPackage',
    etsPackageClass: 'ExpoLinkingPackage',
    cmakeTarget: 'rnoh_expo_linking',
  },
  {
    packageName: 'expo-font',
    kind: 'turbo-module',
    cppPackageClass: 'expo::font::harmony::ExpoFontLoaderPackage',
    etsPackageClass: 'ExpoFontLoaderPackage',
    cmakeTarget: 'rnoh_expo_font',
  },
  {
    packageName: 'expo-splash-screen',
    kind: 'ability-lifecycle',
    cppPackageClass: 'expo::splashscreen::harmony::ExpoSplashScreenPackage',
    etsPackageClass: 'ExpoSplashScreenPackage',
    cmakeTarget: 'rnoh_expo_splash_screen',
  },
  {
    packageName: 'expo-system-ui',
    kind: 'turbo-module',
    cppPackageClass: 'expo::systemui::harmony::ExpoSystemUIPackage',
    etsPackageClass: 'ExpoSystemUIPackage',
    cmakeTarget: 'rnoh_expo_system_ui',
  },
] as const;

async function resolveFirstPartyPackage(packageName: string) {
  const packageRoot = path.join(repoRoot, 'packages', packageName);
  const packageJson = JSON.parse(
    await fs.promises.readFile(path.join(packageRoot, 'package.json'), 'utf8')
  );
  const rawConfig = JSON.parse(
    await fs.promises.readFile(path.join(packageRoot, 'expo-module.config.json'), 'utf8')
  );

  return resolveModuleAsync(packageName, {
    name: packageName,
    path: packageRoot,
    version: packageJson.version,
    config: new ExpoModuleConfig(rawConfig),
  });
}

describe('first-party Harmony metadata', () => {
  it.each(expectedPackages)(
    'resolves $packageName against its real native source tree',
    async ({ packageName, kind, cppPackageClass, etsPackageClass, cmakeTarget }) => {
      const result = await resolveFirstPartyPackage(packageName);

      expect(result).toMatchObject({
        packageName,
        packageVersion: expect.any(String),
        packageRoot: path.join(repoRoot, 'packages', packageName),
        kind,
        cpp: { packageClass: cppPackageClass, cmakeTarget },
        ets: { packageClass: etsPackageClass, importPath: `${packageName}/harmony` },
      });
    }
  );

  it('models Linking Ability lifecycle explicitly', async () => {
    const result = await resolveFirstPartyPackage('expo-linking');

    expect(result?.lifecycleDependencies).toEqual([
      {
        localName: 'linkingLifecycle',
        className: 'ExpoLinkingLifecycle',
        importPath: 'expo-linking/harmony',
        appStorageKey: 'ExpoLinkingLifecycle',
      },
    ]);
  });

  it('models the Splash controller and ArkUI overlay explicitly', async () => {
    const result = await resolveFirstPartyPackage('expo-splash-screen');

    expect(result?.lifecycleDependencies).toEqual([
      {
        localName: 'splashScreenController',
        className: 'ExpoSplashScreenLifecycle',
        importPath: 'expo-splash-screen/harmony',
        appStorageKey: 'ExpoSplashScreenController',
        arkUIOverlay: {
          className: 'ExpoSplashScreenView',
          importPath: 'expo-splash-screen/harmony',
          controllerProperty: 'controller',
        },
      },
    ]);
  });

  it('marks expo-status-bar as RNOH reuse without an Expo native package', async () => {
    const result = await resolveFirstPartyPackage('expo-status-bar');

    expect(result).toEqual({
      packageName: 'expo-status-bar',
      packageVersion: '3.0.9',
      packageRoot: path.join(repoRoot, 'packages', 'expo-status-bar'),
      kind: 'rnoh-reuse',
      reason: 'Uses the StatusBarManager supplied by RNOH.',
      lifecycleDependencies: [],
    });
  });

  it('generates all current first-party native packages and the Splash overlay', async () => {
    const modules = await Promise.all([
      ...expectedPackages.map(({ packageName }) => resolveFirstPartyPackage(packageName)),
      resolveFirstPartyPackage('expo-status-bar'),
    ]);
    const resolvedModules = modules.filter((module) => module != null);
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-harmony-first-party-'));

    try {
      await generatePackageListAsync(resolvedModules, output, 'expo.modules');
      const cpp = fs.readFileSync(path.join(output, 'ExpoModulesPackages.cpp'), 'utf8');
      const ets = fs.readFileSync(path.join(output, 'ExpoModulesPackages.ets'), 'utf8');
      const cmake = fs.readFileSync(path.join(output, 'expo-modules.cmake'), 'utf8');
      const overlays = renderExpoModulesAppOverlays(resolvedModules);

      for (const packageName of [
        'ExpoAssetPackage',
        'ExponentConstantsPackage',
        'ExpoFontLoaderPackage',
        'ExpoLinkingPackage',
        'ExpoModulesCorePackage',
        'ExpoSplashScreenPackage',
        'ExpoSystemUIPackage',
      ]) {
        expect(cpp).toContain(packageName);
        expect(ets).toContain(packageName);
      }
      expect(cmake).toContain('rnoh_expo_splash_screen');
      expect(cmake).toContain('rnoh_expo_system_ui');
      expect(overlays).toContain('ExpoSplashScreenView({ controller:');
      expect(overlays).toContain('ExpoWebBrowserView({ controller:');
      // ArkTS rejects multiple conditional root nodes when both overlays are installed.
      expect(overlays).toContain('build() {\n    Stack() {');
      expect(overlays).toContain('.hitTestBehavior(HitTestMode.None)');
      expect(ets).toContain('new ExpoWebBrowserPackage(ctx, webBrowserController)');
      expect(cmake).toContain('rnoh_expo_web_browser');
      expect(cpp).toContain('expo-status-bar: skipped native package generation');
    } finally {
      fs.rmSync(output, { recursive: true, force: true });
    }
  });
});
