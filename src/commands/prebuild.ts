import * as fs from 'fs';
import * as path from 'path';
import { runFile } from '../utils/exec';
import { log } from '../utils/log';
import { resolveTasks } from '../prebuild/runner';
import { preflight } from '../prebuild/preflight';
import { postflight } from '../prebuild/postflight';
import { runHarmonyGeneration } from '../harmony-project';
import { writeMetroConfig } from '../injector/metro-config';
import { getConfig } from '@expo/config';
import { cleanupStaleIosTemplateOverrides } from '../h-cleanup';

export async function prebuild(args: string[]): Promise<void> {
  const projectRoot = process.cwd();
  const skipPreflight = args.includes('--skip-preflight');

  preflight(projectRoot, skipPreflight);
  cleanupStaleIosTemplateOverrides(projectRoot);

  const { runNative, nativeArgs, runHarmony } = resolveTasks(args);

  if (runNative) {
    // 工程未安装依赖时 npx 会静默拉取最新 expo（与锁定的 SDK 版本不符，如 52 工程被
    // 57 接管 prebuild），前置拦截并引导先装依赖；--no-install 禁止 npx 兜底下载。
    if (!fs.existsSync(path.join(projectRoot, 'node_modules', 'expo'))) {
      throw new Error(
        'expo 未安装：请先在项目内执行依赖安装（如 pnpm install）再运行 prebuild，' +
          '否则 npx 会拉取与项目 SDK 版本不符的最新 expo',
      );
    }
    log.step('expo prebuild（ios/android）');
    runFile('npx', ['--no-install', 'expo', 'prebuild', ...nativeArgs], { cwd: projectRoot });
  }

  if (runHarmony) {
    log.step('生成 harmony/ 目录（内置 HarmonyOS 生成器）');
    const { exp } = getConfig(projectRoot);
    const force = args.includes('--clean') || args.includes('--force');
    // 同步模板升级后的 HarmonyOS resolver，避免旧项目保留过期 metro.config.js。
    writeMetroConfig(projectRoot);
    await runHarmonyGeneration(projectRoot, exp, { force });
  }

  postflight(projectRoot, runHarmony);
}
