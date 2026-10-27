import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import yarnLock from '@yarnpkg/lockfile';
import { SDK54_EXPO_COMMIT } from './catalog.mjs';
import { buildSourceInventory, readSourceTree, readSourceBlobs, serializeInventory } from './source-inventory.mjs';

const require = createRequire(new URL('../../apps/cli/package.json', import.meta.url));
const semver = require('semver');
const semverVersion = require('semver/package.json').version;
const parserRequire = createRequire(import.meta.url);
const sha = data => createHash('sha256').update(data).digest('hex');
export const serializeExternalSources = value => serializeInventory(value).replaceAll('/', '\\/');
const pointer = value => value.replaceAll('~', '~0').replaceAll('/', '~1');

function splitSelectors(header) {
  const parts = []; let quoted = false, escaped = false, start = 0;
  for (let i = 0; i < header.length; i++) {
    const ch = header[i];
    if (escaped) { escaped = false; continue; }
    if (quoted && ch === '\\') { escaped = true; continue; }
    if (ch === '"') quoted = !quoted;
    if (ch === ',' && !quoted) { parts.push(header.slice(start, i).trim()); start = i + 1; }
  }
  if (quoted) throw new Error('Invalid lock selector quote');
  parts.push(header.slice(start).trim());
  return parts.map(part => part.startsWith('"') ? JSON.parse(part) : part);
}

export function parseFixedYarnLock(text) {
  if (!/^# yarn lockfile v1\s*$/m.test(text)) throw new Error('Expected fixed Yarn v1 lock format');
  const parsed = yarnLock.parse(text);
  if (parsed.type !== 'success') throw new Error(`Unresolved lock parse/conflict: ${parsed.type}`);
  const seen = new Map(), lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || /^\s|^#/.test(line) || !line.endsWith(':')) continue;
    for (const selector of splitSelectors(line.slice(0, -1))) {
      if (seen.has(selector)) throw new Error(`Duplicate lock selector ${selector} at yarn.lock:${i + 1}`);
      seen.set(selector, i + 1);
    }
  }
  if (seen.size !== Object.keys(parsed.object).length) throw new Error('Lock headers do not match parsed selector set');
  return [...seen].sort(([a], [b]) => a.localeCompare(b)).map(([selector, line]) => {
    const separator = selector.indexOf('@', selector.startsWith('@') ? 1 : 0);
    if (separator <= 0 || !parsed.object[selector]) throw new Error(`Invalid lock selector ${selector}`);
    const value = parsed.object[selector];
    return { id: `LOCK:${selector}`, selector, name: selector.slice(0, separator), spec: selector.slice(separator + 1), version: value.version ?? null,
      resolved: value.resolved ?? null, integrity: value.integrity ?? null, dependencies: value.dependencies ?? {}, optionalDependencies: value.optionalDependencies ?? {},
      source: { path: 'yarn.lock', line } };
  });
}

const groups = [
  ['M7.1', '构建/React/Metro/平台底座；上游与Harmony目标版本分别验证', ['@expo/metro', 'react', 'react-dom', 'react-native', '@react-native-oh/react-native-harmony', 'react-native-web', 'react-server-dom-webpack']],
  ['M7.2', '存储或随机数能力；需来源/API与实际消费审阅', ['@react-native-async-storage/async-storage', 'react-native-get-random-values']],
  ['M7.3', '网络、认证或分析能力；普通认证不按Go/EAS/Dev Client暂缓', ['@react-native-community/netinfo', 'expo-analytics-amplitude', 'expo-app-auth', 'expo-google-app-auth']],
  ['M7.4', '视图/媒体/导航/交互依赖；包名在bundle不等于Harmony支持', ['@expo/vector-icons', '@react-native-community/datetimepicker', '@react-native-community/slider', '@react-native-community/viewpager', '@react-native-masked-view/masked-view', '@react-native-picker/picker', '@react-native-segmented-control/segmented-control', '@shopify/flash-list', '@shopify/react-native-skia', '@stripe/stripe-react-native', 'lottie-react-native', 'react-native-bootsplash', 'react-native-gesture-handler', 'react-native-keyboard-controller', 'react-native-maps', 'react-native-pager-view', 'react-native-reanimated', 'react-native-safe-area-context', 'react-native-screens', 'react-native-svg', 'react-native-view-shot', 'react-native-webview', 'react-native-worklets', 'unimodules-image-loader-interface']],
  ['M7.5', '开发/观测或加载相关来源待核；共享用途不能整包暂缓', ['@sentry/react-native', 'expo-app-loader-provider', 'expo-mcp', 'sentry-expo']],
  ['M7.1', '旧create-expo-app wrapper与固定create-expo来源分开；入口移交属于M0A', ['create-expo-app']],
];
export const externalSourceScopes = Object.freeze(Object.fromEntries(groups.flatMap(([batch, reason, names]) => names.map(name => [name, { batch, reason, state: '本轮必评', finalApiScope: 'NOT_RUN' }]))));

