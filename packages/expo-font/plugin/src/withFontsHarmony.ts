import { createHash } from 'crypto';
import { type ExpoConfig } from 'expo/config';
import { withHarmonyResources, type HarmonyResourceContribution } from 'expo/harmony-config';
import fs from 'fs/promises';
import path from 'path';

import { resolveFontPaths } from './utils';

const pkg = require('expo-font/package.json');
const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

export function withFontsHarmony(config: ExpoConfig, fonts: string[]): ExpoConfig {
  return withHarmonyResources(config, async (mod) => {
    if (!Array.isArray(fonts) || fonts.some(font => typeof font !== 'string' || !font)) {
      throw new Error('Harmony expo-font fonts must be an array of file or directory paths');
    }
    const root = mod.modRequest.projectRoot;
    for (const font of fonts) {
      const source = path.resolve(root, font);
      if (!(await fs.stat(source)).isDirectory() && !/\.(ttf|otf)$/.test(source)) {
        throw new Error(`Harmony embedded fonts support TTF/OTF: ${font}`);
      }
    }
    const resources: HarmonyResourceContribution[] = [];
    const entries: { family: string; resource: string; sha256: string }[] = [];
    for (const source of (await resolveFontPaths(fonts, root)).sort()) {
      if (!/\.(ttf|otf)$/.test(source)) throw new Error(`Harmony embedded fonts support TTF/OTF: ${source}`);
      const bytes = await fs.readFile(source);
      const magic = bytes.subarray(0, 4).toString('hex');
      if (!['00010000', '4f54544f', '74727565'].includes(magic)) throw new Error(`Invalid Harmony TTF/OTF font: ${source}`);
      const family = path.parse(source).name;
      if (entries.some(entry => entry.family === family)) throw new Error(`Duplicate Harmony embedded font family: ${family}`);
      const target = `fonts/${path.basename(source)}`;
      const hash = sha256(bytes);
      resources.push({ owner: 'expo-font', packageName: pkg.name, packageVersion: pkg.version,
        source: path.relative(root, source).split(path.sep).join('/'), target, sha256: hash });
      entries.push({ family, resource: `expo-font/${target}`, sha256: hash });
    }
    const contents = JSON.stringify(entries) + '\n';
    resources.push({ owner: 'expo-font', packageName: pkg.name, packageVersion: pkg.version,
      target: 'fonts.json', contents, sha256: sha256(contents) });
    mod.modResults.push(...resources);
    return mod;
  });
}
