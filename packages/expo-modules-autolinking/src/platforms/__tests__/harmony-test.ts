import { vol } from 'memfs';

import { ExpoModuleConfig } from '../../ExpoModuleConfig';
import { generatePackageListAsync, resolveModuleAsync } from '../harmony/harmony';

const FONT_ROOT = '/app/node_modules/expo-font';
const LINKING_ROOT = '/app/node_modules/expo-linking';

function nativeFiles(root: string, packageClass: string, header: string, cmakeTarget: string) {
  return {
    [`${root}/harmony/src/main/cpp/${header}`]: '#pragma once\n',
    [`${root}/harmony/src/main/cpp/CMakeLists.txt`]: `add_library(${cmakeTarget} SHARED source.cpp)\n`,
    [`${root}/harmony/index.ets`]: `export { ${packageClass} } from './src/main/ets/${packageClass}';\n`,
  };
}

afterEach(() => {
  vol.reset();
  jest.resetAllMocks();
});

describe(resolveModuleAsync, () => {
  it('resolves a Harmony TurboModule from explicit package metadata', async () => {
    vol.fromJSON(
      nativeFiles(FONT_ROOT, 'ExpoFontLoaderPackage', 'ExpoFontLoaderPackage.h', 'rnoh_expo_font')
    );

    const result = await resolveModuleAsync('expo-font', {
      name: 'expo-font',
      path: FONT_ROOT,
      version: '14.0.11',
      config: new ExpoModuleConfig({
        platforms: ['harmony'],
        harmony: {
          kind: 'turbo-module',
          cpp: {
            packageClass: 'expo::font::harmony::ExpoFontLoaderPackage',
            header: 'ExpoFontLoaderPackage.h',
            cmakeTarget: 'rnoh_expo_font',
            cmakePath: 'harmony/src/main/cpp',
          },
          ets: {
            packageClass: 'ExpoFontLoaderPackage',
            importPath: 'expo-font/harmony',
            entrypoint: 'harmony/index.ets',
          },
        },
      }),
    });

    expect(result).toEqual({
      packageName: 'expo-font',
      packageVersion: '14.0.11',
      packageRoot: FONT_ROOT,
      kind: 'turbo-module',
      cpp: {
        packageClass: 'expo::font::harmony::ExpoFontLoaderPackage',
        header: 'ExpoFontLoaderPackage.h',
        cmakeTarget: 'rnoh_expo_font',
        cmakePath: `${FONT_ROOT}/harmony/src/main/cpp`,
      },
      ets: {
        packageClass: 'ExpoFontLoaderPackage',
        importPath: 'expo-font/harmony',
        entrypoint: `${FONT_ROOT}/harmony/index.ets`,
      },
      lifecycleDependencies: [],
    });
  });

  it('preserves explicit Ability lifecycle dependencies without package-name inference', async () => {
    vol.fromJSON(
      nativeFiles(LINKING_ROOT, 'ExpoLinkingPackage', 'ExpoLinkingPackage.h', 'rnoh_expo_linking')
    );
    vol.fromJSON({
      [`${LINKING_ROOT}/harmony/index.ets`]: [
        "export { ExpoLinkingPackage } from './src/main/ets/ExpoLinkingPackage';",
        "export { ExpoLinkingLifecycle } from './src/main/ets/ExpoLinkingLifecycle';",
      ].join('\n'),
    });

    const result = await resolveModuleAsync('renamed-linking-package', {
      name: 'renamed-linking-package',
      path: LINKING_ROOT,
      version: '8.0.11',
      config: new ExpoModuleConfig({
        platforms: ['harmony'],
        harmony: {
          kind: 'ability-lifecycle',
          cpp: {
            packageClass: 'expo::linking::harmony::ExpoLinkingPackage',
            header: 'ExpoLinkingPackage.h',
            cmakeTarget: 'rnoh_expo_linking',
            cmakePath: 'harmony/src/main/cpp',
          },
          ets: {
            packageClass: 'ExpoLinkingPackage',
            importPath: 'expo-linking/harmony',
            entrypoint: 'harmony/index.ets',
          },
          lifecycleDependencies: [
            {
              localName: 'linkingLifecycle',
              className: 'ExpoLinkingLifecycle',
              importPath: 'expo-linking/harmony',
              appStorageKey: 'ExpoLinkingLifecycle',
            },
          ],
        },
      }),
    });

    expect(result?.kind).toBe('ability-lifecycle');
    expect(result).toMatchObject({
      packageName: 'renamed-linking-package',
      packageVersion: '8.0.11',
      packageRoot: LINKING_ROOT,
    });
    expect(result?.lifecycleDependencies).toEqual([
      {
        localName: 'linkingLifecycle',
        className: 'ExpoLinkingLifecycle',
        importPath: 'expo-linking/harmony',
        appStorageKey: 'ExpoLinkingLifecycle',
      },
    ]);
  });

  it('resolves an RNOH-reuse package without native generation metadata', async () => {
    const result = await resolveModuleAsync('expo-status-bar', {
      name: 'expo-status-bar',
      path: '/app/node_modules/expo-status-bar',
      version: '3.0.9',
      config: new ExpoModuleConfig({
        platforms: ['harmony'],
        harmony: {
          kind: 'rnoh-reuse',
          reason: 'Uses the StatusBarManager supplied by RNOH.',
        },
      }),
    });

    expect(result).toEqual({
      packageName: 'expo-status-bar',
      packageVersion: '3.0.9',
      packageRoot: '/app/node_modules/expo-status-bar',
      kind: 'rnoh-reuse',
      reason: 'Uses the StatusBarManager supplied by RNOH.',
      lifecycleDependencies: [],
    });
  });

  it.each([
    {
      label: 'declared CMake target is missing',
      files: {
        ...nativeFiles(
          FONT_ROOT,
          'ExpoFontLoaderPackage',
          'ExpoFontLoaderPackage.h',
          'different_target'
        ),
      },
      message: 'CMake target "rnoh_expo_font"',
    },
    {
      label: 'ETS package export is missing',
      files: {
        ...nativeFiles(FONT_ROOT, 'DifferentPackage', 'ExpoFontLoaderPackage.h', 'rnoh_expo_font'),
      },
      message: 'ETS export "ExpoFontLoaderPackage"',
    },
  ])('rejects expo-font when $label', async ({ files, message }) => {
    vol.fromJSON(files);

    const promise = resolveModuleAsync('expo-font', {
      name: 'expo-font',
      path: FONT_ROOT,
      version: '14.0.11',
      config: new ExpoModuleConfig({
        platforms: ['harmony'],
        harmony: {
          kind: 'turbo-module',
          cpp: {
            packageClass: 'expo::font::harmony::ExpoFontLoaderPackage',
            header: 'ExpoFontLoaderPackage.h',
            cmakeTarget: 'rnoh_expo_font',
            cmakePath: 'harmony/src/main/cpp',
          },
          ets: {
            packageClass: 'ExpoFontLoaderPackage',
            importPath: 'expo-font/harmony',
            entrypoint: 'harmony/index.ets',
          },
        },
      }),
    });

    await expect(promise).rejects.toThrow('expo-font');
    await expect(promise).rejects.toThrow(message);
  });

  it('rejects lifecycle modules without an explicit lifecycle dependency', async () => {
    vol.fromJSON(
      nativeFiles(LINKING_ROOT, 'ExpoLinkingPackage', 'ExpoLinkingPackage.h', 'rnoh_expo_linking')
    );

    await expect(
      resolveModuleAsync('expo-linking', {
        name: 'expo-linking',
        path: LINKING_ROOT,
        version: '8.0.11',
        config: new ExpoModuleConfig({
          platforms: ['harmony'],
          harmony: {
            kind: 'ability-lifecycle',
            cpp: {
              packageClass: 'expo::linking::harmony::ExpoLinkingPackage',
              header: 'ExpoLinkingPackage.h',
              cmakeTarget: 'rnoh_expo_linking',
              cmakePath: 'harmony/src/main/cpp',
            },
            ets: {
              packageClass: 'ExpoLinkingPackage',
              importPath: 'expo-linking/harmony',
              entrypoint: 'harmony/index.ets',
            },
          },
        }),
      })
    ).rejects.toThrow('expo-linking');
  });
});

