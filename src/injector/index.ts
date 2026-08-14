import { injectHarmonyBlock } from './app-json';
import { writeMetroConfig } from './metro-config';
import { mergePackageJson } from './package-json';
import { writePostinstall } from './postinstall';
import { writeStartHarmony } from './start-harmony';
import { writeBundleHarmonyRelease } from './bundle-harmony-release';
import { writeBundleHarmonyDev } from './bundle-harmony-dev';
import { writeHarmonyEntry } from './harmony-entry';
import { writeHarmonyIconSymbolFallback } from './icon-symbol';
import { ensureNpmrcHoisted } from './npmrc';

export interface InjectOptions {
  slug: string;
  scheme: string;
}

/** 注入鸿蒙基线（create 流程步骤 2）。*/
export function injectHarmonyBaseline(targetDir: string, opts: InjectOptions): void {
  injectHarmonyBlock(targetDir, opts.slug);
  writeMetroConfig(targetDir);
  mergePackageJson(targetDir);
  writePostinstall(targetDir);
  writeStartHarmony(targetDir);
  writeBundleHarmonyDev(targetDir);
  writeBundleHarmonyRelease(targetDir);
  writeHarmonyEntry(targetDir, opts.scheme);
  writeHarmonyIconSymbolFallback(targetDir);
  ensureNpmrcHoisted(targetDir);
}
