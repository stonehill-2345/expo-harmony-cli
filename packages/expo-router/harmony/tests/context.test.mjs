import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

test('Harmony context passes the app root and import mode and preserves native intent', async () => {
  const source = await readFile(new URL('../../_ctx.harmony.js', import.meta.url), 'utf8');
  let args;
  const context = vm.createContext({
    process: { env: { EXPO_ROUTER_APP_ROOT: './app', EXPO_ROUTER_IMPORT_MODE: 'sync' } },
    require: { context: (...values) => { args = values; return { captured: true }; } },
  });
  const module = new vm.SourceTextModule(source, { context });
  await module.link(() => { throw new Error('Unexpected context module import'); });
  await module.evaluate();
  assert.equal(args[0], './app');
  assert.equal(args[1], true);
  assert.equal(args[3], 'sync');
  for (const key of ['./index.tsx', './index.harmony.tsx', './index.native.tsx', './+native-intent.ts', './(group)/[id].tsx']) {
    assert.ok(args[2].test(key), `must include ${key}`);
  }
  for (const key of ['./+html.tsx', './+middleware.ts', './data+api.ts', './nested/data+api.tsx', './photo.png']) {
    assert.ok(!args[2].test(key), `must exclude ${key}`);
  }
});
