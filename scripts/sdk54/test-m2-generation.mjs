import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const script = fileURLToPath(import.meta.url);
const repository = fileURLToPath(new URL('../../', import.meta.url));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const digest = file => hash(fs.readFileSync(file));
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
};
function tree(root, prefix = '') {
  const entries = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(root, entry.name);
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isSymbolicLink()) entries.push({ path: relative, link: fs.readlinkSync(absolute) });
    else if (entry.isDirectory()) {
      entries.push({ path: relative, directory: true });
      entries.push(...tree(absolute, relative));
    } else entries.push({ path: relative, sha256: digest(absolute), mode: fs.statSync(absolute).mode & 0o777 });
  }
  return entries;
}
const treeHash = root => hash(JSON.stringify(tree(root)));

async function nativeWorker() {
  const project = path.resolve(option('--project'));
  const request = createRequire(path.join(project, 'package.json'));
  const expoRequest = createRequire(request.resolve('expo/package.json'));
  const autolinking = expoRequest('expo-modules-autolinking/exports');
  const cliRoot = path.dirname(expoRequest.resolve('@expo/cli/package.json'));
  const cliRequest = createRequire(path.join(cliRoot, 'package.json'));
  const { getConfig } = cliRequest('@expo/config');
  const { resolveHarmonyConfig } = cliRequest(path.join(cliRoot, 'build/src/harmony/config.js'));
  const { compileHarmonyConfigAsync } = cliRequest(path.join(cliRoot, 'build/src/prebuild/harmony/configPlugins.js'));
  const { updateHarmonyDebugBundlePathAsync } = cliRequest(path.join(cliRoot, 'build/src/prebuild/harmony/prebuildHarmonyAsync.js'));
  const { exp } = getConfig(project, { isModdedConfig: true, skipSDKVersionRequirement: true });
  const snapshot = resolveHarmonyConfig(exp);
  if (option('--snapshot')) {
    write(option('--snapshot'), JSON.stringify(snapshot.expoConfig));
    return;
  }
  const plan = await compileHarmonyConfigAsync(project, exp, snapshot);
  const modules = await autolinking.queryAutolinkingModulesFromProjectAsync(project, { platform: 'harmony' });
  if (args.includes('--missing-har')) modules.push({
    packageName: 'zz-m2-missing-har', packageVersion: '1.0.0', packageRoot: path.join(project, '.m2-missing-har'),
    kind: 'har', lifecycleDependencies: [],
    hars: [{ packageName: '@example/m2-missing', packagePath: path.join(project, '.m2-missing-har/missing.har') }],
  });
  const core = modules.find(item => item.packageName === 'expo-modules-core');
  assert.ok(core?.packageRoot, 'real autolinking query must resolve Core');
  const result = await autolinking.syncHarmonyNativeProjectAsync({
    projectRoot: project,
    appName: snapshot.harmony.name,
    bundleName: snapshot.harmony.bundleName,
    appConfig: snapshot.expoConfig,
    userInterfaceStyle: snapshot.harmony.userInterfaceStyle,
    nativeConfig: plan.nativeConfig,
    modules,
    inputHarPath: path.join(project, 'node_modules/@react-native-oh/react-native-harmony/react_native_openharmony.har'),
    corePackageRoot: core.packageRoot,
    clean: args.includes('--clean'),
    ...(option('--template-root') ? { templateRoot: path.resolve(option('--template-root')) } : {}),
    finalize: async stage => {
      await updateHarmonyDebugBundlePathAsync(project, stage);
      if (args.includes('--trial')) write(path.join(stage, 'm2-native-trial.txt'), option('--fault', 'trial'));
    },
    generationFault: async point => {
      if (point !== option('--fault')) return;
      if (option('--ready')) write(option('--ready'), { point, pid: process.pid });
      if (args.includes('--exit')) process.exit(73);
      if (option('--release')) {
        const deadline = Date.now() + 45000;
        while (!fs.existsSync(option('--release'))) {
          if (Date.now() > deadline) throw new Error('M2 hold timed out');
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        return;
      }
      throw new Error(`M2_NATIVE_FAULT:${point}`);
    },
  });
  if (option('--result')) write(option('--result'), { ...result, modules: modules.map(item => ({ packageName: item.packageName, packageRoot: item.packageRoot })) });
}

if (args.includes('--worker')) {
  try { await nativeWorker(); } catch (error) { console.error(error.stack); process.exitCode = 1; }
} else if (args.includes('--help')) {
  console.log('node scripts/sdk54/test-m2-generation.mjs --runtime-dir DIR --release-sha256 SHA256 [--evidence-dir DIR] [--work-dir DIR] [--npm-cache DIR] [--pm npm,pnpm]');
} else {
  const runtime = path.resolve(option('--runtime-dir', 'outputs/sdk54/ai-e2e/20261027-m2-generation/runtime'));
  const evidence = path.resolve(option('--evidence-dir', 'outputs/sdk54/ai-e2e/20261027-m2-generation/consumers'));
  const work = path.resolve(option('--work-dir', fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-m2-consumers-'))));
  const managers = option('--pm', 'npm,pnpm').split(',');
  assert.ok(managers.length > 0 && managers.every(pm => ['npm', 'pnpm'].includes(pm)) && managers.length === new Set(managers).size);
  assert.ok(option('--release-sha256'), 'M2 consumption requires a frozen --release-sha256');
  assert.ok(!args.includes('--reuse-installed'), 'M2 consumption requires real installation; --reuse-installed is disabled');
  const realRepository = fs.realpathSync(repository);
  fs.mkdirSync(work, { recursive: true });
  const realWork = fs.realpathSync(work);
  assert.ok(realWork !== realRepository && !realWork.startsWith(realRepository + path.sep), 'consumers must be outside repository');
  fs.mkdirSync(evidence, { recursive: true });
  const reportFile = path.join(evidence, 'generation-consumer-report.json');
  const report = { schemaVersion: 1, runtime, work, releaseSha256: option('--release-sha256'), results: [], passed: false, completed: false };
  const save = () => write(reportFile, report);
  const execute = (command, commandArgs, cwd, env, logName, timeout = 180000) => {
    const log = path.join(evidence, logName);
    const handle = fs.openSync(log, 'w');
    const child = spawn(command, commandArgs, { cwd, env, stdio: ['ignore', handle, handle], detached: true });
    const completion = new Promise(resolve => {
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        try { process.kill(-child.pid, 'SIGKILL'); } catch {}
      }, timeout);
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fs.closeSync(handle);
        resolve({ ...value, timedOut, log: logName, logSha256: digest(log) });
      };
      child.once('error', error => finish({ error: error.message, exitCode: null }));
      child.once('exit', (exitCode, signal) => finish({ exitCode, signal }));
    });
    return { child, completion };
  };
  try {
    assert.equal(digest(path.join(runtime, 'release.json')), report.releaseSha256, 'frozen runtime manifest changed');
    {
      const install = execute(process.execPath, [path.join(repository, 'scripts/sdk54/test-m1-config.mjs'),
        '--runtime-dir', runtime, '--release-sha256', report.releaseSha256,
        '--evidence-dir', path.join(evidence, 'm1-regression'), '--work-dir', work, '--pm', managers.join(','),
        '--npm-cache', option('--npm-cache', '/private/tmp/sdk54-m0a-npm-cache')], repository, process.env, 'm1-regression.log', 1800000);
      report.m1 = await install.completion;
      save();
      assert.equal(report.m1.exitCode, 0, 'M1 real install/types/bytes/negative matrix must pass');
    }
    const m1 = json(path.join(evidence, 'm1-regression/config-consumer-report.json'));
    assert.equal(m1.passed, true);
    assert.equal(m1.releaseSha256, report.releaseSha256);
    const pythonFreeBin = path.join(work, 'python-free-bin');
    fs.mkdirSync(pythonFreeBin, { recursive: true });
    if (!fs.existsSync(path.join(pythonFreeBin, 'node'))) fs.symlinkSync(process.execPath, path.join(pythonFreeBin, 'node'));
    if (!fs.existsSync(path.join(pythonFreeBin, 'git'))) fs.symlinkSync('/usr/bin/git', path.join(pythonFreeBin, 'git'));
    const snapshots = [];
    for (const pm of managers) {
      const project = path.join(work, pm);
      const harmony = path.join(project, 'harmony');
      const request = createRequire(path.join(project, 'package.json'));
      const cli = request.resolve('expo/bin/cli');
      const expoRequest = createRequire(request.resolve('expo/package.json'));
      const installedTemplates = path.join(path.dirname(expoRequest.resolve('expo-modules-autolinking/package.json')), 'templates/harmony');
      const result = { pm, project, checks: [], failures: [] };
      report.results.push(result);
      const check = async (id, action) => {
        try { const detail = await action(); result.checks.push({ id, passed: true, detail }); }
        catch (error) { result.checks.push({ id, passed: false, error: error.stack }); result.failures.push(id); }
        save();
      };
      const env = { ...process.env, NODE_PATH: '', CI: '1', EXPO_NO_TELEMETRY: '1', EXPO_NO_UPDATE_CHECK: '1', PATH: pythonFreeBin, EXPO_HARMONY_PYTHON: path.join(pythonFreeBin, 'python3'), PYTHON: path.join(pythonFreeBin, 'python3') };
      const prebuild = async (name, clean = false) => {
        const command = await execute(process.execPath, [cli, 'prebuild', '--platform', 'harmony', '--no-install', ...(clean ? ['--clean'] : [])], project, env, `${pm}-${name}.log`).completion;
        assert.equal(command.exitCode, 0, JSON.stringify(command));
        return command;
      };
      const worker = (name, extra = [], timeout = 180000) => execute(process.execPath, [script, '--worker', '--project', project, ...extra], project, env, `${pm}-${name}.log`, timeout);
      const configure = scenario => write(path.join(project, 'm2-case.json'), scenario);
      const readModule = () => json(path.join(harmony, 'entry/src/main/module.json5')).module;
      const readApp = () => json(path.join(harmony, 'AppScope/app.json5')).app;
      const assertMedia = (expected, backgroundColor) => {
        const artifacts = [];
        for (const [target, source] of [
          ['AppScope/resources/base/media/app_icon.png', expected.icon],
          ['entry/src/main/resources/base/media/background.png', expected.icon],
          ['entry/src/main/resources/base/media/foreground.png', expected.foreground],
          ['entry/src/main/resources/base/media/startIcon.png', expected.splash],
        ]) {
          const outputSHA256 = digest(path.join(harmony, target));
          assert.equal(outputSHA256, digest(path.join(project, 'assets', source)), target);
          artifacts.push({ target, source, sha256: outputSHA256 });
        }
        const colorFile = path.join(harmony, 'entry/src/main/resources/base/element/color.json');
        assert.equal(json(colorFile).color.find(item => item.name === 'start_window_background').value, backgroundColor);
        artifacts.push({ target: path.relative(harmony, colorFile), backgroundColor, sha256: digest(colorFile) });
        return artifacts;
      };
      const assertConstants = async (name, expectedHarmony, removedFields = []) => {
        const expectedFile = path.join(evidence, `${pm}-${name}-expected-public.json`);
        const command = await worker(`snapshot-${name}`, ['--snapshot', expectedFile]).completion;
        assert.equal(command.exitCode, 0, 'installed CLI must resolve the expected public snapshot');
        const output = path.join(harmony, 'entry/src/main/resources/rawfile/app.config');
        assert.equal(fs.readFileSync(output, 'utf8'), fs.readFileSync(expectedFile, 'utf8'));
        const snapshot = json(output);
        for (const [key, value] of Object.entries(expectedHarmony)) assert.deepEqual(snapshot.harmony[key], value);
        for (const key of removedFields) assert.equal(Object.hasOwn(snapshot.harmony, key), false, `Constants must remove harmony.${key}`);
        const archived = path.join(evidence, `${pm}-${name}-actual-app.config`);
        fs.copyFileSync(output, archived);
        return { expectedSnapshot: path.basename(expectedFile), actualSnapshot: path.basename(archived), sha256: digest(output), removedFields };
      };

      // Extra packages are immutable graph fixtures; only project dependency declarations change below.
      const fixtureRoot = path.join(project, '.m2-fixtures');
      const shared = path.join(fixtureRoot, 'm2-shared-native');
      const wrapper = path.join(fixtureRoot, 'm2-wrapper');
      write(path.join(shared, 'package.json'), { name: 'm2-shared-native', version: '1.0.0' });
      write(path.join(shared, 'shared.har'), 'M2 immutable graph HAR fixture\n');
      write(path.join(shared, 'expo-module.config.json'), { platforms: ['harmony'], harmony: { kind: 'har', har: { packageName: '@example/m2-shared', packagePath: 'shared.har' } } });
      write(path.join(wrapper, 'package.json'), { name: 'm2-wrapper', version: '1.0.0', dependencies: { 'm2-shared-native': '1.0.0' } });
      fs.mkdirSync(path.join(wrapper, 'node_modules'), { recursive: true });
      if (!fs.existsSync(path.join(wrapper, 'node_modules/m2-shared-native'))) fs.symlinkSync(shared, path.join(wrapper, 'node_modules/m2-shared-native'));
      for (const [name, source] of [['m2-shared-native', shared], ['m2-wrapper', wrapper]]) {
        if (!fs.existsSync(path.join(project, 'node_modules', name))) fs.symlinkSync(source, path.join(project, 'node_modules', name));
      }
      const projectManifest = json(path.join(project, 'package.json'));
      projectManifest.dependencies['m2-shared-native'] = 'file:./.m2-fixtures/m2-shared-native';
      projectManifest.dependencies['m2-wrapper'] = 'file:./.m2-fixtures/m2-wrapper';
      write(path.join(project, 'package.json'), projectManifest);
      write(path.join(project, 'm2.plugin.cjs'), `const {defineHarmonyPlugin,withHarmonyModule}=require('expo/harmony-config');
module.exports=defineHarmonyPlugin((config,options={})=>withHarmonyModule(config,mod=>{
  mod.modResults.metadata=[{name:'m2.plugin',value:options.marker}];
  if(options.sharedCamera&&!mod.modResults.requestPermissions.some(p=>p.name==='ohos.permission.CAMERA')) mod.modResults.requestPermissions.push({name:'ohos.permission.CAMERA',reason:'$string:app_name',usedScene:{abilities:['EntryAbility'],when:'inuse'}});
  return mod;
}));\n`);
      write(path.join(project, 'app.config.ts'), `const fs=require('node:fs');const path=require('node:path');
export default ()=>{const c=JSON.parse(fs.readFileSync(path.join(__dirname,'m2-case.json'),'utf8'));return {
name:'M2 ${pm}',slug:'m2-${pm}',version:'1.0.0',icon:'./assets/universal.png',...c.expo,
harmony:{name:'M2 ${pm}',bundleName:'com.example.m2${pm}',...c.harmony},
plugins:c.plugin?[['./m2.plugin.cjs',c.plugin]]:[]
};};\n`);
      const camera = { name: 'ohos.permission.CAMERA', reason: '$string:app_name', usedScene: { abilities: ['EntryAbility'], when: 'inuse' } };
      const first = { harmony: { version: '9.1.0', versionCode: 910, icon: './assets/harmony.png', foregroundImage: './assets/foreground.png', splash: { image: './assets/splash.png', backgroundColor: '#112233' }, scheme: ['m2one'], querySchemes: ['first'], permissions: [camera] }, plugin: { marker: 'alpha', sharedCamera: true } };
      const second = { harmony: { version: '9.2.0', versionCode: 920, icon: './assets/foreground.png', scheme: ['m2two'], querySchemes: ['second'], permissions: [] }, plugin: { marker: 'beta', sharedCamera: true } };
      const fallback = { expo: { android: { adaptiveIcon: { foregroundImage: './assets/foreground.png' } }, splash: { image: './assets/splash.png', backgroundColor: '#445566' } }, harmony: {} };
      const removed = { harmony: {} };
      const dependenciesBefore = tree(path.join(project, 'node_modules'));
      const fixtureBefore = tree(fixtureRoot);
      write(path.join(evidence, `${pm}-dependency-tree-before.json`), dependenciesBefore);
      configure(first);
      await check('M2-A06_PYTHON_UNAVAILABLE_REAL_PREBUILD', async () => {
        const command = await prebuild('first', true);
        const media = assertMedia({ icon: 'harmony.png', foreground: 'foreground.png', splash: 'splash.png' }, '#112233');
        const constants = await assertConstants('first', first.harmony);
        return { command, pythonPath: env.EXPO_HARMONY_PYTHON, path: env.PATH, media, constants };
      });
      if (result.failures.length) continue;
      await check('M2-A01_IDENTICAL_INPUT_FULL_TREE_STATE_STABLE', async () => {
        const before = tree(harmony);
        const inode = fs.statSync(harmony).ino;
        await prebuild('repeat');
        assert.deepEqual(tree(harmony), before);
        assert.equal(fs.statSync(harmony).ino, inode, 'no-op generation must not replace current tree');
        assert.ok(before.some(entry => entry.path === '.expo-harmony-state.json'));
        return { treeSHA256: hash(JSON.stringify(before)), stateSHA256: digest(path.join(harmony, '.expo-harmony-state.json')) };
      });
      write(path.join(harmony, 'user-extension.txt'), 'M2 user extension survives ordinary generation\n');
      const modulePath = path.join(harmony, 'entry/src/main/module.json5');
      const userModule = readModule();
      userModule.m2UserField = { preserved: true };
      userModule.metadata.push({ name: 'm2.user', value: 'preserve' });
      userModule.querySchemes.push('m2-user-query');
      userModule.requestPermissions.push({ name: 'ohos.permission.GET_NETWORK_INFO' });
      write(modulePath, `// actual JSON5 user input\n{module:${JSON.stringify(userModule)},}\n`);
      await check('M2-A01_A04_UPDATE_USER_JSON5_SHARED_PERMISSION', async () => {
        configure(second);
        await prebuild('update');
        const module = readModule();
        assert.equal(readApp().versionName, '9.2.0');
        assert.equal(readApp().versionCode, 920);
        const media = assertMedia({ icon: 'foreground.png', foreground: 'foreground.png', splash: 'foreground.png' }, '#FFFFFF');
        const constants = await assertConstants('update', second.harmony, ['foregroundImage', 'splash']);
        assert.deepEqual(module.m2UserField, { preserved: true });
        assert.ok(module.metadata.some(item => item.name === 'm2.user'));
        assert.ok(module.metadata.some(item => item.name === 'm2.plugin' && item.value === 'beta'));
        assert.ok(module.querySchemes.includes('second') && module.querySchemes.includes('m2-user-query') && !module.querySchemes.includes('first'));
        assert.ok(module.requestPermissions.some(item => item.name === camera.name), 'plugin retains a shared permission after config declaration removal');
        const schemes = module.abilities.flatMap(ability => (ability.skills ?? []).flatMap(skill => (skill.uris ?? []).map(uri => uri.scheme)));
        assert.ok(schemes.includes('m2two') && !schemes.includes('m2one'));
        assert.equal(fs.readFileSync(path.join(harmony, 'user-extension.txt'), 'utf8'), 'M2 user extension survives ordinary generation\n');
        return { media, constants };
      });
      await check('M2-A01_ANDROID_FOREGROUND_AND_EXPO_SPLASH_FALLBACK', async () => {
        configure(fallback);
        await prebuild('expo-media-fallback');
        const media = assertMedia({ icon: 'universal.png', foreground: 'foreground.png', splash: 'splash.png' }, '#445566');
        const constants = await assertConstants('fallback', {}, ['icon', 'foregroundImage', 'splash', 'version', 'versionCode', 'permissions', 'scheme', 'querySchemes']);
        const snapshot = json(path.join(harmony, 'entry/src/main/resources/rawfile/app.config'));
        assert.deepEqual(snapshot.android.adaptiveIcon, fallback.expo.android.adaptiveIcon);
        assert.deepEqual(snapshot.splash, fallback.expo.splash);
        return { media, constants };
      });
      await check('M2-A01_A05_REMOVE_LAST_DECLARATIONS', async () => {
        configure(removed);
        await prebuild('remove-config');
        const module = readModule();
        assert.equal(readApp().versionName, '1.0.0');
        assert.equal(readApp().versionCode, 1);
        const media = assertMedia({ icon: 'universal.png', foreground: 'universal.png', splash: 'universal.png' }, '#FFFFFF');
        const constants = await assertConstants('remove', {}, ['version', 'versionCode', 'icon', 'foregroundImage', 'splash', 'scheme', 'querySchemes', 'permissions']);
        const snapshot = json(path.join(harmony, 'entry/src/main/resources/rawfile/app.config'));
        assert.equal(Object.hasOwn(snapshot, 'splash'), false);
        assert.equal(Object.hasOwn(snapshot.android ?? {}, 'adaptiveIcon'), false);
        assert.ok(!module.metadata.some(item => item.name === 'm2.plugin'));
        assert.ok(module.metadata.some(item => item.name === 'm2.user'));
        assert.ok(!module.requestPermissions.some(item => item.name === camera.name));
        assert.ok(module.requestPermissions.some(item => item.name === 'ohos.permission.GET_NETWORK_INFO'));
        assert.deepEqual(module.querySchemes, ['m2-user-query']);
        assert.ok(!module.abilities.some(ability => (ability.skills ?? []).some(skill => (skill.uris ?? []).some(uri => ['m2one', 'm2two'].includes(uri.scheme)))));
        return { media, constants };
      });
      const sharedHar = path.join(harmony, 'dependencies/expo-modules/example__m2-shared/shared.har');
      write(path.join(path.dirname(sharedHar), 'user-resource.txt'), 'user owns this resource\n');
      await check('M2-A05_REAL_TRANSITIVE_GRAPH_AND_FINAL_REFERENCE_CLEANUP', async () => {
        assert.ok(fs.existsSync(sharedHar));
        delete projectManifest.dependencies['m2-shared-native'];
        write(path.join(project, 'package.json'), projectManifest);
        const transitiveFile = path.join(evidence, `${pm}-transitive-modules.json`);
        const transitive = await worker('transitive', ['--result', transitiveFile]).completion;
        assert.equal(transitive.exitCode, 0);
        assert.ok(json(transitiveFile).modules.some(item => item.packageName === 'm2-shared-native'));
        assert.equal(digest(sharedHar), digest(path.join(shared, 'shared.har')));
        delete projectManifest.dependencies['m2-wrapper'];
        write(path.join(project, 'package.json'), projectManifest);
        const removedFile = path.join(evidence, `${pm}-removed-modules.json`);
        const removal = await worker('remove-final-reference', ['--result', removedFile]).completion;
        assert.equal(removal.exitCode, 0);
        assert.ok(!json(removedFile).modules.some(item => item.packageName === 'm2-shared-native'));
        assert.equal(fs.existsSync(sharedHar), false);
        assert.equal(fs.readFileSync(path.join(path.dirname(sharedHar), 'user-resource.txt'), 'utf8'), 'user owns this resource\n');
      });
      await check('M2-A04_CLEAN_VISIBLE_FULL_BACKUP_AND_BYTE_RESTORE', async () => {
        const before = tree(harmony);
        const command = await prebuild('clean', true);
        const backupMatch = fs.readFileSync(path.join(evidence, command.log), 'utf8').match(/Harmony project backup: ([^\r\n]+)/);
        assert.ok(backupMatch, 'clean must report backup location');
        const backup = backupMatch[1].trim();
        assert.ok(backup.startsWith(path.join(project, '.expo/harmony-backups') + path.sep));
        assert.deepEqual(tree(backup), before);
        assert.equal(fs.existsSync(path.join(harmony, 'user-extension.txt')), false);
        const restore = path.join(project, '.expo/m2-restored/harmony');
        fs.cpSync(backup, restore, { recursive: true });
        assert.deepEqual(tree(restore), before);
        return { backup, restored: restore, backupTreeSHA256: hash(JSON.stringify(before)) };
      });
      for (const failure of ['resource', 'json5', 'har']) {
        await check(`M2-A02_INTERNAL_GENERATION_FAILURE:${failure}`, async () => {
          const before = tree(harmony);
          const template = path.join(project, '.m2-template-trials', failure);
          fs.cpSync(installedTemplates, template, { recursive: true });
          const workerArguments = ['--template-root', template];
          let diagnostic;
          if (failure === 'resource') {
            const icon = path.join(template, 'entry/src/main/resources/base/media/startIcon.png');
            fs.rmSync(icon, { recursive: true, force: true });
            fs.mkdirSync(icon, { recursive: true });
            diagnostic = /EISDIR|is a directory|illegal operation on a directory|ENOTDIR/i;
          } else if (failure === 'json5') {
            write(path.join(template, 'AppScope/app.json5'), '{ app: broken JSON5');
            diagnostic = /JSON5|unexpected|invalid character/i;
          } else {
            workerArguments.push('--missing-har');
            diagnostic = /ENOENT|no such file/i;
          }
          const command = await worker(`internal-${failure}`, workerArguments).completion;
          assert.notEqual(command.exitCode, 0);
          const stack = fs.readFileSync(path.join(evidence, command.log), 'utf8');
          assert.match(stack, diagnostic);
          assert.match(stack, failure === 'resource' ? /startIcon\.png/ : failure === 'json5' ? /JSON5|writeHarmonyAppIdentityAsync/ : /\.m2-missing-har\/missing\.har/);
          assert.deepEqual(tree(harmony), before);
          assert.deepEqual(tree(path.join(project, 'node_modules')), dependenciesBefore);
          assert.equal(fs.existsSync(path.join(project, '.expo-harmony-generation/lock.json')), false);
          const retry = await worker(`internal-${failure}-retry`).completion;
          assert.equal(retry.exitCode, 0);
          assert.deepEqual(tree(harmony), before);
          return { command, retry, previousTreeSHA256: hash(JSON.stringify(before)), dependenciesTreeSHA256: hash(JSON.stringify(dependenciesBefore)), releasedLock: true };
        });
      }
      for (const point of ['after-generate', 'after-validate', 'after-backup', 'after-install']) {
        await check(`M2-A02_NATIVE_ROLLBACK:${point}`, async () => {
          const before = tree(harmony);
          const command = await worker(`throw-${point}`, ['--trial', '--fault', point]).completion;
          assert.notEqual(command.exitCode, 0);
          assert.match(fs.readFileSync(path.join(evidence, command.log), 'utf8'), /M2_NATIVE_FAULT:/);
          assert.deepEqual(tree(harmony), before);
          return command;
        });
        await check(`M2-A02_A03_PROCESS_EXIT_RECOVERY:${point}`, async () => {
          const before = tree(harmony);
          const command = await worker(`exit-${point}`, ['--trial', '--fault', point, '--exit']).completion;
          assert.equal(command.exitCode, 73);
          const recovery = await worker(`recover-${point}`).completion;
          assert.equal(recovery.exitCode, 0);
          assert.deepEqual(tree(harmony), before);
          return { command, recovery };
        });
      }
      await check('M2-A03_REAL_CONCURRENT_PROCESSES', async () => {
        const before = tree(harmony);
        const ready = path.join(evidence, `${pm}-lock-ready.json`);
        const release = path.join(evidence, `${pm}-lock-release.txt`);
        fs.rmSync(ready, { force: true });
        fs.rmSync(release, { force: true });
        const holder = worker('lock-holder', ['--trial', '--fault', 'after-generate', '--ready', ready, '--release', release]);
        try {
          const deadline = Date.now() + 90000;
          while (!fs.existsSync(ready)) {
            if (Date.now() > deadline) throw new Error('native holder did not reach generation fault');
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          const loser = await worker('lock-contender').completion;
          assert.notEqual(loser.exitCode, 0);
          assert.match(fs.readFileSync(path.join(evidence, loser.log), 'utf8'), /locked by running process/);
          assert.deepEqual(tree(harmony), before);
          write(release, 'release\n');
          const winner = await holder.completion;
          assert.equal(winner.exitCode, 0);
          assert.ok(fs.existsSync(path.join(harmony, 'm2-native-trial.txt')));
          const normalize = await worker('lock-normalize').completion;
          assert.equal(normalize.exitCode, 0);
          assert.deepEqual(tree(harmony), before);
          return { winner, loser };
        } finally {
          write(release, 'release\n');
          await holder.completion;
        }
      });
      await check('M2-A06_DEPENDENCY_SOURCE_AND_HAR_FULL_TREE_UNCHANGED', async () => {
        const after = tree(path.join(project, 'node_modules'));
        write(path.join(evidence, `${pm}-dependency-tree-after.json`), after);
        assert.deepEqual(after, dependenciesBefore);
        assert.deepEqual(tree(fixtureRoot), fixtureBefore);
        return { files: after.length, treeSHA256: hash(JSON.stringify(after)) };
      });
      snapshots.push({ pm, treeSHA256: treeHash(harmony) });
    }
    assert.equal(digest(path.join(runtime, 'release.json')), report.releaseSha256, 'runtime changed during consumption');
    report.completed = true;
    report.snapshots = snapshots;
    report.passed = report.results.length === managers.length && report.results.every(result => result.failures.length === 0);
  } catch (error) { report.error = error.stack; }
  finally { save(); }
  console.log(JSON.stringify({ report: reportFile, passed: report.passed, results: report.results.map(({ pm, checks, failures }) => ({ pm, checks: checks.length, failures })), error: report.error }, null, 2));
  if (!report.passed) process.exitCode = 1;
}
