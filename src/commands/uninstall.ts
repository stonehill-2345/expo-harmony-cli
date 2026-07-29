import { runUninstall } from '../installer/uninstaller';

/** uninstall/remove 命令：卸载原包并清理 CLI 管理的 HarmonyOS 适配资产。 */
export async function uninstall(args: string[]): Promise<void> {
  await runUninstall(args);
}
