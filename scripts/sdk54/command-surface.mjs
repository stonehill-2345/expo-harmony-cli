import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { SDK54_EXPO_COMMIT } from './catalog.mjs';
import { readSourceTree, readSourceBlobs, prefetchSourceBlobs } from './source-inventory.mjs';
import { indexCommandSurface, compareCommandSurfaces, serializeCommandSurface, validateCommandSurface } from './command-surface-model.mjs';

const prefix = 'packages/@expo/cli/';
const helpers = ['args', 'resolveArgs', 'variadic'].map(name => `${prefix}src/utils/${name}.ts`);
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
export function selectCommandSources(entries) {
  return entries.filter(entry => entry.path === `${prefix}package.json` || /^packages\/@expo\/cli\/bin\/.*\.ts$/.test(entry.path)
    || entry.path.startsWith(`${prefix}src/`) && /\/(?:index|resolveOptions)\.ts$/.test(entry.path) && !/\/(?:__tests__|__mocks__|fixtures)\//.test(entry.path)
    || helpers.includes(entry.path)).map(entry => {
    if (entry.type !== 'blob' || entry.mode === '120000') throw new Error(`Unsupported command source/symlink ${entry.path}`);
    return entry;
  }).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
function localEntries(root) {
  const entries = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const file = `${directory}/${entry.name}`;
      if (['__tests__', '__mocks__', 'fixtures', 'node_modules'].includes(entry.name)) continue;
      if (entry.isDirectory()) visit(file);
      else entries.push({ path: file, type: 'blob', mode: entry.isSymbolicLink() ? '120000' : '100644' });
    }
  }
  visit(`${prefix}bin`); visit(`${prefix}src`);
  entries.push({ path: `${prefix}package.json`, type: 'blob', mode: fs.lstatSync(path.join(root, prefix, 'package.json')).isSymbolicLink() ? '120000' : '100644' });
  return entries;
}

