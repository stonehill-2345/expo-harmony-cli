import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const mocks = vi.hoisted(() => ({ run: vi.fn(), failures: vi.fn(() => [] as string[]) }));
vi.mock('../../src/utils/exec', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/utils/exec')>(),
  runFileQuiet: mocks.run,
}));
vi.mock('../../src/sdk54/release-runtime', () => ({ releaseRuntimeFailures: mocks.failures }));
import { runSdk54ReleaseCreate } from '../../src/sdk54/create-release';
import { loadReleaseManifest } from '../../src/sdk54/release-manifest';
import { readManagedState } from '../../src/lifecycle/managed-state';

let cwd: string;
async function seedTemplate(command: string, args: string[]): Promise<void> {
  const root = path.join(cwd, 'app');
  if (command === 'npx') {
    expect(args).toContain('@expo-oh/create-expo@3.5.13');
    expect(args).toContain('--no-install');
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'app', dependencies: loadReleaseManifest().templates['blank-typescript'].sourceDependencies }));
    fs.writeFileSync(path.join(root, 'app.json'), JSON.stringify({ expo: { name: 'App', slug: 'app' } }));
    fs.writeFileSync(path.join(root, 'App.tsx'), 'export default function App() {}');
  } else {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const manifest = loadReleaseManifest();
    expect(pkg.dependencies.expo).toBe(manifest.packages.find(item => item.installName === 'expo')?.installSpec);
    expect(pkg.devDependencies['patch-package']).toBeUndefined();
    expect(fs.existsSync(path.join(root, 'patches'))).toBe(false);
  }
}
beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'release-create-'));
  mocks.failures.mockReturnValue([]);
  mocks.run.mockReset();
  mocks.run.mockImplementation(seedTemplate);
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

it('rejects an existing target directory before invoking npx', async () => {
  fs.mkdirSync(path.join(cwd, 'app'));
  await expect(runSdk54ReleaseCreate({ cwd, projectName: 'app', template: 'default', packageManager: 'npm' }))
    .rejects.toThrow(/已存在/);
  expect(mocks.run).not.toHaveBeenCalled();
});

it('surfaces subprocess stderr when template creation fails', async () => {
  mocks.run.mockImplementation(async (command: string) => {
    if (command !== 'npx') return;
    const error = new Error('npx exited with code 1') as Error & { stdout?: string; stderr?: string };
    error.stderr = 'Try using a new directory name, or moving these files.';
    throw error;
  });
  await expect(runSdk54ReleaseCreate({ cwd, projectName: 'app', template: 'blank-typescript', packageManager: 'npm' }))
    .rejects.toThrow(/Try using a new directory name/);
});

it('surfaces subprocess stderr when dependency installation fails', async () => {
  mocks.run.mockImplementation(async (command: string, args: string[]) => {
    if (command === 'npm') {
      const error = new Error('npm exited with code 1') as Error & { stdout?: string; stderr?: string };
      error.stderr = '404 Not Found - GET https://registry.example.com/expo';
      throw error;
    }
    await seedTemplate(command, args);
  });
  await expect(runSdk54ReleaseCreate({ cwd, projectName: 'app', template: 'blank-typescript', packageManager: 'npm' }))
    .rejects.toThrow(/404 Not Found/);
});
