import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Sdk54Template } from './create-options';

export interface Sdk54DocsOptions {
  appName: string;
  slug: string;
  template: Sdk54Template;
  patchSet: string;
  expo: string;
  rnoh: string;
}

export function injectSdk54Docs(projectRoot: string, options: Sdk54DocsOptions): void {
  const sourceRoot = path.resolve(__dirname, '../../content/docs/sdk-54');
  const replacements: Record<string, string> = {
    '{{appName}}': options.appName,
    '{{slug}}': options.slug,
    '{{template}}': options.template,
    '{{patchSet}}': options.patchSet,
    '{{expo}}': options.expo,
    '{{rnoh}}': options.rnoh,
  };
  for (const [sourceName, targetName] of [
    ['README.md', 'README.md'],
    ['AGENTS.md', 'AGENTS.md'],
    ['HARMONY.md', 'docs/HARMONY.md'],
    ['PATCHES.md', 'docs/PATCHES.md'],
    ['TROUBLESHOOTING.md', 'docs/TROUBLESHOOTING.md'],
  ] as const) {
    let contents = fs.readFileSync(path.join(sourceRoot, sourceName), 'utf8');
    for (const [placeholder, value] of Object.entries(replacements)) contents = contents.split(placeholder).join(value);
    const target = path.join(projectRoot, targetName);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
}
