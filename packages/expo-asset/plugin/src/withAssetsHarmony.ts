import { createHash } from 'crypto';
import { type ExpoConfig } from 'expo/config';
import { withHarmonyResources } from 'expo/harmony-config';
import fs from 'fs/promises';
import path from 'path';

import { ACCEPTED_TYPES, FONT_TYPES, resolveAssetPaths } from './utils';

const pkg = require('expo-asset/package.json');

export function withAssetsHarmony(config: ExpoConfig, assets: string[]): ExpoConfig {
  return withHarmonyResources(config, async (mod) => {
    if (!Array.isArray(assets) || assets.some(asset => typeof asset !== 'string' || !asset)) {
      throw new Error('Harmony expo-asset assets must be an array of file or directory paths');
    }
    const root = mod.modRequest.projectRoot;
    for (const source of (await resolveAssetPaths(assets, root)).sort()) {
      const extension = path.extname(source);
      if (!ACCEPTED_TYPES.includes(extension) || FONT_TYPES.includes(extension)) {
        throw new Error(`Unsupported Harmony embedded asset type: ${source}; use expo-font for fonts`);
      }
      const bytes = await fs.readFile(source);
      mod.modResults.push({ owner: 'expo-asset', packageName: pkg.name, packageVersion: pkg.version,
        source: path.relative(root, source).split(path.sep).join('/'), target: path.basename(source),
        sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    return mod;
  });
}
