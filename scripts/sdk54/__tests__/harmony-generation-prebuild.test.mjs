import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadM1Source } from '../m1-test-support.mjs';

const cli = loadM1Source('packages/@expo/cli/src/prebuild/harmony/prebuildHarmonyAsync.ts', {
  '../../harmony/dependencies': { ensureHarmonyDependenciesAsync: async () => {} },
});
const { runHarmonyGenerationTransactionAsync } = loadM1Source('packages/expo-modules-autolinking/src/platforms/harmony/generationTransaction.ts');
const put = (root, file, value) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), value);
};
for (const fail of [false, true]) test(`CLI clean finalizes inside staging and ${fail ? 'rolls back finalizer failure' : 'returns a full backup'}`, async t => {
  const project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-m2-prebuild-')));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  put(project, 'harmony/manual.ets', 'user');
  let finalizerCalls = 0;
  const action = cli.prebuildHarmonyAsync(project, { install: false, clean: true }, {
    getConfig: () => ({ exp: { name: 'Example', slug: 'example' } }),
    ensureDependencies: async () => {},
    compileConfig: async () => ({ nativeConfig: { app: {}, module: {} } }),
    removeHarmonyProject: async () => { throw new Error('CLI must not remove the old project'); },
    updateDebugBundlePath: async (_root, stageRoot) => {
      finalizerCalls++;
      assert.notEqual(stageRoot, path.join(project, 'harmony'));
      assert.equal(fs.readFileSync(path.join(project, 'harmony/manual.ets'), 'utf8'), 'user');
      if (fail) throw new Error('injected entry resolution failure');
      put(stageRoot, 'debug.txt', 'resolved entry');
    },
    loadAutolinking: async () => ({
      queryAutolinkingModulesFromProjectAsync: async () => [{ packageName: 'expo-modules-core', packageRoot: '/core' }],
      validateHarmonyAppAssetsAsync: async () => {},
      syncHarmonyNativeProjectAsync: async options => {
        assert.equal(options.clean, true);
        assert.equal(typeof options.finalize, 'function');
        const transaction = await runHarmonyGenerationTransactionAsync({ projectRoot: project, clean: options.clean,
          generate: async stageRoot => { put(stageRoot, 'native.txt', 'new'); await options.finalize(stageRoot); },
        });
        return { harmonyRoot: transaction.harmonyRoot, backupPath: transaction.backupPath };
      },
    }),
  });
  if (fail) {
    await assert.rejects(action, /injected entry resolution failure/);
    assert.deepEqual(fs.readdirSync(path.join(project, 'harmony')), ['manual.ets']);
  } else {
    const result = await action;
    assert.equal(fs.readFileSync(path.join(result.backupPath, 'manual.ets'), 'utf8'), 'user');
    assert.equal(fs.readFileSync(path.join(result.harmonyRoot, 'debug.txt'), 'utf8'), 'resolved entry');
  }
  assert.equal(finalizerCalls, 1);
});
