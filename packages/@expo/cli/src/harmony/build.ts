import spawnAsync from '@expo/spawn-async';
import fs from 'fs';
import path from 'path';
import type { HarmonyToolchain } from './paths';

export async function buildHarmonyAsync(
  projectRoot: string,
  configuration: 'debug' | 'release',
  toolchain: HarmonyToolchain
) {
  const harmonyRoot = path.join(projectRoot, 'harmony');
  const env = {
    ...process.env,
    DEVECO_HOME: toolchain.devecoHome,
    DEVECO_SDK_HOME: process.env.DEVECO_SDK_HOME ?? path.join(toolchain.devecoHome, 'sdk'),
  };
  await spawnAsync(toolchain.ohpm, ['install'], {
    cwd: path.join(harmonyRoot, 'entry'),
    stdio: 'inherit',
    env,
  });
  await spawnAsync(
    toolchain.hvigor,
    [
      '--mode',
      'module',
      '-p',
      'product=default',
      '-p',
      'module=entry@default',
      '-p',
      `buildMode=${configuration}`,
      'assembleHap',
      '--no-daemon',
      '--stacktrace',
    ],
    { cwd: harmonyRoot, stdio: 'inherit', env }
  );
  const hap = path.join(
    harmonyRoot,
    'entry/build/default/outputs/default/entry-default-unsigned.hap'
  );
  if (!fs.existsSync(hap)) throw new Error(`Harmony HAP was not produced at ${hap}`);
  return hap;
}
