import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SDK54_EXPO_COMMIT } from './catalog.mjs';
import { readSourceTree, readSourceBlobs, prefetchSourceBlobs } from './source-inventory.mjs';
import { indexRuntimeApi, serializeRuntimeApi, validateRuntimeApi } from './runtime-api-model.mjs';

export const runtimePackages = ['expo-asset', 'expo-constants', 'expo-font', 'expo-linking', 'expo-splash-screen', 'expo-status-bar', 'expo-system-ui', 'expo-web-browser'];

export function selectRuntimeSources(entries, packageNames = runtimePackages) {
  const selected = entries.filter(entry => packageNames.some(name => entry.path === `packages/${name}/package.json` || entry.path.startsWith(`packages/${name}/src/`))
    && !/\/(?:__tests__|__mocks__|fixtures)\//.test(entry.path));
  for (const entry of selected) if (entry.type !== 'blob' || entry.mode === '120000') throw new Error(`Unsupported runtime source/symlink: ${entry.path}`);
  return selected.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

export function buildRuntimeApi({ sourceDir, prefetch = false }) {
  const { tree, entries } = readSourceTree(sourceDir, SDK54_EXPO_COMMIT);
  const selected = selectRuntimeSources(entries);
  if (prefetch) prefetchSourceBlobs(sourceDir, selected);
  const blobs = readSourceBlobs(sourceDir, selected);
  const result = indexRuntimeApi({ files: new Map([...blobs].map(([file, content]) => [file, content.toString('utf8')])), packageNames: runtimePackages });
  result.source = { repository: 'https://github.com/expo/expo.git', revision: SDK54_EXPO_COMMIT, tree };
  for (const input of result.inputs) {
    const entry = selected.find(entry => entry.path === input.path);
    input.blob = entry.oid;
    if (input.sha256 !== createHash('sha256').update(blobs.get(input.path)).digest('hex')) throw new Error(`Non-UTF8 runtime source: ${input.path}`);
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    const sourceIndex = args.indexOf('--source');
    if (sourceIndex < 0 || !args[sourceIndex + 1]) throw new Error('Required --source <fixed-git-source>');
    const sourceDir = args.splice(sourceIndex, 2)[1];
    const prefetch = args.includes('--prefetch');
    if (prefetch) args.splice(args.indexOf('--prefetch'), 1);
    if (args.length !== 2 || !['--output', '--check'].includes(args[0])) throw new Error('Usage: --source <dir> [--prefetch] --output|--check <json>');
    const expected = buildRuntimeApi({ sourceDir, prefetch });
    if (args[0] === '--check') {
      const result = validateRuntimeApi(JSON.parse(fs.readFileSync(args[1], 'utf8')), expected);
      console.log(JSON.stringify(result, null, 2));
      if (!result.valid) process.exitCode = 1;
    } else {
      fs.writeFileSync(args[1], serializeRuntimeApi(expected));
      console.log(JSON.stringify(Object.fromEntries(['inputs', 'packages', 'entries', 'modules', 'apis', 'declarations', 'members'].map(key => [key, expected[key].length]))));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
