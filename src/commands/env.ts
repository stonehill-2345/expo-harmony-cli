import * as fs from 'fs';
import * as path from 'path';
import { TOOL_CHECKS } from '../env-checks/registry';
import type { CheckContext, CheckResult } from '../env-checks/types';
import type { Probe } from '../env-checks/types';
import { probeCommand } from '../utils/exec';
import { log } from '../utils/log';

export function summarize(results: CheckResult[]): { fail: number; warn: number } {
  return { fail: results.filter(r => r.status === 'fail').length, warn: results.filter(r => r.status === 'warn').length };
}
export function exitCodeFor(results: CheckResult[]): number {
  const { fail, warn } = summarize(results);
  return fail ? 1 : warn ? 2 : 0;
}
function printResult(r: CheckResult): void {
  const line = `${r.label.padEnd(12)}${r.detail ?? ''}`;
  if (r.status === 'ok') log.success(line); else if (r.status === 'warn') log.warn(line); else if (r.status === 'fail') log.error(line); else log.info(line);
  if (r.hint) console.log(`    └ ${r.hint}`);
}
export async function env(_args: string[], deps: { probe?: Probe; existsSync?: (p: string) => boolean } = {}): Promise<void> {
  process.exitCode = 0;
  const cwd = process.cwd();
  const projectRoot = fs.existsSync(path.join(cwd, 'package.json')) ? cwd : null;
  const ctx: CheckContext = { projectRoot, probe: deps.probe ?? probeCommand, existsSync: deps.existsSync ?? fs.existsSync };
  log.step('环境检查');
  console.log();
  const results = TOOL_CHECKS.map(check => check(ctx));
  results.forEach(printResult);
  const { fail, warn } = summarize(results);
  console.log();
  log.info(`${fail} 项失败，${warn} 项警告。退出码 ${exitCodeFor(results)}。`);
  process.exitCode = exitCodeFor(results);
}
