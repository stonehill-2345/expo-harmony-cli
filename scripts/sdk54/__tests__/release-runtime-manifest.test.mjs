import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReleaseManifest } from '../release-catalog.mjs';

// 运行时 manifest 是 CLI 发布物的一部分（template-contract/release 校验的唯一依据），
// 却没有任何脚本负责再生，历史上多次与 release-catalog 漂移（1.7.0 的 expo@54.0.38 事件）。
// 本测试锁死：apps/cli/content/releases/sdk-54/manifest.json 必须逐字段等于目录生成物。
test('runtime release manifest must equal the catalog output (no pin drift)', () => {
  const runtimePath = path.join(
    fileURLToPath(new URL('../../../', import.meta.url)),
    'apps/cli/content/releases/sdk-54/manifest.json',
  );
  const runtime = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));
  const expected = createReleaseManifest();
  assert.deepEqual(runtime, expected,
    'apps/cli/content/releases/sdk-54/manifest.json 与 scripts/sdk54/release-catalog.mjs 漂移；'
    + '请运行 node scripts/sdk54/generate-release-manifest.mjs --output apps/cli/content/releases/sdk-54/manifest.json 后重试');
});
