import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { parseStageArgs } from '../stage-e2e-packages.mjs';

test('requires an explicit public external package directory', () => {
  assert.throws(
    () => parseStageArgs([], { cwd: '/repo', tmpDir: '/tmp', env: {} }),
    /--external or SDK54_EXTERNAL_DIR is required/,
  );
});

test('uses explicit or environment input and a portable temporary output default', () => {
  assert.deepEqual(
    parseStageArgs(['--external', './tgz'], { cwd: '/repo', tmpDir: '/tmp', env: {} }),
    { externalDir: path.resolve('/repo/tgz'), outputDir: path.resolve('/tmp/expo-sdk54-migration-tgz') },
  );
  assert.deepEqual(
    parseStageArgs([], { cwd: '/repo', tmpDir: '/tmp', env: { SDK54_EXTERNAL_DIR: './public-tgzs', SDK54_STAGE_OUTPUT_DIR: './stage' } }),
    { externalDir: path.resolve('/repo/public-tgzs'), outputDir: path.resolve('/repo/stage') },
  );
});