export function indexExternalSources({ lockText, bundle, seeds, manifests, scopes = externalSourceScopes }) {
  const allLocks = parseFixedYarnLock(lockText), selectedNames = new Set(), selectedIds = new Set(), rows = [];
  for (const seed of seeds) {
    if (!seed.id || selectedIds.has(seed.id) || selectedNames.has(seed.name)) throw new Error(`Duplicate seed/missing identity ${seed.id}`); selectedNames.add(seed.name); selectedIds.add(seed.id);
    if (!scopes[seed.name]?.batch || !scopes[seed.name]?.reason) throw new Error(`Missing scope review ${seed.name}`);
    const declarations = manifests.flatMap(({ path: file, value }) => ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].flatMap(section => value[section]?.[seed.name] === undefined ? [] : [{ spec: value[section][seed.name], consumer: value.name ?? null, section, source: { path: file, pointer: `/${section}/${pointer(seed.name)}` } }]));
    const fixedBundleSpec = bundle[seed.name] ?? null;
    const requested = fixedBundleSpec === null ? [...new Set(declarations.map(d => d.spec))] : [fixedBundleSpec];
    const locks = allLocks.filter(row => row.name === seed.name);
    const exact = requested.length === 1 ? locks.find(row => row.selector === `${seed.name}@${requested[0]}`) : null;
    const compatible = locks.filter(row => requested.some(spec => semver.validRange(spec) && semver.valid(row.version) && semver.satisfies(row.version, spec)));
    const identityValid = row => Boolean(row?.version && row?.resolved && row?.integrity);
    const exactMismatch = exact && requested.some(spec => semver.validRange(spec)) && !compatible.some(row => row.id === exact.id);
    const identityStatus = exact ? exactMismatch ? 'EXACT_LOCK_RANGE_MISMATCH' : identityValid(exact) ? 'EXACT_LOCK' : 'INCOMPLETE_LOCK_IDENTITY' : !requested.length ? 'NO_UPSTREAM_IDENTITY' : !locks.length ? 'NO_LOCK' : compatible.length ? 'COMPATIBLE_LOCK_CANDIDATES' : 'LOCK_RANGE_MISMATCH';
    rows.push({ id: seed.id, name: seed.name, seedSpec: seed.bundledSpec ?? null, fixedBundleSpec,
      seedDiffersFromUpstream: (seed.bundledSpec ?? null) !== fixedBundleSpec, requestedSpecs: requested, declarations,
      exactLockId: exact?.id ?? null, compatibleLockIds: compatible.map(row => row.id), observedLockIds: locks.map(row => row.id), identityStatus,
      scope: { ...scopes[seed.name] }, sourceConclusion: fixedBundleSpec !== null ? '固定上游bundle仍列出；锁缺失不能证明废弃/重命名或不适用' : declarations.length ? '固定源码声明的外部依赖；不属于workspace自身包' : '固定bundle及选中manifests无此身份；旧入口/目标专属身份独立记录，不猜废弃',
      artifactVerification: 'NOT_RUN', publicApiAcceptance: 'NOT_RUN' });
  }
  return { schemaVersion: 1, parser: { name: '@yarnpkg/lockfile', version: parserRequire('@yarnpkg/lockfile/package.json').version, semverActualVersion: semverVersion },
    parsedLockSelectors: allLocks.length, seeds: rows.sort((a, b) => a.id.localeCompare(b.id)), locks: allLocks.filter(row => selectedNames.has(row.name)),
    externalSourcesComplete: false, fullPublicSurfaceComplete: false, stageClosable: false };
}

