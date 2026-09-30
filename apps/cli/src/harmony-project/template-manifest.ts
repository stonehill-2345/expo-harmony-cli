import * as fs from 'fs';
import * as path from 'path';
import type { SdkVersion } from '../version-matrix';

export interface HarmonyTemplateManifest {
  version: string;
  expoSdk: string;
  reactNative: string;
  rnoh: string;
  requiredFiles: string[];
}

export function getBundledTemplateManifestPath(sdk?: SdkVersion): string {
  const name = sdk ? `harmony-${sdk}.manifest.json` : 'harmony-template.manifest.json';
  return path.join(__dirname, '..', '..', 'templates', name);
}

export function loadTemplateManifest(manifestPath: string): HarmonyTemplateManifest {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing Harmony template manifest: ${manifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Partial<HarmonyTemplateManifest>;
  if (typeof manifest.version !== 'string' || !manifest.version) {
    throw new Error('Invalid Harmony template manifest: missing version');
  }
  if (typeof manifest.expoSdk !== 'string' || !manifest.expoSdk) {
    throw new Error('Invalid Harmony template manifest: missing expoSdk');
  }
  if (typeof manifest.reactNative !== 'string' || !manifest.reactNative) {
    throw new Error('Invalid Harmony template manifest: missing reactNative');
  }
  if (typeof manifest.rnoh !== 'string' || !manifest.rnoh) {
    throw new Error('Invalid Harmony template manifest: missing rnoh');
  }
  if (!Array.isArray(manifest.requiredFiles) || manifest.requiredFiles.length === 0) {
    throw new Error('Invalid Harmony template manifest: missing requiredFiles');
  }
  for (const requiredFile of manifest.requiredFiles) {
    if (typeof requiredFile !== 'string' || !requiredFile || path.isAbsolute(requiredFile)) {
      throw new Error(`Invalid Harmony template manifest required file: ${requiredFile}`);
    }
  }

  return manifest as HarmonyTemplateManifest;
}
