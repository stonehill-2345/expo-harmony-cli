import * as path from 'node:path';
import { runFileQuiet } from '../utils/exec';
import type { Sdk54Template } from './create-options';
import { applyDefaultImageSubstitution } from './default-image-substitution';
import { injectSdk54Docs } from './docs';
import { prepareSdk54PatchInstall } from './install-patches';
import { sdk54InstallCommand } from '../lib/pkg-manager';
import { assertManifestReadyForTemplate, loadSdk54PatchManifest } from './patch-manifest';
import { writeSdk54ManagedState } from './project-state';
import { validateSdk54Template } from './template-contract';
import { assertSdk54Runtime } from './verify-runtime';

export interface Sdk54CreateRequest {
  cwd: string;
  projectName: string;
  template: Sdk54Template;
  packageManager: 'npm' | 'pnpm';
}

export interface Sdk54CreateResult {
  projectRoot: string;
  template: Sdk54Template;
  packageManager: 'npm' | 'pnpm';
  patchSet: string;
}

export function createExpoTemplateArg(template: Sdk54Template): string {
  return template === 'blank-typescript' ? 'blank-typescript@sdk-54' : 'default@sdk-54';
}

function commandErrorDetail(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const commandError = error as Error & { stdout?: string | Buffer; stderr?: string | Buffer };
  const output = [commandError.stderr, commandError.stdout]
    .map(value => value?.toString().trim())
    .filter((value): value is string => Boolean(value))
    .join('\n');
  return output || error.message;
}

async function runStage<T>(stage: string, action: () => T | Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) { throw new Error(`[sdk54-create:${stage}] ${error instanceof Error ? error.message : String(error)}`); }
}

export async function runSdk54Create(request: Sdk54CreateRequest): Promise<Sdk54CreateResult> {
  try {
    await runFileQuiet(
      'npx',
      ['create-expo-app@5.0.0', request.projectName, '--template', createExpoTemplateArg(request.template), '--no-install'],
      { cwd: request.cwd },
    );
  } catch (error) {
    throw new Error(`创建 Expo SDK 54 模板失败。请检查网络、npm 源或目标目录。\n${commandErrorDetail(error)}`);
  }

  const projectRoot = path.resolve(request.cwd, request.projectName);
  const manifest = await runStage('manifest', () => loadSdk54PatchManifest());
  await runStage('manifest-ready', () => assertManifestReadyForTemplate(manifest, request.template));
  const validated = await runStage('template-contract', () => validateSdk54Template(projectRoot, request.template, manifest));
  if (request.template === 'default') {
    await runStage('default-image-substitution', () => applyDefaultImageSubstitution(projectRoot));
  }
  await runStage('patch-install', () => prepareSdk54PatchInstall(projectRoot, request.template, manifest));
  const install = sdk54InstallCommand(request.packageManager);
  await runStage('dependency-install', () => runFileQuiet(install.file, install.args, { cwd: projectRoot }));
  await runStage('runtime-probes', () => assertSdk54Runtime(projectRoot, manifest));
  await runStage('managed-state', () => writeSdk54ManagedState(projectRoot, {
    template: request.template, patchSet: manifest.patchSet,
    expo: manifest.catalog.expo.expo,
    rnoh: manifest.catalog.external['@react-native-oh/react-native-harmony'],
  }));
  await runStage('docs', () => injectSdk54Docs(projectRoot, {
    appName: validated.appName, slug: validated.slug, template: request.template,
    patchSet: manifest.patchSet, expo: manifest.catalog.expo.expo,
    rnoh: manifest.catalog.external['@react-native-oh/react-native-harmony'],
  }));
  return { projectRoot, template: request.template, packageManager: request.packageManager, patchSet: manifest.patchSet };
}
