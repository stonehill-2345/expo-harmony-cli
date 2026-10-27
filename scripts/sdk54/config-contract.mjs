import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SDK54_EXPO_COMMIT } from './catalog.mjs';
import { readSourceTree, readSourceBlobs, prefetchSourceBlobs } from './source-inventory.mjs';
import { parseConfigTypes, parseConfigSchema, compareConfigFields, serializeConfigContract, validateConfigContract } from './config-contract-model.mjs';

export const configSources = [
  'packages/@expo/config-types/src/ExpoConfig.ts',
  'packages/@expo/config-types/package.json',
  'packages/@expo/config-types/scripts/generate.js',
  'docs/public/static/schemas/v54.0.0/app-config-schema.json',
  'docs/public/static/schemas/unversioned/app-config-schema.json',
  'packages/@expo/cli/src/api/getExpoSchema.ts',
  'packages/expo-doctor/src/api/getSchemaAsync.ts',
];

export function selectConfigSources(entries) {
  return configSources.map(file => {
    const entry = entries.find(entry => entry.path === file);
    if (!entry || entry.type !== 'blob' || entry.mode === '120000') throw new Error(`Missing/unsupported config source ${file}`);
    return entry;
  });
}

function reviewDifferences(differences, schema) {
  const missingFields = new Set([
    '/p/android/p/intentFilters/items/p/data/items/p/pathAdvancedPattern',
    '/p/android/p/intentFilters/items/p/data/items/p/pathSuffix',
    '/p/android/p/intentFilters/items/p/data/p/pathAdvancedPattern',
    '/p/android/p/intentFilters/items/p/data/p/pathSuffix',
    '/p/androidNavigationBar/p/enforceContrast',
    '/p/experiments/p/autolinkingModuleResolution',
  ]);
  return differences.map(difference => {
    let conclusion, action;
    if (difference.conclusion === 'SOURCE_REQUIRED_UNKNOWN') {
      conclusion = '文档映射没有根required；类型必填性已记录，不能据此判定在线校验行为。';
      action = 'M1建立配置快照前固定实际消费schema，补根required来源。';
    } else if (difference.kind === 'ONLY_LEFT' && difference.path.endsWith('/additional')) {
      const parent = schema.fields.find(field => field.path === difference.path.slice(0, -'/additional'.length));
      const counterparts = parent?.sources.map(id => schema.nodes.find(node => node.id === id));
      if (!counterparts?.length || counterparts.some(node => node.additionalPropertiesId)) throw new Error(`Unreviewed index contract ${difference.id}`);
      conclusion = '类型显式声明开放索引；文档对应对象未显式声明additionalProperties，不表示拒绝该键。';
      action = 'M1保留开放字典输入，结合实际消费schema及插件往返测试复核。';
    } else if (difference.kind === 'ONLY_LEFT' && missingFields.has(difference.path)) {
      conclusion = '固定类型有此命名字段，文档映射未枚举；不是Harmony支持或在线拒绝的证据。';
      action = 'M1核验实际消费schema并为该字段建立配置输入/输出快照；平台行为另行验收。';
    } else if (difference.path === '/p/android/p/versionCode' && difference.kind === 'TYPES') {
      conclusion = 'TypeScript使用number，文档约束为integer；类型声明不能表达整数约束。';
      action = 'M1为versionCode整数、非整数及边界值建立实际校验测试。';
    } else if (difference.path === '/p/android/p/edgeToEdgeEnabled' && difference.kind === 'LITERALS') {
      conclusion = '类型限定true，文档结构为boolean；类型可接受值与文档枚举表达不同。';
      action = 'M1固定实际消费schema并核验true/false的校验与配置快照；不推断默认值。';
    } else throw new Error(`Unreviewed config difference ${difference.id}`);
    return { differenceId: difference.id, status: 'SOURCE_REVIEWED_RUNTIME_NOT_ACCEPTED', conclusion, action, followUp: 'M1/config-snapshot' };
  });
}

