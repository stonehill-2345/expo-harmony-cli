import * as fs from 'fs';
import * as path from 'path';
import { syncHarmonyAutolinking } from '../harmony-project';
import { log } from '../utils/log';

/** sync 命令：只刷新 HarmonyOS autolinking 托管文件，不覆盖原生工程。 */
export async function sync(_args: string[] = []): Promise<void> {
  const projectRoot = process.cwd();
  if (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
    throw new Error('当前目录非项目根（缺 package.json）');
  }
  if (!fs.existsSync(path.join(projectRoot, 'harmony'))) {
    throw new Error(
      'harmony/ 尚未生成。请先执行：pnpm dlx expo-harmony-cli prebuild --platform harmony',
    );
  }

  log.step('同步 HarmonyOS 原生注册');
  const result = syncHarmonyAutolinking(projectRoot);
  log.success(`HarmonyOS 原生注册已同步（${result.linked.length} 个包）`);
  log.info('下一步：cd harmony && ohpm install，再在 DevEco Studio 重新构建');
}
