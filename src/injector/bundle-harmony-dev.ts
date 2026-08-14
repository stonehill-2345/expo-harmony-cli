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
    // Windows 上 react-native.cmd 必须经 shell 启动，否则 Node 直接返回 EINVAL（命令未执行、无任何输出）。
    shell: process.platform === 'win32',
  },
);

if (result.error) {
  console.error('[harmony] react-native 启动失败：' + result.error.message);
}
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
