jest.unmock('fs');
jest.unmock('fs/promises');
jest.unmock('node:fs');
jest.unmock('node:fs/promises');

import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import type { ModuleDescriptorHarmony } from '../../types';
import {
  copyHarmonyTemplateMediaAsync,
  prepareHarmonyNativeProjectAsync,
  prepareRnohCompatibilityHarAsync,
  renderExpoModulesAppOverlays,
  renderExpoModulesLifecycle,
  RNOH_INPUT_HAR_SHA256,
  stageHarmonyEtsPackagesAsync,
  syncHarmonyNativeProjectAsync,
} from '../harmony/nativeProject';

const cpp = {
  packageClass: 'example::RenamedPackage',
  header: 'RenamedPackage.h',
  cmakeTarget: 'renamed_package',
  cmakePath: '/app/node_modules/renamed-linking-package/harmony/src/main/cpp',
};
const ets = {
  packageClass: 'RenamedPackage',
  importPath: 'renamed-linking-package/harmony',
  entrypoint: '/app/node_modules/renamed-linking-package/harmony/index.ets',
};

function lifecycleModule(
  packageName: string,
  localName: string,
  appStorageKey: string
): ModuleDescriptorHarmony {
  return {
    packageName,
    packageVersion: '1.0.0',
    packageRoot: `/app/node_modules/${packageName}`,
    kind: 'ability-lifecycle',
    cpp,
    ets,
    lifecycleDependencies: [
      {
        localName,
        className: 'ExpoLinkingLifecycle',
        importPath: 'renamed-linking-package/harmony',
        appStorageKey,
      },
    ],
  };
}

describe(renderExpoModulesLifecycle, () => {
  it('renders metadata-driven Ability lifecycle wiring without package-name inference', () => {
    const output = renderExpoModulesLifecycle([
      lifecycleModule('renamed-linking-package', 'linkingLifecycle', 'ExpoLinkingLifecycle'),
    ]);

    expect(output).toContain("import { Want } from '@kit.AbilityKit';");
    expect(output).toContain(
      "import { ExpoLinkingLifecycle } from 'renamed-linking-package/harmony';"
    );
    expect(output).toContain('private readonly linkingLifecycle = new ExpoLinkingLifecycle();');
    expect(output).toContain('this.linkingLifecycle.onCreate(want);');
    expect(output).toContain(
      "AppStorage.setOrCreate('ExpoLinkingLifecycle', this.linkingLifecycle);"
    );
    expect(output).toContain('this.linkingLifecycle.onNewWant(want);');
    expect(output).toContain('this.linkingLifecycle.onDestroy();');
    expect(output).toContain("AppStorage.delete('ExpoLinkingLifecycle');");
    expect(output).not.toContain("packageName === 'expo-linking'");
  });

  it('renders a valid no-op lifecycle adapter when no module needs Ability callbacks', () => {
    const output = renderExpoModulesLifecycle([]);

    expect(output).toContain('export class ExpoModulesLifecycle');
    expect(output).toContain('public onCreate(_want: Want): void {}');
    expect(output).toContain('public onNewWant(_want: Want): void {}');
    expect(output).toContain('public onDestroy(): void {}');
  });

  it.each([
    {
      label: 'local name',
      second: lifecycleModule('second-package', 'linkingLifecycle', 'SecondLifecycle'),
      message: 'duplicate lifecycle localName "linkingLifecycle"',
    },
    {
      label: 'AppStorage key',
      second: lifecycleModule('second-package', 'secondLifecycle', 'ExpoLinkingLifecycle'),
      message: 'duplicate lifecycle appStorageKey "ExpoLinkingLifecycle"',
    },
  ])('rejects a duplicate cross-package $label', ({ second, message }) => {
    expect(() =>
      renderExpoModulesLifecycle([
        lifecycleModule('first-package', 'linkingLifecycle', 'ExpoLinkingLifecycle'),
        second,
      ])
    ).toThrow(message);
  });
});

