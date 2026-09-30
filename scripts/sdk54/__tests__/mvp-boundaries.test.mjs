import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertMvpBoundaries } from '../mvp-boundaries.mjs';

function createFixture(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-boundaries-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
  }
  return root;
}

const validFiles = {
  'scripts/sdk54/catalog.mjs': "export const SDK54_PACKAGES = [{ name: 'expo-router' }];\n",
  'apps/example/package.json': '{"dependencies":{"react-native":"0.82.1"}}\n',
  'apps/example/App.tsx': "import { Image } from 'react-native';\n",
  'apps/cli/src/scanner/compat-table.ts':
    "function buildCompatTable54() { return { 'expo-image': { status: 'patch-only', patch: {} } }; }\n" +
    'export function getCompatTable() {}\n',
  'docs/releases/sdk54-mvp.md':
    'Router limit: single-level POP_TO / single-level dismissTo.\n' +
    'WebBrowser limit: ordinary ArkWeb open/close.\n',
};

test('reports catalog, multi-level Router, and OAuth scope expansion separately', (t) => {
  const root = createFixture(t, {
    ...validFiles,
    'scripts/sdk54/catalog.mjs': "export const SDK54_PACKAGES = [{ name: 'expo-image' }];\n",
    'docs/releases/sdk54-mvp.md':
      'multiLevelDismissTo: true\nOAuth complete\nsingle-level dismissTo\nordinary ArkWeb open/close\n',
  });
  const violations = assertMvpBoundaries(root);
  assert.ok(violations.includes('SDK54 catalog must not include expo-image'));
  assert.ok(violations.includes('Router MVP must not claim multi-level dismissTo support'));
  assert.ok(violations.includes('WebBrowser MVP must not claim complete OAuth support'));
});

test('rejects expo-image usage in the public example', (t) => {
  const root = createFixture(t, {
    ...validFiles,
    'apps/example/App.tsx': "import { Image } from 'expo-image';\n",
  });
  const violations = assertMvpBoundaries(root);
  assert.ok(violations.includes('public example must not depend on or import expo-image'));
});

test('rejects application bypass files and dependencies in the fresh fixture', (t) => {
  const root = createFixture(t, {
    ...validFiles,
    'apps/example/metro.config.js': 'module.exports = {};\n',
    'apps/example/index.harmony.js': 'require("./shims/runtime");\n',
    'apps/example/shims/runtime.js': 'module.exports = {};\n',
    'apps/example/package.json': JSON.stringify({
      dependencies: { 'patch-package': '8.0.0' },
      scripts: { postinstall: 'patch-package' },
    }),
  });
  const violations = assertMvpBoundaries(root);
  assert.ok(violations.includes('fresh fixture must not include metro.config.js'));
  assert.ok(violations.includes('fresh fixture must not include index.harmony.js'));
  assert.ok(violations.includes('fresh fixture must not include shims/'));
  assert.ok(violations.includes('fresh fixture must not depend on patch-package'));
  assert.ok(violations.includes('fresh fixture must not define postinstall'));
});

test('accepts the documented single-level Router and ordinary ArkWeb limits', (t) => {
  const root = createFixture(t, validFiles);
  assert.deepEqual(assertMvpBoundaries(root), []);
});

test('accepts Chinese limits and negative multi-screen statements', (t) => {
  const root = createFixture(t, {
    ...validFiles,
    'docs/releases/sdk54-mvp.md':
      'Default 模板完成单层 `dismissTo` 验收。\n' +
      'native-first `dismissTo` 只覆盖目标恰好为上一层路由的 Harmony `POP_TO`。\n' +
      'WebBrowser 是应用内 ArkWeb，不等价于系统浏览器 Cookie/SSO 或完整认证会话。\n' +
      'multi-screen dismissTo native animation is not added.\n',
  });
  assert.deepEqual(assertMvpBoundaries(root), []);
});

test('the current repository stays within the SDK54 MVP boundaries', () => {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  assert.deepEqual(assertMvpBoundaries(repositoryRoot), []);
});
