import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runSdk54DoctorChecks } from '../../src/sdk54/doctor';
import type { Sdk54PatchManifest } from '../../src/sdk54/patch-manifest';

vi.mock('../../src/sdk54/verify-runtime', () => ({ collectSdk54RuntimeFailures: vi.fn(() => []) }));

describe('runSdk54DoctorChecks', () => {
  let root: string;
  let manifest: Sdk54PatchManifest;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-doctor-'));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
      dependencies: { expo: '54.0.37' }, scripts: { postinstall: 'patch-package --error-on-fail --error-on-warn' },
    }));
    fs.mkdirSync(path.join(root, '.expo-harmony'), { recursive: true });
    fs.writeFileSync(path.join(root, '.expo-harmony/managed-state.json'), JSON.stringify({
      version: 2, packages: {}, sdk54: { sdk: 'sdk-54', mode: 'sdk54-package-patch', template: 'default', patchSet: 'sdk54-mvp-1', expo: '54.0.37', rnoh: '0.82.30' },
    }));
    manifest = { schemaVersion: 1, patchSet: 'sdk54-mvp-1', createExpoApp: '5.0.0', patchPackageVersion: '8.0.0', catalog: { expo: { expo: '54.0.37' }, external: {} }, templates: { 'blank-typescript': { expoPackages: [], externalPackages: [], dependencies: {}, devDependencies: {} }, default: { expoPackages: [], externalPackages: [], dependencies: {}, devDependencies: {} } }, defaultImage: { files: [], sourceImport: 'x', replacementImport: 'y' }, patches: [] };
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('passes healthy package-patch state without writing', () => {
    const before = snapshot(root);
    expect(runSdk54DoctorChecks(root, manifest).every(result => result.status === 'ok')).toBe(true);
    expect(snapshot(root)).toBe(before);
  });

  it('reports patch-set and postinstall drift', () => {
    const stateFile = path.join(root, '.expo-harmony/managed-state.json');
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); state.sdk54.patchSet = 'old'; fs.writeFileSync(stateFile, JSON.stringify(state));
    const pkgFile = path.join(root, 'package.json'); const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8')); delete pkg.scripts.postinstall; fs.writeFileSync(pkgFile, JSON.stringify(pkg));
    const results = runSdk54DoctorChecks(root, manifest);
    expect(results).toContainEqual(expect.objectContaining({ id: 'sdk54-state', status: 'fail' }));
    expect(results).toContainEqual(expect.objectContaining({ id: 'sdk54-postinstall', status: 'fail' }));
  });

  it('reports a legacy SDK54 project without modifying it', () => {
    fs.rmSync(path.join(root, '.expo-harmony'), { recursive: true });
    fs.writeFileSync(path.join(root, 'index.harmony.js'), 'legacy');
    const before = snapshot(root);
    expect(runSdk54DoctorChecks(root, manifest)).toEqual([expect.objectContaining({ status: 'fail', detail: expect.stringContaining('legacy SDK54 project') })]);
    expect(snapshot(root)).toBe(before);
  });

  it('checks shipped patch checksum', () => {
    fs.mkdirSync(path.join(root, 'patches'), { recursive: true }); fs.writeFileSync(path.join(root, 'patches/expo.patch'), 'bad');
    manifest.patches = [{ name: 'expo', version: '54.0.37', file: 'expo.patch', sha256: createHash('sha256').update('good').digest('hex'), templates: ['default'], requiredFiles: [], probes: [], licenses: [] }];
    expect(runSdk54DoctorChecks(root, manifest)).toContainEqual(expect.objectContaining({ id: 'sdk54-patches', status: 'fail' }));
  });
});

function snapshot(root: string): string {
  const out: string[] = []; const visit = (dir: string) => { for (const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) { const p=path.join(dir,e.name); if(e.isDirectory()) visit(p); else out.push(path.relative(root,p)+'\0'+fs.readFileSync(p).toString('base64')); } }; visit(root); return out.join('\n');
}