describe(renderExpoModulesAppOverlays, () => {
  it('renders a metadata-driven Ability-owned ArkUI overlay', () => {
    const module = lifecycleModule(
      'expo-splash-screen',
      'splashScreenController',
      'ExpoSplashScreenController'
    );
    module.lifecycleDependencies[0].className = 'ExpoSplashScreenLifecycle';
    module.lifecycleDependencies[0].importPath = 'expo-splash-screen/harmony';
    module.lifecycleDependencies[0].arkUIOverlay = {
      className: 'ExpoSplashScreenView',
      importPath: 'expo-splash-screen/harmony',
      controllerProperty: 'controller',
    };

    const output = renderExpoModulesAppOverlays([module]);

    expect(output).toContain(
      "import { ExpoSplashScreenLifecycle, ExpoSplashScreenView } from 'expo-splash-screen/harmony';"
    );
    expect(output).toContain(
      "@StorageLink('ExpoSplashScreenController') private splashScreenController: ExpoSplashScreenLifecycle | undefined = undefined;"
    );
    expect(output).toContain(
      'ExpoSplashScreenView({ controller: this.splashScreenController })'
    );
  });

  it('renders a zero-size component when no module declares an overlay', () => {
    const output = renderExpoModulesAppOverlays([]);

    expect(output).toContain('export struct ExpoModulesAppOverlays');
    expect(output).toContain('.width(0)');
    expect(output).toContain('.height(0)');
  });
});

