import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { loadSdk54PatchManifest } from '../../src/sdk54/patch-manifest';
import { buildSdk54PackageJson } from '../../src/sdk54/package-json';

const manifest = loadSdk54PatchManifest(path.resolve(__dirname, '../..'));

describe('buildSdk54PackageJson', () => {
  const current = {
    name: 'my-app',
    main: 'expo-router/entry',
    scripts: { start: 'expo start', lint: 'expo lint' },
    expo: { router: { origin: false } },
    dependencies: { 'expo-image': '3.0.11', stale: '^1.0.0' },
    devDependencies: { staleDev: '~1.0.0' },
  };

  it('builds the exact blank-typescript dependency set', () => {
    const result = buildSdk54PackageJson(current, 'blank-typescript', manifest) as any;
    expect(result.name).toBe('my-app');
    expect(result.main).toBe('expo-router/entry');
    expect(result.scripts).toEqual(current.scripts);
    expect(result.expo).toEqual(current.expo);
    expect(result.dependencies.expo).toBe('54.0.37');
    expect(result.dependencies.react).toBe('19.1.1');
    expect(result.dependencies['react-native']).toBe('0.82.1');
    expect(result.dependencies['@react-native-oh/react-native-harmony']).toBe('0.82.30');
    expect(result.dependencies['@react-native-oh/react-native-harmony-cli']).toBe('0.82.30');
    expect(result.dependencies['expo-router']).toBeUndefined();
    expect(result.dependencies['expo-web-browser']).toBeUndefined();
    expect(result.dependencies['expo-image']).toBeUndefined();
    expect(result.dependencies.stale).toBeUndefined();
    expect(result.devDependencies).toEqual({
      '@types/react': '19.1.17',
      'patch-package': '8.0.0',
      typescript: '5.9.2',
    });
    expect(Object.keys(result.dependencies)).toEqual([...Object.keys(result.dependencies)].sort());
  });

  it('builds the exact default dependency set without expo-image', () => {
    const result = buildSdk54PackageJson(current, 'default', manifest) as any;
    expect(result.dependencies.expo).toBe('54.0.37');
    expect(result.dependencies['expo-router']).toBe('6.0.24');
    expect(result.dependencies['expo-web-browser']).toBe('15.0.11');
    expect(result.dependencies['@expo/vector-icons']).toBe('15.0.3');
    expect(result.dependencies['react-native-gesture-handler']).toBe('2.30.0');
    expect(result.dependencies['@react-native-ohos/react-native-gesture-handler']).toBe('2.30.1');
    expect(result.dependencies['react-native-reanimated']).toBe('4.2.1');
    expect(result.dependencies['@react-native-ohos/react-native-reanimated']).toBe('4.0.1');
    expect(result.dependencies['react-native-safe-area-context']).toBe('5.6.2');
    expect(result.dependencies['@react-native-ohos/react-native-safe-area-context']).toBe('5.6.3');
    expect(result.dependencies['react-native-screens']).toBe('4.17.1');
    expect(result.dependencies['@react-native-ohos/react-native-screens']).toBe('4.9.0');
    expect(result.dependencies['react-native-worklets']).toBe('0.7.1');
    expect(result.dependencies['@react-native-ohos/react-native-worklets']).toBe('1.0.0');
    expect(result.dependencies['expo-image']).toBeUndefined();
    expect(result.devDependencies['patch-package']).toBe('8.0.0');
  });

  it.each(['blank-typescript', 'default'] as const)('emits exact versions and stable JSON for %s', template => {
    const first = buildSdk54PackageJson(current, template, manifest) as any;
    const second = buildSdk54PackageJson(current, template, manifest) as any;
    const versions = [...Object.values(first.dependencies), ...Object.values(first.devDependencies)] as string[];
    expect(versions.every(version => !/^[~^]/.test(version))).toBe(true);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
