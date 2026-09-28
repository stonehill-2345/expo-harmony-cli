import fs from 'fs';
import path from 'path';
import { prebuildHarmonyAsync } from '../../prebuild/harmony/prebuildHarmonyAsync';
import { startBundlerAsync } from '../startBundler';
import { bundleHarmonyReleaseAsync } from '../../harmony/bundle';
import { buildHarmonyAsync } from '../../harmony/build';
import {
  installHarmonyAppAsync,
  launchHarmonyAppAsync,
  resolveHarmonyDeviceAsync,
  reverseHarmonyPortAsync,
} from '../../harmony/device';
import { resolveHarmonyToolchain } from '../../harmony/paths';

const defaults = {
  prebuildHarmonyAsync,
  startBundlerAsync,
  bundleHarmonyReleaseAsync,
  buildHarmonyAsync,
  installHarmonyAppAsync,
  launchHarmonyAppAsync,
  resolveHarmonyDeviceAsync,
  reverseHarmonyPortAsync,
  resolveHarmonyToolchain,
};
export async function runHarmonyAsync(
  projectRoot: string,
  options: {
    configuration?: string;
    device?: string;
    port?: number;
    install?: boolean;
    bundler?: boolean;
    buildCache?: boolean;
    bundleName?: string;
  },
  deps: any = defaults
) {
  const configuration = (options.configuration ?? 'Debug').toLowerCase();
  if (!['debug', 'release'].includes(configuration))
    throw new Error('Expected --configuration Debug or Release');
  process.env.NODE_ENV = configuration === 'release' ? 'production' : 'development';
  const native = await deps.prebuildHarmonyAsync(projectRoot, {
    install: options.install ?? true,
    clean: false,
    bundleName: options.bundleName,
  });
  const toolchain = deps.resolveHarmonyToolchain();
  const port = options.port ?? 8081;
  if (options.buildCache === false)
    await Promise.all(
      ['entry/build', 'entry/.cxx', '.hvigor'].map((p) =>
        fs.promises.rm(path.join(projectRoot, 'harmony', p), { recursive: true, force: true })
      )
    );
  if (configuration === 'release') await deps.bundleHarmonyReleaseAsync(projectRoot);
  else {
    await Promise.all([
      fs.promises.rm(
        path.join(projectRoot, 'harmony/entry/src/main/resources/rawfile/bundle.harmony.js'),
        { force: true }
      ),
      fs.promises.rm(path.join(projectRoot, 'harmony/entry/src/main/resources/rawfile/assets'), {
        recursive: true,
        force: true,
      }),
    ]);
    process.env.EXPO_HARMONY_METRO = '1';
    await updateMetroPortAsync(projectRoot, port);
    if (options.bundler !== false)
      await deps.startBundlerAsync(projectRoot, {
        port,
        headless: false,
        hostType: 'localhost',
        showInterface: false,
      });
  }
  const hap = await deps.buildHarmonyAsync(projectRoot, configuration, toolchain);
  const target = await deps.resolveHarmonyDeviceAsync(toolchain.hdc, options.device);
  if (configuration === 'debug') await deps.reverseHarmonyPortAsync(toolchain.hdc, target, port);
  await deps.installHarmonyAppAsync(toolchain.hdc, target, hap);
  const app = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'harmony/AppScope/app.json5'), 'utf8')
  );
  await deps.launchHarmonyAppAsync(toolchain.hdc, target, app.app.bundleName);
  return { hap, target, harmonyRoot: native.harmonyRoot };
}
async function updateMetroPortAsync(projectRoot: string, port: number) {
  const p = path.join(projectRoot, 'harmony/entry/src/main/ets/pages/Index.ets');
  const s = await fs.promises.readFile(p, 'utf8');
  await fs.promises.writeFile(
    p,
    s.replace(/127\.0\.0\.1:\d+(?=\/[^'\"]*\.bundle)/g, `127.0.0.1:${port}`)
  );
}