describe(prepareHarmonyNativeProjectAsync, () => {
  const lockedInputHar = process.env.RNOH_INPUT_HAR;
  const lockedOutputHar = process.env.RNOH_OUTPUT_HAR;

  (lockedInputHar && lockedOutputHar ? it : it.skip)(
    'assembles a blank app native project from the template and generated files',
    async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-harmony-project-'));
      try {
        const packageRoot = path.join(root, 'node_modules', 'expo-asset');
        const corePackageRoot = path.join(root, 'node_modules', 'expo-modules-core');
        fs.mkdirSync(path.join(packageRoot, 'harmony/src/main/ets'), { recursive: true });
        fs.mkdirSync(path.join(packageRoot, 'harmony/src/main/cpp'), { recursive: true });
        fs.mkdirSync(path.join(corePackageRoot, 'harmony/rnoh-compat'), { recursive: true });
        const appConfigScriptPath = path.join(
          root,
          'node_modules/expo-constants/scripts/getAppConfig.js'
        );
        fs.mkdirSync(path.dirname(appConfigScriptPath), { recursive: true });
        fs.writeFileSync(appConfigScriptPath, '# test\n');
        fs.writeFileSync(
          path.join(packageRoot, 'harmony/index.ets'),
          "export { ExpoAssetPackage } from './src/main/ets/ExpoAssetPackage';\n"
        );
        fs.writeFileSync(
          path.join(packageRoot, 'harmony/src/main/ets/ExpoAssetPackage.ets'),
          'export class ExpoAssetPackage {}\n'
        );
        fs.writeFileSync(
          path.join(corePackageRoot, 'harmony/rnoh-compat/prepare_har.py'),
          '# test\n'
        );
        const module: ModuleDescriptorHarmony = {
          packageName: 'expo-asset',
          packageVersion: '12.0.13',
          packageRoot,
          kind: 'turbo-module',
          cpp: {
            packageClass: 'expo::asset::harmony::ExpoAssetPackage',
            header: 'ExpoAssetPackage.h',
            cmakeTarget: 'rnoh_expo_asset',
            cmakePath: path.join(packageRoot, 'harmony/src/main/cpp'),
          },
          ets: {
            packageClass: 'ExpoAssetPackage',
            importPath: 'expo-asset/harmony',
            entrypoint: path.join(packageRoot, 'harmony/index.ets'),
          },
          lifecycleDependencies: [],
        };

        const result = await prepareHarmonyNativeProjectAsync({
          projectRoot: root,
          appName: 'Blank TypeScript',
          bundleName: 'dev.expo.blanktypescript',
          modules: [module],
          inputHarPath: lockedInputHar!,
          corePackageRoot,
          runCompatibilityTool: async ({ outputHarPath }) => {
            fs.copyFileSync(lockedOutputHar!, outputHarPath);
            fs.copyFileSync(`${lockedOutputHar!}.manifest.json`, `${outputHarPath}.manifest.json`);
          },
          runAppConfigGenerator: async ({ destinationDir, projectRoot, scriptPath }) => {
            expect(projectRoot).toBe(root);
            expect(scriptPath).toBe(appConfigScriptPath);
            fs.writeFileSync(
              path.join(destinationDir, 'app.config'),
              JSON.stringify({ name: 'Blank TypeScript' })
            );
          },
        });

        expect(result.generatedFiles).toEqual({
          cpp: path.join(root, 'harmony/entry/src/main/cpp/generated/ExpoModulesPackages.cpp'),
          ets: path.join(root, 'harmony/entry/src/main/ets/generated/ExpoModulesPackages.ets'),
          cmake: path.join(root, 'harmony/entry/src/main/cpp/generated/expo-modules.cmake'),
          lifecycle: path.join(
            root,
            'harmony/entry/src/main/ets/generated/ExpoModulesLifecycle.ets'
          ),
          overlays: path.join(
            root,
            'harmony/entry/src/main/ets/generated/ExpoModulesAppOverlays.ets'
          ),
        });
        expect(fs.readFileSync(path.join(root, 'harmony/AppScope/app.json5'), 'utf8')).toContain(
          'dev.expo.blanktypescript'
        );
        expect(
          fs.readFileSync(path.join(root, 'harmony/entry/src/main/ets/pages/Index.ets'), 'utf8')
        ).toContain('Blank TypeScript');
        expect(
          JSON.parse(
            fs.readFileSync(
              path.join(root, 'harmony/entry/src/main/resources/rawfile/app.config'),
              'utf8'
            )
          )
        ).toEqual({ name: 'Blank TypeScript' });

        const abilityPath = path.join(
          root,
          'harmony/entry/src/main/ets/entryability/EntryAbility.ets'
        );
        fs.appendFileSync(abilityPath, '\n// USER_MARKER\n');
        fs.mkdirSync(path.join(root, 'harmony/expo-modules/stale-package'), {
          recursive: true,
        });
        fs.writeFileSync(path.join(root, 'harmony/expo-modules/stale-package/old.ets'), 'stale\n');
        fs.writeFileSync(result.generatedFiles.lifecycle, 'stale generated\n');

        await syncHarmonyNativeProjectAsync({
          projectRoot: root,
          appName: 'Blank TypeScript',
          bundleName: 'dev.expo.blanktypescript',
          modules: [module],
          inputHarPath: lockedInputHar!,
          corePackageRoot,
          runCompatibilityTool: async () => {
            throw new Error('existing valid HAR must be reused');
          },
          runAppConfigGenerator: async ({ destinationDir }) => {
            fs.writeFileSync(
              path.join(destinationDir, 'app.config'),
              JSON.stringify({ name: 'Synced' })
            );
          },
        });

        expect(fs.readFileSync(abilityPath, 'utf8')).toContain('// USER_MARKER');
        expect(fs.existsSync(path.join(root, 'harmony/expo-modules/stale-package'))).toBe(false);
        expect(fs.readFileSync(result.generatedFiles.lifecycle, 'utf8')).toContain(
          'export class ExpoModulesLifecycle'
        );
        expect(
          JSON.parse(
            fs.readFileSync(
              path.join(root, 'harmony/entry/src/main/resources/rawfile/app.config'),
              'utf8'
            )
          )
        ).toEqual({ name: 'Synced' });
        await expect(
          prepareHarmonyNativeProjectAsync({
            projectRoot: root,
            appName: 'Again',
            bundleName: 'dev.expo.again',
            modules: [module],
            inputHarPath: lockedInputHar!,
            corePackageRoot,
          })
        ).rejects.toThrow('already exists');
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  );
});

describe(stageHarmonyEtsPackagesAsync, () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-harmony-stage-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('stages only the configured ETS entrypoint and production source tree', async () => {
    const packageRoot = path.join(root, 'node_modules', 'expo-asset');
    const harmonyRoot = path.join(root, 'harmony');
    fs.mkdirSync(path.join(packageRoot, 'harmony', 'src', 'main', 'ets'), { recursive: true });
    fs.mkdirSync(path.join(packageRoot, 'harmony', 'example'), { recursive: true });
    fs.mkdirSync(path.join(harmonyRoot, 'entry'), { recursive: true });
    fs.writeFileSync(
      path.join(packageRoot, 'harmony', 'index.ets'),
      "export { ExpoAssetPackage } from './src/main/ets/ExpoAssetPackage';\n"
    );
    fs.writeFileSync(
      path.join(packageRoot, 'harmony', 'src', 'main', 'ets', 'ExpoAssetPackage.ets'),
      'export class ExpoAssetPackage {}\n'
    );
    fs.writeFileSync(path.join(packageRoot, 'harmony', 'example', 'ignored.ets'), 'bad\n');
    fs.writeFileSync(
      path.join(harmonyRoot, 'entry', 'oh-package.json5'),
      JSON.stringify({ name: 'entry', version: '1.0.0', dependencies: {} })
    );
    fs.writeFileSync(
      path.join(harmonyRoot, 'build-profile.json5'),
      JSON.stringify({ modules: [{ name: 'entry', srcPath: './entry', targets: [] }] })
    );

    const dependencies = await stageHarmonyEtsPackagesAsync(
      [
        {
          packageName: 'expo-asset',
          packageVersion: '12.0.13',
          packageRoot,
          kind: 'turbo-module',
          cpp: { ...cpp, cmakePath: path.join(packageRoot, 'harmony/src/main/cpp') },
          ets: {
            packageClass: 'ExpoAssetPackage',
            importPath: 'expo-asset/harmony',
            entrypoint: path.join(packageRoot, 'harmony/index.ets'),
          },
          lifecycleDependencies: [],
        },
      ],
      harmonyRoot
    );

    const stagedRoot = path.join(harmonyRoot, 'expo-modules', 'expo-asset');
    expect(fs.existsSync(path.join(stagedRoot, 'harmony/index.ets'))).toBe(true);
    expect(fs.existsSync(path.join(stagedRoot, 'harmony/src/main/ets/ExpoAssetPackage.ets'))).toBe(
      true
    );
    expect(fs.existsSync(path.join(stagedRoot, 'harmony/example/ignored.ets'))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(stagedRoot, 'oh-package.json5'), 'utf8'))).toEqual({
      name: 'expo-asset',
      version: '12.0.13',
      main: 'harmony/index.ets',
      dependencies: {
        '@rnoh/react-native-openharmony': 'file:../../dependencies/react_native_openharmony.har',
      },
    });
    expect(
      JSON.parse(fs.readFileSync(path.join(stagedRoot, 'src/main/module.json5'), 'utf8'))
    ).toEqual({
      module: { name: 'expo_asset', type: 'har', deviceTypes: ['default'] },
    });
    expect(fs.readFileSync(path.join(stagedRoot, 'hvigorfile.ts'), 'utf8')).toContain('harTasks');
    expect(
      JSON.parse(fs.readFileSync(path.join(stagedRoot, 'build-profile.json5'), 'utf8'))
    ).toMatchObject({
      apiType: 'stageMode',
      targets: [{ name: 'default', runtimeOS: 'HarmonyOS' }],
    });
    expect(dependencies).toEqual({ 'expo-asset': 'file:../expo-modules/expo-asset' });
    expect(
      JSON.parse(fs.readFileSync(path.join(harmonyRoot, 'entry/oh-package.json5'), 'utf8'))
        .dependencies
    ).toEqual({
      '@rnoh/react-native-openharmony': 'file:../dependencies/react_native_openharmony.har',
      'expo-asset': 'file:../expo-modules/expo-asset',
    });
    expect(
      JSON.parse(fs.readFileSync(path.join(harmonyRoot, 'build-profile.json5'), 'utf8')).modules
    ).toContainEqual({
      name: 'expo_asset',
      srcPath: './expo-modules/expo-asset',
      targets: [{ name: 'default', applyToProducts: ['default'] }],
    });
  });
});

