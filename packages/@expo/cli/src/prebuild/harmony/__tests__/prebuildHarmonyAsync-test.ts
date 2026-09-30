import { vol } from 'memfs';

import { prebuildHarmonyAsync, updateHarmonyDebugBundlePathAsync } from '../prebuildHarmonyAsync';

describe(prebuildHarmonyAsync, () => {
  afterEach(() => vol.reset());
  it('aligns dependencies, resolves Harmony modules, and synchronizes the native project', async () => {
    const ensureDependencies = jest.fn(async () => ({ installed: false }));
    const queryModules = jest.fn(async () => [
      { packageName: 'expo-modules-core', packageRoot: '/app/node_modules/expo-modules-core' },
    ]);
    const syncProject = jest.fn(async () => ({ harmonyRoot: '/app/harmony' }));

    await expect(
      prebuildHarmonyAsync(
        '/app',
        { install: true, clean: false },
        {
          getConfig: () => ({ exp: { name: 'My App', slug: 'My App' } } as any),
          ensureDependencies,
          loadAutolinking: async () => ({
            queryAutolinkingModulesFromProjectAsync: queryModules,
            syncHarmonyNativeProjectAsync: syncProject,
          }),
          removeHarmonyProject: jest.fn(),
          updateDebugBundlePath: jest.fn(async () => {}),
        }
      )
    ).resolves.toEqual({ harmonyRoot: '/app/harmony' });

    expect(ensureDependencies).toHaveBeenCalledWith('/app', {
      install: true,
      packageManagerOptions: undefined,
    });
    expect(queryModules).toHaveBeenCalledWith('/app', { platform: 'harmony' });
    expect(syncProject).toHaveBeenCalledWith(
      expect.objectContaining({
        projectRoot: '/app',
        appName: 'My App',
        bundleName: 'dev.expo.myapp',
        inputHarPath:
          '/app/node_modules/@react-native-oh/react-native-harmony/react_native_openharmony.har',
        corePackageRoot: '/app/node_modules/expo-modules-core',
      })
    );
  });

  it('removes harmony before synchronization when clean is enabled', async () => {
    const removeHarmonyProject = jest.fn(async () => {});
    await prebuildHarmonyAsync(
      '/app',
      { install: false, clean: true, bundleName: 'com.example.custom' },
      {
        getConfig: () => ({ exp: { name: 'App', slug: 'app' } } as any),
        ensureDependencies: jest.fn(async () => ({ installed: false })),
        loadAutolinking: async () => ({
          queryAutolinkingModulesFromProjectAsync: jest.fn(async () => [
            { packageName: 'expo-modules-core', packageRoot: '/core' },
          ]),
          syncHarmonyNativeProjectAsync: jest.fn(async () => ({})),
        }),
        removeHarmonyProject,
        updateDebugBundlePath: jest.fn(async () => {}),
      }
    );
    expect(removeHarmonyProject).toHaveBeenCalledWith('/app/harmony');
  });
});

describe(updateHarmonyDebugBundlePathAsync, () => {
  it('uses the resolved expo-router entry instead of hardcoded index.bundle', async () => {
    vol.fromJSON({
      '/app/harmony/entry/src/main/ets/pages/Index.ets':
        "new MetroJSBundleProvider('http://127.0.0.1:8081/index.bundle?platform=harmony&dev=true&minify=false', ['main'])",
    });
    await updateHarmonyDebugBundlePathAsync(
      '/app',
      '/app/harmony',
      () => '/app/node_modules/expo-router/entry.js'
    );
    expect(vol.readFileSync('/app/harmony/entry/src/main/ets/pages/Index.ets', 'utf8')).toContain(
      'http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=harmony&dev=true&minify=false'
    );
  });

  it('is idempotent when the resolved Debug bundle URL is already current', async () => {
    const current =
      "new MetroJSBundleProvider('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=harmony&dev=true&minify=false', ['main'])";
    vol.fromJSON({ '/app/harmony/entry/src/main/ets/pages/Index.ets': current });
    await expect(
      updateHarmonyDebugBundlePathAsync(
        '/app',
        '/app/harmony',
        () => '/app/node_modules/expo-router/entry.js'
      )
    ).resolves.toBeUndefined();
    expect(vol.readFileSync('/app/harmony/entry/src/main/ets/pages/Index.ets', 'utf8')).toBe(
      current
    );
  });
});
