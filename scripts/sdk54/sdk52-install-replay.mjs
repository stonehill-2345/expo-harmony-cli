import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { executeBaselineCommand, requireEmptyDirectory, validateBaselineResults } from './current-baseline.mjs';

const hash = data => createHash('sha256').update(data).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const save = (file, value) => { fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(value, null, 2)}\n`); fs.renameSync(`${file}.tmp`, file); };
const names = ['install', 'identity', 'prebuild', 'repeat-prebuild', 'repeat-consistency', 'release-bundle', 'native-device'];
const critical = ['expo', 'react', 'react-native', '@react-native-oh/react-native-harmony', '@react-native-oh/react-native-harmony-cli'];
const skip = (id, reason) => ({ id, status: 'NOT_RUN', reason });

function filesUnder(directory) {
  const files = [];
  function visit(relative = '') {
    for (const name of fs.readdirSync(path.join(directory, relative)).sort()) {
      if (['node_modules', '.git', 'oh_modules', '.hvigor', 'build'].includes(name)) continue;
      const file = path.posix.join(relative, name), absolute = path.join(directory, file), stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new Error(`Unsupported source symlink ${file}`);
      if (stat.isDirectory()) visit(file);
      else if (stat.isFile()) files.push({ path: file, bytes: stat.size, mode: stat.mode & 0o777, sha256: hash(fs.readFileSync(absolute)) });
      else throw new Error(`Unsupported source file ${file}`);
    }
  }
  visit(); return files;
}

export function copySdk52Project(source, target) {
  if (!/^52\.\d+\.\d+$/.test(json(path.join(source, 'package.json')).dependencies?.expo ?? '')) throw new Error('Expected exact SDK52 source project');
  const files = filesUnder(source);
  requireEmptyDirectory(target);
  for (const file of files) {
    const destination = path.join(target, file.path); fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(source, file.path), destination); fs.chmodSync(destination, file.mode);
    if (hash(fs.readFileSync(destination)) !== file.sha256) throw new Error(`Copied SDK52 file mismatch ${file.path}`);
  }
  return { source: fs.realpathSync(source), target: fs.realpathSync(target), files, sha256: hash(JSON.stringify(files)) };
}

export function verifySdk52Installed(project) {
  const manifest = json(path.join(project, 'package.json')), records = [], errors = [], root = fs.realpathSync(project);
  for (const name of critical) {
    try {
      const file = path.join(project, 'node_modules', name, 'package.json'), realPath = fs.realpathSync(file), actual = json(realPath);
      const insideProject = realPath.startsWith(`${root}${path.sep}`);
      const expected = manifest.dependencies?.[name];
      records.push({ name, expected, actualName: actual.name, version: actual.version, path: realPath, insideProject, sha256: hash(fs.readFileSync(realPath)) });
      if (!insideProject || actual.name !== name || actual.version !== expected || name === 'expo' && !/^52\.\d+\.\d+$/.test(actual.version)) errors.push(`Installed SDK52 identity mismatch ${name}`);
    } catch (error) { errors.push(`Missing/unreadable installed SDK52 package ${name}: ${error.message}`); }
  }
  return { valid: !errors.length, records, errors };
}

export function fingerprintNativeProject(project) {
  for (const file of ['harmony/entry/src/main/module.json5', 'harmony/AppScope/app.json5', 'harmony/build-profile.json5']) {
    if (!fs.existsSync(path.join(project, file)) || !fs.lstatSync(path.join(project, file)).isFile()) throw new Error(`Missing generated native file ${file}`);
  }
  const files = filesUnder(path.join(project, 'harmony'));
  return { files, sha256: hash(JSON.stringify(files)) };
}

function snapshots(project, output) {
  const records = [];
  for (const name of ['package.json', 'app.json', 'package-lock.json', 'pnpm-lock.yaml', '.expo-harmony/managed-state.json']) {
    const file = path.join(project, name); if (!fs.existsSync(file)) continue;
    const evidencePath = path.join(output, name); fs.mkdirSync(path.dirname(evidencePath), { recursive: true }); fs.copyFileSync(file, evidencePath);
    records.push({ name, evidencePath, sha256: hash(fs.readFileSync(evidencePath)) });
  }
  return records;
}

export function canProbeSdk52Release(scenario) {
  return Boolean(scenario?.steps?.slice(0, 3).length === 3 && scenario.steps.slice(0, 3).every(step => step.status === 'PASS')
    && scenario.nativeFirst?.sha256 && scenario.nativeFirst?.files?.length);
}

export async function probeSdk52Release({ reference, output, packageManager = 'pnpm' }) {
  reference = path.resolve(reference); output = path.resolve(output);
  const replay = json(reference), validation = validateSdk52Replay(replay, path.dirname(reference));
  if (!validation.valid) throw new Error(`Invalid replay evidence: ${validation.errors.join('; ')}`);
  const scenario = replay.scenarios.find(scenario => scenario.packageManager === packageManager);
  if (!canProbeSdk52Release(scenario)) throw new Error('Release bundle requires installed identity and successful first native generation');
  const before = fingerprintNativeProject(scenario.project);
  if (before.sha256 !== scenario.nativeFirst.sha256) throw new Error('Native project changed after first generation; review before bundling');
  const bundle = path.join(scenario.project, 'harmony/entry/src/main/resources/rawfile/bundle.harmony.js');
  if (fs.existsSync(bundle)) throw new Error('Release probe requires no stale bundle');
  requireEmptyDirectory(output);
  const execution = await executeBaselineCommand({ id: `sdk52-${packageManager}-release-followup`, command: [packageManager, 'run', 'bundle:harmony:release'], cwd: scenario.project, output, timeoutMs: 300000,
    env: { CI: '1', EXPO_OFFLINE: '1', npm_config_cache: path.join(replay.workDir, 'npm-cache'), NPM_CONFIG_CACHE: path.join(replay.workDir, 'npm-cache') } });
  let artifact = null;
  if (fs.existsSync(bundle) && fs.statSync(bundle).size) {
    const evidencePath = path.join(output, 'bundle.harmony.js'); fs.copyFileSync(bundle, evidencePath);
    artifact = { evidencePath, bytes: fs.statSync(bundle).size, sha256: hash(fs.readFileSync(bundle)) };
  } else if (execution.status === 'PASS') { execution.status = 'FAIL'; execution.assertionFailure = 'Command exited 0 without fresh nonempty bundle'; }
  const result = { schemaVersion: 1, reference: { path: reference, sha256: hash(fs.readFileSync(reference)) }, candidateSha256: replay.candidate.sha256,
    nativeBeforeSha256: before.sha256, legacyOverwriteGuard: 'RECORDED_SEPARATELY_NOT_A_BUNDLE_PREREQUISITE', execution, artifact, nativeDeviceAccepted: false, stageClosable: false };
  save(path.join(output, 'results.json'), result); return result;
}

export async function runSdk52Replay({ reference, workDir, output, timeoutMs = 600000 }) {
  reference = path.resolve(reference); const previous = json(reference), validation = validateBaselineResults(previous, path.dirname(reference));
  if (!validation.valid) throw new Error(`Invalid previous baseline: ${validation.errors.join('; ')}`);
  requireEmptyDirectory(output); requireEmptyDirectory(workDir); output = fs.realpathSync(output); workDir = fs.realpathSync(workDir);
  if (output === workDir || output.startsWith(`${workDir}${path.sep}`) || workDir.startsWith(`${output}${path.sep}`)) throw new Error('Evidence and work directories must be separate');
  const cli = path.join(previous.candidate.installed.realPath, 'dist/index.js');
  const result = { schemaVersion: 1, state: 'RUNNING', reference: { path: reference, sha256: hash(fs.readFileSync(reference)) }, candidate: previous.candidate,
    workDir, setup: [], scenarios: [], productAllPassed: false, stageClosable: false };
  const resultPath = path.join(output, 'results.json'), persist = () => save(resultPath, result);
  const env = { CI: '1', npm_config_cache: path.join(workDir, 'npm-cache'), NPM_CONFIG_CACHE: path.join(workDir, 'npm-cache'),
    npm_config_update_notifier: 'false', npm_config_fetch_retries: '1', npm_config_fetch_timeout: '30000',
    npm_config_store_dir: path.join(workDir, 'pnpm-store'), pnpm_config_store_dir: path.join(workDir, 'pnpm-store') };
  let interrupted = false;
  const run = async (id, command, cwd, limit = timeoutMs) => {
    const record = await executeBaselineCommand({ id, command, cwd, output, timeoutMs: limit, env }); interrupted ||= record.interrupted;
    console.log(`${id}: ${record.status} (exit=${record.exitCode}, timeout=${record.timedOut})`); return record;
  };
  const assertion = (id, valid, detail) => {
    const log = `${id}.log`; fs.writeFileSync(path.join(output, log), `${JSON.stringify(detail, null, 2)}\n`, { flag: 'wx' });
    return { id, kind: 'ASSERTION', status: valid ? 'PASS' : 'FAIL', valid, log, logSha256: hash(fs.readFileSync(path.join(output, log))) };
  };
  for (const pm of ['npm', 'pnpm']) {
    const original = previous.scenarios.find(scenario => scenario.id === `sdk52-default-${pm}`);
    if (!original || original.steps[0].status !== 'PASS') throw new Error(`Previous SDK52 create did not pass for ${pm}`);
    const id = `sdk52-${pm}`, project = path.join(workDir, id), source = copySdk52Project(original.project.projectRoot, project);
    const sourceEvidence = path.join(output, 'sources', id);
    for (const file of source.files) { const destination = path.join(sourceEvidence, file.path); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.copyFileSync(path.join(project, file.path), destination); }
    result.scenarios.push({ id, packageManager: pm, project, source: { ...source, evidenceRoot: sourceEvidence }, steps: names.map(name => skip(`${id}-${name}`, '尚未执行')) });
  }
  persist();
  result.setup.push(await run('git-init', ['git', 'init', '--quiet', workDir], workDir, 10000)); persist();
  // Projects have independent locks; installation is sequential to bound memory use.
  for (const scenario of result.scenarios) {
    const { id, project, packageManager: pm } = scenario;
    for (let index = 0; index < names.length; index++) {
      const name = names[index], stepId = `${id}-${name}`;
      if (name === 'native-device') scenario.steps[index] = skip(stepId, '无本轮签名HAP/原生构建候选和确定运行目标；JS打包不构成设备运行');
      else if (interrupted || result.setup[0].status !== 'PASS') scenario.steps[index] = skip(stepId, '执行中断或隔离工作目录初始化失败');
      else if (name === 'install') scenario.steps[index] = await run(stepId, pm === 'npm' ? ['npm', 'install', '--no-audit', '--no-fund'] : ['pnpm', 'install', '--reporter=append-only'], project);
      else if (scenario.steps[0].status !== 'PASS') scenario.steps[index] = skip(stepId, '正常依赖安装未通过，不使用半成品继续生成或打包');
      else if (name === 'identity') {
        scenario.installed = verifySdk52Installed(project); scenario.steps[index] = assertion(stepId, scenario.installed.valid, scenario.installed);
      } else if (scenario.steps[1].status !== 'PASS') scenario.steps[index] = skip(stepId, '关键安装身份或隔离解析未通过');
      else if (name === 'prebuild' || name === 'repeat-prebuild') {
        if (name === 'repeat-prebuild' && scenario.steps[2].status !== 'PASS') scenario.steps[index] = skip(stepId, '首次prebuild未通过');
        else {
          scenario.steps[index] = await run(stepId, [process.execPath, cli, 'prebuild', '--platform', 'harmony'], project, 180000);
          if (scenario.steps[index].status === 'PASS') {
            try { scenario[name === 'prebuild' ? 'nativeFirst' : 'nativeRepeat'] = fingerprintNativeProject(project); }
            catch (error) { scenario.steps[index].status = 'FAIL'; scenario.steps[index].assertionFailure = error.message; }
          }
        }
      } else if (name === 'repeat-consistency') {
        if (!scenario.nativeFirst || !scenario.nativeRepeat) scenario.steps[index] = skip(stepId, '两次原生生成未全部通过');
        else scenario.steps[index] = assertion(stepId, scenario.nativeFirst.sha256 === scenario.nativeRepeat.sha256, { first: scenario.nativeFirst, repeat: scenario.nativeRepeat });
      } else if (name === 'release-bundle') {
        if (!canProbeSdk52Release(scenario)) scenario.steps[index] = skip(stepId, '安装身份或首次原生生成未通过');
        else {
          if (fingerprintNativeProject(project).sha256 !== scenario.nativeFirst.sha256) throw new Error('Native files changed after first generation; review before bundling');
          const bundle = path.join(project, 'harmony/entry/src/main/resources/rawfile/bundle.harmony.js');
          if (fs.existsSync(bundle)) throw new Error('Fresh replay must not contain pre-existing Release bundle');
          scenario.steps[index] = await run(stepId, [pm, 'run', 'bundle:harmony:release'], project, 300000);
          if (scenario.steps[index].status === 'PASS') {
            if (!fs.existsSync(bundle) || !fs.statSync(bundle).size) { scenario.steps[index].status = 'FAIL'; scenario.steps[index].assertionFailure = 'Release command exited 0 without new nonempty bundle'; }
            else { const evidencePath = path.join(output, `${id}-bundle.harmony.js`); fs.copyFileSync(bundle, evidencePath); scenario.bundle = { evidencePath, bytes: fs.statSync(bundle).size, sha256: hash(fs.readFileSync(bundle)) }; }
          }
        }
      }
      persist();
    }
    scenario.snapshots = snapshots(project, path.join(output, 'projects', id)); persist();
  }
  const hdc = process.env.HDC_PATH || (fs.existsSync('/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains/hdc') ? '/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains/hdc' : 'hdc');
  for (const [id, command] of [['hdc-version', [hdc, 'version']], ['hdc-targets', [hdc, 'list', 'targets']], ['no-git-commits', ['git', 'log', '--all', '--oneline']]]) {
    result.setup.push(await run(id, command, workDir, 10000)); persist();
  }
  const commits = result.setup.at(-1);
  if (commits.status === 'PASS' && fs.readFileSync(path.join(output, commits.log), 'utf8').trim()) { commits.status = 'FAIL'; commits.assertionFailure = 'Unexpected Git commit'; }
  result.state = interrupted ? 'INTERRUPTED' : 'FINISHED'; result.productAllPassed = false; persist(); return result;
}

export function validateSdk52Replay(result, output) {
  const errors = [], verify = (file, expected, label) => {
    try { if (!expected || hash(fs.readFileSync(file)) !== expected) errors.push(`${label}: hash mismatch`); }
    catch (error) { errors.push(`${label}: ${error.message}`); }
  };
  if (result.schemaVersion !== 1 || !['FINISHED', 'INTERRUPTED'].includes(result.state)) errors.push('Incomplete result schema/state');
  if (result.stageClosable !== false || result.productAllPassed !== false) errors.push('Cannot claim stage/product completion without native/device acceptance');
  verify(result.candidate?.path, result.candidate?.sha256, 'candidate'); verify(result.reference?.path, result.reference?.sha256, 'reference');
  if (JSON.stringify((result.scenarios ?? []).map(s => s.id)) !== JSON.stringify(['sdk52-npm', 'sdk52-pnpm'])) errors.push('Missing/duplicate scenario matrix');
  if (JSON.stringify((result.setup ?? []).map(s => s.id)) !== JSON.stringify(['git-init', 'hdc-version', 'hdc-targets', 'no-git-commits'])) errors.push('Missing/duplicate setup matrix');
  const seen = new Set();
  function step(record) {
    if (!['PASS', 'FAIL', 'NOT_RUN'].includes(record.status)) { errors.push(`Invalid status ${record.id}`); return; }
    if (record.status === 'NOT_RUN') { if (!record.reason || record.reason === '尚未执行' && result.state === 'FINISHED') errors.push(`Missing reason ${record.id}`); return; }
    if (record.log !== `${record.id}.log` || !/^[a-zA-Z0-9_-]+$/.test(record.id) || seen.has(record.id)) errors.push(`Invalid/duplicate log ${record.id}`);
    seen.add(record.id); verify(path.join(output, path.basename(record.log ?? 'missing')), record.logSha256, record.id);
    const pass = record.kind === 'ASSERTION' ? record.valid === true : record.exitCode === 0 && !record.error && !record.signal && !record.timedOut && !record.interrupted && !record.assertionFailure;
    if (pass !== (record.status === 'PASS')) errors.push(`Exit/assertion/status mismatch ${record.id}`);
  }
  (result.setup ?? []).forEach(step);
  for (const scenario of result.scenarios ?? []) {
    if (scenario.packageManager !== scenario.id?.slice('sdk52-'.length) || !['npm', 'pnpm'].includes(scenario.packageManager)) errors.push(`Scenario/package-manager mismatch ${scenario.id}`);
    if (JSON.stringify((scenario.steps ?? []).map(s => s.id)) !== JSON.stringify(names.map(name => `${scenario.id}-${name}`))) errors.push(`Missing scenario steps ${scenario.id}`);
    (scenario.steps ?? []).forEach(step);
    if (scenario.source?.sha256 !== hash(JSON.stringify(scenario.source?.files ?? []))) errors.push(`Source index hash mismatch ${scenario.id}`);
    try {
      if (hash(JSON.stringify(filesUnder(scenario.source.evidenceRoot))) !== scenario.source.sha256) errors.push(`Source evidence inventory incomplete ${scenario.id}`);
    } catch (error) { errors.push(`Source evidence missing ${scenario.id}: ${error.message}`); }
    for (const file of scenario.source?.files ?? []) verify(path.join(scenario.source.evidenceRoot, file.path), file.sha256, `source ${scenario.id}/${file.path}`);
    for (const file of scenario.snapshots ?? []) verify(file.evidencePath, file.sha256, `snapshot ${scenario.id}`);
    if (scenario.bundle) verify(scenario.bundle.evidencePath, scenario.bundle.sha256, 'Release bundle');
    const install = scenario.steps?.[0];
    if (install?.status !== 'NOT_RUN') {
      const command = scenario.packageManager === 'npm' ? ['npm', 'install', '--no-audit', '--no-fund'] : ['pnpm', 'install', '--reporter=append-only'];
      if (JSON.stringify(install?.command) !== JSON.stringify(command)) errors.push(`Changed install command ${scenario.id}`);
    }
    if (install?.status !== 'PASS' && scenario.steps?.slice(1).some(s => s.status === 'PASS')) errors.push(`Passed step after failed install ${scenario.id}`);
    if (scenario.steps?.[4]?.status === 'PASS' && (!scenario.nativeFirst || !scenario.nativeRepeat || scenario.nativeFirst.sha256 !== scenario.nativeRepeat.sha256)) errors.push(`Fake native consistency ${scenario.id}`);
    for (const key of ['nativeFirst', 'nativeRepeat']) if (scenario[key] && scenario[key].sha256 !== hash(JSON.stringify(scenario[key].files))) errors.push(`Native inventory hash mismatch ${scenario.id}/${key}`);
    for (const [index, detail] of [[1, scenario.installed], [4, { first: scenario.nativeFirst, repeat: scenario.nativeRepeat }]]) {
      const record = scenario.steps?.[index];
      if (record?.kind === 'ASSERTION') {
        try { if (JSON.stringify(json(path.join(output, record.log))) !== JSON.stringify(detail)) errors.push(`Assertion evidence differs from record ${record.id}`); }
        catch (error) { errors.push(`Invalid assertion evidence ${record.id}: ${error.message}`); }
      }
    }
  }
  return { valid: !errors.length, errors, productAllPassed: false, stageClosable: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2), options = {};
    for (let index = 0; index < args.length; index++) {
      const flag = args[index]; if (!['--reference', '--work-dir', '--output', '--timeout-ms', '--check'].includes(flag) || !args[index + 1] || options[flag]) throw new Error(`Invalid argument ${flag}`); options[flag] = args[++index];
    }
    if (options['--check']) {
      if (Object.keys(options).length !== 1) throw new Error('--check accepts only result path');
      const file = path.resolve(options['--check']), validation = validateSdk52Replay(json(file), path.dirname(file)); console.log(JSON.stringify(validation, null, 2)); if (!validation.valid) process.exitCode = 1;
    } else {
      if (!options['--reference'] || !options['--work-dir'] || !options['--output']) throw new Error('Required --reference <previous-results> --work-dir <empty> --output <empty> [--timeout-ms <ms>]');
      const timeoutMs = Number(options['--timeout-ms'] ?? 600000); if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid timeout');
      const result = await runSdk52Replay({ reference: options['--reference'], workDir: options['--work-dir'], output: options['--output'], timeoutMs });
      const validation = validateSdk52Replay(result, path.resolve(options['--output'])); console.log(JSON.stringify(validation, null, 2)); process.exitCode = validation.valid ? 2 : 1;
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
