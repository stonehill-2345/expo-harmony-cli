import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import type { ReleaseManifest } from './release-manifest';
import type { Sdk54Template } from './create-options';
import type { CheckResult } from '../env-checks/types';
import { readManagedState } from '../lifecycle/managed-state';

export function releaseRuntimeFailures(projectRoot: string, manifest: ReleaseManifest, template: Sdk54Template): string[] {
  const failures: string[] = [];
  const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  const declared = { ...pkg.devDependencies, ...pkg.dependencies };
  const resolve = createRequire(path.join(projectRoot, 'package.json'));
  const selected = manifest.packages.filter(p => p.templates.includes(template));
  for (const item of selected) {
    try {
      if (declared[item.installName] !== item.installSpec) failures.push(`${item.installName}: expected ${item.installSpec}`);
      const file = resolve.resolve(`${item.installName}/package.json`);
      const actual = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (actual.name !== item.publishName || actual.version !== item.publishVersion) failures.push(`${item.installName}: unexpected identity ${actual.name}@${actual.version}`);
      const root = path.dirname(file);
      for (const required of item.requiredFiles) if (!fs.existsSync(path.join(root, required))) failures.push(`${item.installName}: missing ${required}`);
      for (const probe of item.probes) {
        const target = path.join(root, probe.target);
        if (probe.kind === 'file') {
          if (!fs.existsSync(target)) failures.push(`${item.installName}: missing ${probe.target}`);
          continue;
        }
        const result = probe.kind === 'command'
          ? spawnSync(process.execPath, [target, ...(probe.args ?? [])], { cwd: projectRoot, encoding: 'utf8', timeout: 10000 })
          : spawnSync(process.execPath, ['-e', "const v=require(process.argv[1]);const e=process.argv[2];if(e.startsWith('export:')){if(!(e.slice(7) in v))process.exit(1);console.log(e)}", target, probe.expected ?? ''], { cwd: projectRoot, encoding: 'utf8', timeout: 10000 });
        if (result.status !== 0 || (probe.expected && !`${result.stdout}${result.stderr}`.includes(probe.expected))) failures.push(`${item.installName}: probe ${probe.target} failed`);
      }
      for (const dep of Object.keys(actual.dependencies ?? {})) {
        const release = manifest.packages.find(p => p.installName === dep);
        if (!release) continue;
        const nested = JSON.parse(fs.readFileSync(createRequire(file).resolve(`${dep}/package.json`), 'utf8'));
        if (nested.name !== release.publishName || nested.version !== release.publishVersion) failures.push(`${item.installName} -> ${dep}: unexpected dependency identity`);
      }
    } catch (error) { failures.push(`${item.installName}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  return failures;
}

export function runReleaseDoctorChecks(projectRoot: string, manifest: ReleaseManifest): CheckResult[] {
  const state = readManagedState(projectRoot).sdk54;
  const failures = state?.mode === 'sdk54-scoped-packages' && state.release === manifest.release
    ? releaseRuntimeFailures(projectRoot, manifest, state.template)
    : ['Missing or incompatible scoped release managed-state'];
  return [{ id: 'sdk54-release', label: 'SDK54 npm release', status: failures.length ? 'fail' : 'ok', level: 'required', detail: failures.length ? failures.join('；') : manifest.release }];
}
