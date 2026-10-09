import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const mocks = vi.hoisted(() => ({ run: vi.fn(), failures: vi.fn(() => [] as string[]) }));
vi.mock('../../src/utils/exec', () => ({ runFileQuiet: mocks.run }));
vi.mock('../../src/sdk54/release-runtime', () => ({ releaseRuntimeFailures: mocks.failures }));
import { runSdk54ReleaseCreate } from '../../src/sdk54/create-release';
import { loadReleaseManifest } from '../../src/sdk54/release-manifest';
import { readManagedState } from '../../src/lifecycle/managed-state';

let cwd: string;
beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'release-create-'));
  mocks.failures.mockReturnValue([]);
  mocks.run.mockReset();
  mocks.run.mockImplementation(async (command: string, args: string[]) => {
    const root = path.join(cwd, 'app');
    if (command === 'npx') {
      expect(args).toContain('create-expo-app@5.0.0');
      expect(args).toContain('--no-install');
      fs.mkdirSync(root);
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'app', dependencies: loadReleaseManifest().templates['blank-typescript'].sourceDependencies }));
      fs.writeFileSync(path.join(root, 'app.json'), JSON.stringify({ expo: { name: 'App', slug: 'app' } }));
      fs.writeFileSync(path.join(root, 'App.tsx'), 'export default function App() {}');
    } else {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
      expect(pkg.dependencies.expo).toBe('npm:@expo-oh/expo@54.0.37');
      expect(pkg.devDependencies['patch-package']).toBeUndefined();
      expect(fs.existsSync(path.join(root, 'patches'))).toBe(false);
    }
  });
});
afterEach(() => fs.rmSync(cwd, { recursive: true, force: true }));

it('writes aliases before installing and records the release after successful probes', async () => {
  const result = await runSdk54ReleaseCreate({ cwd, projectName: 'app', template: 'blank-typescript', packageManager: 'npm' });
  expect(mocks.run).toHaveBeenCalledTimes(2);
  expect(readManagedState(result.projectRoot).sdk54).toMatchObject({ mode: 'sdk54-scoped-packages', release: result.release });
  const docs = fs.readFileSync(path.join(result.projectRoot, 'README.md'), 'utf8');
  expect(docs).toContain('@expo-oh');
  expect(docs).not.toContain('{{');
});

it('preserves the failed project without recording successful release state', async () => {
  mocks.failures.mockReturnValue(['wrong package identity']);
  await expect(runSdk54ReleaseCreate({ cwd, projectName: 'app', template: 'blank-typescript', packageManager: 'pnpm' })).rejects.toThrow('wrong package identity');
  expect(fs.existsSync(path.join(cwd, 'app/package.json'))).toBe(true);
  expect(readManagedState(path.join(cwd, 'app')).sdk54).toBeUndefined();
});
