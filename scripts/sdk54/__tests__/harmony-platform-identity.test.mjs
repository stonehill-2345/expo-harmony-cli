import assert from 'node:assert/strict';
import test from 'node:test';

import { runHarmonyPlatformIdentity } from '../test-harmony-platform-identity.mjs';

test('Harmony platform identification uses installed identities without managed state or process flags', () => {
  const result = runHarmonyPlatformIdentity({ verbose: false });
  assert.equal(result.passed, true);
  assert.ok(result.cases.length > 0);
  assert.equal(new Set(result.cases.map(({ id }) => id)).size, result.cases.length);
  assert.ok(result.cases.every(({ passed }) => passed));
  for (const id of ['foreign-release-name', 'self-consistent-foreign-expo-and-rnoh-versions', 'changed-expo-install-spec', 'changed-expo-upstream-version', 'duplicate-release-expo-entry']) {
    assert.ok(result.cases.some((entry) => entry.id === id), `${id} must be exercised`);
  }
});
