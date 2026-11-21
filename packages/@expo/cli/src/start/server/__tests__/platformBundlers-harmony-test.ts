jest.unmock('fs');
jest.unmock('node:fs');
jest.mock(
  '@expo/metro-config/build/harmonyProject',
  () => jest.requireActual('../../../../../metro-config/src/harmonyProject'),
  { virtual: true }
);

import fs from 'fs';
import os from 'os';
import path from 'path';

import { getPlatformBundlers } from '../platformBundlers';

describe(getPlatformBundlers, () => {
  let root: string;
  const write = (file: string, value: unknown) => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(value));
  };
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-harmony-platform-bundlers-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('adds Harmony only for a complete installed release identity', () => {
    write('node_modules/expo/package.json', { name: '@expo-oh/expo', version: '54.0.39' });
    write('node_modules/expo/harmony-release.json', {
      schemaVersion: 1,
      release: 'sdk54-expo-oh-harmony.1',
      packages: [{
        installName: 'expo', publishName: '@expo-oh/expo', publishVersion: '54.0.39',
        upstreamVersion: '54.0.37', installSpec: 'npm:@expo-oh/expo@54.0.39',
      }],
      catalog: { external: { '@react-native-oh/react-native-harmony': '0.82.30' } },
    });
    write('node_modules/@react-native-oh/react-native-harmony/package.json', {
      name: '@react-native-oh/react-native-harmony', version: '0.82.30',
    });
    expect(getPlatformBundlers(root, { platforms: ['ios', 'android'] } as any)).toEqual({
      ios: 'metro', android: 'metro', web: 'metro', harmony: 'metro',
    });
    write('node_modules/expo/package.json', { name: 'expo', version: '54.0.37' });
    expect(getPlatformBundlers(root, { platforms: ['ios', 'android'] } as any)).toEqual({
      ios: 'metro', android: 'metro', web: 'metro',
    });
  });
});
