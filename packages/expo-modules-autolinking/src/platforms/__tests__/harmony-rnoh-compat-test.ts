import { vol } from 'memfs';

import { resolveExpoModule } from '../../autolinking/findModules';
import { resolveModuleAsync } from '../harmony/harmony';

const root = '/app/node_modules/@scope/rnoh-demo';

afterEach(() => vol.reset());

describe('RNOH package.json compatibility', () => {
  it('discovers and resolves existing RNOH multi-HAR autolinking metadata', async () => {
    vol.fromJSON({
      [`${root}/package.json`]: JSON.stringify({
        name: '@scope/rnoh-demo',
        version: '2.0.0',
        harmony: {
          autolinking: {
            etsPackageClassName: 'DemoPackage',
            cppPackageClassName: 'DemoPackage',
            cmakeLibraryTargetName: 'rnoh_demo',
            mainHarPath: 'dist/harmony',
            ohPackageName: [
              { harName: 'demo.har', packageName: '@scope/demo' },
              { harName: 'helper.har', packageName: '@scope/helper', version: '1.0.0' },
            ],
          },
        },
      }),
      [`${root}/dist/harmony/demo.har`]: 'demo',
      [`${root}/dist/harmony/helper.har`]: 'helper',
    });

    const revision = await resolveExpoModule(
      {
        name: '@scope/rnoh-demo',
        version: '2.0.0',
        path: root,
        originPath: root,
        source: 0,
        duplicates: null,
        depth: 0,
      },
      'harmony',
      new Set()
    );
    expect(revision).not.toBeNull();
    await expect(resolveModuleAsync('@scope/rnoh-demo', revision!)).resolves.toMatchObject({
      kind: 'rnoh-package',
      cpp: {
        packageClass: 'rnoh::DemoPackage',
        cmakeTarget: 'rnoh_demo',
        cmakePath: 'src/main/cpp',
      },
      ets: { packageClass: 'DemoPackage', importPath: '@scope/demo' },
      hars: [
        expect.objectContaining({ packageName: '@scope/demo', primary: true }),
        expect.objectContaining({ packageName: '@scope/helper', version: '1.0.0' }),
      ],
    });
  });

  it('uses RNOH default names for a package without explicit class or OHPM metadata', async () => {
    vol.fromJSON({
      [`${root}/package.json`]: JSON.stringify({
        name: '@scope/rnoh-demo',
        version: '2.0.0',
        harmony: { autolinking: true },
      }),
      [`${root}/harmony/demo.har`]: 'demo',
    });
    const revision = await resolveExpoModule(
      {
        name: '@scope/rnoh-demo',
        version: '2.0.0',
        path: root,
        originPath: root,
        source: 0,
        duplicates: null,
        depth: 0,
      },
      'harmony',
      new Set()
    );
    await expect(resolveModuleAsync('@scope/rnoh-demo', revision!)).resolves.toMatchObject({
      cpp: {
        packageClass: 'rnoh::ScopeRnohDemoPackage',
        cmakeTarget: 'rnoh__scope__rnoh_demo',
      },
      ets: {
        packageClass: 'ScopeRnohDemoPackage',
        importPath: '@rnoh/scope--rnoh-demo',
      },
    });
  });
});

describe('RNOH HAR mapping order', () => {
  it('uses the first explicit mapping as the primary HAR even when filenames sort differently', async () => {
    vol.fromJSON({
      [`${root}/package.json`]: JSON.stringify({
        name: '@scope/rnoh-demo',
        version: '2.0.0',
        harmony: {
          autolinking: {
            ohPackageName: [
              { harName: 'z-primary.har', packageName: '@scope/primary' },
              { harName: 'a-helper.har', packageName: '@scope/helper' },
            ],
          },
        },
      }),
      [`${root}/harmony/a-helper.har`]: 'helper',
      [`${root}/harmony/z-primary.har`]: 'primary',
    });
    const revision = await resolveExpoModule(
      {
        name: '@scope/rnoh-demo',
        version: '2.0.0',
        path: root,
        originPath: root,
        source: 0,
        duplicates: null,
        depth: 0,
      },
      'harmony',
      new Set()
    );
    await expect(resolveModuleAsync('@scope/rnoh-demo', revision!)).resolves.toMatchObject({
      ets: { importPath: '@scope/primary' },
      hars: [
        expect.objectContaining({ packageName: '@scope/primary', primary: true }),
        expect.objectContaining({ packageName: '@scope/helper' }),
      ],
    });
  });
});

describe('version-locked RNOH navigation compatibility catalog', () => {
  it.each([
    [
      '@react-native-ohos/react-native-screens',
      '4.9.0',
      'screens.har',
      'ScreensPackage',
      'RNOHScreensPackage',
      'rnoh_screens',
      'default',
      'screens-content-wrapper-v1',
    ],
    [
      '@react-native-ohos/react-native-safe-area-context',
      '5.6.3',
      'safe_area.har',
      'rnoh::SafeAreaViewPackage',
      'SafeAreaViewPackage',
      'rnoh_safe_area',
      'named',
      undefined,
    ],
    [
      '@react-native-ohos/react-native-gesture-handler',
      '2.30.1',
      'gesture_handler.har',
      'rnoh::GestureHandlerPackage',
      'GestureHandlerPackage',
      'rnoh_gesture_handler',
      'default',
      undefined,
    ],
    [
      '@react-native-ohos/react-native-worklets',
      '1.0.0',
      'worklets.har',
      'rnoh::ReanimatedWorkletPackage',
      'ReanimatedWorkletPackage',
      'rnoh_worklets',
      'named',
      'worklets-private-symbols-v2',
    ],
    [
      '@react-native-ohos/react-native-reanimated',
      '4.0.1',
      'reanimated.har',
      'rnoh::ReanimatedPackage',
      'ReanimatedPackage',
      'rnoh_reanimated',
      'named',
      undefined,
    ],
  ])(
    'resolves %s@%s without package-owned autolinking metadata',
    async (name, version, har, cppClass, etsClass, target, importKind, transform) => {
      const packageRoot = `/app/node_modules/${name}`;
      vol.fromJSON({
        [`${packageRoot}/package.json`]: JSON.stringify({
          name,
          version,
          harmony: { alias: 'upstream' },
        }),
        [`${packageRoot}/harmony/${har}`]: 'har',
      });
      const revision = await resolveExpoModule(
        {
          name,
          version,
          path: packageRoot,
          originPath: packageRoot,
          source: 0,
          duplicates: null,
          depth: 0,
        },
        'harmony',
        new Set()
      );
      expect(revision).not.toBeNull();
      await expect(resolveModuleAsync(name, revision!)).resolves.toMatchObject({
        kind: 'rnoh-package',
        cpp: { packageClass: cppClass, cmakeTarget: target },
        ets: { packageClass: etsClass, importKind },
        hars: [expect.objectContaining({ packageName: name, primary: true, transform })],
      });
    }
  );

  it('does not apply the catalog to an unverified adapter version', async () => {
    const name = '@react-native-ohos/react-native-screens';
    const packageRoot = `/app/node_modules/${name}`;
    vol.fromJSON({
      [`${packageRoot}/package.json`]: JSON.stringify({
        name,
        version: '4.9.1',
        harmony: { alias: 'react-native-screens' },
      }),
      [`${packageRoot}/harmony/screens.har`]: 'har',
    });
    await expect(
      resolveExpoModule(
        {
          name,
          version: '4.9.1',
          path: packageRoot,
          originPath: packageRoot,
          source: 0,
          duplicates: null,
          depth: 0,
        },
        'harmony',
        new Set()
      )
    ).resolves.toBeNull();
  });
});
