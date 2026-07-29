import * as fs from 'fs';
import * as path from 'path';
import { scanAndAdapt } from '../scanner/scan';
import { log } from '../utils/log';

/** scan 命令：手动重跑扫描适配（用户后期加包后用）。*/
export async function scan(_args: string[]): Promise<void> {
  const projectRoot = process.cwd();
  if (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
    throw new Error('当前目录非项目根（缺 package.json）');
  }
  log.step('重跑扫描适配');
  const report = scanAndAdapt(projectRoot);
  log.info(`bump ${report.bumped.length} / 原生包 ${report.addedNative.length} / alias-only ${report.addedAliasOnly.length} / 删 ${report.removed.length} / 替换 ${report.replaced.length} / patch ${report.patched.length} / 回收 ${report.reconciled.length}`);
  if (fs.existsSync(path.join(projectRoot, 'harmony'))) {
    log.success('扫描完成。下一步：pnpm install，然后执行 pnpm dlx expo-harmony-cli sync');
  } else {
    log.success('扫描完成。下一步：pnpm install（让新加的鸿蒙包生效）');
  }
}
