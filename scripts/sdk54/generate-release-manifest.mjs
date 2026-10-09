import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReleaseManifest } from './release-catalog.mjs';
const target = fileURLToPath(new URL('../../apps/cli/content/releases/sdk-54/manifest.json', import.meta.url));
const contents = `${JSON.stringify(createReleaseManifest(), null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== contents) throw new Error('Release manifest is stale; run sdk54:release:manifest');
} else {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}
