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
  await stageMaterialIconsAsync(bundleOutput, assets);
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

async function stageMaterialIconsAsync(bundleOutput: string, assets: string): Promise<void> {
  const source = await findFileNamedAsync(assets, 'MaterialIcons.ttf');
  if (!source) return;

  const destination = path.join(assets, 'MaterialIcons.ttf');
  await fs.promises.copyFile(source, destination);

  const bundle = await fs.promises.readFile(bundleOutput, 'utf8');
  const marker = 'name:"MaterialIcons",type:"ttf"';
  const markerIndex = bundle.indexOf(marker);
  const assetStart = bundle.lastIndexOf('registerAsset({', markerIndex);
  const locationPrefix = 'httpServerLocation:"';
  const locationStart = bundle.indexOf(locationPrefix, assetStart) + locationPrefix.length;
  const locationEnd = bundle.indexOf('"', locationStart);
  if (
    markerIndex < 0 ||
    assetStart < 0 ||
    locationStart < locationPrefix.length ||
    locationEnd < locationStart ||
    locationEnd > markerIndex
  ) {
    throw new Error('Harmony Release could not rewrite the MaterialIcons asset location.');
  }
  await fs.promises.writeFile(
    bundleOutput,
    `${bundle.slice(0, locationStart)}/assets${bundle.slice(locationEnd)}`
  );
}

async function findFileNamedAsync(root: string, name: string): Promise<string | null> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(root, { withFileTypes: true });
  } catch (error: any) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  for (const entry of entries) {
    const file = path.join(root, entry.name);
    if (entry.isFile() && entry.name === name) return file;
    if (entry.isDirectory()) {
      const nested = await findFileNamedAsync(file, name);
      if (nested) return nested;
    }
  }
  return null;
}
