import * as fs from 'fs';
import * as path from 'path';

const BUNDLE_HARMONY_DEV_JS = `#!/usr/bin/env node
const { spawnSync } = require('child_process');

const reactNative = process.platform === 'win32' ? 'react-native.cmd' : 'react-native';
const result = spawnSync(
  reactNative,
  ['bundle-harmony', '--dev', 'false', '--entry-file', 'index.harmony.js'],
  {
    stdio: 'inherit',
    env: { ...process.env, RN_BUNDLE_PLATFORM: 'harmony' },
  },
);

if (result.error || result.status !== 0) {
  process.exit(result.status || 1);
}
`;

/** 写入跨平台的开发 bundle 脚本，避免 package.json 使用 POSIX 环境变量赋值。 */
export function writeBundleHarmonyDev(targetDir: string): void {
  const scriptsDir = path.join(targetDir, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.writeFileSync(path.join(scriptsDir, 'bundle-harmony-dev.js'), BUNDLE_HARMONY_DEV_JS);
}
