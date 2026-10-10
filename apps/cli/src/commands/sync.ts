import * as fs from 'fs';
import * as path from 'path';
import { syncHarmonyAutolinking } from '../harmony-project';
import { log } from '../utils/log';
import { classifyHarmonyProject } from '../sdk54/project-state';

/** sync 命令：只刷新 HarmonyOS autolinking 托管文件，不覆盖原生工程。 */
export async function sync(args: string[] = []): Promise<void> {
  const projectRoot = process.cwd();
  if (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
    throw new Error('当前目录非项目根（缺 package.json）');
  }
  const kind = classifyHarmonyProject(projectRoot);
  if (kind === 'sdk54-scoped-packages') throw new Error('SDK54 @expo-oh 项目请使用 npx expo install / expo prebuild；不支持旧 injector 命令');
  if (kind === 'sdk54-package-patch') throw new Error('SDK54 package-patch 使用官方 expo prebuild/autolinking，不支持旧 sync');
  if (kind === 'sdk54-legacy') throw new Error('legacy SDK54 project：仅诊断，不自动迁移');
  if (!fs.existsSync(path.join(projectRoot, 'harmony'))) {
    throw new Error(
      'harmony/ 尚未生成。请先执行：pnpm dlx expo-harmony-cli prebuild --platform harmony',
    );
  }

  log.step('同步 HarmonyOS 原生注册');
  const result = await syncHarmonyAutolinking(projectRoot, { force: args.includes('--force') });
  log.success(`HarmonyOS 原生注册已同步（${result.linked.length} 个包）`);
  log.info('下一步：cd harmony && ohpm install，再在 DevEco Studio 重新构建');
}
