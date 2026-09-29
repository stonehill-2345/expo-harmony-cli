import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { RuntimeProbeSpec, Sdk54PatchManifest } from './patch-manifest';

export interface RuntimeFailure {
  stage: 'version' | 'file' | 'probe' | 'bypass';
  packageName?: string;
  expected?: string;
  actual?: string;
  detail: string;
}

const BYPASSES = ['index.harmony.js', 'shims', 'scripts/postinstall-harmony.js', 'metro.config.js'];

function runProbe(packageRoot: string, probe: RuntimeProbeSpec): { ok: boolean; output: string } {
  const target = path.join(packageRoot, probe.target);
  if (probe.kind === 'file') return { ok: fs.existsSync(target), output: fs.existsSync(target) ? target : '' };
  const expectedExport = probe.kind === 'require' && probe.expected?.startsWith('export:')
    ? probe.expected.slice('export:'.length)
    : undefined;
  const result = probe.kind === 'require'
    ? spawnSync(process.execPath, ['-e', "const value=require(process.argv[1]); const expected=process.argv[2]; if(expected){if(!Object.prototype.hasOwnProperty.call(value,expected))process.exit(2);process.stdout.write('export:'+expected);}else{const output=typeof value==='function'?value.toString():JSON.stringify(value);process.stdout.write(output??'undefined');}", target, expectedExport ?? ''], { encoding: 'utf8', timeout: 5000 })
    : spawnSync(process.execPath, [target, ...(probe.args ?? [])], { encoding: 'utf8', timeout: 5000 });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  return { ok: !result.error && result.status === 0 && (!probe.expected || expectedExport ? output === `export:${expectedExport}` : output.includes(probe.expected)), output };
}

export function collectSdk54RuntimeFailures(projectRoot: string, manifest: Sdk54PatchManifest): RuntimeFailure[] {
  const failures: RuntimeFailure[] = [];
  let projectPackage: any = {};
  try { projectPackage = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')); } catch { /* version failures below */ }
  const declared = { ...projectPackage.devDependencies, ...projectPackage.dependencies };

  for (const relativePath of BYPASSES) {
    if (fs.existsSync(path.join(projectRoot, relativePath))) {
      failures.push({ stage: 'bypass', detail: `项目包含禁止的 legacy bypass：${relativePath}` });
    }
  }

  for (const patch of manifest.patches) {
    if (!Object.prototype.hasOwnProperty.call(declared, patch.name)) continue;
    const packageRoot = path.join(projectRoot, 'node_modules', patch.name);
    let actual: string | undefined;
    try { actual = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')).version; } catch { actual = undefined; }
    if (actual !== patch.version) {
      failures.push({ stage: 'version', packageName: patch.name, expected: patch.version, actual: actual ?? 'missing', detail: `${patch.name} 版本不匹配` });
      continue;
    }
    for (const requiredFile of patch.requiredFiles) {
      if (!fs.existsSync(path.join(packageRoot, requiredFile))) {
        failures.push({ stage: 'file', packageName: patch.name, expected: requiredFile, actual: 'missing', detail: `${patch.name} 缺少运行文件 ${requiredFile}` });
      }
    }
    for (const probe of patch.probes) {
      const result = runProbe(packageRoot, probe);
      if (!result.ok) failures.push({
        stage: 'probe', packageName: patch.name, expected: probe.expected, actual: result.output.trim(),
        detail: `${patch.name} runtime probe 未通过；请重新安装并确认 postinstall 未被禁用`,
      });
    }
  }
  return failures;
}

export function assertSdk54Runtime(projectRoot: string, manifest: Sdk54PatchManifest): void {
  const failures = collectSdk54RuntimeFailures(projectRoot, manifest);
  if (failures.length) {
    throw new Error(`SDK54 runtime 验证失败：\n${failures.map(failure => `- ${failure.detail}`).join('\n')}\n请重新安装并确认 postinstall 未被禁用。`);
  }
}
