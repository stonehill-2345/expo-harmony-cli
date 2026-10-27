import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

import { SDK54_EXPO_COMMIT } from './catalog.mjs';
import { buildSourceInventory, prefetchSourceBlobs, readSourceBlobs, readSourceTree, serializeInventory } from './source-inventory.mjs';
import { compareOptionSurfaces, extractSchemaSurface, extractTypeSurface, syntaxFacts } from './plugin-surface-types.mjs';

export { compareOptionSurfaces, extractSchemaSurface, extractTypeSurface } from './plugin-surface-types.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');
export const FIRST_PLUGIN_DESCRIPTORS = [
  ['PLG-ASSET', 'expo-asset', 'withAssets'], ['PLG-FONT', 'expo-font', 'withFonts'],
  ['PLG-SPLASH', 'expo-splash-screen', 'withSplashScreen'], ['PLG-SYSTEM-UI', 'expo-system-ui', 'withSystemUI'],
  ['PLG-ROUTER', 'expo-router', 'index', 'withRouter'], ['PLG-WEB-BROWSER', 'expo-web-browser', 'withWebBrowser'],
].map(([id, packageName, file, symbol = file]) => ({ id, packageName, symbol,
  sourcePath: `packages/${packageName}/plugin/src/${file}.ts`,
  ...(id === 'PLG-ROUTER' ? { schemaPath: 'packages/expo-router/plugin/options.json' } : {}),
}));

function sourceFiles(entries) {
  const roots = ['packages/@expo/prebuild-config/src/', 'packages/@expo/config-types/src/',
    ...FIRST_PLUGIN_DESCRIPTORS.map((entry) => `packages/${entry.packageName}/plugin/`)];
  const manifests = ['packages/@expo/prebuild-config/package.json', 'packages/@expo/config-types/package.json'];
  return entries.filter((entry) => entry.type === 'blob' && (manifests.includes(entry.path) || roots.some((root) => entry.path.startsWith(root))) &&
    !entry.path.includes('/__tests__/') && !entry.path.includes('/build/') && /\.(tsx?|json|js)$/.test(entry.path));
}

export function buildPluginSurface({ sourceDir, revision = SDK54_EXPO_COMMIT, prefetch = false }) {
  const inventory = buildSourceInventory({ sourceDir, revision, prefetch });
  const { tree, entries } = readSourceTree(sourceDir, revision);
  const selected = sourceFiles(entries);
  for (const entry of selected) if (entry.mode === '120000') throw new Error(`Unsupported source symlink: ${entry.path}`);
  if (prefetch) prefetchSourceBlobs(sourceDir, selected);
  const blobs = readSourceBlobs(sourceDir, selected);
  const files = new Map([...blobs].map(([file, content]) => [file, content.toString('utf8')]));
  const plugins = FIRST_PLUGIN_DESCRIPTORS.map((descriptor) => {
    const typescript = extractTypeSurface(files, descriptor);
    const consumers = [...files.keys()].filter((file) => file.startsWith(`packages/${descriptor.packageName}/plugin/src/`) && file.endsWith('.ts'));
    if (descriptor.id === 'PLG-SPLASH') consumers.push(...[...files.keys()].filter((file) =>
      /\/expo-splash-screen\/get(?:Android|Ios)SplashConfig\.ts$/.test(file)));
    typescript.facts = consumers.flatMap((file) => syntaxFacts(files.get(file), file));
    const schema = descriptor.schemaPath ? extractSchemaSurface(JSON.parse(files.get(descriptor.schemaPath)),
      { ...descriptor, sourcePath: descriptor.schemaPath }) : null;
    const pkg = inventory.packages.find((entry) => entry.name === descriptor.packageName);
    if (!pkg) throw new Error(`Missing source package ${descriptor.packageName}`);
    return { ...descriptor, packageId: pkg.id, version: pkg.version, typescript, schema,
      differences: schema ? compareOptionSurfaces(typescript, schema) : [],
      implementation: '未评估', runtimeAcceptance: 'NOT_RUN' };
  });
  return {
    schemaVersion: 1, sourceRevision: revision, sourceTree: tree, compilerVersion: ts.version,
    packageInventorySha256: sha(serializeInventory(inventory)),
    inputs: selected.map((entry) => ({ path: entry.path, blob: entry.oid, sha256: sha(blobs.get(entry.path)) })),
    plugins, stageClosable: false, fullSdkPublicSurfaceComplete: false,
    limitation: '仅六个首批插件的声明/源码事实；不代表全部公开面、Harmony 插件执行或设备验收完成',
  };
}

export function validateSurfaceRecords(actual, expected) {
  const failures = [];
  if (!actual || typeof actual !== 'object' || !Array.isArray(actual.plugins)) return { valid: false, failures: ['Invalid plugin surface inventory'] };
  const checkIds = (records, label) => {
    const seen = new Set();
    for (const entry of records ?? []) {
      if (!entry || typeof entry.id !== 'string') failures.push(`${label}: missing ID`);
      else if (seen.has(entry.id)) failures.push(`${label}: duplicate ${entry.id}`);
      else seen.add(entry.id);
    }
  };
  checkIds(actual.plugins, 'plugins');
  for (const plugin of actual.plugins) for (const name of ['typescript', 'schema']) checkIds(plugin?.[name]?.options, `${plugin?.id}/${name}`);
  for (const plugin of expected.plugins) {
    const found = actual.plugins.find((entry) => entry?.id === plugin.id);
    if (!found) { failures.push(`Missing plugin ${plugin.id}`); continue; }
    for (const name of ['typescript', 'schema']) {
      for (const option of plugin[name]?.options ?? []) {
        const match = found[name]?.options?.find((entry) => entry?.id === option.id);
        if (!match) failures.push(`Missing option ${option.id} from ${serializeInventory(option.occurrences[0].source).trim()}`);
        else if (serializeInventory(match) !== serializeInventory(option)) failures.push(`Changed option ${option.id}`);
      }
    }
  }
  if (serializeInventory(actual) !== serializeInventory(expected)) failures.push('Source/type/schema/facts or completion metadata differs from fixed source');
  return { valid: failures.length === 0, failures };
}

function main(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (argument === '--prefetch') options.prefetch = true;
    else if (['--source', '--output', '--check'].includes(argument) && argv[i + 1] && !argv[i + 1].startsWith('--') && !options[argument.slice(2)]) options[argument.slice(2)] = argv[++i];
    else throw new Error(`Unknown or incomplete argument: ${argument}`);
  }
  if (!options.source || Boolean(options.output) === Boolean(options.check)) throw new Error('Usage: plugin-surface.mjs --source <git-dir> (--output <json> | --check <json>) [--prefetch]');
  const expected = buildPluginSurface({ sourceDir: path.resolve(options.source), prefetch: options.prefetch });
  if (options.check) {
    const result = validateSurfaceRecords(JSON.parse(fs.readFileSync(options.check, 'utf8')), expected);
    console.log(serializeInventory(result).trimEnd());
    if (!result.valid) process.exitCode = 1;
  } else {
    const content = serializeInventory(expected);
    fs.mkdirSync(path.dirname(path.resolve(options.output)), { recursive: true });
    fs.writeFileSync(options.output, content);
    console.log(serializeInventory({ sourceRevision: expected.sourceRevision, compilerVersion: ts.version,
      plugins: expected.plugins.length, inputs: expected.inputs.length, sha256: sha(content),
      options: expected.plugins.reduce((count, plugin) => count + plugin.typescript.options.length + (plugin.schema?.options.length ?? 0), 0),
      stageClosable: false }).trimEnd());
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
