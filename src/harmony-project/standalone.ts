import * as fs from 'fs';
import * as path from 'path';
import type { HarmonyGenerationOptions } from './types';
import { resolveBundleName, resolveAppName } from './config-merger';
import { initProject } from './init-project';
import { runAutolinking, type AutolinkingResult } from './autolinking';
import { HARMONY_PACKAGE_MAPPING } from './harmony-package-mapping';

/**
 * 编排：resolveBundleName/appName → init（模板拷贝 + 6 动态渲染 + gitignore 重命名 +
 * build-profile.template）→ autolinking（写三文件 + oh-package 合并）。
 *
 * init 流程参考官方 cli B 节。metro.config.js 不写（expo 项目已有，spec 决策）。
 */
export async function runHarmonyGeneration(
  projectRoot: string,
  expoConfig: any,
  opts: HarmonyGenerationOptions = {},
): Promise<void> {
  const bundleName = opts.bundleName ?? resolveBundleName(expoConfig);
  const appName = opts.appName ?? resolveAppName(expoConfig);
  const rnohNpmPackageName = opts.rnohNpmPackageName ?? '@react-native-oh/react-native-harmony';
  const rnohCliNpmPackageName =
    opts.rnohCliNpmPackageName ?? '@react-native-oh/react-native-harmony-cli';
  const harmonyDir = path.join(projectRoot, 'harmony');

  if (fs.existsSync(harmonyDir) && !opts.force) {
    throw new Error(
      `harmony/ 已存在。如需覆盖生成，请执行：pnpm dlx expo-harmony-cli prebuild --platform harmony --force`,
    );
  }
  if (opts.force && fs.existsSync(harmonyDir)) {
    fs.rmSync(harmonyDir, { recursive: true, force: true });
  }

  // ① init：模板拷贝 + 6 动态渲染 + gitignore 重命名 + build-profile.template
  await initProject({
    projectRoot,
    harmonyDir,
    bundleName,
    appName,
    rnohNpmPackageName,
    rnohCliNpmPackageName,
    templateSource: opts.templateSource,
  });

  // ② autolinking：写三文件（ets/cpp/cmake）+ 合并 oh-package.json5
  syncHarmonyAutolinking(projectRoot);
}

/**
 * 仅刷新 HarmonyOS 原生依赖的 autolinking 托管文件。
 * 不复制模板、不删除 harmony/，因此不会影响签名、资源和其他非托管配置。
 */
export function syncHarmonyAutolinking(projectRoot: string): AutolinkingResult {
  const harmonyDir = path.join(projectRoot, 'harmony');
  if (!fs.existsSync(harmonyDir)) {
    throw new Error(
      'harmony/ 尚未生成。请先执行：pnpm dlx expo-harmony-cli prebuild --platform harmony',
    );
  }

  const result = runAutolinking({
    projectRoot,
    harmonyDir,
    mapping: HARMONY_PACKAGE_MAPPING,
  });
  for (const file of result.files) {
    fs.mkdirSync(path.dirname(file.path), { recursive: true });
    fs.writeFileSync(file.path, file.content);
  }
  return result;
}
