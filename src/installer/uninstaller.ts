import * as fs from 'fs';
import * as path from 'path';
import { syncHarmonyAutolinking } from '../harmony-project';
import { cleanupManagedPackage, readManagedState } from '../lifecycle/managed-state';
import { uninstallCmd, resolvePm } from '../lib/pkg-manager';
import { run } from '../utils/exec';
import { log } from '../utils/log';

const DEVECO_OHPM_PATH = '/Applications/DevEco-Studio.app/Contents/tools/ohpm/bin/ohpm';

function packageName(input: string): string {
  const versionAt = input.indexOf('@', 1);
  return versionAt === -1 ? input : input.slice(0, versionAt);
}

function resolveOhpmCommand(): string {
  return process.platform === 'darwin' && fs.existsSync(DEVECO_OHPM_PATH)
    ? DEVECO_OHPM_PATH
    : 'ohpm';
}

/**
 * 卸载原包与 CLI 自己添加的 HarmonyOS 伴随资产。
 * 没有 managed-state 条目时绝不推断或删除用户手工配置。
 */
export async function runUninstall(args: string[]): Promise<void> {
  const requested = args.find(arg => !arg.startsWith('-'));
  if (!requested) throw new Error('用法: uninstall <pkg>');

  const projectRoot = process.cwd();
  const originalPackage = packageName(requested);
  const skipHarmony = args.includes('--skip-harmony');
  const skipNative = args.includes('--skip-native');
  const pm = resolvePm(args, projectRoot);
  const managed = readManagedState(projectRoot).packages[originalPackage];
  const packages = [originalPackage];
  if (!skipHarmony && managed?.harmonyPackage) packages.push(managed.harmonyPackage);

  log.step(`卸载 ${packages.join('、')}`);
  run(uninstallCmd(pm, packages), { cwd: projectRoot });

  if (skipHarmony) {
    log.info('--skip-harmony，已跳过 HarmonyOS 管理资产清理');
    return;
  }

  const cleanup = cleanupManagedPackage(projectRoot, originalPackage);
  if (!cleanup.found) {
    log.info('未发现 CLI 管理的 HarmonyOS 适配资产，未修改原生工程');
    return;
  }
  log.success('HarmonyOS 适配资产已清理');

  if (!cleanup.needsAutolink || skipNative) {
    if (cleanup.needsAutolink && skipNative) {
      log.warn('--skip-native，未刷新原生注册。完成后执行：pnpm dlx expo-harmony-cli sync');
    }
    return;
  }

  const harmonyDir = path.join(projectRoot, 'harmony');
  if (!fs.existsSync(harmonyDir)) return;
  log.step('自动同步 HarmonyOS 原生注册');
  const syncResult = syncHarmonyAutolinking(projectRoot);
  log.success(`HarmonyOS 原生注册已同步（${syncResult.linked.length} 个包）`);
  log.step('刷新 HarmonyOS 原生依赖');
  run(`${resolveOhpmCommand()} install --all`, { cwd: harmonyDir });

  if (cleanup.requiresCodegen) {
    log.step('刷新 TurboModule C++ 桥接代码');
    run('pnpm codegen', { cwd: projectRoot });
  }
  log.success('uninstall 完成');
}
