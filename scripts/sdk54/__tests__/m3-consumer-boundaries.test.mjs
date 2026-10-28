import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { createConsumerConfig } from '../test-m3-author-contract.mjs';
import { loadM1Source } from '../m1-test-support.mjs';

test('M3 consumer configuration satisfies native media validation across plugin lifecycle', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-m3-media-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'assets'));
  fs.writeFileSync(path.join(root, 'assets/harmony.png'), 'fixture');
  const { validateHarmonyAppAssetsAsync } = loadM1Source('packages/expo-modules-autolinking/src/platforms/harmony/nativeProject.ts');
  for (const pm of ['npm', 'pnpm']) for (const enabled of [true, false]) {
    await validateHarmonyAppAssetsAsync(root, createConsumerConfig(pm, enabled));
  }
});

for (const location of ['repository', 'symlink']) {
  test(`M3 consumption rejects ${location} workspace before writing evidence or installing`, t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-m3-boundary-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const evidence = path.join(root, 'evidence');
    const work = location === 'repository' ? process.cwd() : path.join(root, 'alias');
    if (location === 'symlink') fs.symlinkSync(process.cwd(), work);
    const result = spawnSync(process.execPath, ['scripts/sdk54/test-m3-author-contract.mjs',
      '--work-dir', work, '--evidence-dir', evidence, '--runtime-dir', path.join(root, 'missing'),
      '--release-sha256', 'unavailable'], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /M3 consumers must be outside repository/);
    assert.equal(fs.existsSync(evidence), false);
  });
}
