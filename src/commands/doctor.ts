import * as fs from 'fs';
import * as path from 'path';
import { TOOL_CHECKS, PROJECT_CHECKS } from '../env-checks/registry';
import type { CheckContext, CheckResult } from '../env-checks/types';
import type { Probe } from '../env-checks/types';
import { probeCommand } from '../utils/exec';
import { log } from '../utils/log';
import { exitCodeFor } from './env';

function printResult(r: CheckResult, indent = ''): void {
  const line = `${indent}${r.label.padEnd(12)}${r.detail ?? ''}`;
  if (r.status === 'ok') log.success(line); else if (r.status === 'warn') log.warn(line); else if (r.status === 'fail') log.error(line); else log.info(line);
  if (r.hint) console.log(`${indent}    └ ${r.hint}`);
}

/** 汇总"下一步"建议：fail 全局最优先（基础环境未修，项目检查意义小）；warn 先项目段后环境段（drift/基线比 hvigor 缺失更紧要）。 */
function nextStep(tools: CheckResult[], projects: CheckResult[]): string {
  const worst =
    [...tools, ...projects].find(r => r.status === 'fail') ??
    projects.find(r => r.status === 'warn') ??
    tools.find(r => r.status === 'warn');
  return worst?.hint ?? worst?.label ?? '';
}

export async function doctor(_args: string[], deps: { probe?: Probe; existsSync?: (p: string) => boolean } = {}): Promise<void> {
  process.exitCode = 0;
  const cwd = process.cwd();
  const projectRoot = fs.existsSync(path.join(cwd, 'package.json')) ? cwd : null;
  const ctx: CheckContext = { projectRoot, probe: deps.probe ?? probeCommand, existsSync: deps.existsSync ?? fs.existsSync };
  log.step('doctor：项目与环境诊断');
  if (!projectRoot) {
    log.error('项目根未找到（缺 package.json）');
    log.info('下一步：cd 到 Expo 项目根目录后重试');
    process.exitCode = 1;
    return;
  }
  // 段一：环境（复用 env 注册表，仅计数，不逐项打印）
  const tools = TOOL_CHECKS.map(check => check(ctx));
  const ok = tools.filter(r => r.status === 'ok').length;
  const warn = tools.filter(r => r.status === 'warn').length;
  const fail = tools.filter(r => r.status === 'fail').length;
  log.info(`环境（复用 env 注册表，仅计数）   ✓ ${ok} / ⚠ ${warn} / ✗ ${fail}`);
  // 段二：项目明细
  console.log('项目');
  const projects = PROJECT_CHECKS.map(check => check(ctx));
  projects.forEach(r => printResult(r, '  '));
  // 段三：汇总 + 下一步
  const all = [...tools, ...projects];
  const { fail: allFail, warn: allWarn } = { fail: all.filter(r => r.status === 'fail').length, warn: all.filter(r => r.status === 'warn').length };
  const summary = allFail
    ? `汇总：存在 ${allFail} 项失败，需处理后重试。下一步：${nextStep(tools, projects)}`
    : allWarn
      ? `汇总：可继续开发，但有 ${allWarn} 项警告。下一步：${nextStep(tools, projects)}`
      : '汇总：环境与项目检查全部通过。';
  log.info(summary);
  process.exitCode = exitCodeFor(all);
}
