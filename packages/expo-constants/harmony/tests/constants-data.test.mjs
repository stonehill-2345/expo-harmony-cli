import assert from 'node:assert/strict';
import test from 'node:test';

import { buildConstants, parseAppConfig } from '../src/main/ets/ConstantsData.ts';

test('parseAppConfig preserves the generated public Expo config', () => {
  const config = parseAppConfig('{"name":"Fixture","slug":"fixture","version":"1.2.3","scheme":"fixture"}');

  assert.deepEqual(config, {
    name: 'Fixture',
    slug: 'fixture',
    version: '1.2.3',
    scheme: 'fixture',
  });
});

test('parseAppConfig treats a missing resource as no manifest', () => {
  assert.equal(parseAppConfig(null), null);
});

test('parseAppConfig rejects malformed or non-object config', () => {
  assert.throws(() => parseAppConfig('{'), /Invalid embedded app.config/);
  assert.throws(() => parseAppConfig('[]'), /must contain a JSON object/);
});

test('buildConstants exposes bare-host values without Expo Go placeholders', () => {
  const manifest = { name: 'Fixture', slug: 'fixture', version: '1.2.3', scheme: 'fixture' };
  const constants = buildConstants({
    sessionId: 'e3fc2f02-7ab4-4cf0-8e96-f981d2f27777',
    manifest,
    deviceName: 'Harmony Device',
    systemVersion: 'HarmonyOS 6.0',
    statusBarHeight: 32,
    systemFonts: ['HarmonyOS Sans'],
    debugMode: true,
    launchUri: 'fixture://launch',
    versionCode: 12,
    versionName: '1.2.3',
  });

  assert.equal(constants.name, 'ExponentConstants');
  assert.equal(constants.executionEnvironment, 'bare');
  assert.equal(constants.appOwnership, null);
  assert.equal(constants.expoVersion, null);
  assert.equal(constants.sessionId, 'e3fc2f02-7ab4-4cf0-8e96-f981d2f27777');
  assert.equal(constants.manifest, manifest);
  assert.equal(constants.debugMode, true);
  assert.equal(constants.linkingUri, 'fixture://launch');
  assert.deepEqual(constants.platform, {
    harmony: { versionCode: 12, versionName: '1.2.3' },
  });
  assert.equal(Object.hasOwn(constants, 'installationId'), false);
  assert.equal(Object.hasOwn(constants, 'expoConfig'), false);
});
