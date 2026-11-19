import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { startCandidateRegistry } from './candidate-registry.mjs';
import { verifyRelease } from './verify-npm-release.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const script = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);
const option = (flag, fallback) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const digest = file => hash(fs.readFileSync(file));
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const fixtureName = '@expo-harmony/m3-author-fixture';
const conflictName = '@expo-harmony/m3-conflict-fixture';
const parentName = '@expo-harmony/m3-parent-fixture';
export function createConsumerConfig(pm, enabled) {
  return { name: 'M3 Author Fixture', slug: `m3-author-${pm}`, version: '1.0.0', icon: './assets/harmony.png',
    harmony: { bundleName: `com.example.m3${pm}` }, plugins: enabled ? [fixtureName] : [] };
}
const write = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
};
function tree(root, prefix = '') {
  return fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const absolute = path.join(root, entry.name);
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isSymbolicLink()) return [{ path: relative, link: fs.readlinkSync(absolute) }];
    if (entry.isDirectory()) return [{ path: relative, directory: true }, ...tree(absolute, relative)];
    return [{ path: relative, sha256: digest(absolute), mode: fs.statSync(absolute).mode & 0o777 }];
  });
}

if (args.includes('--worker')) {
  const project = path.resolve(option('--project'));
  const request = createRequire(path.join(project, 'package.json'));
  const expoRequest = createRequire(request.resolve('expo/package.json'));
  const api = expoRequest('expo-modules-autolinking/exports');
  const modules = await api.queryAutolinkingModulesFromProjectAsync(project, { platform: 'harmony' });
  write(option('--result'), modules);
} else if (args.includes('--help')) {
  console.log('node scripts/sdk54/test-m3-author-contract.mjs --runtime-dir DIR --release-sha256 SHA256 --work-dir DIR [--evidence-dir DIR] [--pm npm,pnpm]');
} else if (process.argv[1] && path.resolve(process.argv[1]) === script) {
  const work = path.resolve(option('--work-dir', fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-m3-consumers-'))));
  fs.mkdirSync(work, { recursive: true });
  const realWork = fs.realpathSync(work);
  const realRepository = fs.realpathSync(repository);
  assert.ok(realWork !== realRepository && !realWork.startsWith(realRepository + path.sep), 'M3 consumers must be outside repository');
  const runtime = path.resolve(option('--runtime-dir'));
  const releaseSha256 = option('--release-sha256');
  assert.equal(digest(path.join(runtime, 'release.json')), releaseSha256, 'Frozen candidate identity required');
  const managers = option('--pm', 'npm,pnpm').split(',');
  assert.ok(managers.length > 0 && managers.every(pm => ['npm', 'pnpm'].includes(pm)) && new Set(managers).size === managers.length);
  for (const pm of managers) assert.equal(fs.existsSync(path.join(work, pm)), false, 'M3 requires fresh consumer installations');
  const evidence = path.resolve(option('--evidence-dir', 'outputs/sdk54/ai-e2e/20261028-m3-author-contract/consumers'));
  fs.mkdirSync(evidence, { recursive: true });
  const reportFile = path.join(evidence, 'author-consumer-report.json');
  const report = { schemaVersion: 1, releaseSha256, runtime, work, results: [], passed: false, completed: false,
    device: { status: 'NOT_RUN', reason: 'Host consumption does not accept native calls or device lifecycle behavior' } };
  const save = () => write(reportFile, report);
  async function run(command, commandArgs, cwd, env, logName, timeout = 180000) {
    const log = path.join(evidence, logName);
    const handle = fs.openSync(log, 'w');
    try {
      return await new Promise(resolve => {
        const child = spawn(command, commandArgs, { cwd, env, stdio: ['ignore', handle, handle], detached: true });
        let timedOut = false;
        let settled = false;
        const timer = setTimeout(() => {
          timedOut = true;
          try { process.kill(-child.pid, 'SIGKILL'); } catch {}
        }, timeout);
        const finish = value => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ ...value, timedOut, log: logName, logSha256: digest(log) });
        };
        child.once('error', error => finish({ exitCode: null, error: error.message }));
        child.once('exit', (exitCode, signal) => finish({ exitCode, signal }));
      });
    } finally { fs.closeSync(handle); }
  }
  const assertSuccess = command => {
    assert.equal(command.timedOut, false, command.log);
    assert.equal(command.exitCode, 0, `Command failed: ${command.log}`);
  };
  let registry;
  try {
    assert.deepEqual(await verifyRelease(runtime), []);
    report.installRegression = await run(process.execPath, [path.join(repository, 'scripts/sdk54/test-m1-config.mjs'),
      '--runtime-dir', runtime, '--release-sha256', releaseSha256, '--work-dir', work,
      '--evidence-dir', path.join(evidence, 'm1-regression'), '--pm', managers.join(','),
      '--npm-cache', option('--npm-cache', '/private/tmp/sdk54-m0a-npm-cache')], repository, process.env, 'm1-regression.log', 1800000);
    save();
    assertSuccess(report.installRegression);
    const m1 = json(path.join(evidence, 'm1-regression/config-consumer-report.json'));
    assert.equal(m1.passed, true);
    assert.ok(m1.results.every(item => item.reusedWorkspace === false));
    const fixtureRoot = path.join(repository, 'packages/expo-modules-core/harmony/m3-fixture');
    report.pack = await run('npm', ['pack', '--json', '--pack-destination', evidence], fixtureRoot,
      { ...process.env, npm_config_cache: option('--npm-cache', '/private/tmp/sdk54-m0a-npm-cache') }, 'fixture-pack.log');
    assertSuccess(report.pack);
    const packed = json(path.join(evidence, report.pack.log))[0];
    const archive = path.join(evidence, packed.filename);
    const fixture = { name: packed.name, version: packed.version, archive, integrity: packed.integrity };
    assert.equal(fixture.name, fixtureName);
    assert.equal(fixture.integrity, 'sha512-' + crypto.createHash('sha512').update(fs.readFileSync(archive)).digest('base64'));
    report.fixture = { ...fixture, sha256: digest(archive) };
    const auxiliaryRoot = path.join(evidence, 'auxiliary-packages');
    assert.equal(fs.existsSync(auxiliaryRoot), false, 'Use a new evidence directory');
    const conflictRoot = path.join(auxiliaryRoot, 'conflict');
    fs.cpSync(fixtureRoot, conflictRoot, { recursive: true });
    const conflictManifest = json(path.join(conflictRoot, 'package.json'));
    conflictManifest.name = conflictName;
    write(path.join(conflictRoot, 'package.json'), conflictManifest);
    const conflictMetadata = json(path.join(conflictRoot, 'expo-module.config.json'));
    conflictMetadata.harmony.ets.importPath = `${conflictName}/harmony`;
    write(path.join(conflictRoot, 'expo-module.config.json'), conflictMetadata);
    const parentRoot = path.join(auxiliaryRoot, 'parent');
    write(path.join(parentRoot, 'package.json'), { name: parentName, version: '0.0.1', main: 'index.js',
      files: ['index.js'], dependencies: { [fixtureName]: fixture.version } });
    write(path.join(parentRoot, 'index.js'), 'module.exports = {};\n');
    const auxiliary = [];
    for (const [name, root] of [['conflict', conflictRoot], ['parent', parentRoot]]) {
      const command = await run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', evidence], root,
        { ...process.env, npm_config_cache: option('--npm-cache', '/private/tmp/sdk54-m0a-npm-cache') }, `${name}-pack.log`);
      assertSuccess(command);
      const packedAuxiliary = json(path.join(evidence, command.log))[0];
      const aux = { name: packedAuxiliary.name, version: packedAuxiliary.version,
        archive: path.join(evidence, packedAuxiliary.filename), integrity: packedAuxiliary.integrity };
      auxiliary.push(aux);
      report[name] = { ...aux, command, sha256: digest(aux.archive) };
    }
    const release = json(path.join(runtime, 'release.json'));
    assert.ok(release.packages.every(item => item.name !== fixtureName && item.installName !== fixtureName));
    registry = await startCandidateRegistry([...release.packages.map(item => ({ ...item, archive: path.join(runtime, item.file) })), fixture, ...auxiliary]);
    for (const pm of managers) {
      const project = path.join(work, pm);
      const result = { pm, project, checks: [], commands: [], failures: [] };
      report.results.push(result);
      const env = { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1', EXPO_NO_UPDATE_CHECK: '1', NODE_PATH: '',
        npm_config_registry: registry.registry, npm_config_cache: option('--npm-cache', '/private/tmp/sdk54-m0a-npm-cache'),
        npm_config_replace_registry_host: 'never', npm_config_fetch_timeout: '120000', npm_config_fetch_retries: '1' };
      const request = createRequire(path.join(project, 'package.json'));
      const cli = request.resolve('expo/bin/cli');
      const command = async (name, executable, commandArgs) => {
        const executed = await run(executable, commandArgs, project, env, `${pm}-${name}.log`, 300000);
        result.commands.push(executed);
        save();
        return executed;
      };
      const config = enabled => write(path.join(project, 'app.config.ts'), `export default ${JSON.stringify(createConsumerConfig(pm, enabled))};\n`);
      const install = async (name, enabled, extras = {}) => {
        const manifestFile = path.join(project, 'package.json');
        const manifest = json(manifestFile);
        if (enabled) manifest.dependencies[fixtureName] = fixture.version;
        else delete manifest.dependencies[fixtureName];
        for (const [key, value] of Object.entries(extras)) {
          if (value === null) delete manifest.dependencies[key];
          else manifest.dependencies[key] = value;
        }
        write(manifestFile, manifest);
        assertSuccess(await command(name, pm, pm === 'npm'
          ? ['install', '--prefer-offline', '--no-audit', '--no-fund']
          : ['install', '--prefer-offline', '--no-frozen-lockfile']));
      };
      const prebuild = name => command(name, process.execPath, [cli, 'prebuild', '--platform', 'harmony', '--no-install']);
      const query = async name => {
        const file = path.join(evidence, `${pm}-${name}-modules.json`);
        assertSuccess(await command(`${name}-query`, process.execPath, [script, '--worker', '--project', project, '--result', file]));
        return json(file);
      };
      const assertRegistered = (present, label, pluginPresent = present) => {
        const generated = ['entry/src/main/cpp/generated/ExpoModulesPackages.cpp',
          'entry/src/main/cpp/generated/expo-modules.cmake', 'entry/src/main/ets/generated/ExpoModulesPackages.ets'];
        const expected = ['AuthorFixturePackage', 'rnoh_m3_author_fixture', 'AuthorFixturePackage'];
        for (const [i, file] of generated.entries()) {
          const contents = fs.readFileSync(path.join(project, 'harmony', file), 'utf8');
          assert.equal(contents.includes(expected[i]), present, `${label}: ${file}`);
        }
        const module = json(path.join(project, 'harmony/entry/src/main/module.json5'));
        const marker = module.module.metadata?.some(item => item.name === 'expo.m3.author-fixture');
        assert.equal(Boolean(marker), pluginPresent, `${label}: plugin metadata`);
      };
      config(true);
      await install('install-fixture', true);
      write(path.join(project, 'App.tsx'), `export { FixtureProbe as default } from '${fixtureName}';\n`);
      const dependencyTree = tree(path.join(project, 'node_modules'));
      write(path.join(evidence, `${pm}-dependencies-installed.json`), dependencyTree);
      let modules = await query('installed');
      const descriptor = modules.find(item => item.packageName === fixtureName);
      assert.equal(descriptor?.cpp?.cmakeTarget, 'rnoh_m3_author_fixture');
      assertSuccess(await prebuild('first-prebuild'));
      assertRegistered(true, 'install');
      result.checks.push('UNLISTED_TGZ_REAL_INSTALL_AND_AUTOLINKING', 'PLUGIN_AND_NATIVE_REGISTRATION');
      const native = tree(path.join(project, 'harmony'));
      assertSuccess(await prebuild('identical-prebuild'));
      assert.deepEqual(tree(path.join(project, 'harmony')), native);
      assert.deepEqual(tree(path.join(project, 'node_modules')), dependencyTree);
      result.checks.push('IDEMPOTENT_GENERATION_AND_UNCHANGED_DEPENDENCIES');
      const fixturePackage = fs.realpathSync(path.join(project, 'node_modules', fixtureName));
      const metadata = json(path.join(fixturePackage, 'expo-module.config.json'));
      const sourceHeader = path.join(fixturePackage, metadata.harmony.cpp.cmakePath, metadata.harmony.cpp.header);
      const heldHeader = sourceHeader + '.m3-held';
      fs.renameSync(sourceHeader, heldHeader);
      try {
        const negative = await prebuild('missing-native-source');
        assert.equal(negative.timedOut, false);
        assert.notEqual(negative.exitCode, 0);
        assert.match(fs.readFileSync(path.join(evidence, negative.log), 'utf8'), /header|does not exist|missing/i);
        assert.deepEqual(tree(path.join(project, 'harmony')), native);
      } finally { fs.renameSync(heldHeader, sourceHeader); }
      assert.deepEqual(tree(path.join(project, 'node_modules')), dependencyTree);
      result.checks.push('MISSING_SOURCE_FAILS_WITH_OLD_TREE_PRESERVED');
      await install('install-conflict', true, { [conflictName]: '0.0.1' });
      const conflictDependencies = tree(path.join(project, 'node_modules'));
      const conflict = await prebuild('conflicting-packages');
      assert.equal(conflict.timedOut, false);
      assert.notEqual(conflict.exitCode, 0);
      const conflictLog = fs.readFileSync(path.join(evidence, conflict.log), 'utf8');
      assert.ok(conflictLog.includes(fixtureName) && conflictLog.includes(conflictName));
      assert.match(conflictLog, /Harmony conflict.*cpp\.(?:packageClass|cmakeTarget)/);
      assert.deepEqual(tree(path.join(project, 'harmony')), native);
      assert.deepEqual(tree(path.join(project, 'node_modules')), conflictDependencies);
      result.checks.push('REAL_INSTALLED_NATIVE_CONFLICT_REPORTS_BOTH_SOURCES_BEFORE_WRITES');
      await install('remove-conflict-add-parent', true, { [conflictName]: null, [parentName]: '0.0.1' });
      config(false);
      await install('remove-direct-retain-transitive', false);
      modules = await query('transitive');
      assert.equal(modules.filter(item => item.packageName === fixtureName).length, 1);
      assertSuccess(await prebuild('transitive-prebuild'));
      assertRegistered(true, 'transitive', false);
      result.checks.push('TRANSITIVE_REFERENCE_PRESERVES_NATIVE_MODULE_WITHOUT_PLUGIN');
      await install('remove-final-reference', false, { [parentName]: null });
      modules = await query('removed');
      assert.equal(modules.some(item => item.packageName === fixtureName), false);
      const removedDependencies = tree(path.join(project, 'node_modules'));
      assertSuccess(await prebuild('removed-prebuild'));
      assertRegistered(false, 'remove');
      const removedNative = tree(path.join(project, 'harmony'));
      result.checks.push('REMOVE_PLUGIN_AND_DEPENDENCY_CLEARS_GENERATED_REGISTRATION');
      config(true);
      const dangling = await prebuild('dangling-plugin');
      assert.equal(dangling.timedOut, false);
      assert.notEqual(dangling.exitCode, 0);
      assert.match(fs.readFileSync(path.join(evidence, dangling.log), 'utf8'), /Failed to resolve|Cannot find|not found/i);
      assert.deepEqual(tree(path.join(project, 'harmony')), removedNative);
      assert.deepEqual(tree(path.join(project, 'node_modules')), removedDependencies);
      result.checks.push('UNINSTALLED_PLUGIN_REJECTED_WITHOUT_NATIVE_OR_DEPENDENCY_WRITES');
      await install('reinstall-fixture', true);
      const reinstalledDependencies = tree(path.join(project, 'node_modules'));
      assertSuccess(await prebuild('reinstalled-prebuild'));
      assertRegistered(true, 'reinstall');
      assert.deepEqual(tree(path.join(project, 'node_modules')), reinstalledDependencies);
      modules = await query('reinstalled');
      assert.equal(modules.filter(item => item.packageName === fixtureName).length, 1);
      result.checks.push('REINSTALL_RESTORES_SINGLE_REGISTRATION_AND_PLUGIN');
      write(path.join(evidence, `${pm}-dependencies-final.json`), reinstalledDependencies);
      result.nativeTreeSHA256 = hash(JSON.stringify(tree(path.join(project, 'harmony'))));
      result.dependencyTreeSHA256 = hash(JSON.stringify(reinstalledDependencies));
      result.passed = true;
      save();
    }
    report.completed = true;
    report.passed = report.results.length === managers.length && report.results.every(item => item.passed);
  } catch (error) {
    report.error = error.stack;
    process.exitCode = 1;
  } finally {
    if (registry) await registry.close();
    save();
  }
  console.log(`M3 host consumer evidence: ${reportFile}`);
}
