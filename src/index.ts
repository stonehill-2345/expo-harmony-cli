#!/usr/bin/env node
import { create } from './commands/create';
import { prebuild } from './commands/prebuild';
import { install } from './commands/install';
import { scan } from './commands/scan';
import { list } from './commands/list';
import { sync } from './commands/sync';
import { uninstall } from './commands/uninstall';

/** 命令分发（纯函数）。argv = process.argv.slice(2) */
export async function dispatch(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;

  if (cmd === '--help' || cmd === '-h') {
    printHelp();
    return;
  }

  if (cmd === undefined || cmd === 'create') {
    await create(rest);
    return;
  }
  if (cmd === 'prebuild') {
    await prebuild(rest);
    return;
  }
  if (cmd === 'install') {
    await install(rest);
    return;
  }
  if (cmd === 'uninstall' || cmd === 'remove') {
    await uninstall(rest);
    return;
  }
  if (cmd === 'scan') {
    await scan(rest);
    return;
  }
  if (cmd === 'list') {
    await list(rest);
    return;
  }
  if (cmd === 'sync') {
    await sync(rest);
    return;
  }

  // 裸项目名 → 当 create <name>
  await create(argv);
}

function printHelp(): void {
  console.log(`
expo-harmony-cli <command> [args]

Commands:
  create [name]           创建含鸿蒙基线的 Expo 项目（默认命令）
  install <pkg>           装 iOS/Android + 鸿蒙 JS 包 + 原生集成
  uninstall <pkg>         卸载包并清理 CLI 管理的 HarmonyOS 适配资产（remove 同义）
  prebuild [args]         生成三端原生目录（透传 expo prebuild + harmony 走生成器）
  scan                    手动重跑扫描适配
  sync                    增量同步 HarmonyOS 原生注册（不覆盖 harmony/）
  list                    列出 compat-table（调试用）

Examples:
  npx expo-harmony-cli my-app
  pnpm dlx expo-harmony-cli my-app  # pnpm 用户可选
  pnpm dlx expo-harmony-cli install @shopify/flash-list
  pnpm dlx expo-harmony-cli uninstall @shopify/flash-list
  pnpm dlx expo-harmony-cli prebuild --platform harmony
  pnpm dlx expo-harmony-cli sync
`);
}

async function main(): Promise<void> {
  try {
    await dispatch(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
