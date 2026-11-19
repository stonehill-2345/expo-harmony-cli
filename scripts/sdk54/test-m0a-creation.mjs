import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { extract } from 'tar';
import { startCandidateRegistry } from './candidate-registry.mjs';
import { CREATION_TEMPLATES, validateCreationTemplate } from './creation-catalog.mjs';
import { verifyRelease } from './verify-npm-release.mjs';
import { assertExternalConsumerWorkspace } from './creation-workspace.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const directory = path.resolve(option('--directory', 'outputs/sdk54/ai-e2e/20261027-m0a-creation'));
const evidenceDir = path.resolve(option('--evidence-dir', directory));
const commandTimeout = Number(option('--timeout', '600000'));
assert.ok(Number.isInteger(commandTimeout) && commandTimeout >= 1000 && commandTimeout <= 900000, 'Invalid command timeout');
const work = option('--work-dir') ? path.resolve(option('--work-dir')) : fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-m0a-consumers-'));
assertExternalConsumerWorkspace(work, process.cwd());
fs.mkdirSync(work, { recursive: true });
fs.mkdirSync(evidenceDir, { recursive: true });
// The upstream creator skips automatic initial commits when already inside a Git tree.
execFileSync('git', ['init', '-q', work]);
const runtimeDir = path.join(directory, 'runtime');
assert.deepEqual(await verifyRelease(runtimeDir), [], 'Runtime candidate verification failed');
const runtime = JSON.parse(fs.readFileSync(path.join(runtimeDir, 'release.json')));
const creator = JSON.parse(fs.readFileSync(path.join(directory, 'creator/creator.json')));
const templates = JSON.parse(fs.readFileSync(path.join(directory, 'templates/templates.json')));
const packages = [
  ...runtime.packages.map(item => ({ ...item, archive: path.join(runtimeDir, item.file) })),
  { ...creator, archive: path.join(directory, 'creator', creator.file) },
  ...templates.packages.map(item => ({ ...item, archive: path.join(directory, 'templates', item.file) })),
];
const registry = await startCandidateRegistry(packages);
const creatorDir = path.join(work, 'creator');
fs.mkdirSync(creatorDir, { recursive: true });
await extract({ file: packages.find(item => item.name === creator.name).archive, cwd: creatorDir });
const cli = path.join(creatorDir, 'package/build/index.js');
const report = { schemaVersion: 1, sourceRevision: templates.sourceRevision, work, artifacts: packages.map(({ name, version, integrity }) => ({ name, version, integrity })), results: [], completed: false, passed: false };
const reportFile = path.join(evidenceDir, 'creation-consumer-report.json');
const save = () => fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function run(command, commandArgs, cwd, env, logName, timeout = commandTimeout) {
  const logPath = path.join(evidenceDir, logName);
  const log = fs.openSync(logPath, 'w');
  const result = await new Promise(resolve => {
    const child = spawn(command, commandArgs, { cwd, env, stdio: ['ignore', log, log], detached: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    }, timeout);
    child.once('error', error => { clearTimeout(timer); resolve({ exitCode: null, error: error.message, timedOut }); });
    child.once('exit', (exitCode, signal) => { clearTimeout(timer); resolve({ exitCode, signal, timedOut }); });
  });
  fs.closeSync(log);
  return { command: [command, ...commandArgs], ...result, log: logName, logSha256: digest(logPath) };
}

try {
  for (const template of ['blank-typescript', 'default']) for (const pm of ['npm', 'pnpm']) {
    const id = `${template}-${pm}`;
    const env = { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1', EXPO_NO_UPDATE_CHECK: '1',
      npm_config_registry: registry.registry, npm_config_cache: path.join(work, 'npm-cache'),
      npm_config_user_agent: `${pm}/${execFileSync(pm, ['--version'], { encoding: 'utf8' }).trim()}`,
      npm_config_fetch_timeout: '120000', npm_config_fetch_retries: '2',
      npm_config_replace_registry_host: 'never', npm_config_maxsockets: '12', NODE_PATH: '',
    };
    const create = await run(process.execPath, [cli, id, '--yes', ...(template === 'default' ? [] : ['--template', template])], work, env, `consumer-${id}-create.log`);
    const projectRoot = path.join(work, id);
    const result = { id, template, pm, create, checks: [], failures: [] };
    report.results.push(result);
    if (create.exitCode !== 0) result.failures.push('Real creator returned nonzero during creation or installation');
    try {
      const source = JSON.parse(fs.readFileSync(path.join('templates', `expo-template-${template}`, 'package.json')));
      validateCreationTemplate(source, template);
      const actual = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json')));
      assert.deepEqual(actual.dependencies, source.dependencies, 'Creator rewrote template dependencies');
      assert.deepEqual(actual.devDependencies, source.devDependencies, 'Creator rewrote template devDependencies');
      assert.equal(actual.name, id);
      for (const forbidden of ['harmony', '.expo-harmony', 'patches', 'index.harmony.js', 'metro.config.js'])
        assert.ok(!fs.existsSync(path.join(projectRoot, forbidden)), `Unexpected post-create injection: ${forbidden}`);
      const app = template === 'default' ? 'app/(tabs)/index.tsx' : 'App.tsx';
      assert.equal(digest(path.join(projectRoot, app)), digest(path.join('templates', `expo-template-${template}`, app)));
      result.checks.push('TEMPLATE_DEPENDENCIES_AND_APP_BYTES_UNCHANGED_NO_INJECTION');
      if (create.exitCode === 0) {
        const require = createRequire(path.join(projectRoot, 'package.json'));
        for (const [name, spec] of Object.entries(actual.dependencies)) {
          if (!spec.startsWith('npm:@expo-oh/')) continue;
          const installedPath = path.join(projectRoot, 'node_modules', name, 'package.json');
          assert.ok(!fs.realpathSync(installedPath).startsWith(process.cwd() + path.sep), `Workspace link: ${name}`);
          const installed = JSON.parse(fs.readFileSync(installedPath));
          const item = runtime.packages.find(item => spec === `npm:${item.name}@${item.version}`);
          assert.ok(item, `Unknown runtime candidate: ${spec}`);
          assert.equal(installed.name, item.name);
          assert.equal(installed.version, item.version);
        }
        assert.equal(require('@expo/metro-config/build/harmonyProject').isHarmonyProject(projectRoot), true);
        result.checks.push('REAL_INSTALLED_RELEASE_IDENTITIES_NO_STATE');
        if (template === 'blank-typescript') {
          result.prebuild = await run(process.execPath, [require.resolve('expo/bin/cli'), 'prebuild', '--platform', 'harmony', '--no-install'], projectRoot, env, `consumer-${id}-prebuild.log`);
        }
      }
    } catch (error) { result.failures.push(error.message); }
    save();
    console.log(JSON.stringify({ id, createExitCode: create.exitCode, prebuildExitCode: result.prebuild?.exitCode, checks: result.checks, failures: result.failures }));
  }
  report.completed = true;
  report.passed = report.results.length === 4 && report.results.every(item => item.create.exitCode === 0 && !item.failures.length);
  save();
} finally { await registry.close(); }
console.log(`Consumer evidence: ${reportFile}`);
if (!report.passed) process.exitCode = 1;