export function buildExternalSources({ sourceDir }) {
  const inventory = buildSourceInventory({ sourceDir }), { tree, entries } = readSourceTree(sourceDir, SDK54_EXPO_COMMIT);
  const paths = ['package.json', 'yarn.lock', 'packages/expo/bundledNativeModules.json', ...inventory.packages.map(p => p.sourcePath), ...inventory.templates.map(p => p.sourcePath)];
  const selected = entries.filter(entry => paths.includes(entry.path));
  if (selected.some(entry => entry.type !== 'blob' || entry.mode === '120000')) throw new Error('Invalid source input/symlink');
  const files = readSourceBlobs(sourceDir, selected);
  if (files.size !== new Set(paths).size || tree !== inventory.source.tree) throw new Error('Incomplete fixed source inputs');
  const oldPath = 'docs/releases/sdk54-source-seed-diff.json', oldBytes = fs.readFileSync(oldPath), old = JSON.parse(oldBytes);
  if (sha(oldBytes) !== '166016aa5d489ca2a4d6fafad4090756a2ddf9dde6082a08c4cde80569ed5f3f' || old.sourceRevision !== SDK54_EXPO_COMMIT) throw new Error('Frozen seed input identity mismatch');
  const result = indexExternalSources({ lockText: files.get('yarn.lock').toString(), bundle: JSON.parse(files.get('packages/expo/bundledNativeModules.json')), seeds: old.seeds.filter(s => s.result === 'absent-from-workspace'), manifests: paths.filter(p => p.endsWith('/package.json') || p === 'package.json').map(file => ({ path: file, value: JSON.parse(files.get(file)) })) });
  result.source = { revision: SDK54_EXPO_COMMIT, tree };
  result.previous = { path: oldPath, sha256: sha(oldBytes) };
  result.inputs = selected.map(entry => ({ path: entry.path, blob: entry.oid, sha256: sha(files.get(entry.path)) }));
  result.summary = Object.fromEntries([...new Set(result.seeds.map(row => row.identityStatus))].sort().map(status => [status, result.seeds.filter(row => row.identityStatus === status).length]));
  return result;
}

export function validateExternalSources(actual, expected) {
  const failures = [];
  for (const field of ['seeds', 'locks', 'inputs']) {
    const rows = new Map();
    for (const row of actual?.[field] ?? []) { const id = row.id ?? row.path; if (rows.has(id)) failures.push(`Duplicate ${field} ${id}`); rows.set(id, row); }
    for (const row of expected[field] ?? []) { const id = row.id ?? row.path, value = rows.get(id); if (!value || serializeInventory(value) !== serializeInventory(row)) failures.push(`${!value ? 'Missing' : 'Changed'} ${field} ${id} at ${row.source?.path ?? row.path ?? row.declarations?.[0]?.source.path ?? 'packages/expo/bundledNativeModules.json'}:${row.source?.line ?? ''}`); rows.delete(id); }
    for (const id of rows.keys()) failures.push(`Unexpected ${field} ${id}`);
  }
  if (serializeInventory(actual) !== serializeInventory(expected)) failures.push('External source review differs from fixed source reconstruction');
  return { valid: !failures.length, failures };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2), options = {};
    for (let i = 0; i < args.length; i += 2) { if (!['--source', '--output', '--check'].includes(args[i]) || !args[i + 1] || options[args[i]]) throw new Error('Invalid args'); options[args[i]] = args[i + 1]; }
    if (!options['--source'] || Boolean(options['--output']) === Boolean(options['--check'])) throw new Error('Usage: --source <git> --output|--check <json>');
    const expected = buildExternalSources({ sourceDir: options['--source'] });
    if (options['--check']) { const result = validateExternalSources(JSON.parse(fs.readFileSync(options['--check'])), expected); console.log(JSON.stringify(result)); if (!result.valid) process.exitCode = 1; }
    else { fs.writeFileSync(options['--output'], serializeExternalSources(expected)); console.log(JSON.stringify({ seeds: expected.seeds.length, locks: expected.locks.length, inputs: expected.inputs.length, summary: expected.summary, stageClosable: false })); }
  } catch (error) { console.error(error.stack); process.exitCode = 1; }
}
