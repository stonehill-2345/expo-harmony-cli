import { getHarmonyRelease, harmonyVersions, harmonyInstallSpec, hasReleaseIdentity } from './release';
import * as PackageManager from '@expo/package-manager';
import fs from 'fs';
import path from 'path';

import * as Log from '../log';
import { CommandError } from '../utils/errors';

export const HARMONY_RUNTIME_PACKAGES = {
  react: '19.1.1',
  'react-native': '0.82.1',
  '@react-native-oh/react-native-harmony': '0.82.30',
  'expo-splash-screen': '31.0.13',
} as const;

export async function ensureHarmonyDependenciesAsync(
  projectRoot: string,
  {
    install,
    packageManagerOptions = {},
  }: {
    install: boolean;
    packageManagerOptions?: { npm?: boolean; yarn?: boolean; pnpm?: boolean; bun?: boolean };
  }
): Promise<{ installed: boolean }> {
  const release = getHarmonyRelease(projectRoot);
  const versions = release ? harmonyVersions(release) : HARMONY_RUNTIME_PACKAGES;
  const required = Object.fromEntries(Object.keys(HARMONY_RUNTIME_PACKAGES).map(name => [name, versions[name as keyof typeof versions]]));
  const mismatches = Object.entries(required).filter(([name, expected]) => {
    const item = release?.packages.find(p => p.installName === name);
    return item ? !hasReleaseIdentity(projectRoot, item) : readInstalledVersion(projectRoot, name) !== expected;
  });
  if (mismatches.length === 0) {
    return { installed: false };
  }

  const specs = Object.entries(required).map(
    ([name, version]) => harmonyInstallSpec(projectRoot, name, version)
  );
  if (!install) {
    throw new CommandError(
      'HARMONY_DEPENDENCIES',
      `Harmony requires ${specs.join(', ')}. Install them or rerun without --no-install.`
    );
  }

  const packageManager = PackageManager.createForProject(projectRoot, {
    ...packageManagerOptions,
    log: Log.log,
  });
  await packageManager.addAsync(specs);
  return { installed: true };
}

function readInstalledVersion(projectRoot: string, packageName: string): string | null {
  try {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'node_modules', packageName, 'package.json'), 'utf8')
    );
    return typeof packageJson.version === 'string' ? packageJson.version : null;
  } catch {
    return null;
  }
}