function reviewDifferences(differences) {
  return differences.map(difference => {
    const record = difference.adaptation ?? difference.source;
    let conclusion, action;
    if (difference.category === 'commands' && record.name === 'run:harmony' && difference.kind === 'ONLY_ADAPTATION') {
      conclusion = '适配分发器新增run:harmony，关联expoRunHarmony；上游固定来源无此入口。';
      action = 'M0A移交命令入口；M5验证项目根解析、失败退出及Debug/Release真实构建运行。';
    } else if (difference.category === 'options' && record.source.endsWith('/prebuild/index.ts') && record.name === '--bundle-name') {
      conclusion = '适配prebuild新增String参数--bundle-name，不能仅据声明认定原生应用身份同步。';
      action = 'M1验证bundle-name更新与配置快照；M5验证CLI转发及非法输入。';
    } else if (difference.category === 'options' && record.source.endsWith('/run/harmony/index.ts')) {
      conclusion = `适配run:harmony声明${record.name}，类型${record.declaredType}${record.aliasTarget ? `，别名目标${record.aliasTarget}` : ''}；未执行参数校验。`;
      action = `M5为${record.name}验证有效/无效输入、与其他参数组合及对应命令结果；设备相关值另做设备验收。`;
    } else if (difference.category === 'parsers' && record.source.endsWith('/run/harmony/index.ts')) {
      conclusion = '新增Harmony参数解析器，permissive:false；其与run平台入口的转发一致性尚未实测。';
      action = 'M5对比run harmony与run:harmony、未知参数、--help及目录参数的实际行为。';
    } else if (difference.category === 'branches' && record.source.endsWith('/run/index.ts')) {
      conclusion = 'run的平台switch新增harmony分支；静态分支可达不代表可用构建运行。';
      action = 'M5验证平台选择、显式harmony和失败传播；M0A移交时保留原平台分支回归。';
    } else throw new Error(`Unreviewed command difference ${difference.id}`);
    return { differenceId: difference.id, status: 'DECLARATION_REVIEWED_RUNTIME_NOT_ACCEPTED', conclusion, action, followUp: difference.followUp };
  });
}
export function buildCommandSurface({ sourceDir, adaptationRoot, prefetch = false }) {
  const { entries, tree } = readSourceTree(sourceDir, SDK54_EXPO_COMMIT);
  const selected = selectCommandSources(entries);
  if (prefetch) prefetchSourceBlobs(sourceDir, selected);
  const fixed = readSourceBlobs(sourceDir, selected);
  const local = localEntries(adaptationRoot), adapted = selectCommandSources(local);
  const localBuffers = new Map(adapted.map(entry => [entry.path, fs.readFileSync(path.join(adaptationRoot, entry.path))]));
  const textFiles = buffers => new Map([...buffers].map(([file, buffer]) => {
    const content = buffer.toString('utf8');
    if (!Buffer.from(content).equals(buffer)) throw new Error(`Non-UTF8 command source ${file}`);
    return [file, content];
  }));
  const source = indexCommandSurface(textFiles(fixed), entries.map(entry => entry.path));
  const adaptation = indexCommandSurface(textFiles(localBuffers), local.map(entry => entry.path));
  const differences = compareCommandSurfaces(source, adaptation);
  return { schemaVersion: 1, provenance: { repository: 'https://github.com/expo/expo.git', revision: SDK54_EXPO_COMMIT, tree },
    sourceInputs: selected.map(entry => ({ path: entry.path, blob: entry.oid, bytes: fixed.get(entry.path).length, sha256: hash(fixed.get(entry.path)) })),
    adaptationInputs: adapted.map(entry => ({ path: entry.path, bytes: localBuffers.get(entry.path).length, sha256: hash(localBuffers.get(entry.path)), origin: 'LOCAL_ADAPTATION_NOT_FIXED_UPSTREAM' })),
    sourceVersion: JSON.parse(fixed.get(`${prefix}package.json`)).version, adaptationVersion: JSON.parse(localBuffers.get(`${prefix}package.json`)).version,
    source, adaptation, differences, differenceReviews: reviewDifferences(differences),
    anomalyReviews: [source, adaptation].flatMap((surface, index) => surface.anomalies.map(anomaly => {
      const option = surface.options.find(option => option.id === anomaly.optionId);
      return { anomalyId: anomaly.id, origin: index === 0 ? 'FIXED_SOURCE' : 'LOCAL_ADAPTATION',
        conclusion: `${option.name}指向${option.aliasTarget}，解析状态${option.aliasState}；声明异常原样保留。`,
        action: 'M5先用实际CLI参数复现，再独立评估修复及其平台回归；本轮不改产品参数表。' };
    })),
    limitations: ['STATIC_SELECTED_ENTRY_AND_PARSER_DECLARATIONS_ONLY', 'HELP_AND_BRANCH_TEXT_NOT_BEHAVIORAL_ASSERTIONS',
      'VARIADIC_FINAL_VALUE_TYPES_AND_VALIDATION_NOT_EXECUTED', 'OUTSIDE_SELECTED_MODULES_NOT_INDEXED', 'NO_COMMAND_RUNTIME_OR_DEVICE_ACCEPTANCE'],
    fullCommandRuntimeComplete: false, stageClosable: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2), options = {};
    for (let i = 0; i < args.length; i++) {
      const flag = args[i];
      if (flag === '--prefetch' && !options.prefetch) options.prefetch = true;
      else if (['--source', '--adaptation', '--output', '--check'].includes(flag) && args[i + 1] && !args[i + 1].startsWith('--') && !options[flag.slice(2)]) options[flag.slice(2)] = args[++i];
      else throw new Error(`Unknown/incomplete argument ${flag}`);
    }
    if (!options.source || !options.adaptation || Boolean(options.output) === Boolean(options.check)) throw new Error('Usage: --source <fixed-git> --adaptation <repo> [--prefetch] --output|--check <json>');
    const expected = buildCommandSurface({ sourceDir: options.source, adaptationRoot: options.adaptation, prefetch: options.prefetch });
    if (options.output) {
      fs.writeFileSync(options.output, serializeCommandSurface(expected));
      console.log(JSON.stringify({ sourceInputs: expected.sourceInputs.length, adaptationInputs: expected.adaptationInputs.length,
        commands: expected.source.commands.length, adaptationCommands: expected.adaptation.commands.length,
        options: expected.source.options.length, adaptationOptions: expected.adaptation.options.length, anomalies: expected.source.anomalies.length, differences: expected.differences.length }));
    } else {
      const result = validateCommandSurface(JSON.parse(fs.readFileSync(options.check)), expected);
      console.log(JSON.stringify(result, null, 2));
      if (!result.valid) process.exitCode = 1;
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
