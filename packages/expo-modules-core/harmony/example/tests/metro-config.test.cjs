const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');

const root = process.env.EXPO_HARMONY_EXAMPLE_ROOT;
assert.ok(root, 'EXPO_HARMONY_EXAMPLE_ROOT is required');
const requireApp = createRequire(path.join(root, 'package.json'));
const { getDefaultConfig } = requireApp('@expo/metro-config');

test('SDK config enables Harmony without an application metro.config.js', () => {
  const config = getDefaultConfig(root, { platform: 'harmony' });
  assert.ok(config.resolver.platforms.includes('harmony'));
  const before = config.serializer.getModulesRunBeforeMainModule(path.join(root, 'index.ts'));
  assert.ok(before[0].includes('@react-native-oh/react-native-harmony/Libraries/Core/InitializeCore'));
  assert.equal(typeof config.resolver.resolveRequest, 'function');
});

test('SDK config does not change the default Android/iOS initialization', () => {
  const config = getDefaultConfig(root);
  const before = config.serializer.getModulesRunBeforeMainModule(path.join(root, 'index.ts'));
  assert.ok(before[0].includes('/react-native/Libraries/Core/InitializeCore'));
  assert.ok(!before[0].includes('react-native-harmony'));
});
