import chalk from 'chalk';
import type { Pm } from './lib/pkg-manager';
import { installCmd } from './lib/pkg-manager';

export interface Tip {
  steps?: Array<{ cmd: string; desc: string }>;
  mustRead?: Array<{ name: string; path: string }>;
  onDemand?: Array<{ name: string; path: string }>;
  slashCommands?: Array<{ cmd: string; desc: string }>;
}

export interface TipOptions {
  pm?: Pm;
  projectName?: string;
}

export const TIPS: Record<string, Tip> = {};

function commandText(pm: Pm, command: { file: string; args: string[] }): string {
  return [command.file, ...command.args].join(' ');
}

function cliCommand(pm: Pm): string {
  return {
    pnpm: 'pnpm dlx expo-harmony-cli',
    npm: 'npx expo-harmony-cli',
    yarn: 'yarn dlx expo-harmony-cli',
    bun: 'bunx expo-harmony-cli',
  }[pm];
}

function startCommand(pm: Pm): string {
  return {
    pnpm: 'pnpm start:harmony',
    npm: 'npm run start:harmony',
    yarn: 'yarn start:harmony',
    bun: 'bun run start:harmony',
  }[pm];
}

function createCompleteTip(pm: Pm, projectName?: string): Tip {
  return {
    steps: [
      { cmd: projectName ? `cd ${projectName} && ${commandText(pm, installCmd(pm))}` : commandText(pm, installCmd(pm)), desc: '安装依赖并应用 patch' },
      {
        cmd: `${cliCommand(pm)} prebuild --platform harmony`,
        desc: '首次生成 HarmonyOS 原生工程',
      },
      { cmd: 'cd harmony && ohpm install', desc: '安装 ArkTS/HAR 原生依赖' },
      { cmd: startCommand(pm), desc: '启动 HarmonyOS Metro（默认端口 8888，原生端口 8081）' },
      { cmd: 'DevEco Studio', desc: '打开 harmony/，构建并运行 entry 模块' },
    ],
    mustRead: [{ name: '项目快速开始', path: 'README.md' }],
    onDemand: [
      { name: 'HarmonyOS 开发与 CLI 机制', path: 'docs/HARMONY.md' },
      { name: 'patch 说明', path: 'docs/PATCHES.md' },
      { name: '签名配置', path: 'harmony/SIGNING.md' },
      { name: '常见问题', path: 'docs/TROUBLESHOOTING.md' },
    ],
  };
}

export function printTip(key: string, options: TipOptions = {}): void {
  const tip = key === 'create.complete' ? createCompleteTip(options.pm || 'pnpm', options.projectName) : TIPS[key];
  if (!tip) return;
  if (tip.steps?.length) {
    console.log(chalk.bold('\n▶ 下一步：'));
    for (const s of tip.steps)
      console.log(`  ${chalk.cyan(s.cmd)}  ${s.desc ? '— ' + s.desc : ''}`);
  }
  if (tip.mustRead?.length) {
    console.log(chalk.bold('\n📚 必读：'));
    for (const d of tip.mustRead) console.log(`  • ${d.name} → ${d.path}`);
  }
  if (tip.onDemand?.length) {
    console.log(chalk.bold('\n📚 按需：'));
    for (const d of tip.onDemand) console.log(`  • ${d.name} → ${d.path}`);
  }
  if (tip.slashCommands?.length) {
    console.log(chalk.bold('\n📚 Slash Commands（Claude Code）：'));
    for (const c of tip.slashCommands) console.log(`  • ${c.cmd}  ${c.desc ? '— ' + c.desc : ''}`);
  }
}
