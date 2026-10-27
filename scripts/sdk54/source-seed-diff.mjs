import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { SDK54_EXPO_COMMIT, SDK54_PACKAGES } from './catalog.mjs';
import { serializeInventory } from './source-inventory.mjs';

const CORE_SEEDS = ['create-expo-app', '@expo/config', '@expo/config-types',
  '@expo/config-plugins', '@expo/prebuild-config', '@expo/metro'];
const sha = (content) => createHash('sha256').update(content).digest('hex');

export function compareSourceSeeds(inventory, bundle, inputHashes) {
  if (inventory.source?.revision !== SDK54_EXPO_COMMIT) throw new Error('Seed comparison requires the fixed Expo source revision');
  const sources = new Map();
  for (const entry of inventory.packages) {
    if (sources.has(entry.name)) throw new Error(`Duplicate source package: ${entry.name}`);
    sources.set(entry.name, entry);
  }
  const names = [...new Set([...Object.keys(bundle), ...SDK54_PACKAGES.map(({ name }) => name), ...CORE_SEEDS])].sort();
  const seeds = names.map((name) => {
    const adapted = SDK54_PACKAGES.find((entry) => entry.name === name);
    const source = sources.get(name);
    return {
      name, id: `SEED:${name}`, bundledSpec: bundle[name] ?? null,
      adaptedVersion: adapted?.version ?? null, coreSeed: CORE_SEEDS.includes(name),
      sourceId: source?.id ?? null, sourcePath: source?.sourcePath ?? null,
      sourceVersion: source?.version ?? null,
      result: source ? 'present-in-workspace' : 'absent-from-workspace',
      review: '未完成范围及来源评估',
    };
  });
  const seedNames = new Set(names);
  const sourceOnly = inventory.packages.filter((entry) => !seedNames.has(entry.name))
    .map((entry) => ({ name: entry.name, sourceId: entry.id, sourcePath: entry.sourcePath,
      sourceVersion: entry.version, result: 'new-source-record', review: '新增；用途及范围待评估' }));
  return {
    schemaVersion: 1, sourceRevision: SDK54_EXPO_COMMIT, inputHashes,
    summary: { seeds: seeds.length, workspacePackages: sources.size,
      present: seeds.filter((entry) => entry.sourceId).length,
      absent: seeds.filter((entry) => !entry.sourceId).length, sourceOnly: sourceOnly.length },
    seeds, sourceOnly, stageClosable: false,
    limitation: '不在 workspace 不等于已废弃或不适用；仍需追溯外部来源、历史包与替代入口。未枚举全部 API 和插件选项。',
  };
}

function main(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--inventory', '--bundle', '--output'].includes(argv[i]) || !argv[i + 1] || args[argv[i]]) {
      throw new Error('Usage: source-seed-diff.mjs --inventory <json> --bundle <json> --output <json>');
    }
    args[argv[i]] = argv[i + 1];
  }
  if (Object.keys(args).length !== 3) throw new Error('Supply --inventory, --bundle and --output');
  const inventoryContent = fs.readFileSync(args['--inventory']);
  const bundleContent = fs.readFileSync(args['--bundle']);
  const result = compareSourceSeeds(JSON.parse(inventoryContent), JSON.parse(bundleContent), {
    inventorySha256: sha(inventoryContent), bundleSha256: sha(bundleContent),
  });
  fs.mkdirSync(path.dirname(path.resolve(args['--output'])), { recursive: true });
  fs.writeFileSync(args['--output'], serializeInventory(result));
  console.log(serializeInventory(result.summary).trimEnd());
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
