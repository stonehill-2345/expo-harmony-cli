jest.unmock('fs');
jest.unmock('node:fs');
jest.mock(
  '@expo/metro-config/build/harmonyProject',
  () => jest.requireActual('../../../../metro-config/src/harmonyProject'),
  { virtual: true }
);
import fs from 'fs';
import os from 'os';
import path from 'path';

import { enableHarmonyMetroForManagedProject } from '../index';

describe(enableHarmonyMetroForManagedProject, () => {
  let root: string;
  const previous = process.env.EXPO_HARMONY_METRO;
  const rnoh = '@react-native-oh/react-native-harmony';
  const release = {
    schemaVersion: 1,
    release: 'sdk54-expo-oh-harmony.1',
    packages: [
      {
        installName: 'expo',
        publishName: '@expo-oh/expo',
        publishVersion: '54.0.39',
        upstreamVersion: '54.0.37',
        installSpec: 'npm:@expo-oh/expo@54.0.39',
      },
    ],
    catalog: { external: { [rnoh]: '0.82.30' } },
  };
  const write = (file: string, value: unknown) => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value));
  };
  const install = () => {
    write('package.json', { name: 'test-app' });
    write('node_modules/expo/package.json', {
      name: '@expo-oh/expo',
      version: '54.0.39',
    });
    write('node_modules/expo/harmony-release.json', release);
    write(`node_modules/${rnoh}/package.json`, {
      name: rnoh,
      version: '0.82.30',
    });
  };
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-harmony-start-'));
    delete process.env.EXPO_HARMONY_METRO;
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    if (previous === undefined) delete process.env.EXPO_HARMONY_METRO;
    else process.env.EXPO_HARMONY_METRO = previous;
  });

  it('identifies installed adapted packages after managed state is deleted', () => {
    install();
    write('.expo-harmony/managed-state.json', {
      sdk54: { mode: 'sdk54-scoped-packages' },
    });
    expect(enableHarmonyMetroForManagedProject(root)).toBe(true);
    fs.rmSync(path.join(root, '.expo-harmony'), { recursive: true });
    expect(enableHarmonyMetroForManagedProject(root)).toBe(true);
    expect(process.env.EXPO_HARMONY_METRO).toBeUndefined();
  });

  it.each(['sdk54-package-patch', 'sdk54-scoped-packages'])(
    'does not authorize state-only %s projects',
    (mode) => {
      write('.expo-harmony/managed-state.json', { sdk54: { mode } });
      expect(enableHarmonyMetroForManagedProject(root)).toBe(false);
    }
  );

  it('does not authorize dependency declarations without installed packages', () => {
    write('package.json', {
      dependencies: { expo: 'npm:@expo-oh/expo@54.0.39', [rnoh]: '0.82.30' },
    });
    expect(enableHarmonyMetroForManagedProject(root)).toBe(false);
  });

  it('keeps official Expo with standalone RNOH unchanged after another project starts', () => {
    install();
    expect(enableHarmonyMetroForManagedProject(root)).toBe(true);
    write('node_modules/expo/package.json', {
      name: 'expo',
      version: '54.0.37',
    });
    process.env.EXPO_HARMONY_METRO = '1';
    expect(enableHarmonyMetroForManagedProject(root)).toBe(false);
  });

  it.each([
    ['wrong RNOH name', { name: 'foreign-rnoh', version: '0.82.30' }],
    ['wrong RNOH version', { name: rnoh, version: '0.77.71' }],
  ])('does not authorize %s', (_name, pkg) => {
    install();
    write(`node_modules/${rnoh}/package.json`, pkg);
    expect(enableHarmonyMetroForManagedProject(root)).toBe(false);
  });

  it.each(['{ invalid', JSON.stringify({ ...release, packages: [] })])(
    'reports damaged adapted metadata',
    (manifest) => {
      install();
      write('node_modules/expo/harmony-release.json', manifest);
      expect(() => enableHarmonyMetroForManagedProject(root)).toThrow(/Harmony release/);
    }
  );
});
