import { runInstall } from '../installer/installer';

/** install 命令：装 iOS/Android + 鸿蒙 JS 包，并按需增量同步原生注册。 */
export async function install(args: string[]): Promise<void> {
  await runInstall(args);
}
