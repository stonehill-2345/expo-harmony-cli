import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';

vi.mock('../../src/utils/exec', () => ({
  runFileQuiet: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../src/sdk54/patch-manifest', () => ({
  loadSdk54PatchManifest: vi.fn(() => ({ patchSet: 'sdk54-mvp-1', catalog: { expo: { expo: '54.0.37' }, external: { '@react-native-oh/react-native-harmony': '0.82.30' } } })),
  assertManifestReadyForTemplate: vi.fn(),
}));
vi.mock('../../src/sdk54/template-contract', () => ({ validateSdk54Template: vi.fn((projectRoot: string, template: string) => ({ projectRoot, template, appName: 'My App', slug: 'my-app', packageJson: {}, appJson: {} })) }));
vi.mock('../../src/sdk54/default-image-substitution', () => ({ applyDefaultImageSubstitution: vi.fn(() => ['app/(tabs)/explore.tsx', 'app/(tabs)/index.tsx']) }));
vi.mock('../../src/sdk54/install-patches', () => ({ prepareSdk54PatchInstall: vi.fn(() => ({ patchFiles: ['patches/expo.patch'], packageJsonChanged: true })) }));
vi.mock('../../src/lib/pkg-manager', () => ({ sdk54InstallCommand: vi.fn((pm: string) => ({ file: pm, args: ['install'] })) }));
vi.mock('../../src/sdk54/verify-runtime', () => ({ assertSdk54Runtime: vi.fn() }));
vi.mock('../../src/sdk54/project-state', () => ({ writeSdk54ManagedState: vi.fn() }));
vi.mock('../../src/sdk54/docs', () => ({ injectSdk54Docs: vi.fn() }));

import { runFileQuiet } from '../../src/utils/exec';
import { createExpoTemplateArg, runSdk54Create } from '../../src/sdk54/create';

describe('createExpoTemplateArg', () => {
  it('maps CLI template names to official create-expo-app template arguments', () => {
    expect(createExpoTemplateArg('blank-typescript')).toBe('blank-typescript@sdk-54');
    expect(createExpoTemplateArg('default')).toBe('default@sdk-54');
  });
});

describe('runSdk54Create', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['blank-typescript', 'blank-typescript@sdk-54'],
    ['default', 'default@sdk-54'],
  ] as const)('calls create-expo-app@5.0.0 for %s', async (template, officialTemplate) => {
    const result = await runSdk54Create({
      cwd: '/workspace',
      projectName: 'myapp',
      template,
      packageManager: 'pnpm',
    });

    expect(runFileQuiet).toHaveBeenCalledWith(
      'npx',
      ['create-expo-app@5.0.0', 'myapp', '--template', officialTemplate, '--no-install'],
      { cwd: '/workspace' },
    );
    expect(result).toEqual({
      projectRoot: path.resolve('/workspace', 'myapp'),
      template,
      packageManager: 'pnpm',
      patchSet: 'sdk54-mvp-1',
    });
  });

  it('preserves create-expo-app stderr and stdout in the stage error', async () => {
    const error = Object.assign(new Error('npx exited with code 1'), {
      stderr: 'registry unavailable',
      stdout: 'create output',
    });
    vi.mocked(runFileQuiet).mockRejectedValueOnce(error);

    await expect(runSdk54Create({
      cwd: '/workspace',
      projectName: 'myapp',
      template: 'default',
      packageManager: 'npm',
    })).rejects.toThrow(/创建 Expo SDK 54 模板失败.*registry unavailable.*create output/s);
  });
});


describe('runSdk54Create orchestration', () => {
  beforeEach(() => vi.clearAllMocks());
  it('runs the SDK54 stages in order and skips image substitution for blank', async () => {
    const { validateSdk54Template } = await import('../../src/sdk54/template-contract');
    const { applyDefaultImageSubstitution } = await import('../../src/sdk54/default-image-substitution');
    const { prepareSdk54PatchInstall } = await import('../../src/sdk54/install-patches');
    const { assertSdk54Runtime } = await import('../../src/sdk54/verify-runtime');
    const { writeSdk54ManagedState } = await import('../../src/sdk54/project-state');
    const { injectSdk54Docs } = await import('../../src/sdk54/docs');
    await runSdk54Create({ cwd: '/workspace', projectName: 'blank', template: 'blank-typescript', packageManager: 'pnpm' });
    expect(validateSdk54Template).toHaveBeenCalledWith('/workspace/blank', 'blank-typescript', expect.anything());
    expect(applyDefaultImageSubstitution).not.toHaveBeenCalled();
    expect(prepareSdk54PatchInstall).toHaveBeenCalled();
    expect(runFileQuiet).toHaveBeenLastCalledWith('pnpm', ['install'], { cwd: '/workspace/blank' });
    expect(assertSdk54Runtime).toHaveBeenCalled();
    expect(writeSdk54ManagedState).toHaveBeenCalled();
    expect(injectSdk54Docs).toHaveBeenCalled();
  });

  it('stops after template-contract failure and preserves the project directory', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const { validateSdk54Template } = await import('../../src/sdk54/template-contract');
    const { prepareSdk54PatchInstall } = await import('../../src/sdk54/install-patches');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-create-stage-'));
    const projectRoot = path.join(root, 'app');
    fs.mkdirSync(projectRoot);
    vi.mocked(validateSdk54Template).mockImplementationOnce(() => { throw new Error('drift'); });
    await expect(runSdk54Create({ cwd: root, projectName: 'app', template: 'default', packageManager: 'npm' })).rejects.toThrow(/template-contract.*drift/);
    expect(prepareSdk54PatchInstall).not.toHaveBeenCalled();
    expect(fs.existsSync(projectRoot)).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
