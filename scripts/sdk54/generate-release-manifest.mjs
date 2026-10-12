import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReleaseManifest, RELEASE_ID } from './release-catalog.mjs';
// Runtime releases do not automatically promote the product CLI's pinned combination.
const outputIndex = process.argv.indexOf('--output');
const target = outputIndex >= 0
  ? path.resolve(process.argv[outputIndex + 1])
  : fileURLToPath(new URL(`../../docs/releases/${RELEASE_ID}.json`, import.meta.url));
const contents = `${JSON.stringify(createReleaseManifest(), null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== contents) throw new Error('Release manifest is stale; run sdk54:release:manifest');
} else {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}