describe(generatePackageListAsync, () => {
  it('writes deterministic C++, ETS, and CMake package registration files', async () => {
    const output = '/app/harmony/generated';
    const modules = [
      {
        packageName: 'expo-status-bar',
        kind: 'rnoh-reuse' as const,
        reason: 'Uses the StatusBarManager supplied by RNOH.',
        lifecycleDependencies: [],
      },
      {
        packageName: 'expo-linking',
        kind: 'ability-lifecycle' as const,
        cpp: {
          packageClass: 'expo::linking::harmony::ExpoLinkingPackage',
          header: 'ExpoLinkingPackage.h',
          cmakeTarget: 'rnoh_expo_linking',
          cmakePath: '/app/node_modules/expo-linking/harmony/src/main/cpp',
        },
        ets: {
          packageClass: 'ExpoLinkingPackage',
          importPath: 'expo-linking/harmony',
          entrypoint: '/app/node_modules/expo-linking/harmony/index.ets',
        },
        lifecycleDependencies: [
          {
            localName: 'linkingLifecycle',
            className: 'ExpoLinkingLifecycle',
            importPath: 'expo-linking/harmony',
            appStorageKey: 'ExpoLinkingLifecycle',
          },
        ],
      },
      {
        packageName: 'expo-asset',
        kind: 'turbo-module' as const,
        cpp: {
          packageClass: 'expo::asset::harmony::ExpoAssetPackage',
          header: 'ExpoAssetPackage.h',
          cmakeTarget: 'rnoh_expo_asset',
          cmakePath: '/app/node_modules/expo-asset/harmony/src/main/cpp',
        },
        ets: {
          packageClass: 'ExpoAssetPackage',
          importPath: 'expo-asset/harmony',
          entrypoint: '/app/node_modules/expo-asset/harmony/index.ets',
        },
        lifecycleDependencies: [],
      },
    ];

    await generatePackageListAsync(modules, output, 'ignored.for.harmony');

    await expect(vol.promises.readFile(`${output}/ExpoModulesPackages.cpp`, 'utf8')).resolves.toBe(
      `// @generated by expo-modules-autolinking. Do not edit.\n` +
        `#include "RNOH/PackageProvider.h"\n` +
        `#include "ExpoAssetPackage.h"\n` +
        `#include "ExpoLinkingPackage.h"\n\n` +
        `using namespace rnoh;\n\n` +
        `std::vector<std::shared_ptr<Package>> PackageProvider::getPackages(Package::Context ctx) {\n` +
        `  return {\n` +
        `    std::make_shared<expo::asset::harmony::ExpoAssetPackage>(ctx),\n` +
        `    std::make_shared<expo::linking::harmony::ExpoLinkingPackage>(ctx)\n` +
        `  };\n` +
        `}\n` +
        `\n// expo-status-bar: skipped native package generation (Uses the StatusBarManager supplied by RNOH.)\n`
    );

    await expect(vol.promises.readFile(`${output}/ExpoModulesPackages.ets`, 'utf8')).resolves.toBe(
      `// @generated by expo-modules-autolinking. Do not edit.\n` +
        `import type { RNPackage, RNPackageContext } from '@rnoh/react-native-openharmony';\n` +
        `import { ExpoAssetPackage } from 'expo-asset/harmony';\n` +
        `import { ExpoLinkingLifecycle } from 'expo-linking/harmony';\n` +
        `import { ExpoLinkingPackage } from 'expo-linking/harmony';\n\n` +
        `export function getExpoModulesPackages(ctx: RNPackageContext): RNPackage[] {\n` +
        `  const linkingLifecycle = AppStorage.get<ExpoLinkingLifecycle>('ExpoLinkingLifecycle');\n` +
        `  if (!linkingLifecycle) {\n` +
        `    throw new Error('Missing required Harmony lifecycle dependency "ExpoLinkingLifecycle" for expo-linking');\n` +
        `  }\n` +
        `  return [\n` +
        `    new ExpoAssetPackage(ctx),\n` +
        `    new ExpoLinkingPackage(ctx, linkingLifecycle)\n` +
        `  ];\n` +
        `}\n` +
        `\n// expo-status-bar: skipped native package generation (Uses the StatusBarManager supplied by RNOH.)\n`
    );

    await expect(vol.promises.readFile(`${output}/expo-modules.cmake`, 'utf8')).resolves.toBe(
      `# @generated by expo-modules-autolinking. Do not edit.\n` +
        `add_subdirectory("/app/node_modules/expo-asset/harmony/src/main/cpp" expo_modules_expo_asset)\n` +
        `add_subdirectory("/app/node_modules/expo-linking/harmony/src/main/cpp" expo_modules_expo_linking)\n\n` +
        `target_link_libraries(rnoh_app PUBLIC\n` +
        `  rnoh_expo_asset\n` +
        `  rnoh_expo_linking\n` +
        `)\n` +
        `\n# expo-status-bar: skipped native package generation (Uses the StatusBarManager supplied by RNOH.)\n`
    );
  });

  it('produces byte-identical output regardless of input order', async () => {
    const moduleA = {
      packageName: 'z-package',
      kind: 'turbo-module' as const,
      cpp: {
        packageClass: 'example::ZPackage',
        header: 'ZPackage.h',
        cmakeTarget: 'z_target',
        cmakePath: '/modules/z/cpp',
      },
      ets: {
        packageClass: 'ZPackage',
        importPath: 'z-package/harmony',
        entrypoint: '/modules/z/index.ets',
      },
      lifecycleDependencies: [],
    };
    const moduleB = {
      packageName: 'a-package',
      kind: 'turbo-module' as const,
      cpp: {
        packageClass: 'example::APackage',
        header: 'APackage.h',
        cmakeTarget: 'a_target',
        cmakePath: '/modules/a/cpp',
      },
      ets: {
        packageClass: 'APackage',
        importPath: 'a-package/harmony',
        entrypoint: '/modules/a/index.ets',
      },
      lifecycleDependencies: [],
    };

    await generatePackageListAsync([moduleA, moduleB], '/first', 'ignored');
    await generatePackageListAsync([moduleB, moduleA], '/second', 'ignored');

    for (const filename of [
      'ExpoModulesPackages.cpp',
      'ExpoModulesPackages.ets',
      'expo-modules.cmake',
    ]) {
      const first = await vol.promises.readFile(`/first/${filename}`, 'utf8');
      const second = await vol.promises.readFile(`/second/${filename}`, 'utf8');
      expect(first).toBe(second);
    }
  });
});

