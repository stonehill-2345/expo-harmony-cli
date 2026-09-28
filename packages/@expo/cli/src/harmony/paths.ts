import fs from 'fs';
import path from 'path';

import { CommandError } from '../utils/errors';

export type HarmonyToolchain = { devecoHome: string; ohpm: string; hvigor: string; hdc: string };

export function resolveHarmonyToolchain(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): HarmonyToolchain {
  const standardMacHome = '/Applications/DevEco-Studio.app/Contents';
  const devecoHome =
    env.DEVECO_HOME ??
    (env.DEVECO_SDK_HOME ? path.dirname(env.DEVECO_SDK_HOME) : undefined) ??
    (platform === 'darwin' && fs.existsSync(standardMacHome) ? standardMacHome : undefined);
  if (!devecoHome)
    throw new CommandError('HARMONY_ENV', 'Set DEVECO_HOME or DEVECO_SDK_HOME to DevEco Studio.');
  const tools = path.join(devecoHome, 'tools');
  const sdk = env.DEVECO_SDK_HOME ?? path.join(devecoHome, 'sdk');
  const pathHdc = findExecutableOnPath('hdc', env.PATH);
  const candidates = [pathHdc, path.join(sdk, 'default/openharmony/toolchains/hdc'), 'hdc'].filter(
    (item): item is string => item != null
  );
  const result = {
    devecoHome,
    ohpm: path.join(tools, 'ohpm/bin/ohpm'),
    hvigor: path.join(tools, 'hvigor/bin/hvigorw'),
    hdc: candidates.find((item) => item === 'hdc' || fs.existsSync(item))!,
  };
  for (const [name, file] of Object.entries(result)) {
    if (name !== 'devecoHome' && file !== 'hdc' && !fs.existsSync(file)) {
      throw new CommandError('HARMONY_ENV', `Harmony ${name} tool does not exist at ${file}`);
    }
  }
  return result;
}

function findExecutableOnPath(executable: string, searchPath: string | undefined): string | undefined {
  for (const directory of (searchPath ?? '').split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(directory, executable);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {}
  }
  return undefined;
}