describe(prepareRnohCompatibilityHarAsync, () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-harmony-har-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('fails with the missing original HAR path', async () => {
    const inputHarPath = path.join(root, 'missing.har');
    await expect(
      prepareRnohCompatibilityHarAsync({
        harmonyRoot: path.join(root, 'harmony'),
        inputHarPath,
        corePackageRoot: path.join(root, 'expo-modules-core'),
      })
    ).rejects.toThrow(inputHarPath);
  });

  it('fails closed without overwriting an unknown existing output', async () => {
    const harmonyRoot = path.join(root, 'harmony');
    const outputHarPath = path.join(harmonyRoot, 'dependencies/react_native_openharmony.har');
    fs.mkdirSync(path.dirname(outputHarPath), { recursive: true });
    fs.writeFileSync(outputHarPath, 'unknown');

    await expect(
      prepareRnohCompatibilityHarAsync({
        harmonyRoot,
        inputHarPath: outputHarPath,
        corePackageRoot: path.join(root, 'expo-modules-core'),
      })
    ).rejects.toThrow(RNOH_INPUT_HAR_SHA256);
    expect(fs.readFileSync(outputHarPath, 'utf8')).toBe('unknown');
  });

  const lockedInputHar = process.env.RNOH_INPUT_HAR;
  (lockedInputHar ? it : it.skip)(
    'invokes the SDK compatibility tool with project-local output arguments',
    async () => {
      const harmonyRoot = path.join(root, 'harmony');
      const corePackageRoot = path.join(root, 'expo-modules-core');
      const scriptPath = path.join(corePackageRoot, 'harmony/rnoh-compat/prepare_har.py');
      fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
      fs.writeFileSync(scriptPath, '# test\n');
      let invocation: unknown;

      await expect(
        prepareRnohCompatibilityHarAsync({
          harmonyRoot,
          inputHarPath: lockedInputHar!,
          corePackageRoot,
          pythonExecutable: 'python-test',
          runCompatibilityTool: async (args) => {
            invocation = args;
            fs.writeFileSync(args.outputHarPath, 'invalid output');
            fs.writeFileSync(`${args.outputHarPath}.manifest.json`, '{}');
          },
        })
      ).rejects.toThrow('output SHA256 mismatch');

      expect(invocation).toEqual({
        pythonExecutable: 'python-test',
        scriptPath,
        inputHarPath: lockedInputHar,
        outputHarPath: path.join(harmonyRoot, 'dependencies/react_native_openharmony.har'),
        profile: 'core-v1-v3',
      });
      expect(
        fs.existsSync(path.join(harmonyRoot, 'dependencies/react_native_openharmony.har'))
      ).toBe(false);
    }
  );
});

