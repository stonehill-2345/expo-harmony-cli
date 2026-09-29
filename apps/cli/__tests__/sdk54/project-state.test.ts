import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readManagedState, writeManagedState } from '../../src/lifecycle/managed-state';
import { classifyHarmonyProject, writeSdk54ManagedState } from '../../src/sdk54/project-state';

describe('SDK54 project state', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-state-'));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { expo: '54.0.37' } }));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('merges the exact SDK54 state without overwriting existing fields', () => {
    writeManagedState(root, { version: 2, packages: { foo: { needsAutolink: true } }, generatedFiles: { 'x.txt': { contentHash: 'abc', cliVersion: '1.4.0' } } });
    writeSdk54ManagedState(root, { template: 'default', patchSet: 'sdk54-mvp-1', expo: '54.0.37', rnoh: '0.82.30' });
    expect(readManagedState(root)).toEqual({
      version: 2,
      packages: { foo: { needsAutolink: true } },
      generatedFiles: { 'x.txt': { contentHash: 'abc', cliVersion: '1.4.0' } },
      sdk54: { sdk: 'sdk-54', mode: 'sdk54-package-patch', template: 'default', patchSet: 'sdk54-mvp-1', expo: '54.0.37', rnoh: '0.82.30' },
    });
    const before = fs.readFileSync(path.join(root, '.expo-harmony/managed-state.json'), 'utf8');
    writeSdk54ManagedState(root, { template: 'default', patchSet: 'sdk54-mvp-1', expo: '54.0.37', rnoh: '0.82.30' });
    expect(fs.readFileSync(path.join(root, '.expo-harmony/managed-state.json'), 'utf8')).toBe(before);
  });

  it('classifies package-patch state before harmony prebuild exists', () => {
    writeSdk54ManagedState(root, { template: 'blank-typescript', patchSet: 'sdk54-mvp-1', expo: '54.0.37', rnoh: '0.82.30' });
    expect(classifyHarmonyProject(root)).toBe('sdk54-package-patch');
  });

  it.each(['index.harmony.js', 'shims'])('classifies Expo 54 with %s as legacy', relative => {
    const target = path.join(root, relative);
    if (path.extname(target)) fs.writeFileSync(target, 'legacy'); else fs.mkdirSync(target);
    expect(classifyHarmonyProject(root)).toBe('sdk54-legacy');
  });

  it('classifies old managed state without sdk54 metadata as legacy SDK54', () => {
    writeManagedState(root, { version: 2, packages: { old: {} } });
    expect(classifyHarmonyProject(root)).toBe('sdk54-legacy');
  });

  it('classifies Expo 52 as sdk52-legacy and unrelated projects as unknown', () => {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { expo: '52.0.49' } }));
    expect(classifyHarmonyProject(root)).toBe('sdk52-legacy');
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: {} }));
    expect(classifyHarmonyProject(root)).toBe('unknown');
  });
});
