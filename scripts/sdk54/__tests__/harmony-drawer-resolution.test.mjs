import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadM1Source } from '../m1-test-support.mjs';

test('Harmony Drawer uses real native gestures in source and built packages without redirecting other platforms', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-drawer-'));
  try {
    fs.writeFileSync(path.join(root, 'package.json'), '{}');
    fs.mkdirSync(path.join(root, 'Libraries/Core'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Libraries/Core/InitializeCore.js'), '');
    const resolveFrom = () => path.join(root, 'package.json');
    const { withHarmony } = loadM1Source('packages/@expo/metro-config/src/withHarmony.ts', {
      'resolve-from': resolveFrom,
      [path.join(root, 'metro.config')]: { createHarmonyMetroConfig: () => ({ resolver: { resolveRequest: (_context, moduleName) => ({ type: 'sourceFile', filePath: moduleName }) } }) },
    });
    const config = withHarmony({ resolver: { platforms: ['ios', 'android'] }, serializer: {} }, root);
    const context = { resolveRequest: (_context, filePath, platform) => ({ type: 'sourceFile', filePath, platform }) };
    for (const prefix of ['src', 'lib/module']) {
      const file = `/project/node_modules/react-native-drawer-layout/${prefix}/views/GestureHandler.${prefix === 'src' ? 'tsx' : 'js'}`;
      const actual = config.resolver.resolveRequest(context, file, 'harmony');
      assert.equal(actual.filePath, path.join(path.dirname(file), 'GestureHandlerNative'));
      for (const platform of ['ios', 'android', 'web']) assert.equal(config.resolver.resolveRequest(context, file, platform).filePath, file);
    }
    const unrelated = '/project/src/views/GestureHandler.tsx';
    assert.equal(config.resolver.resolveRequest(context, unrelated, 'harmony').filePath, unrelated);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