describe('third-party HAR staging', () => {
  let root: string;
  let harmonyRoot: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-harmony-third-party-'));
    harmonyRoot = path.join(root, 'harmony');
    fs.mkdirSync(path.join(harmonyRoot, 'entry'), { recursive: true });
    fs.writeFileSync(
      path.join(harmonyRoot, 'entry/oh-package.json5'),
      JSON.stringify({ name: 'entry', version: '1.0.0', dependencies: {} })
    );
    fs.writeFileSync(
      path.join(harmonyRoot, 'build-profile.json5'),
      JSON.stringify({ modules: [{ name: 'entry', srcPath: './entry', targets: [] }] })
    );
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('copies single and multi HAR dependencies and removes stale files on the next sync', async () => {
    const packageRoot = path.join(root, 'node_modules/@example/library');
    fs.mkdirSync(path.join(packageRoot, 'harmony'), { recursive: true });
    fs.writeFileSync(path.join(packageRoot, 'harmony/base.har'), 'base');
    fs.writeFileSync(path.join(packageRoot, 'harmony/feature.har'), 'feature');
    fs.writeFileSync(
      path.join(harmonyRoot, 'oh-package.json5'),
      JSON.stringify({
        overrides: { user: '1.0.0', stale: 'file:./dependencies/expo-modules/stale/stale.har' },
      })
    );

    const module: ModuleDescriptorHarmony = {
      packageName: '@example/library',
      packageVersion: '1.0.0',
      packageRoot,
      kind: 'har',
      hars: [
        {
          packageName: '@example/base',
          packagePath: path.join(packageRoot, 'harmony/base.har'),
        },
        {
          packageName: '@example/feature',
          packagePath: path.join(packageRoot, 'harmony/feature.har'),
        },
      ],
      lifecycleDependencies: [],
    };

    const dependencies = await stageHarmonyEtsPackagesAsync([module], harmonyRoot);
    expect(dependencies).toEqual({
      '@example/base': 'file:../dependencies/expo-modules/example__base/base.har',
      '@example/feature': 'file:../dependencies/expo-modules/example__feature/feature.har',
    });
    expect(
      fs.readFileSync(
        path.join(harmonyRoot, 'dependencies/expo-modules/example__base/base.har'),
        'utf8'
      )
    ).toBe('base');

    await stageHarmonyEtsPackagesAsync([], harmonyRoot);
    expect(fs.existsSync(path.join(harmonyRoot, 'dependencies/expo-modules'))).toBe(false);
    expect(
      JSON.parse(fs.readFileSync(path.join(harmonyRoot, 'oh-package.json5'), 'utf8')).overrides
    ).toEqual({
      user: '1.0.0',
      '@rnoh/react-native-openharmony': 'file:./dependencies/react_native_openharmony.har',
    });
    expect(
      JSON.parse(fs.readFileSync(path.join(harmonyRoot, 'entry/oh-package.json5'), 'utf8'))
        .dependencies
    ).toEqual({
      '@rnoh/react-native-openharmony': 'file:../dependencies/react_native_openharmony.har',
    });
  });

  const lockedScreensHar = process.env.RNOH_SCREENS_INPUT_HAR;
  (lockedScreensHar ? it : it.skip)(
    'keeps native modal pop animation while allowing the top screen to handle Back',
    async () => {
      const packageRoot = path.join(root, 'node_modules/@react-native-ohos/react-native-screens');
      fs.mkdirSync(path.join(packageRoot, 'harmony'), { recursive: true });
      fs.copyFileSync(lockedScreensHar!, path.join(packageRoot, 'harmony/screens.har'));
      await stageHarmonyEtsPackagesAsync([{
        packageName: '@react-native-ohos/react-native-screens', packageVersion: '4.9.0', packageRoot,
        kind: 'rnoh-package', cpp, ets,
        hars: [{ packageName: '@react-native-ohos/react-native-screens', packagePath: path.join(packageRoot, 'harmony/screens.har'), primary: true, transform: 'screens-content-wrapper-v1' }],
        lifecycleDependencies: [],
      }], harmonyRoot);
      const outputHar = path.join(harmonyRoot, 'dependencies/expo-modules/react-native-ohos__react-native-screens/screens.har');
      const source = execFileSync('tar', ['-xOzf', outputHar, 'package/src/main/ets/components/RNSScreen.ets'], { encoding: 'utf8' });
      expect(source).toContain("if ((this.from || this.viewTagArr?.length > 0) &&\n          this.pageId !== RNSScreen.TOP_PAGEID) {");
      expect(source).toContain('this.backPressed();');
      expect(source).toContain('this.isNativeOpr(true);');
      expect(source).toContain('return false;');
    }
  );

  it('keeps the previous managed HAR set when a transform fails', async () => {
    const previous = path.join(harmonyRoot, 'dependencies/expo-modules/previous/previous.har');
    fs.mkdirSync(path.dirname(previous), { recursive: true });
    fs.writeFileSync(previous, 'previous');
    const packageRoot = path.join(root, 'node_modules/transformed-package');
    fs.mkdirSync(path.join(packageRoot, 'harmony'), { recursive: true });
    const input = path.join(packageRoot, 'harmony/input.har');
    fs.writeFileSync(input, 'input');

    await expect(
      stageHarmonyEtsPackagesAsync(
        [
          {
            packageName: 'transformed-package',
            packageVersion: '1.0.0',
            packageRoot,
            kind: 'rnoh-package',
            cpp,
            ets,
            hars: [
              {
                packageName: '@example/transformed',
                packagePath: input,
                primary: true,
                transform: 'screens-content-wrapper-v1',
              },
            ],
            lifecycleDependencies: [],
          },
        ],
        harmonyRoot,
        async (_transform, _input, output) => {
          fs.mkdirSync(path.dirname(output), { recursive: true });
          fs.writeFileSync(output, 'partial');
          throw new Error('transform failed');
        }
      )
    ).rejects.toThrow('transform failed');

    expect(fs.readFileSync(previous, 'utf8')).toBe('previous');
    expect(fs.existsSync(path.join(harmonyRoot, '.expo-har-staging'))).toBe(false);
  });

  it('rejects an OHPM name shared by a source package and HAR dependency', async () => {
    const sourceRoot = path.join(root, 'node_modules/source-package');
    fs.mkdirSync(path.join(sourceRoot, 'harmony/src/main/ets'), { recursive: true });
    fs.writeFileSync(
      path.join(sourceRoot, 'harmony/index.ets'),
      "export { SourcePackage } from './src/main/ets/SourcePackage';\n"
    );
    fs.writeFileSync(
      path.join(sourceRoot, 'harmony/src/main/ets/SourcePackage.ets'),
      'export class SourcePackage {}\n'
    );
    const harRoot = path.join(root, 'node_modules/har-package');
    fs.mkdirSync(path.join(harRoot, 'harmony'), { recursive: true });
    fs.writeFileSync(path.join(harRoot, 'harmony/source.har'), 'har');

    await expect(
      stageHarmonyEtsPackagesAsync(
        [
          {
            packageName: 'source-package',
            packageVersion: '1.0.0',
            packageRoot: sourceRoot,
            kind: 'turbo-module',
            cpp,
            ets: {
              packageClass: 'SourcePackage',
              importPath: 'source-package/harmony',
              entrypoint: path.join(sourceRoot, 'harmony/index.ets'),
            },
            lifecycleDependencies: [],
          },
          {
            packageName: 'har-package',
            packageVersion: '1.0.0',
            packageRoot: harRoot,
            kind: 'har',
            hars: [
              {
                packageName: 'source-package',
                packagePath: path.join(harRoot, 'harmony/source.har'),
              },
            ],
            lifecycleDependencies: [],
          },
        ],
        harmonyRoot
      )
    ).rejects.toThrow('duplicate Harmony OHPM package name "source-package"');
  });
});