describe('third-party Harmony metadata', () => {
  const thirdPartyRoot = '/app/node_modules/@example/rnoh-library';

  it('resolves a dependency-only multi-HAR package', async () => {
    vol.fromJSON({
      [`${thirdPartyRoot}/harmony/base.har`]: 'base',
      [`${thirdPartyRoot}/harmony/feature.har`]: 'feature',
    });

    await expect(
      resolveModuleAsync('@example/rnoh-library', {
        name: '@example/rnoh-library',
        path: thirdPartyRoot,
        version: '1.2.3',
        config: new ExpoModuleConfig({
          platforms: ['harmony'],
          harmony: {
            kind: 'har',
            har: [
              { packageName: '@example/base', packagePath: 'harmony/base.har' },
              { packageName: '@example/feature', packagePath: 'harmony/feature.har' },
            ],
          },
        }),
      })
    ).resolves.toMatchObject({
      packageName: '@example/rnoh-library',
      kind: 'har',
      hars: [
        { packageName: '@example/base', packagePath: `${thirdPartyRoot}/harmony/base.har` },
        { packageName: '@example/feature', packagePath: `${thirdPartyRoot}/harmony/feature.har` },
      ],
    });
  });

  it('resolves a multi-HAR RNOH package from its explicit primary HAR', async () => {
    vol.fromJSON({
      [`${thirdPartyRoot}/harmony/demo.har`]: 'demo',
      [`${thirdPartyRoot}/harmony/support.har`]: 'support',
    });

    await expect(
      resolveModuleAsync('@example/rnoh-library', {
        name: '@example/rnoh-library',
        path: thirdPartyRoot,
        version: '1.2.3',
        config: new ExpoModuleConfig({
          platforms: ['harmony'],
          harmony: {
            kind: 'rnoh-package',
            cpp: {
              packageClass: 'rnoh::ExamplePackage',
              header: 'ExamplePackage.h',
              cmakeTarget: 'rnoh_example',
              cmakePath: 'src/main/cpp',
            },
            ets: {
              packageClass: 'ExamplePackage',
              importPath: '@example/demo',
              entrypoint: 'index.ets',
            },
            har: [
              {
                packageName: '@example/demo',
                packagePath: 'harmony/demo.har',
                primary: true,
              },
              { packageName: '@example/support', packagePath: 'harmony/support.har' },
            ],
          },
        }),
      })
    ).resolves.toMatchObject({
      kind: 'rnoh-package',
      cpp: { cmakePath: 'src/main/cpp', cmakeTarget: 'rnoh_example' },
      ets: { importPath: '@example/demo', entrypoint: 'index.ets' },
      hars: [
        expect.objectContaining({ packageName: '@example/demo', primary: true }),
        expect.objectContaining({ packageName: '@example/support' }),
      ],
    });
  });

  it.each([
    {
      label: 'a missing HAR file',
      har: { packageName: '@example/missing', packagePath: 'harmony/missing.har' },
      message: 'missing.har',
    },
    {
      label: 'duplicate OHPM package names',
      har: [
        { packageName: '@example/duplicate', packagePath: 'harmony/demo.har' },
        { packageName: '@example/duplicate', packagePath: 'harmony/support.har' },
      ],
      message: 'duplicate HAR packageName',
    },
  ])('rejects $label', async ({ har, message }) => {
    vol.fromJSON({
      [`${thirdPartyRoot}/harmony/demo.har`]: 'demo',
      [`${thirdPartyRoot}/harmony/support.har`]: 'support',
    });
    await expect(
      resolveModuleAsync('@example/rnoh-library', {
        name: '@example/rnoh-library',
        path: thirdPartyRoot,
        version: '1.2.3',
        config: new ExpoModuleConfig({ platforms: ['harmony'], harmony: { kind: 'har', har } }),
      })
    ).rejects.toThrow(message);
  });

  it('rejects a multi-HAR RNOH package without exactly one primary HAR', async () => {
    vol.fromJSON({
      [`${thirdPartyRoot}/harmony/demo.har`]: 'demo',
      [`${thirdPartyRoot}/harmony/support.har`]: 'support',
    });
    await expect(
      resolveModuleAsync('@example/rnoh-library', {
        name: '@example/rnoh-library',
        path: thirdPartyRoot,
        version: '1.2.3',
        config: new ExpoModuleConfig({
          platforms: ['harmony'],
          harmony: {
            kind: 'rnoh-package',
            cpp: {
              packageClass: 'rnoh::ExamplePackage',
              header: 'ExamplePackage.h',
              cmakeTarget: 'rnoh_example',
              cmakePath: 'src/main/cpp',
            },
            ets: {
              packageClass: 'ExamplePackage',
              importPath: '@example/demo',
              entrypoint: 'index.ets',
            },
            har: [
              { packageName: '@example/demo', packagePath: 'harmony/demo.har' },
              { packageName: '@example/support', packagePath: 'harmony/support.har' },
            ],
          },
        }),
      })
    ).rejects.toThrow('exactly one primary HAR');
  });

  it('generates registration and OH_MODULES CMake wiring for an RNOH package', async () => {
    const output = '/app/generated-rnoh';
    await generatePackageListAsync(
      [
        {
          packageName: '@example/rnoh-library',
          packageVersion: '1.2.3',
          packageRoot: thirdPartyRoot,
          kind: 'rnoh-package',
          cpp: {
            packageClass: 'rnoh::ExamplePackage',
            header: 'ExamplePackage.h',
            cmakeTarget: 'rnoh_example',
            cmakePath: 'src/main/cpp',
          },
          ets: {
            packageClass: 'ExamplePackage',
            importPath: '@example/demo',
            entrypoint: 'index.ets',
          },
          hars: [
            {
              packageName: '@example/demo',
              packagePath: `${thirdPartyRoot}/harmony/demo.har`,
              primary: true,
            },
          ],
          lifecycleDependencies: [],
        },
      ],
      output,
      'unused'
    );

    expect(vol.readFileSync(`${output}/ExpoModulesPackages.cpp`, 'utf8')).toContain(
      'std::make_shared<rnoh::ExamplePackage>(ctx)'
    );
    expect(vol.readFileSync(`${output}/ExpoModulesPackages.ets`, 'utf8')).toContain(
      "import { ExamplePackage } from '@example/demo';"
    );
    await generatePackageListAsync(
      [
        {
          ...{
            packageName: '@example/default',
            packageVersion: '1.0.0',
            packageRoot: '/default',
            kind: 'rnoh-package' as const,
            cpp: {
              packageClass: 'DefaultPackage',
              header: 'DefaultPackage.h',
              cmakeTarget: 'default_target',
              cmakePath: 'src/main/cpp',
            },
            ets: {
              packageClass: 'DefaultPackage',
              importPath: '@example/default',
              entrypoint: 'index.ets',
              importKind: 'default' as const,
            },
            hars: [
              {
                packageName: '@example/default',
                packagePath: '/default/default.har',
                primary: true,
              },
            ],
            lifecycleDependencies: [],
          },
        },
      ],
      '/default-output',
      'unused'
    );
    expect(vol.readFileSync('/default-output/ExpoModulesPackages.ets', 'utf8')).toContain(
      "import DefaultPackage from '@example/default';"
    );
    expect(vol.readFileSync(`${output}/expo-modules.cmake`, 'utf8')).toContain(
      'add_subdirectory("${OH_MODULES_DIR}/@example/demo/src/main/cpp"'
    );
  });
});

