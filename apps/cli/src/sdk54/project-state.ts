import { expoSdkMajor } from './npm-spec';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { readManagedState, writeManagedState, type Sdk54ManagedState } from '../lifecycle/managed-state';
import type { Sdk54Template } from './create-options';

export type HarmonyProjectKind = 'sdk54-scoped-packages' | 'sdk52-legacy' | 'sdk54-package-patch' | 'sdk54-legacy' | 'unknown';

export interface WriteSdk54ManagedStateInput {
  template: Sdk54Template;
  patchSet: string;
  expo: string;
  rnoh: string;
}

export function writeSdk54ManagedState(projectRoot: string, input: WriteSdk54ManagedStateInput): void {
  const current = readManagedState(projectRoot);
  const sdk54: Sdk54ManagedState = { sdk: 'sdk-54', mode: 'sdk54-package-patch', ...input };
  writeManagedState(projectRoot, { ...current, sdk54 });
}

function expoMajor(projectRoot: string): number | undefined {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
    const value = pkg.dependencies?.expo ?? pkg.devDependencies?.expo;
    if (typeof value !== 'string') return undefined;
    return expoSdkMajor(value);
  } catch { return undefined; }
}

export function classifyHarmonyProject(projectRoot: string): HarmonyProjectKind {
  const major = expoMajor(projectRoot);
  const state = readManagedState(projectRoot);
  if (major === 54) {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
    const spec = pkg.dependencies?.expo ?? pkg.devDependencies?.expo;
    if (state.sdk54?.mode === 'sdk54-scoped-packages' || (typeof spec === 'string' && spec.startsWith('npm:@expo-oh/expo@'))) return 'sdk54-scoped-packages';
  }
  if (major === 54 && state.sdk54?.mode === 'sdk54-package-patch') return 'sdk54-package-patch';
  if (major !== undefined && major <= 52) return 'sdk52-legacy';
  if (major === 54) {
    const hasBypass = ['index.harmony.js', 'shims'].some(relative => fs.existsSync(path.join(projectRoot, relative)));
    const stateFile = path.join(projectRoot, '.expo-harmony/managed-state.json');
    if (hasBypass || fs.existsSync(stateFile)) return 'sdk54-legacy';
  }
  return 'unknown';
}
