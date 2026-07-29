import { run } from '../utils/exec';
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
    log.step('expo prebuild（ios/android）');
    run(`npx expo prebuild ${nativeArgs.join(' ')}`.trim(), { cwd: projectRoot });
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