describe('third-party Harmony conflict validation', () => {
  it('rejects a CMake target shared by source and prebuilt RNOH packages', async () => {
    const sourceModule = {
      packageName: 'source-package',
      packageVersion: '1.0.0',
      packageRoot: '/source-package',
      kind: 'turbo-module' as const,
      cpp: {
        packageClass: 'source::Package',
        header: 'SourcePackage.h',
        cmakeTarget: 'shared_target',
        cmakePath: '/source-package/harmony/src/main/cpp',
      },
      ets: {
        packageClass: 'SourcePackage',
        importPath: 'source-package/harmony',
        entrypoint: '/source-package/harmony/index.ets',
      },
      lifecycleDependencies: [],
    };
    const prebuiltModule = {
      packageName: 'prebuilt-package',
      packageVersion: '1.0.0',
      packageRoot: '/prebuilt-package',
      kind: 'rnoh-package' as const,
      cpp: {
        packageClass: 'prebuilt::Package',
        header: 'PrebuiltPackage.h',
        cmakeTarget: 'shared_target',
        cmakePath: 'src/main/cpp',
      },
      ets: {
        packageClass: 'PrebuiltPackage',
        importPath: '@example/prebuilt',
        entrypoint: 'index.ets',
      },
      hars: [
        {
          packageName: '@example/prebuilt',
          packagePath: '/prebuilt-package/harmony/prebuilt.har',
          primary: true,
        },
      ],
      lifecycleDependencies: [],
    };

    await expect(
      generatePackageListAsync([sourceModule, prebuiltModule], '/conflict', 'unused')
    ).rejects.toThrow('CMake target "shared_target" resolves to multiple source directories');
  });
});
