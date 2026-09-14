import * as fs from 'fs';
import * as path from 'path';
import { select } from '@inquirer/prompts';
import { runFileQuiet } from './utils/exec';
import { log } from './utils/log';
import { resolvePm } from './lib/pkg-manager';
import { injectHarmonyBaseline } from './injector';
import { scanAndAdapt } from './scanner/scan';
import { cleanupHTemplateCode } from './h-cleanup';
import { injectContent } from './content-injector';
import { printTip } from './tips';
import { buildBundleName } from './utils/bundle-name';
import { getVersionMatrix, type SdkVersion } from './version-matrix';

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

const SDK_CHOICES: Array<{ value: SdkVersion; label: string }> = [
  { value: 'sdk-54', label: 'Expo SDK 54 模板（RN 0.82）' },
  { value: 'sdk-52', label: 'Expo SDK 52 模板（RN 0.77）' },
];

function parseSdkFlag(args: string[]): { sdk: SdkVersion | null; rest: string[] } {
  let sdk: SdkVersion | null = null;
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg !== '--sdk' && !arg.startsWith('--sdk=')) {
      rest.push(arg);
      continue;
    }
    if (sdk !== null) throw new Error('--sdk 只能指定一次');
    const value = arg === '--sdk' ? args[++i] : arg.slice('--sdk='.length);
    if (value !== '52' && value !== '54') {
      throw new Error('--sdk 仅支持 52 或 54，例如 --sdk=52 或 --sdk 54');
    }
    sdk = value === '52' ? 'sdk-52' : 'sdk-54';
  }
  return { sdk, rest };
}

/** create 命令编排：选择 SDK → 创建模板 → 注入鸿蒙基线 → 适配依赖 → 写入开发资料。*/
export async function runCreate(args: string[], opts: CreateOptions = {}): Promise<void> {
  // 提取 --sdk flag（如有）
  const { sdk: flagSdk, rest } = parseSdkFlag(args);
  const projectName = rest[0];
  if (!projectName) throw new Error('用法: expo-harmony-cli <project-name> [--sdk=52|54]');
  assertValidProjectName(projectName);

  const cwd = opts.cwd || process.cwd();

  // 步骤 0：选择 Expo SDK 版本（--sdk flag 优先，否则交互式选择）
  if (flagSdk === null && (!process.stdin.isTTY || !process.stdout.isTTY)) {
    throw new Error('非交互环境必须显式指定 Expo SDK：请使用 --sdk=52 或 --sdk=54');
  }
  const sdk: SdkVersion = flagSdk ?? await select({
    message: '选择 Expo SDK 模板版本',
    choices: SDK_CHOICES.map(({ value, label }) => ({ value, name: label })),
    default: 'sdk-54',
  });

  const V = getVersionMatrix(sdk);
  const sdkLabel = sdk === 'sdk-52' ? 'SDK 52' : 'SDK 54';

  // 步骤 1：拉 create-expo-app（不装依赖）
  try {
    await runStep(`1/4 创建 Expo ${sdkLabel} 模板`, () =>
      runFileQuiet('npx', ['create-expo-app', projectName, '--template', `default@${V.expoSdk}`, '--no-install'], { cwd }),
    );
  } catch (error) {
    throw new Error(`创建 Expo ${sdkLabel} 模板失败。请检查网络、npm 源或目标目录。\n${getCommandErrorDetail(error)}`);
  }
  const targetDir = path.resolve(cwd, projectName);

  // 读 app.json 拿 slug/scheme/name（bundleName = com.example.<清洗后 slug>，鸿蒙禁横杠）
  let slug: string;
  let scheme: string;
  let appName: string;
  let bundleName: string;
  try {
    const app = JSON.parse(fs.readFileSync(path.join(targetDir, 'app.json'), 'utf8'));
    if (!app?.expo || typeof app.expo !== 'object') throw new Error('app.json 缺少 expo 配置');
    slug = app.expo.slug || projectName;
    scheme = app.expo.scheme || slug;
    appName = app.expo.name || projectName;
    bundleName = buildBundleName(slug);
  } catch (error) {
    throw new Error(
      `Expo 模板生成不完整：无法读取 ${path.join(targetDir, 'app.json')}。请删除目标目录后重试。\n${getCommandErrorDetail(error)}`,
    );
  }

  // 步骤 2：注入鸿蒙基线
  await runStep('2/4 注入 HarmonyOS 基线', () => {
    injectHarmonyBaseline(targetDir, { slug, scheme, sdk });
  });

  // 步骤 3：扫描适配 + 清理不兼容的默认模板代码
  const report = await runStep('3/4 适配默认模板依赖', () => {
    removeOptionalDefaultTemplateDependencies(targetDir);
    const result = scanAndAdapt(targetDir, sdk);
    cleanupHTemplateCode(targetDir, { removed: [...result.removed, 'expo-splash-screen'], replaced: result.replaced });
    return result;
  });
  log.info(`bump ${report.bumped.length} / 原生包 ${report.addedNative.length} / alias-only ${report.addedAliasOnly.length} / 删 ${report.removed.length} / 替换 ${report.replaced.length} / patch ${report.patched.length}`);

  // 步骤 4：文档与技能在依赖适配完成后写入
  await runStep('4/4 写入开发资料', () => {
    injectContent(targetDir, { appName, slug, bundleName, sdk });
  });

  log.success(`已创建：${projectName}`);
  const pm = resolvePm(rest, targetDir);
  printTip('create.complete', { pm, projectName });
}
