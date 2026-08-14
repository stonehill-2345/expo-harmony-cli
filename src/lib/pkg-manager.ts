import * as fs from 'fs';
import * as path from 'path';

export type Pm = 'pnpm' | 'npm' | 'yarn' | 'bun';
export interface CommandParts { file: string; args: string[]; }

/** 包管理器选择：显式 flag > 项目 lockfile > 默认 pnpm。*/
export function resolvePm(userFlags: string[], projectRoot?: string): Pm {
  if (userFlags.includes('--npm')) return 'npm';
  if (userFlags.includes('--yarn')) return 'yarn';
  if (userFlags.includes('--bun')) return 'bun';
  if (userFlags.includes('--pnpm')) return 'pnpm';

  if (projectRoot) {
    if (fs.existsSync(path.join(projectRoot, 'pnpm-lock.yaml'))) return 'pnpm';
    if (fs.existsSync(path.join(projectRoot, 'package-lock.json'))) return 'npm';
    if (fs.existsSync(path.join(projectRoot, 'yarn.lock'))) return 'yarn';
    if (fs.existsSync(path.join(projectRoot, 'bun.lockb'))) return 'bun';
  }

  return 'pnpm';
}

/** pm 对应的 install 命令字面量。*/
export function installCmd(pm: Pm): CommandParts {
  return { pnpm: { file: 'pnpm', args: ['install'] }, npm: { file: 'npm', args: ['install'] }, yarn: { file: 'yarn', args: [] }, bun: { file: 'bun', args: ['install'] } }[pm];
}

/** pm 对应的卸载命令。packages 必须是已校验的 npm 包名。 */
export function uninstallCmd(pm: Pm, packages: string[]): CommandParts {
  if (!packages.length) throw new Error('缺少待卸载依赖');
  return { file: pm, args: [pm === 'npm' ? 'uninstall' : 'remove', ...packages] };
}

export function runScriptCmd(pm: Pm, script: string): CommandParts {
  return pm === 'pnpm' || pm === 'yarn'
    ? { file: pm, args: [script] }
    : { file: pm, args: ['run', script] };
}
