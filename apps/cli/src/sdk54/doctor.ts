import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CheckResult } from '../env-checks/types';
import { readManagedState } from '../lifecycle/managed-state';
import { classifyHarmonyProject } from './project-state';
import type { Sdk54PatchManifest } from './patch-manifest';
import { collectSdk54RuntimeFailures } from './verify-runtime';

export function runSdk54DoctorChecks(projectRoot: string, manifest: Sdk54PatchManifest): CheckResult[] {
  const kind = classifyHarmonyProject(projectRoot);
  if (kind === 'sdk54-legacy') return [{ id: 'sdk54-legacy', label: 'SDK54 模式', status: 'fail', level: 'required', detail: 'legacy SDK54 project：只诊断，不自动清理或迁移', hint: '使用 CLI 1.5.0 fresh create 后手工迁移业务代码' }];
  const state = readManagedState(projectRoot);
  if (kind !== 'sdk54-package-patch' || !state.sdk54) return [{ id: 'sdk54-state', label: 'SDK54 状态', status: 'fail', level: 'required', detail: '缺少 sdk54-package-patch managed-state' }];
  const results: CheckResult[] = [];
  results.push(state.sdk54.patchSet === manifest.patchSet
    ? { id: 'sdk54-state', label: 'SDK54 状态', status: 'ok', level: 'required', detail: manifest.patchSet }
    : { id: 'sdk54-state', label: 'SDK54 状态', status: 'fail', level: 'required', detail: `patch-set ${state.sdk54.patchSet} ≠ ${manifest.patchSet}` });
  let pkg: any = {}; try { pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')); } catch { /* fail below */ }
  const postinstall = pkg.scripts?.postinstall;
  results.push(typeof postinstall === 'string' && postinstall.split('&&').map((x: string) => x.trim()).includes('patch-package --error-on-fail --error-on-warn')
    ? { id: 'sdk54-postinstall', label: 'patch lifecycle', status: 'ok', level: 'required' }
    : { id: 'sdk54-postinstall', label: 'patch lifecycle', status: 'fail', level: 'required', detail: '缺少 patch-package --error-on-fail --error-on-warn' });
  const applicable = manifest.patches.filter(patch => patch.templates.includes(state.sdk54!.template));
  const patchFailures = applicable.filter(patch => {
    const file = path.join(projectRoot, 'patches', patch.file);
    return !fs.existsSync(file) || createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== patch.sha256;
  });
  results.push(patchFailures.length
    ? { id: 'sdk54-patches', label: 'package patches', status: 'fail', level: 'required', detail: patchFailures.map(p => p.file).join('、') }
    : { id: 'sdk54-patches', label: 'package patches', status: 'ok', level: 'required', detail: `${applicable.length} 个 patch` });
  const runtime = collectSdk54RuntimeFailures(projectRoot, manifest);
  results.push(runtime.length
    ? { id: 'sdk54-runtime', label: 'runtime probes', status: 'fail', level: 'required', detail: runtime.map(item => item.detail).join('；'), hint: '重新安装并确认 postinstall 未被禁用' }
    : { id: 'sdk54-runtime', label: 'runtime probes', status: 'ok', level: 'required' });
  return results;
}
