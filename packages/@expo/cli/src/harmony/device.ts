import spawnAsync from '@expo/spawn-async';
import { CommandError } from '../utils/errors';

const HDC_DEVICE_DISCOVERY_TIMEOUT = 10_000;

class HdcDeviceDiscoveryTimeoutError extends Error {}
class HdcServerConnectionError extends Error {}

async function hdc(
  hdcPath: string,
  target: string | undefined,
  args: string[],
  timeout?: number
) {
  const command = spawnAsync(hdcPath, [...(target ? ['-t', target] : []), ...args]);
  if (timeout == null) return getHdcOutput(await command);

  let timeoutId: NodeJS.Timeout | undefined;
  let timedOut = false;
  const timeoutError = new HdcDeviceDiscoveryTimeoutError(
    'Harmony HDC device discovery timed out.'
  );
  try {
    const result = await Promise.race([
      command,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          timedOut = true;
          command.child.kill('SIGKILL');
          reject(timeoutError);
        }, timeout);
      }),
    ]);
    return getHdcOutput(result);
  } catch (error) {
    if (timedOut) {
      await command.catch(() => undefined);
      throw timeoutError;
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function getHdcOutput(result: spawnAsync.SpawnResult): string {
  if ([result.stdout, result.stderr].some((text) => text?.includes('Connect server failed'))) {
    throw Object.assign(new HdcServerConnectionError('Connect server failed'), result);
  }
  return result.stdout.trim();
}

async function listHarmonyTargetsAsync(hdcPath: string) {
  return await hdc(hdcPath, undefined, ['list', 'targets'], HDC_DEVICE_DISCOVERY_TIMEOUT);
}

export async function resolveHarmonyDeviceAsync(hdcPath: string, requested?: string) {
  if (requested) return requested;
  let output: string;
  try {
    output = await listHarmonyTargetsAsync(hdcPath);
  } catch (error) {
    if (!isHdcServerUnavailable(error)) throw error;
    try {
      await hdc(hdcPath, undefined, ['start', '-r']);
      output = await listHarmonyTargetsAsync(hdcPath);
    } catch (retryError) {
      if (!isHdcServerUnavailable(retryError)) throw retryError;
      throw new CommandError(
        'HARMONY_DEVICE',
        'Unable to connect to the Harmony HDC server after restarting it.'
      );
    }
  }
  const targets = output
    .split(/\r?\n/)
    .map((x) => x.trim().split(/\s+/)[0])
    .filter((x) => x && x !== '[Empty]');
  if (targets.length !== 1)
    throw new CommandError(
      'HARMONY_DEVICE',
      targets.length
        ? 'Specify --device when multiple Harmony targets are connected.'
        : 'No Harmony device is connected.'
    );
  return targets[0];
}

function isHdcServerUnavailable(error: unknown): boolean {
  if (
    error instanceof HdcDeviceDiscoveryTimeoutError ||
    error instanceof HdcServerConnectionError
  )
    return true;
  if (!(error instanceof Error)) return false;
  const result = error as Error & { stdout?: string; stderr?: string };
  return [result.message, result.stdout, result.stderr].some((text) =>
    text?.includes('Connect server failed')
  );
}

export async function reverseHarmonyPortAsync(hdcPath: string, target: string, port: number) {
  await hdc(hdcPath, target, ['rport', `tcp:${port}`, `tcp:${port}`]);
}
export async function installHarmonyAppAsync(hdcPath: string, target: string, hap: string) {
  await hdc(hdcPath, target, ['install', '-r', hap]);
}
export async function launchHarmonyAppAsync(hdcPath: string, target: string, bundleName: string) {
  await hdc(hdcPath, target, ['shell', 'aa', 'start', '-a', 'EntryAbility', '-b', bundleName]);
}