describe('copyHarmonyTemplateMediaAsync', () => {
  it('materializes Harmony media from Expo app assets without binary template payloads', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-harmony-media-'));
    try {
      fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
      fs.writeFileSync(path.join(root, 'assets/icon.png'), 'icon');
      fs.writeFileSync(path.join(root, 'assets/adaptive.png'), 'foreground');
      fs.writeFileSync(path.join(root, 'assets/splash.png'), 'splash');
      fs.writeFileSync(path.join(root, 'app.json'), JSON.stringify({ expo: {
        icon: './assets/icon.png',
        android: { adaptiveIcon: { foregroundImage: './assets/adaptive.png' } },
        splash: { image: './assets/splash.png' },
      } }));
      const harmonyRoot = path.join(root, 'harmony');
      fs.mkdirSync(path.join(harmonyRoot, 'entry/src/main/resources/base/media'), { recursive: true });
      fs.mkdirSync(path.join(harmonyRoot, 'AppScope/resources/base/media'), { recursive: true });

      await copyHarmonyTemplateMediaAsync(root, harmonyRoot);

      expect(fs.readFileSync(path.join(harmonyRoot, 'entry/src/main/resources/base/media/background.png'), 'utf8')).toBe('icon');
      expect(fs.readFileSync(path.join(harmonyRoot, 'entry/src/main/resources/base/media/foreground.png'), 'utf8')).toBe('foreground');
      expect(fs.readFileSync(path.join(harmonyRoot, 'entry/src/main/resources/base/media/startIcon.png'), 'utf8')).toBe('splash');
      expect(fs.readFileSync(path.join(harmonyRoot, 'AppScope/resources/base/media/app_icon.png'), 'utf8')).toBe('icon');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
