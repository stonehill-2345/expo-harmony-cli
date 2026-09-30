import {
  createPlatformModulesRunBeforeMainModule,
  withHarmonySerializer,
} from '../withHarmony';

describe(createPlatformModulesRunBeforeMainModule, () => {
  const reactNativeInitializeCore = '/app/node_modules/react-native/Libraries/Core/InitializeCore.js';
  const harmonyInitializeCore =
    '/app/node_modules/@react-native-oh/react-native-harmony/Libraries/Core/InitializeCore.js';
  const winterRuntime = '/app/node_modules/expo/src/winter/index.ts';

  it.each(['android', 'ios', undefined])(
    'preserves standard React Native premodules for %s',
    (platform) => {
      const beforeMain = jest.fn(() => [reactNativeInitializeCore, winterRuntime]);
      const select = createPlatformModulesRunBeforeMainModule(beforeMain, harmonyInitializeCore);

      expect(select('/app/index.ts', platform)).toEqual([
        reactNativeInitializeCore,
        winterRuntime,
      ]);
    }
  );

  it('uses RNOH InitializeCore only for Harmony requests', () => {
    const beforeMain = jest.fn(() => [reactNativeInitializeCore, winterRuntime]);
    const select = createPlatformModulesRunBeforeMainModule(beforeMain, harmonyInitializeCore);

    expect(select('/app/index.ts', 'harmony')).toEqual([
      harmonyInitializeCore,
      winterRuntime,
    ]);
  });
});


describe(withHarmonySerializer, () => {
  function createConfig() {
    const getModulesRunBeforeMainModule = jest.fn((_entryFile: string, platform?: string) =>
      platform === 'harmony'
        ? ['/rnoh/InitializeCore.js', '/expo/winter.js']
        : ['/react-native/InitializeCore.js', '/expo/winter.js']
    );
    const customSerializer = Object.assign(
      jest.fn(async (_entryPoint, _preModules, _graph, options) => options.runBeforeMainModule),
      { __expoSerializer: true }
    );
    return {
      serializer: { getModulesRunBeforeMainModule, customSerializer },
      getModulesRunBeforeMainModule,
      customSerializer,
    } as any;
  }

  it.each([
    ['android', '/react-native/InitializeCore.js'],
    ['ios', '/react-native/InitializeCore.js'],
    ['harmony', '/rnoh/InitializeCore.js'],
  ])('selects %s premodules at final serialization', async (platform, initializeCore) => {
    const fixture = createConfig();
    const config = withHarmonySerializer(fixture);

    const result = await config.serializer.customSerializer!(
      '/app/index.ts',
      [],
      { transformOptions: { platform } } as any,
      { runBeforeMainModule: ['/wrong/InitializeCore.js'] } as any
    );

    expect(result).toEqual([initializeCore, '/expo/winter.js']);
    expect(fixture.getModulesRunBeforeMainModule).toHaveBeenCalledWith('/app/index.ts', platform);
  });

  it('preserves Expo serializer marker properties', () => {
    const fixture = createConfig();
    const config = withHarmonySerializer(fixture);
    expect((config.serializer.customSerializer as any).__expoSerializer).toBe(true);
  });
});
