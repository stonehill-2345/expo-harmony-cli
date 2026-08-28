import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { runFile } from '../utils/exec';
import { log } from '../utils/log';
import { adaptPackage } from './adapt-package';
import { resolvePm, installCmd, runScriptCmd } from '../lib/pkg-manager';
import * as harmonyProject from '../harmony-project';
import { assertNoDrift } from '../harmony-project/standalone';
import { ensureAppJsonPlugin } from '../injector/app-json';

const DEVECO_OHPM_PATH = '/Applications/DevEco-Studio.app/Contents/tools/ohpm/bin/ohpm';

/** install <pkg>：安装依赖后按需增量同步 HarmonyOS 原生 autolinking。 */
export async function runInstall(args: string[]): Promise<void> {
  const pkg = args.find(a => !a.startsWith('-'));
  if (!pkg) throw new Error('用法: install <pkg>[@version]');

  const projectRoot = process.cwd();
  if (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
    throw new Error('当前目录非项目根（缺 package.json）');
  }
  const skipHarmony = args.includes('--skip-harmony');
  const skipNative = args.includes('--skip-native');
  const force = args.includes('--force');
  const pm = resolvePm(args, projectRoot);
  if (!skipHarmony && !skipNative && !force && fs.existsSync(path.join(projectRoot, '.expo-harmony', 'managed-state.json'))) assertNoDrift(projectRoot);
  const addedPermissionsPlugin = ensureReactNativePermissionsPlugin(projectRoot, pkg);

  // 步骤 2：iOS/Android 安装
  log.step(`expo install ${pkg}`);
  runFile('npx', ['expo', 'install', `--${pm}`, pkg], { cwd: projectRoot });

  if (skipHarmony) {
    log.info('--skip-harmony，跳过鸿蒙处理');
    return;
  }

  // 步骤 3：查 compat-table（单包）
  const result = adaptPackage(pkg, projectRoot, {
    appPlugins: addedPermissionsPlugin ? ['react-native-permissions'] : undefined,
  });
  if (result.status === 'skipped' || result.status === 'unsupported') {
    console.log();
    log.warn(
      [
        // Keep this text unstyled so the package name and newline remain
        // contiguous for log consumers that inspect the raw output.
        `未自动适配 HarmonyOS : ${pkg}\n请先确认：`,
        '- 纯 JS 包：可直接运行',
        `- 包含原生模块：请勿直接在 HarmonyOS 使用，可参考 ${chalk.cyan.bold('.agent/skills/expo-harmony-adapter/SKILL.md')} 完成适配`,
      ].join('\n')
    );
    return;
  }
  log.success(
    `鸿蒙适配：${result.status}${result.harmonyPackage ? ' → ' + result.harmonyPackage : ''}`
  );

  // 步骤 4：装新依赖
  log.step('装新依赖');
  const install = installCmd(pm);
  runFile(install.file, install.args, { cwd: projectRoot });

  // 步骤 5：已有 Harmony 工程时只刷新 autolinking 托管文件，不覆盖整个 harmony/。
  if (result.needsAutolink && !skipNative) {
    if (fs.existsSync(path.join(projectRoot, 'harmony'))) {
      log.step('自动同步 HarmonyOS 原生注册');
      const syncResult = await harmonyProject.syncHarmonyAutolinking(projectRoot, { force });
      log.success(`HarmonyOS 原生注册已同步（${syncResult.linked.length} 个包）`);
      if (result.requiresCodegen) {
        const harmonyEntryDir = path.join(projectRoot, 'harmony', 'entry');
        log.step('安装 HarmonyOS 原生依赖');
        runFile(resolveOhpmCommand(), ['install'], { cwd: harmonyEntryDir });
        log.step('生成 TurboModule C++ 桥接代码');
        const codegen = runScriptCmd(pm, 'codegen');
        runFile(codegen.file, codegen.args, { cwd: projectRoot });
        ensureCodegenOutput(projectRoot);
        log.success('TurboModule C++ 桥接代码已生成');
      } else {
        log.info('下一步：cd harmony && ohpm install，再在 DevEco Studio 重新构建');
      }
    } else {
      log.info(
        'harmony/ 尚未生成。首次使用请执行：pnpm dlx expo-harmony-cli prebuild --platform harmony'
      );
    }
  } else if (result.needsAutolink && skipNative) {
    log.warn(
      '--skip-native，未自动同步原生注册。完成依赖安装后可执行：pnpm dlx expo-harmony-cli sync'
    );
  } else if (result.harmonyPackage) {
    log.info('该鸿蒙适配包为 alias-only，无需原生 autolinking');
  }

  log.success('install 完成');
}

function ensureCodegenOutput(projectRoot: string): void {
  const generatedDir = path.join(
    projectRoot,
    'harmony',
    'entry',
    'src',
    'main',
    'cpp',
    'generated'
  );
  const generatedCppFiles = fs.existsSync(generatedDir)
    ? fs.readdirSync(generatedDir).filter(file => file.endsWith('.cpp'))
    : [];
  if (generatedCppFiles.length === 0) {
    throw new Error(
      'TurboModule codegen 未生成 C++ 文件，请检查 react-native codegen-harmony 输出。'
    );
  }
}

function resolveOhpmCommand(): string {
  return process.platform === 'darwin' && fs.existsSync(DEVECO_OHPM_PATH)
    ? DEVECO_OHPM_PATH
    : 'ohpm';
}

function ensureReactNativePermissionsPlugin(projectRoot: string, requestedPackage: string): boolean {
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  const installed =
    packageJson.dependencies?.['react-native-permissions'] ||
    packageJson.devDependencies?.['react-native-permissions'];
  if (
    requestedPackage === 'react-native-permissions' ||
    requestedPackage.startsWith('react-native-permissions@') ||
    installed
  ) {
    const appJsonPath = path.join(projectRoot, 'app.json');
    const app = fs.existsSync(appJsonPath) ? JSON.parse(fs.readFileSync(appJsonPath, 'utf8')) : null;
    const hadPlugin = Array.isArray(app?.expo?.plugins) && app.expo.plugins.some((entry: unknown) =>
      entry === 'react-native-permissions' || (Array.isArray(entry) && entry[0] === 'react-native-permissions'),
    );
    ensureAppJsonPlugin(projectRoot, 'react-native-permissions', { iosPermissions: [] });
    return !hadPlugin;
  }
  return false;
}
