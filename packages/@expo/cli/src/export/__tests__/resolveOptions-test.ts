import { getConfig } from '@expo/config';

jest.mock(
  '@expo/metro-config/build/harmonyProject',
  () => jest.requireActual('../../../../metro-config/src/harmonyProject'),
  { virtual: true }
);

import { resolveOptionsAsync, resolvePlatformOption } from '../resolveOptions';

jest.mock('@expo/config', () => ({
  getConfig: jest.fn(() => ({
    pkg: {},
    exp: {
      sdkVersion: '45.0.0',
      name: 'my-app',
      slug: 'my-app',
      platforms: ['ios', 'android'],
    },
  })),
}));

describe(resolveOptionsAsync, () => {
  it('allows Harmony when installed identity exposes a Metro bundler', () => {
    expect(
      resolvePlatformOption(
        { platforms: ['ios', 'android'] } as any,
        { ios: 'metro', android: 'metro', web: 'metro', harmony: 'metro' },
        ['harmony']
      )
    ).toEqual(['harmony']);
  });

  it('includes Harmony in all only when the bundler map exposes it', () => {
    expect(
      resolvePlatformOption(
        { platforms: ['ios', 'android'] } as any,
        { ios: 'metro', android: 'metro', web: 'metro', harmony: 'metro' },
        ['all']
      )
    ).toEqual(['ios', 'android', 'harmony']);
    expect(() =>
      resolvePlatformOption(
        { platforms: ['ios', 'android'] } as any,
        { ios: 'metro', android: 'metro', web: 'metro' },
        ['harmony']
      )
    ).toThrow(/Platform "harmony" is not configured/);
  });

  it(`asserts unknown platform`, async () => {
    await expect(resolveOptionsAsync('/', { '--platform': ['foobar'] })).rejects.toThrow(
      /^Unsupported platform "foobar"\./
    );
  });

  it(`asserts not-configured platform`, async () => {
    jest.mocked(getConfig).mockReturnValueOnce({
      // @ts-expect-error
      exp: { web: { bundler: 'webpack' }, platforms: ['ios', 'android', 'web'] },
    });
    await expect(resolveOptionsAsync('/', { '--platform': ['web'] })).rejects.toThrow(
      /^Platform "web" is not configured to use the Metro bundler in the project Expo config,/
    );
  });

  it(`allows multiple platform flags`, async () => {
    await expect(
      resolveOptionsAsync('/', { '--platform': ['android', 'ios'] })
    ).resolves.toMatchObject({
      platforms: ['android', 'ios'],
    });
  });

  it(`filters duplicated platform flags`, async () => {
    await expect(
      resolveOptionsAsync('/', { '--platform': ['android', 'android', 'ios', 'ios'] })
    ).resolves.toMatchObject({
      platforms: ['android', 'ios'],
    });
  });

  it(`filters duplicated platform flags including all`, async () => {
    await expect(
      resolveOptionsAsync('/', { '--platform': ['android', 'all'] })
    ).resolves.toMatchObject({
      platforms: ['android', 'ios'],
    });
  });

  it(`parses qualified options`, async () => {
    await expect(
      resolveOptionsAsync('/', {
        '--output-dir': 'foobar',
        '--platform': ['android'],
        '--clear': true,
        '--dev': true,
        '--dump-assetmap': true,
        '--source-maps': true,
        '--max-workers': 2,
      })
    ).resolves.toEqual({
      clear: true,
      dev: true,
      bytecode: true,
      minify: true,
      dumpAssetmap: true,
      hostedNative: false,
      sourceMaps: true,
      maxWorkers: 2,
      skipSSG: false,
      outputDir: 'foobar',
      platforms: ['android'],
    });
  });

  it(`parses default options`, async () => {
    await expect(resolveOptionsAsync('/', {})).resolves.toEqual({
      clear: false,
      dev: false,
      bytecode: true,
      minify: true,
      dumpAssetmap: false,
      hostedNative: false,
      sourceMaps: false,
      maxWorkers: undefined,
      skipSSG: false,
      outputDir: 'dist',
      platforms: ['ios', 'android'],
    });
  });
  it(`parses default options with web enabled`, async () => {
    jest.mocked(getConfig).mockReturnValueOnce({
      // @ts-expect-error
      exp: { web: { bundler: 'metro' }, platforms: ['ios', 'android', 'web'] },
    });
    await expect(resolveOptionsAsync('/', {})).resolves.toEqual(
      expect.objectContaining({
        platforms: ['ios', 'android', 'web'],
      })
    );
  });
});
