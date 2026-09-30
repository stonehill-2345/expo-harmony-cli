import * as path from 'path';
import { getBundledTemplateManifestPath, loadTemplateManifest } from './template-manifest';
import type { SdkVersion } from '../version-matrix';
import { validateHarmonyTemplate } from './template-validator';

export type HarmonyTemplateSource = 'bundled' | 'cdn' | 'auto';

export interface HarmonyTemplateSourceOptions {
  source?: HarmonyTemplateSource;
  sdk?: SdkVersion;
}

export interface ResolvedHarmonyTemplateSource {
  source: 'bundled';
  templateDir: string;
  manifestPath: string;
}

export function getBundledTemplateDir(sdk?: SdkVersion): string {
  const dirName = sdk ? `harmony-${sdk}` : 'harmony';
  return path.join(__dirname, '..', '..', 'templates', dirName);
}

export function resolveHarmonyTemplateSource(
  opts: HarmonyTemplateSourceOptions = {},
): ResolvedHarmonyTemplateSource {
  const source = opts.source ?? 'bundled';
  if (source !== 'bundled') {
    throw new Error('CDN Harmony template source is not enabled in P0. Use the bundled template.');
  }

  const templateDir = getBundledTemplateDir(opts.sdk);
  const manifestPath = getBundledTemplateManifestPath(opts.sdk);
  const manifest = loadTemplateManifest(manifestPath);
  validateHarmonyTemplate(templateDir, manifest);

  return { source: 'bundled', templateDir, manifestPath };
}
