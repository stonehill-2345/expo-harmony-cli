import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { scanAndAdapt } from '../scanner/scan';
import { log } from '../utils/log';

/** scan 命令：手动重跑扫描适配（用户后期加包后用）。*/
export async function scan(_args: string[]): Promise<void> {
  const projectRoot = process.cwd();
  if (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
    throw new Error('当前目录非项目根（缺 package.json）');
  }
  const apply = _args.includes('--apply');
  log.step(apply ? '应用扫描适配' : '预览扫描适配（只读）');
  let scanRoot = projectRoot;
  let tempRoot: string | undefined;
  if (!apply) {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-harmony-scan-'));
    for (const name of ['package.json', 'app.json', 'app.config.js', 'app.config.ts']) {
      const source = path.join(projectRoot, name);
      if (fs.existsSync(source)) fs.copyFileSync(source, path.join(tempRoot, name));
    }
    for (const dir of ['shims', 'patches', '.expo-harmony']) {
      const source = path.join(projectRoot, dir);
      if (fs.existsSync(source)) fs.cpSync(source, path.join(tempRoot, dir), { recursive: true });
    }
    scanRoot = tempRoot;
  }
  try {
    const report = scanAndAdapt(scanRoot);
    log.info(`bump ${report.bumped.length} / 原生包 ${report.addedNative.length} / alias-only ${report.addedAliasOnly.length} / 删 ${report.removed.length} / 替换 ${report.replaced.length} / patch ${report.patched.length} / 回收 ${report.reconciled.length}`);
    if (apply && fs.existsSync(path.join(projectRoot, 'harmony'))) {
      log.success('扫描完成。下一步：pnpm install，然后执行 pnpm dlx expo-harmony-cli sync');
    } else if (apply) {
      log.success('扫描完成。下一步：pnpm install（让新加的鸿蒙包生效）');
    } else {
      log.info('只读预览完成。未修改项目；确认后请使用 scan --apply 应用变更。');
    }
  } finally {
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}
