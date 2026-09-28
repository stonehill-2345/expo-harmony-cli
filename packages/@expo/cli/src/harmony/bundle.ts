import { resolveEntryPoint } from '@expo/config/paths';
import fs from 'fs';
import path from 'path';
import { exportEmbedInternalAsync } from '../export/embed/exportEmbedAsync';

export async function bundleHarmonyReleaseAsync(projectRoot: string) {
  process.env.EXPO_HARMONY_METRO = '1';
  const raw = path.join(projectRoot, 'harmony/entry/src/main/resources/rawfile');
  const assets = path.join(raw, 'assets');
  const bundleOutput = path.join(raw, 'bundle.harmony.js');
  await fs.promises.rm(assets, { recursive: true, force: true });
  await exportEmbedInternalAsync(projectRoot, {
    entryFile: resolveEntryPoint(projectRoot, { platform: 'harmony' }),
    platform: 'harmony',
    dev: false,
    minify: true,
    bundleOutput,
    assetsDest: assets,
    resetCache: false,
    sourcemapUseAbsolutePath: false,
    verbose: false,
    bundleEncoding: 'utf8',
  });
  await copyDirectoryContentsAsync(path.join(assets, 'assets'), assets);
  return bundleOutput;
}

async function copyDirectoryContentsAsync(source: string, destination: string): Promise<void> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(source, { withFileTypes: true });
  } catch (error: any) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }

  await fs.promises.mkdir(destination, { recursive: true });
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyDirectoryContentsAsync(sourcePath, destinationPath);
    } else {
      await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
      await fs.promises.copyFile(sourcePath, destinationPath);
    }
  }
}
