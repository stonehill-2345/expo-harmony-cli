import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Sdk54Template } from './create-options';
import { loadReleaseManifest, buildReleasePackageJson } from './release-manifest';
import { validateSdk54Template } from './template-contract';
import { applyDefaultImageSubstitution } from './default-image-substitution';
import { sdk54InstallCommand } from '../lib/pkg-manager';
import { runFileQuiet, getCommandErrorDetail } from '../utils/exec';
import { readManagedState, writeManagedState } from '../lifecycle/managed-state';
import { commitTextFileTransaction } from './file-transaction';
import { releaseRuntimeFailures } from './release-runtime';

export interface Sdk54ReleaseCreateRequest {
  cwd: string;
  projectName: string;
  template: Sdk54Template;
  packageManager: 'npm' | 'pnpm';
}

const SDK54_CREATE_EXPO = '@expo-oh/create-expo@3.5.13';

export async function runSdk54ReleaseCreate(request: Sdk54ReleaseCreateRequest) {
  const manifest = loadReleaseManifest();
  const projectRoot = path.resolve(request.cwd, request.projectName);
  if (fs.existsSync(projectRoot)) {
    throw new Error(`目标目录已存在：${projectRoot}。请更换项目名，或删除/移动该目录后重试。`);
  }
  try {
    await runFileQuiet('npx', [SDK54_CREATE_EXPO, request.projectName, '--template', request.template, '--no-install'], { cwd: request.cwd });
  } catch (error) {
    throw new Error(`创建 SDK 54 模板失败（${SDK54_CREATE_EXPO}）。请检查网络、npm 源或目标目录。\n${getCommandErrorDetail(error)}`);
  }
  const validated = validateSdk54Template(projectRoot, request.template, manifest);
  if (request.template === 'default') applyDefaultImageSubstitution(projectRoot);
  const pkg = buildReleasePackageJson(validated.packageJson, request.template, manifest);
  commitTextFileTransaction([{ path: path.join(projectRoot, 'package.json'), contents: `${JSON.stringify(pkg, null, 2)}\n` }]);
  const command = sdk54InstallCommand(request.packageManager);
  try {
    await runFileQuiet(command.file, command.args, { cwd: projectRoot });
  } catch (error) {
    throw new Error(`安装依赖失败（${command.file} ${command.args.join(' ')}）。请检查网络或 npm 源后，在 ${projectRoot} 内重试。\n${getCommandErrorDetail(error)}`);
  }
  const failures = releaseRuntimeFailures(projectRoot, manifest, request.template);
  if (failures.length) throw new Error(`SDK54 release verification failed:\n${failures.join('\n')}`);
  writeManagedState(projectRoot, { ...readManagedState(projectRoot), sdk54: {
    sdk: 'sdk-54', mode: 'sdk54-scoped-packages', release: manifest.release,
    template: request.template, expo: manifest.packages.find(p => p.installName === 'expo')!.publishVersion,
    rnoh: manifest.catalog.external['@react-native-oh/react-native-harmony'],
  } });
  for (const name of ['README.md', 'AGENTS.md']) {
    const source = fs.readFileSync(path.resolve(__dirname, '../../content/releases/sdk-54', name), 'utf8');
    const contents = source.split('{{appName}}').join(validated.appName)
      .split('{{release}}').join(manifest.release).split('{{cliVersion}}').join(manifest.cliVersion);
    fs.writeFileSync(path.join(projectRoot, name), contents);
  }
  return { projectRoot, template: request.template, packageManager: request.packageManager, release: manifest.release };
}
