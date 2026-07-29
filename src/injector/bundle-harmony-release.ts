import * as fs from 'fs';
import * as path from 'path';

const BUNDLE_HARMONY_RELEASE_JS = `#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rawfileDir = path.join('harmony', 'entry', 'src', 'main', 'resources', 'rawfile');
const bundlePath = path.join(rawfileDir, 'bundle.harmony.js');
const assetsDir = path.join(rawfileDir, 'assets');

if (!fs.existsSync(path.join('harmony', 'entry'))) {
  console.error('[harmony] Missing harmony/entry. Run prebuild first:');
  console.error('  pnpm dlx expo-harmony-cli prebuild --platform harmony');
  process.exit(1);
}

try {
  require.resolve('@react-native-community/cli/package.json');
} catch {
  console.error('[harmony] Missing @react-native-community/cli required by react-native bundle-harmony.');
  console.error('  pnpm add -D @react-native-community/cli@20.1.1');
  process.exit(1);
}

fs.mkdirSync(rawfileDir, { recursive: true });
// Do not accept a stale bundle when bundle-harmony reports an error without a non-zero exit code.
fs.rmSync(bundlePath, { force: true });
fs.rmSync(assetsDir, { recursive: true, force: true });

const reactNative = process.platform === 'win32' ? 'react-native.cmd' : 'react-native';
const result = spawnSync(
  reactNative,
  [
    'bundle-harmony',
    '--dev',
    'false',
    '--entry-file',
    'index.harmony.js',
    '--bundle-output',
    bundlePath,
    '--assets-dest',
    assetsDir,
  ],
  {
    stdio: 'inherit',
    env: { ...process.env, RN_BUNDLE_PLATFORM: 'harmony' },
  },
);

if (result.error || result.status !== 0 || !fs.existsSync(bundlePath) || fs.statSync(bundlePath).size === 0) {
  console.error('[harmony] Release bundle was not generated: ' + bundlePath);
  process.exit(result.status || 1);
}

console.log('[harmony] Release bundle ready: ' + bundlePath);
console.log('[harmony] Next: build the release HAP in DevEco Studio with the release signing profile.');
`;

/** 写入可复现的 release JS bundle 生成脚本。 */
export function writeBundleHarmonyRelease(targetDir: string): void {
  const scriptsDir = path.join(targetDir, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  const file = path.join(scriptsDir, 'bundle-harmony-release.js');
  fs.writeFileSync(file, BUNDLE_HARMONY_RELEASE_JS);
  fs.chmodSync(file, 0o755);
}
