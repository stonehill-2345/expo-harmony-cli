import * as path from 'path';
import { resolvePm } from '../lib/pkg-manager';
import type { Check, CheckContext, CheckResult } from './types';

const NODE_MIN = '18.18.0';

export function compareAtLeast(actual: string, min: string): boolean {
  const parse = (v: string) => v.replace(/^[^\d]*/, '').split('.').map(n => parseInt(n, 10) || 0);
  const [a1 = 0, a2 = 0, a3 = 0] = parse(actual);
  const [m1 = 0, m2 = 0, m3 = 0] = parse(min);
  if (a1 !== m1) return a1 > m1;
  if (a2 !== m2) return a2 > m2;
  return a3 >= m3;
}

export const nodeCheck: Check = (ctx: CheckContext): CheckResult => {
  const probe = ctx.probe('node', ['--version']);
  if (!probe.ok) return { id: 'node', label: 'Node.js', status: 'fail', level: 'required', detail: '未找到', hint: `安装 Node.js >= ${NODE_MIN}（https://nodejs.org）` };
  const version = probe.stdout.trim().replace(/^v/, '');
  // 工具在但输出无法解析 = 版本未知 warn，不因解析问题误报缺失/过低（规范 2.3）
  if (!/^\d+(\.\d+)*$/.test(version)) {
    const raw = version.slice(0, 40) || '（空输出）';
    return { id: 'node', label: 'Node.js', status: 'warn', level: 'required', detail: `版本未知（无法解析输出：${raw}）`, hint: `确认 node --version 输出 >= ${NODE_MIN}` };
  }
  if (!compareAtLeast(version, NODE_MIN)) return { id: 'node', label: 'Node.js', status: 'fail', level: 'required', detail: `${version}（要求 >= ${NODE_MIN}）`, hint: '升级 Node.js 后重试' };
  return { id: 'node', label: 'Node.js', status: 'ok', level: 'required', detail: `v${version}（要求 >= ${NODE_MIN}）` };
};

export const pmCheck: Check = (ctx: CheckContext): CheckResult => {
  if (!ctx.projectRoot) return { id: 'pm', label: '包管理器', status: 'skip', level: 'required', detail: '非项目目录，跳过' };
  const pm = resolvePm([], ctx.projectRoot);
  const probe = ctx.probe(pm, ['--version']);
  if (!probe.ok) return { id: 'pm', label: '包管理器', status: 'fail', level: 'required', detail: `${pm} 未找到`, hint: `安装 ${pm} 并确认其在 PATH 中` };
  return { id: 'pm', label: '包管理器', status: 'ok', level: 'required', detail: `${pm} ${probe.stdout.trim()}` };
};

const OHPM_HINT = process.platform === 'win32'
  ? '$env:Path += ";C:\\Program Files\\Huawei\\DevEco Studio\\tools\\ohpm\\bin"'
  : 'export PATH="/Applications/DevEco-Studio.app/Contents/tools/ohpm/bin:$PATH"';

export const ohpmCheck: Check = ctx => {
  const probe = ctx.probe('ohpm', ['--version']);
  if (!probe.ok) return { id: 'ohpm', label: 'ohpm', status: 'fail', level: 'required', detail: '未找到', hint: OHPM_HINT };
  return { id: 'ohpm', label: 'ohpm', status: 'ok', level: 'required', detail: probe.stdout.trim() };
};

export const hvigorCheck: Check = ctx => {
  if (ctx.projectRoot && ctx.existsSync(path.join(ctx.projectRoot, 'harmony', 'hvigorw'))) return { id: 'hvigor', label: 'hvigor', status: 'ok', level: 'build', detail: 'harmony/hvigorw' };
  const probe = ctx.probe('hvigor', ['--version']);
  if (!probe.ok) return { id: 'hvigor', label: 'hvigor', status: 'warn', level: 'build', detail: '未找到', hint: 'hvigor 随 DevEco Studio 提供，HAP 构建阶段需要' };
  return { id: 'hvigor', label: 'hvigor', status: 'ok', level: 'build', detail: probe.stdout.trim() };
};

export const hdcCheck: Check = ctx => {
  const file = process.env.HDC_PATH ?? 'hdc';
  const probe = ctx.probe(file, ['version']);
  if (!probe.ok) return { id: 'hdc', label: 'hdc', status: 'warn', level: 'build', detail: '未找到', hint: 'hdc 位于 DevEco SDK toolchains；可设置 HDC_PATH 指向 hdc 可执行文件' };
  const line = probe.stdout.split(/\r?\n/).find(l => l.includes('Ver')) ?? probe.stdout;
  return { id: 'hdc', label: 'hdc', status: 'ok', level: 'build', detail: line.trim() };
};

const DEVECO_PATHS: Partial<Record<NodeJS.Platform, string[]>> = { darwin: ['/Applications/DevEco-Studio.app'], win32: ['C:\\Program Files\\Huawei\\DevEco Studio'] };

export const devecoCheck: Check = ctx => {
  const home = process.env.DEVECO_HOME;
  if (home && ctx.existsSync(home)) return { id: 'deveco', label: 'DevEco Studio', status: 'ok', level: 'build', detail: home };
  const candidates = DEVECO_PATHS[process.platform];
  if (!candidates) return { id: 'deveco', label: 'DevEco Studio', status: 'skip', level: 'build', detail: `${process.platform} 平台跳过` };
  const found = candidates.find(p => ctx.existsSync(p));
  if (!found) return { id: 'deveco', label: 'DevEco Studio', status: 'warn', level: 'build', detail: '未检测到安装目录（未检测到 ≠ 未安装）', hint: '自定义安装路径请设置 DEVECO_HOME 环境变量' };
  return { id: 'deveco', label: 'DevEco Studio', status: 'ok', level: 'build', detail: found };
};
