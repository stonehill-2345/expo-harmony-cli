import { expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { withHarmony } from '../../../../packages/@expo/metro-config/src/withHarmony';

it('resolves a Harmony package published under a different name in pnpm storage', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'metro-release-'));
  try {
    const rnoh = path.join(root, 'node_modules/@react-native-oh/react-native-harmony');
    fs.mkdirSync(path.join(rnoh, 'Libraries/Core'), { recursive: true });
    fs.writeFileSync(path.join(rnoh, 'package.json'), '{}');
    fs.writeFileSync(path.join(rnoh, 'metro.config.js'), 'exports.createHarmonyMetroConfig = () => ({ resolver: { resolveRequest: () => null } });');
    fs.writeFileSync(path.join(rnoh, 'Libraries/Core/InitializeCore.js'), '');
    const screens = path.join(root, 'node_modules/.pnpm/screens/node_modules/@expo-oh/react-native-screens');
    fs.mkdirSync(screens, { recursive: true });
    fs.writeFileSync(path.join(screens, 'package.json'), JSON.stringify({ name: '@expo-oh/react-native-screens', harmony: { alias: 'react-native-screens' } }));
    fs.mkdirSync(path.join(root, 'node_modules/@react-native-ohos'));
    fs.symlinkSync(screens, path.join(root, 'node_modules/@react-native-ohos/react-native-screens'));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { '@react-native-ohos/react-native-screens': 'npm:@expo-oh/react-native-screens@4.9.0' } }));
    const config = withHarmony({ resolver: { platforms: ['ios'], extraNodeModules: { existing: '/existing' } }, serializer: {} } as any, root);
    expect(config.resolver.extraNodeModules?.['@expo-oh/react-native-screens']).toBe(fs.realpathSync(screens));
    expect(config.resolver.extraNodeModules?.existing).toBe('/existing');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
