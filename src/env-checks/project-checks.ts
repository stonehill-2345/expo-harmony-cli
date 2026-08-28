import * as fs from 'fs';
import * as path from 'path';
import { VERSION_MATRIX } from '../version-matrix';
import { readManagedState } from '../lifecycle/managed-state';
import { runAutolinking } from '../harmony-project/autolinking';
import { collectDrift, hasDrift } from '../harmony-project/standalone';
import { HARMONY_PACKAGE_MAPPING } from '../harmony-project/harmony-package-mapping';
import type { Check, CheckContext, CheckResult } from './types';

export const harmonyExistsCheck: Check = ctx => {
  if (!ctx.projectRoot) return { id: 'harmony', label: 'harmony/ 工程', status: 'fail', level: 'required', detail: '非项目目录', hint: 'cd 到项目根后重试' };
  if (ctx.existsSync(path.join(ctx.projectRoot, 'harmony'))) return { id: 'harmony', label: 'harmony/ 工程', status: 'ok', level: 'required' };
  return { id: 'harmony', label: 'harmony/ 工程', status: 'fail', level: 'required', detail: 'harmony/ 不存在', hint: 'pnpm dlx expo-harmony-cli prebuild --platform harmony' };
};

function scope(version: string, kind: 'major' | 'majorMinor'): string {
  const p = version.replace(/^[^\d]*/, '').split('.').map(n => parseInt(n, 10) || 0);
  return kind === 'major' ? `${p[0]}` : `${p[0]}.${p[1]}`;
}
const BASELINE = [
  { dep: 'react', value: VERSION_MATRIX.react, kind: 'majorMinor' as const },
  { dep: 'react-native', value: VERSION_MATRIX.reactNative, kind: 'majorMinor' as const },
  { dep: '@react-native-oh/react-native-harmony', value: VERSION_MATRIX.rnoh, kind: 'majorMinor' as const },
  { dep: 'expo', value: VERSION_MATRIX.expo, kind: 'major' as const },
];
export const baselineCheck: Check = ctx => {
  if (!ctx.projectRoot) return { id: 'baseline', label: '依赖基线', status: 'skip', level: 'required', detail: '非项目目录，跳过' };
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ctx.projectRoot, 'package.json'), 'utf8')) as any;
    const deps = { ...pkg.devDependencies, ...pkg.dependencies };
    const mismatches = BASELINE.filter(item => typeof deps[item.dep] === 'string' && scope(deps[item.dep], item.kind) !== scope(item.value, item.kind)).map(item => `${item.dep} ${deps[item.dep]} ≠ 验证基线 ${item.value}`);
    return mismatches.length ? { id: 'baseline', label: '依赖基线', status: 'warn', level: 'required', detail: `${mismatches.join('；')}（未验证组合）` } : { id: 'baseline', label: '依赖基线', status: 'ok', level: 'required', detail: '与验证基线一致' };
  } catch { return { id: 'baseline', label: '依赖基线', status: 'warn', level: 'required', detail: '无法解析依赖清单（package.json）' }; }
};

export const driftCheck: Check = ctx => {
  if (!ctx.projectRoot) return { id: 'drift', label: '受管文件漂移', status: 'skip', level: 'required', detail: '非项目目录，跳过' };
  const harmonyDir = path.join(ctx.projectRoot, 'harmony');
  if (!ctx.existsSync(harmonyDir)) return { id: 'drift', label: '受管文件漂移', status: 'ok', level: 'required', detail: 'harmony/ 不存在（下次 prebuild 将建立）' };
  const state = readManagedState(ctx.projectRoot);
  if (!Object.keys(state.generatedFiles ?? {}).length && !Object.keys(state.managedEntries ?? {}).length) return { id: 'drift', label: '受管文件漂移', status: 'ok', level: 'required', detail: '无基线记录（下次 sync 将建立）' };
  try {
    const report = collectDrift(ctx.projectRoot, runAutolinking({ projectRoot: ctx.projectRoot, harmonyDir, mapping: HARMONY_PACKAGE_MAPPING }));
    return hasDrift(report) ? { id: 'drift', label: '受管文件漂移', status: 'warn', level: 'required', detail: `${report.files.length} 个文件、${report.entries.length} 处托管条目漂移，下次 sync 将被阻断`, hint: 'git diff 查看改动；sync --force 覆盖，或还原手动修改' } : { id: 'drift', label: '受管文件漂移', status: 'ok', level: 'required', detail: '与基线一致' };
  } catch { return { id: 'drift', label: '受管文件漂移', status: 'skip', level: 'required', detail: '无法计算托管条目期望（node_modules 或 oh-package 缺失）' }; }
};