export function buildConfigContract({ sourceDir, prefetch = false }) {
  const { tree, entries } = readSourceTree(sourceDir, SDK54_EXPO_COMMIT);
  const selected = selectConfigSources(entries);
  if (prefetch) prefetchSourceBlobs(sourceDir, selected);
  const blobs = readSourceBlobs(sourceDir, selected);
  const text = file => {
    const buffer = blobs.get(file);
    const value = buffer.toString('utf8');
    if (!buffer.equals(Buffer.from(value))) throw new Error(`Non-UTF8 config source ${file}`);
    return value;
  };
  const [typesFile, manifestFile, generatorFile, sdkFile, unversionedFile, cliFile, doctorFile] = configSources;
  const types = parseConfigTypes(text(typesFile), typesFile);
  const sdk54 = parseConfigSchema(JSON.parse(text(sdkFile)), sdkFile);
  const unversioned = parseConfigSchema(JSON.parse(text(unversionedFile)), unversionedFile);
  const typesVsSdk54 = compareConfigFields(types.fields, sdk54.fields, 'types-vs-sdk54');
  const differenceReviews = reviewDifferences(typesVsSdk54, sdk54);
  const consumers = [
    { source: generatorFile, anchors: ['http://exp.host/--/api/v2/project/configuration/schema/', 'data.data.schema'], role: 'TYPE_GENERATOR_ONLINE_SCHEMA' },
    { source: cliFile, anchors: ['project/configuration/schema/', 'json.schema', 'derefSchema'], role: 'CLI_ONLINE_OR_SERVER_SCHEMA' },
    { source: doctorFile, anchors: ['project/configuration/schema/', 'resultJson.data?.schema'], role: 'DOCTOR_ONLINE_SCHEMA' },
  ].map(consumer => ({ ...consumer, onlineContent: 'NOT_REQUESTED', anchors: consumer.anchors.map(anchor => {
    const content = text(consumer.source), offset = content.indexOf(anchor);
    if (offset < 0) throw new Error(`Missing consumer anchor ${consumer.source}: ${anchor}`);
    return { text: anchor, line: content.slice(0, offset).split('\n').length };
  }) }));
  return {
    schemaVersion: 1, source: { repository: 'https://github.com/expo/expo.git', revision: SDK54_EXPO_COMMIT, tree },
    inputs: selected.map(entry => ({ path: entry.path, blob: entry.oid, bytes: blobs.get(entry.path).length, sha256: createHash('sha256').update(blobs.get(entry.path)).digest('hex') })),
    configTypesPackage: JSON.parse(text(manifestFile)), types, schemas: { sdk54, unversioned }, consumers,
    comparisons: {
      typesVsSdk54,
      sdk54VsUnversioned: compareConfigFields(sdk54.fields, unversioned.fields, 'sdk54-vs-unversioned'),
      docsBytesEqual: blobs.get(sdkFile).equals(blobs.get(unversionedFile)),
    },
    differenceReviews,
    limitations: ['DOCS_SCHEMA_IS_NOT_VERIFIED_ONLINE_CONSUMER_SCHEMA', 'ROOT_SCHEMA_REQUIRED_UNKNOWN',
      'META_FALLBACK_IS_NOT_A_RUNTIME_DEFAULT', 'BRANCH_FIELD_UNION_IS_NOT_SEMANTIC_EQUIVALENCE',
      'SCHEMA_CONSTRAINTS_RETAINED_NOT_RUNTIME_VALIDATED', 'HARMONY_CONFIG_IMPLEMENTATION_NOT_EVALUATED'],
    fullConfigCompatibilityComplete: false, stageClosable: false,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2), sourceIndex = args.indexOf('--source');
    if (sourceIndex < 0 || !args[sourceIndex + 1]) throw new Error('Required --source <fixed-git-source>');
    const sourceDir = args.splice(sourceIndex, 2)[1];
    const prefetch = args.includes('--prefetch');
    if (prefetch) args.splice(args.indexOf('--prefetch'), 1);
    if (args.length !== 2 || !['--output', '--check'].includes(args[0])) throw new Error('Usage: --source <dir> [--prefetch] --output|--check <json>');
    const expected = buildConfigContract({ sourceDir, prefetch });
    if (args[0] === '--check') {
      const result = validateConfigContract(JSON.parse(fs.readFileSync(args[1], 'utf8')), expected);
      console.log(JSON.stringify(result, null, 2));
      if (!result.valid) process.exitCode = 1;
    } else {
      fs.writeFileSync(args[1], serializeConfigContract(expected));
      console.log(JSON.stringify({ inputs: expected.inputs.length, interfaces: expected.types.interfaces.length,
        typeFields: expected.types.fields.length, schemaFields: expected.schemas.sdk54.fields.length,
        typeDifferences: expected.comparisons.typesVsSdk54.length, schemaDifferences: expected.comparisons.sdk54VsUnversioned.length }));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
