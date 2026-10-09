import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Sdk54CreateRequest } from './create';
import { createExpoTemplateArg } from './create';
import { loadReleaseManifest, buildReleasePackageJson } from './release-manifest';
import { validateSdk54Template } from './template-contract';
import { applyDefaultImageSubstitution } from './default-image-substitution';
import { sdk54InstallCommand } from '../lib/pkg-manager';
import { runFileQuiet } from '../utils/exec';
import { readManagedState, writeManagedState } from '../lifecycle/managed-state';
import { commitTextFileTransaction } from './file-transaction';
import { releaseRuntimeFailures } from './release-runtime';

export async function runSdk54ReleaseCreate(request: Sdk54CreateRequest) {
  const manifest = loadReleaseManifest();
  await runFileQuiet('npx', [`create-expo-app@${manifest.createExpoApp}`, request.projectName, '--template', createExpoTemplateArg(request.template), '--no-install'], { cwd: request.cwd });
  const projectRoot = path.resolve(request.cwd, request.projectName);
  const validated = validateSdk54Template(projectRoot, request.template, manifest);
  if (request.template === 'default') applyDefaultImageSubstitution(projectRoot);
  const pkg = buildReleasePackageJson(validated.packageJson, request.template, manifest);
  commitTextFileTransaction([{ path: path.join(projectRoot, 'package.json'), contents: `${JSON.stringify(pkg, null, 2)}\n` }]);
  const command = sdk54InstallCommand(request.packageManager);
  await runFileQuiet(command.file, command.args, { cwd: projectRoot });
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
