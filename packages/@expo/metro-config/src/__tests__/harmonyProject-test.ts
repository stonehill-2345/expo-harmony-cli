jest.unmock('fs');
jest.unmock('node:fs');

import fs from 'fs';
import os from 'os';
import path from 'path';

import { isHarmonyProject, shouldEnableHarmonyMetro } from '../harmonyProject';

describe('installed Harmony platform detection', () => {
  let root: string;
  const previous = process.env.EXPO_HARMONY_METRO;
  const write = (file: string, value: unknown) => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(value));
  };
  const install = (name = '@expo-oh/expo') => {
    write('node_modules/expo/package.json', { name, version: '54.0.39' });
    write('node_modules/expo/harmony-release.json', {
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
      catalog: {
        external: { '@react-native-oh/react-native-harmony': '0.82.30' },
      },
    });
    write('node_modules/@react-native-oh/react-native-harmony/package.json', {
      name: '@react-native-oh/react-native-harmony',
      version: '0.82.30',
    });
  };
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-harmony-metro-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    if (previous === undefined) delete process.env.EXPO_HARMONY_METRO;
    else process.env.EXPO_HARMONY_METRO = previous;
  });

  it('enables direct Metro configuration before any CLI startup', () => {
    install();
    delete process.env.EXPO_HARMONY_METRO;
    expect(isHarmonyProject(root)).toBe(true);
    expect(shouldEnableHarmonyMetro(root)).toBe(true);
  });

  it('does not authorize official projects from global process environment', () => {
    install('expo');
    process.env.EXPO_HARMONY_METRO = '1';
    expect(shouldEnableHarmonyMetro(root)).toBe(false);
  });

  it('preserves explicit Harmony bundle configuration', () => {
    install('expo');
    expect(shouldEnableHarmonyMetro(root, 'harmony')).toBe(true);
  });

  it('does not cache identity after a release installation changes', () => {
    install();
    expect(isHarmonyProject(root)).toBe(true);
    write('node_modules/expo/package.json', {
      name: '@expo-oh/expo',
      version: '54.0.999',
    });
    expect(() => isHarmonyProject(root)).toThrow(/Harmony release/);
  });
});
