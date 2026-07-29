import * as fs from 'fs';
import * as path from 'path';
import { runFileQuiet } from './utils/exec';
import { log } from './utils/log';
import { resolvePm } from './lib/pkg-manager';
import { injectHarmonyBaseline } from './injector';
import { scanAndAdapt } from './scanner/scan';
import { cleanupHTemplateCode } from './h-cleanup';
import { injectContent } from './content-injector';
import { printTip } from './tips';
import { buildBundleName } from './utils/bundle-name';

const OPTIONAL_DEFAULT_TEMPLATE_DEPENDENCIES = ['react-native-webview'];

/** 默认 Expo 模板携带但首屏不使用的能力不进入 HarmonyOS 初装依赖；用户后续 install 时仍按兼容表适配。 */
function removeOptionalDefaultTemplateDependencies(targetDir: string): void {
  const packageJsonPath = path.join(targetDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  for (const dependency of OPTIONAL_DEFAULT_TEMPLATE_DEPENDENCIES) {
    delete pkg.dependencies?.[dependency];
    delete pkg.devDependencies?.[dependency];
  }

  fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2));
}

export interface CreateOptions {
  cwd?: string;
}

const SAFE_PROJECT_NAME = /^[a-z0-9][a-z0-9._-]*$/;

function assertValidProjectName(projectName: string): void {
  if (!SAFE_PROJECT_NAME.test(projectName)) {
    throw new Error('项目名仅支持小写字母、数字、点、下划线和连字符，且必须以字母或数字开头。');
  }
}

function getCommandErrorDetail(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const commandError = error as Error & { stdout?: string | Buffer; stderr?: string | Buffer };
  const output = [commandError.stderr, commandError.stdout]
    .map((value) => value?.toString().trim())
    .filter((value): value is string => Boolean(value))
    .join('\n');
  return output || error.message;
}

async function runStep<T>(message: string, action: () => T | Promise<T>): Promise<T> {
  const task = log.task(message);
  try {
    const result = await action();
    task.success();
    return result;
  } catch (error) {
    task.fail();
    throw error;
  }
}

/** create 命令编排：创建模板 → 注入鸿蒙基线 → 适配依赖 → 写入开发资料。*/
export async function runCreate(args: string[], opts: CreateOptions = {}): Promise<void> {
  const projectName = args[0];
  if (!projectName) throw new Error('用法: expo-harmony-cli <project-name>');
  assertValidProjectName(projectName);

  const cwd = opts.cwd || process.cwd();

  // 步骤 1：拉 create-expo-app（不装依赖）
  try {
    await runStep('1/4 创建 Expo SDK 52 模板', () =>
      runFileQuiet('npx', ['create-expo-app', projectName, '--template', 'default@sdk-52', '--no-install'], { cwd }),
    );
  } catch (error) {
    throw new Error(`创建 Expo SDK 52 模板失败。请检查网络、npm 源或目标目录。\n${getCommandErrorDetail(error)}`);
  }
  const targetDir = path.resolve(cwd, projectName);

  // 读 app.json 拿 slug/scheme/name（bundleName = com.example.<清洗后 slug>，鸿蒙禁横杠）
  const app = JSON.parse(fs.readFileSync(path.join(targetDir, 'app.json'), 'utf8'));
  const slug = app.expo.slug || projectName;
  const scheme = app.expo.scheme || slug;
  const appName = app.expo.name || projectName;
  const bundleName = buildBundleName(slug);

  // 步骤 2：注入鸿蒙基线
  await runStep('2/4 注入 HarmonyOS 基线', () => {
    injectHarmonyBaseline(targetDir, { slug, scheme });
  });

  // 步骤 3：扫描适配 + 清理不兼容的默认模板代码
  const report = await runStep('3/4 适配默认模板依赖', () => {
    removeOptionalDefaultTemplateDependencies(targetDir);
    const result = scanAndAdapt(targetDir);
    cleanupHTemplateCode(targetDir, { removed: [...result.removed, 'expo-splash-screen'], replaced: result.replaced });
    return result;
  });
  log.info(`bump ${report.bumped.length} / 原生包 ${report.addedNative.length} / alias-only ${report.addedAliasOnly.length} / 删 ${report.removed.length} / 替换 ${report.replaced.length} / patch ${report.patched.length}`);

  // 步骤 4：文档与技能在依赖适配完成后写入
  await runStep('4/4 写入开发资料', () => {
    injectContent(targetDir, { appName, slug, bundleName });
  });

  log.success(`已创建：${projectName}`);
  const pm = resolvePm(args, targetDir);
  printTip('create.complete', { pm, projectName });
}
