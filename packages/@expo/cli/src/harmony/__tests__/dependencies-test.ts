import * as PackageManager from '@expo/package-manager';
import { vol } from 'memfs';

import { ensureHarmonyDependenciesAsync, HARMONY_RUNTIME_PACKAGES } from '../dependencies';

const projectRoot = '/app';

function writePackage(name: string, version: string) {
  vol.fromJSON({
    [`${projectRoot}/node_modules/${name}/package.json`]: JSON.stringify({ name, version }),
  });
}

describe(ensureHarmonyDependenciesAsync, () => {
  const addAsync = jest.fn(async () => {});

  beforeEach(() => {
    vol.reset();
    addAsync.mockClear();
    jest.mocked(PackageManager.createForProject).mockReturnValue({ addAsync } as any);
  });

  it('does not install when the locked runtime is already present', async () => {
    for (const [name, version] of Object.entries(HARMONY_RUNTIME_PACKAGES)) {
      writePackage(name, version);
    }

    await expect(ensureHarmonyDependenciesAsync(projectRoot, { install: true })).resolves.toEqual({
      installed: false,
    });
    expect(PackageManager.createForProject).not.toHaveBeenCalled();
  });

  it('installs all exact locked versions when any runtime dependency is missing', async () => {
    writePackage('react', '19.1.0');

    await expect(
      ensureHarmonyDependenciesAsync(projectRoot, {
        install: true,
        packageManagerOptions: { npm: true },
      })
    ).resolves.toEqual({ installed: true });
    expect(PackageManager.createForProject).toHaveBeenCalledWith(projectRoot, {
      npm: true,
      log: expect.any(Function),
    });
    expect(addAsync).toHaveBeenCalledWith([
      'react@19.1.1',
      'react-native@0.82.1',
      '@react-native-oh/react-native-harmony@0.82.30',
      'expo-splash-screen@31.0.13',
    ]);
  });

  it('fails with an actionable version list when installation is disabled', async () => {
    writePackage('react', '19.1.0');
    writePackage('react-native', '0.81.5');

    await expect(ensureHarmonyDependenciesAsync(projectRoot, { install: false })).rejects.toThrow(
      'react@19.1.1, react-native@0.82.1, @react-native-oh/react-native-harmony@0.82.30'
    );
    expect(PackageManager.createForProject).not.toHaveBeenCalled();
  });
});
