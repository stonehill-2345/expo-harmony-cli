import * as path from 'path';
import { getBundledTemplateManifestPath, loadTemplateManifest } from './template-manifest';
import { validateHarmonyTemplate } from './template-validator';

export type HarmonyTemplateSource = 'bundled' | 'cdn' | 'auto';

export interface HarmonyTemplateSourceOptions {
  source?: HarmonyTemplateSource;
}

export interface ResolvedHarmonyTemplateSource {
  source: 'bundled';
  templateDir: string;
  manifestPath: string;
}

export function getBundledTemplateDir(): string {
  return path.join(__dirname, '..', '..', 'templates', 'harmony');
}

export function resolveHarmonyTemplateSource(
  opts: HarmonyTemplateSourceOptions = {},
): ResolvedHarmonyTemplateSource {
  const source = opts.source ?? 'bundled';
  if (source !== 'bundled') {
    throw new Error('CDN Harmony template source is not enabled in P0. Use the bundled template.');
  }

  const templateDir = getBundledTemplateDir();
  const manifestPath = getBundledTemplateManifestPath();
  const manifest = loadTemplateManifest(manifestPath);
  validateHarmonyTemplate(templateDir, manifest);

  return { source: 'bundled', templateDir, manifestPath };
}
