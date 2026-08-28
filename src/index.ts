#!/usr/bin/env node
import { create } from './commands/create';
import { prebuild } from './commands/prebuild';
import { install } from './commands/install';
import { scan } from './commands/scan';
import { list } from './commands/list';
import { sync } from './commands/sync';
import { env } from './commands/env';
import { doctor } from './commands/doctor';
import { uninstall } from './commands/uninstall';
import packageJson from '../package.json';

const COMMANDS = ['create', 'prebuild', 'install', 'uninstall', 'remove', 'scan', 'list', 'sync', 'env', 'doctor'];

/** 命令分发（纯函数）。argv = process.argv.slice(2) */
export async function dispatch(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;

  if (cmd === '--help' || cmd === '-h') {
    printHelp();
    return;
  }
  if (cmd === '--version' || cmd === '-v') {
    console.log(packageJson.version);
    return;
  }

  if (cmd?.startsWith('-')) {
    printHelp();
    throw new Error(`未知选项：${cmd}`);
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
  if (cmd === 'env') {
    await env(rest);
    return;
  }
  if (cmd === 'doctor') {
    await doctor(rest);
    return;
  }

  // 裸项目名兼容：其余参数全为 flag（如 --pnpm）时放行；近似命令拼写提示后仍按项目名创建，
  // 避免误拦 scanx 这类合法项目名。
  const nearMiss = COMMANDS.find(command => editDistance(cmd!, command) <= 2);
  if (rest.some(arg => !arg.startsWith('-'))) {
    printHelp();
    throw new Error(`未知命令：${cmd}${nearMiss ? `（是否想输入 ${nearMiss}？）` : ''}`);
  }
  if (nearMiss) {
    console.error(`提示："${cmd}" 接近命令 "${nearMiss}"，将按项目名继续创建；若想执行该命令请重新输入。`);
  }
  await create(argv);
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = a[i - 1] === b[j - 1]
        ? diagonal
        : Math.min(diagonal, above, row[j - 1]) + 1;
      diagonal = above;
    }
  }
  return row[b.length];
}

function printHelp(): void {
  console.log(`
expo-harmony-cli <command> [args]

Commands:
  create [name]           创建含鸿蒙基线的 Expo 项目（默认命令）
  install <pkg>           装 iOS/Android + 鸿蒙 JS 包 + 原生集成（--force 跳过 drift 保护）
  uninstall <pkg>         卸载包并清理 CLI 管理的 HarmonyOS 适配资产（remove 同义，--force 跳过 drift 保护）
  prebuild [args]         生成三端原生目录（透传 expo prebuild + harmony 走生成器）
  scan                    手动重跑扫描适配
  sync                    增量同步 HarmonyOS 原生注册（--force 跳过受管文件 drift 保护）
  env                     检查环境工具（node/包管理器/ohpm/hvigor/hdc/DevEco）
  doctor                  只读汇总环境与项目诊断（兼容基线/受管文件漂移）
  list                    列出 compat-table（调试用）

Options:
  -h, --help              显示帮助
  -v, --version           显示 CLI 版本

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
