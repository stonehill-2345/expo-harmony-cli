import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { extract } from 'tar';
import { startCandidateRegistry } from './candidate-registry.mjs';
import { assertExternalConsumerWorkspace } from './creation-workspace.mjs';
import { verifyRelease } from './verify-npm-release.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const repository = process.cwd();
const directory = path.resolve(option('--directory', 'outputs/sdk54/ai-e2e/20261027-m1-config'));
const evidence = path.resolve(option('--evidence-dir', path.join(directory, 'consumers')));
const runtimeDirectory = path.resolve(option('--runtime-dir', path.join(directory, 'runtime')));
const releaseSha256 = option('--release-sha256');
const work = option('--work-dir')
  ? path.resolve(option('--work-dir'))
  : fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-m1-consumers-'));
const timeout = Number(option('--timeout', '900000'));
const managers = option('--pm', 'npm,pnpm').split(',');
assert.ok(
  managers.every((pm) => ['npm', 'pnpm'].includes(pm)) && managers.length === new Set(managers).size
);
assert.ok(Number.isInteger(timeout) && timeout >= 1000 && timeout <= 900000);
assertExternalConsumerWorkspace(work, repository);
fs.mkdirSync(work, { recursive: true });
fs.mkdirSync(evidence, { recursive: true });
const digest = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
// npm pacote renames these archived ignore files during extraction; their bytes must still match.
const npmIgnorePaths = new Set([
  'expo-modules-autolinking/templates/harmony/dependencies/.gitignore',
  'expo-modules-autolinking/templates/harmony/entry/src/main/cpp/generated/.gitignore',
  'expo-modules-autolinking/templates/harmony/entry/src/main/ets/generated/.gitignore',
  'expo-modules-autolinking/templates/harmony/entry/src/main/resources/rawfile/.gitignore',
  'expo-modules-autolinking/templates/harmony/expo-modules/.gitignore',
  'expo-modules-core/harmony/example/host/harmony/entry/src/main/ets/codegen/.gitignore',
]);
const reportFile = path.join(evidence, 'config-consumer-report.json');
const report = {
  schemaVersion: 1,
  work,
  runtimeDirectory,
  packageManagers: managers,
  scope:
    'M1 configuration and external third-party plugin; default built-in plugins remain M4/M7 obligations',
  checks: [],
  artifacts: [],
  results: [],
  completed: false,
  passed: false,
};
const save = () => fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
function check(result, id, action) {
  try {
    const detail = action();
    result.checks.push({ id, passed: true, ...(detail === undefined ? {} : { detail }) });
  } catch (error) {
    result.checks.push({ id, passed: false, error: error.message });
    result.failures.push(`${id}: ${error.message}`);
  }
}

async function run(command, commandArgs, cwd, env, name, commandTimeout = timeout) {
  const logFile = path.join(evidence, name);
  const log = fs.openSync(logFile, 'w');
  const result = await new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
      cwd,
      env,
      stdio: ['ignore', log, log],
      detached: true,
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {}
    }, commandTimeout);
    child.once('error', (error) => {
      clearTimeout(timer);
      resolve({ exitCode: null, error: error.message, timedOut });
    });
    child.once('exit', (exitCode, signal) => {
      clearTimeout(timer);
      resolve({ exitCode, signal, timedOut });
    });
  });
  fs.closeSync(log);
  return { command: [command, ...commandArgs], ...result, log: name, logSha256: digest(logFile) };
}

function tree(root, prefix = '') {
  const files = [];
  for (const item of fs
    .readdirSync(root, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.posix.join(prefix, item.name);
    const absolute = path.join(root, item.name);
    if (item.isDirectory()) files.push(...tree(absolute, relative));
    else if (item.isSymbolicLink()) files.push({ path: relative, link: fs.readlinkSync(absolute) });
    else files.push({ path: relative, sha256: digest(absolute) });
  }
  return files;
}

const configSource = `const fs = require('node:fs');
const path = require('node:path');
export default () => {
  fs.appendFileSync(path.join(__dirname, 'evaluations.log'), process.env.M1_CASE + '\\n');
  const name = 'sdk54-m1-harmony-plugin-fixture';
  const scenario = process.env.M1_CASE || 'positive';
  let plugins = [[name, { case: scenario }], name + '/android-only.js'];
  if (scenario === 'missing') plugins = ['sdk54-m1-missing-plugin'];
  if (scenario === 'unsupported') plugins = [name + '/unsupported.js'];
  if (scenario === 'invalid-export') plugins = [name + '/invalid-export.js'];
  if (scenario === 'duplicate') plugins = [name, name];
  if (scenario === 'duplicate-alias') plugins = [name, name + '/app.plugin.js'];
  if (scenario === 'empty') plugins = [name, name + '/empty.js'];
  return {
    name: 'Universal fallback', slug: 'm1-consumer', version: '5.4.1', icon: './assets/universal.png',
    splash: { image: './assets/universal.png', backgroundColor: '#FF0000' },
    harmony: { name: process.env.M1_APP_NAME, bundleName: process.env.M1_BUNDLE_NAME, version: scenario === 'invalid-version' ? 'release' : '7.3.2', versionCode: 5401,
      icon: './assets/harmony.png', foregroundImage: './assets/foreground.png',
      splash: { image: './assets/splash.png', backgroundColor: '#112233' },
      scheme: ['m1demo'], querySchemes: ['https', 'custom'], orientation: 'landscape', userInterfaceStyle: 'dark',
      permissions: [{ name: 'ohos.permission.CAMERA', reason: '$string:app_name', usedScene: { abilities: ['EntryAbility'], when: 'inuse' } }],
      extensions: { app: { distributedNotificationEnabled: false }, module: { description: '$string:module_desc' } }
    },
    extra: { environmentValue: process.env.M1_APP_NAME },
    ios: { config: { hidden: 'ios-secret' } }, android: { config: { hidden: 'android-secret' } },
    updates: { codeSigningCertificate: 'private.pem', codeSigningMetadata: { keyid: 'secret' }, requestHeaders: { Authorization: 'secret' } },
    hooks: { privateHook: 'secret' }, plugins
  };
};
`;

function prepareProject(project, pm, runtime) {
  fs.mkdirSync(project, { recursive: true });
  const template = path.join(repository, 'templates/expo-template-blank-typescript');
  const manifest = readJSON(path.join(template, 'package.json'));
  const dependencies = {
    ...manifest.dependencies,
    // The full candidate set includes Router; match its React DOM peer to SDK54's React version.
    'react-dom': '19.1.1',
    'sdk54-m1-harmony-plugin-fixture': '1.0.0',
  };
  for (const item of runtime.packages)
    dependencies[item.installName] = `npm:${item.name}@${item.version}`;
  const pkg = {
    name: `m1-config-${pm}`,
    version: '1.0.0',
    private: true,
    main: 'index.ts',
    dependencies,
    devDependencies: {
      ...manifest.devDependencies,
      '@types/node': '22.14.0',
      '@types/xcode': '3.0.0',
    },
  };
  fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  fs.writeFileSync(path.join(project, 'app.config.ts'), configSource);
  for (const file of ['index.ts', 'App.tsx'])
    fs.copyFileSync(path.join(template, file), path.join(project, file));
  const assets = path.join(project, 'assets');
  fs.mkdirSync(assets, { recursive: true });
  for (const [original, destination] of [
    ['favicon.png', 'universal.png'],
    ['icon.png', 'harmony.png'],
    ['adaptive-icon.png', 'foreground.png'],
    ['splash-icon.png', 'splash.png'],
  ]) {
    fs.copyFileSync(path.join(template, 'assets', original), path.join(assets, destination));
  }
  fs.writeFileSync(
    path.join(project, 'contract.ts'),
    `import { HarmonyExpoConfig, defineHarmonyPlugin, withHarmonyModule } from 'expo/harmony-config';
const config: HarmonyExpoConfig = { name: 'Types', slug: 'types', harmony: { orientation: 'landscape', extensions: { app: { nested: [true, null] } } } };
defineHarmonyPlugin((exp: HarmonyExpoConfig) => withHarmonyModule(exp, async mod => { mod.modResults.custom = true; return mod; }))(config);
// @ts-expect-error invalid enum must be rejected
const invalid: HarmonyExpoConfig = { name: 'Types', slug: 'types', harmony: { orientation: 'up' } };
`
  );
}

function assertEvaluation(project, scenario) {
  assert.deepEqual(
    fs.readFileSync(path.join(project, 'evaluations.log'), 'utf8').trim().split('\n'),
    [scenario],
    'Dynamic configuration must be evaluated exactly once'
  );
  assert.ok(!fs.existsSync(path.join(project, 'app.json')));
}

function assertNative(project, pm, result) {
  const harmony = path.join(project, 'harmony');
  const app = readJSON(path.join(harmony, 'AppScope/app.json5')).app;
  const module = readJSON(path.join(harmony, 'entry/src/main/module.json5')).module;
  assert.equal(app.bundleName, `com.example.m1${pm}`);
  assert.equal(app.versionName, '7.3.2');
  assert.equal(app.versionCode, 5401);
  assert.equal(app.vendor, 'm1-third-party');
  assert.equal(
    app.colorMode,
    undefined,
    'App manifest must not contain the unsupported colorMode field'
  );
  const themeSources = tree(path.join(harmony, 'entry/src/main/ets'))
    .filter((item) => item.path.endsWith('.ets'))
    .map((item) => fs.readFileSync(path.join(harmony, 'entry/src/main/ets', item.path), 'utf8'))
    .join('\n');
  assert.match(
    themeSources,
    /setColorMode\([^)]*COLOR_MODE_DARK\)/,
    'Dark theme must call the native system color mode API'
  );
  const abilitySource = fs.readFileSync(
    path.join(harmony, 'entry/src/main/ets/entryability/EntryAbility.ets'),
    'utf8'
  );
  assert.match(
    abilitySource,
    /import\s*\{\s*applyExpoAppConfiguration\s*\}\s*from\s*['"]\.\.\/generated\/ExpoAppConfiguration['"]/
  );
  assert.match(abilitySource, /applyExpoAppConfiguration\(this\.context\);/);
  assert.equal(app.distributedNotificationEnabled, false);
  assert.equal(module.description, '$string:module_desc');
  assert.deepEqual(module.querySchemes, ['https', 'custom']);
  assert.deepEqual(module.metadata, [{ name: 'm1.fixture', value: 'applied' }]);
  assert.deepEqual(
    module.requestPermissions.find((p) => p.name === 'ohos.permission.CAMERA'),
    {
      name: 'ohos.permission.CAMERA',
      reason: '$string:app_name',
      usedScene: { abilities: ['EntryAbility'], when: 'inuse' },
    }
  );
  const ability = module.abilities.find((a) => a.name === 'EntryAbility');
  assert.equal(ability.orientation, 'landscape');
  assert.ok(ability.skills.some((skill) => skill.uris?.some((uri) => uri.scheme === 'm1demo')));
  for (const file of [
    'AppScope/resources/base/element/string.json',
    'entry/src/main/resources/base/element/string.json',
  ]) {
    const strings = readJSON(path.join(harmony, file)).string;
    assert.ok(
      strings
        .filter((item) =>
          ['app_name', 'module_desc', 'EntryAbility_desc', 'EntryAbility_label'].includes(item.name)
        )
        .every((item) => item.value === `M1 Harmony ${pm}`)
    );
    assert.ok(
      strings.some((item) => ['app_name', 'EntryAbility_label'].includes(item.name)),
      'Expected app label resource is missing'
    );
  }
  const constants = path.join(harmony, 'entry/src/main/resources/rawfile/app.config');
  assert.equal(
    fs.readFileSync(constants, 'utf8'),
    fs.readFileSync(path.join(project, 'expected-public.json'), 'utf8'),
    'Constants must be the exact public snapshot bytes'
  );
  const archivedSnapshot = path.join(evidence, `${pm}-expected-public.json`);
  fs.copyFileSync(path.join(project, 'expected-public.json'), archivedSnapshot);
  result.publicSnapshot = { file: path.basename(archivedSnapshot), sha256: digest(archivedSnapshot) };
  const snapshot = readJSON(constants);
  assert.equal(snapshot.harmony.name, `M1 Harmony ${pm}`);
  assert.equal(snapshot.extra.environmentValue, `M1 Harmony ${pm}`);
  for (const key of ['mods', '_internal', 'hooks']) assert.equal(snapshot[key], undefined);
  assert.equal(snapshot.ios.config, undefined);
  assert.equal(snapshot.android.config, undefined);
  assert.deepEqual(snapshot.updates, {});
  for (const [source, target] of [
    ['harmony.png', 'AppScope/resources/base/media/app_icon.png'],
    ['harmony.png', 'entry/src/main/resources/base/media/background.png'],
    ['foreground.png', 'entry/src/main/resources/base/media/foreground.png'],
    ['splash.png', 'entry/src/main/resources/base/media/startIcon.png'],
  ]) {
    assert.equal(digest(path.join(project, 'assets', source)), digest(path.join(harmony, target)));
  }
  const colors = readJSON(
    path.join(harmony, 'entry/src/main/resources/base/element/color.json')
  ).color;
  assert.equal(colors.find((item) => item.name === 'start_window_background').value, '#112233');
  assert.deepEqual(
    fs.readFileSync(path.join(project, 'mod-trace.log'), 'utf8').trim().split('\n').sort(),
    ['harmony.app', 'harmony.module']
  );
  const outputFiles = [
    'AppScope/app.json5',
    'entry/src/main/module.json5',
    'entry/src/main/resources/rawfile/app.config',
    'AppScope/resources/base/media/app_icon.png',
    'entry/src/main/resources/base/media/foreground.png',
    'entry/src/main/resources/base/media/startIcon.png',
  ];
  result.artifacts = outputFiles.map((file) => ({
    path: file,
    sha256: digest(path.join(harmony, file)),
  }));
}

let registry;
try {
  if (releaseSha256)
    assert.equal(
      digest(path.join(runtimeDirectory, 'release.json')),
      releaseSha256,
      'Frozen candidate manifest changed'
    );
  report.releaseSha256 = digest(path.join(runtimeDirectory, 'release.json'));
  assert.deepEqual(
    await verifyRelease(runtimeDirectory),
    [],
    'Runtime candidate verification failed'
  );
  const runtime = readJSON(path.join(runtimeDirectory, 'release.json'));
  assert.equal(runtime.packages.length, 15);
  const packages = runtime.packages.map((item) => ({
    ...item,
    archive: path.join(runtimeDirectory, item.file),
  }));
  report.artifacts.push(
    ...packages.map((item) => ({
      name: item.name,
      installName: item.installName,
      version: item.version,
      integrity: item.integrity,
      sha256: digest(item.archive),
    }))
  );
  const packEnvironment = {
    ...process.env,
    NODE_PATH: '',
    npm_config_registry: 'https://registry.npmjs.org',
    npm_config_cache: option('--npm-cache', '/private/tmp/sdk54-m0a-npm-cache'),
  };
  const pack = await run(
    'npm',
    ['pack', '--json', '--pack-destination', evidence],
    path.join(repository, 'scripts/sdk54/fixtures/m1-harmony-plugin'),
    packEnvironment,
    'plugin-pack.log',
    60000
  );
  report.pluginPack = pack;
  assert.equal(pack.exitCode, 0, 'Third-party fixture packing failed');
  const packed = JSON.parse(fs.readFileSync(path.join(evidence, pack.log), 'utf8'))[0];
  const pluginArchive = path.join(evidence, packed.filename);
  const plugin = {
    name: 'sdk54-m1-harmony-plugin-fixture',
    version: '1.0.0',
    archive: pluginArchive,
    integrity: `sha512-${createHash('sha512')
      .update(fs.readFileSync(pluginArchive))
      .digest('base64')}`,
  };
  report.artifacts.push({
    name: plugin.name,
    version: plugin.version,
    integrity: plugin.integrity,
    sha256: digest(pluginArchive),
  });
  // npm repeats metadata requests during peer resolution. Cache only successful immutable response bytes.
  const upstream = new Map();
  const npmCache = option('--npm-cache', '/private/tmp/sdk54-m0a-npm-cache');
  const npmExecutable = fs.realpathSync(
    path.join(path.dirname(process.execPath), process.platform === 'win32' ? 'npm.cmd' : 'npm')
  );
  const npmRequire = createRequire(npmExecutable);
  const cacache = npmRequire('cacache');
  const cacheRoot = path.join(npmCache, '_cacache');
  const cachedMetadata = [];
  const newest = new Map();
  for (const item of Object.values(await cacache.ls(cacheRoot))) {
    const rawURL = item.metadata?.url;
    if (!rawURL) continue;
    const url = new URL(rawURL);
    if (
      !(
        url.origin === 'https://registry.npmjs.org' ||
        /^http:\/\/127\.0\.0\.1:\d+$/.test(url.origin)
      )
    )
      continue;
    const name = decodeURIComponent(url.pathname.slice(1));
    if (
      name.startsWith('@expo-oh/') ||
      name.startsWith('tarballs/') ||
      name.startsWith('sdk54-m1-') ||
      name.endsWith('.tgz')
    )
      continue;
    const key = `https://registry.npmjs.org${url.pathname}${url.search}`;
    if (!newest.has(key) || newest.get(key).time < item.time) newest.set(key, item);
  }
  for (const [url, item] of newest) {
    try {
      const cached = await cacache.get(cacheRoot, item.key);
      const parsed = JSON.parse(cached.data);
      if (!parsed.versions || parsed.name !== decodeURIComponent(new URL(url).pathname.slice(1)))
        continue;
      upstream.set(url, {
        bytes: cached.data,
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
      cachedMetadata.push({
        url,
        source: item.metadata.url,
        integrity: item.integrity,
        sha256: createHash('sha256').update(cached.data).digest('hex'),
      });
    } catch {
      /* A cache miss or damaged entry falls back to the public registry. */
    }
  }
  report.metadataCache = {
    directory: npmCache,
    entries: cachedMetadata.length,
    excludesAllCandidateMetadata: true,
  };
  fs.writeFileSync(
    path.join(evidence, 'public-metadata-cache.json'),
    JSON.stringify(cachedMetadata, null, 2) + '\n'
  );
  report.metadataCache.sha256 = digest(path.join(evidence, 'public-metadata-cache.json'));
  registry = await startCandidateRegistry([...packages, plugin], {
    fetchUpstream: async (url, options) => {
      let response = upstream.get(url);
      if (!response) {
        const fetched = await fetch(url, options);
        const bytes = Buffer.from(await fetched.arrayBuffer());
        response = {
          bytes,
          status: fetched.status,
          headers: {
            'content-type': fetched.headers.get('content-type') ?? 'application/octet-stream',
          },
        };
        if (fetched.ok) upstream.set(url, response);
      }
      return new Response(response.bytes, { status: response.status, headers: response.headers });
    },
  });
  for (const pm of managers) {
    const project = path.join(work, pm);
    const reusedWorkspace = fs.existsSync(path.join(project, 'node_modules'));
    prepareProject(project, pm, runtime);
    for (const file of ['evaluations.log', 'mod-trace.log', 'expected-public.json'])
      fs.rmSync(path.join(project, file), { force: true });
    const result = {
      pm,
      project,
      reusedWorkspace,
      installMode: reusedWorkspace
        ? 'REUSED_INSTALLED_WORKSPACE_WITH_REAL_INSTALL'
        : 'FRESH_WORKSPACE_WITH_VERIFIED_PACKAGE_MANAGER_CACHE',
      checks: [],
      failures: [],
      negatives: [],
      npmIgnoreMappings: [],
    };
    if (args.includes('--refresh-cli') && pm === 'npm' && reusedWorkspace) {
      const oldManifest = path.join(project, 'node_modules/@expo/cli/package.json');
      result.previousCliManifestSha256 = fs.existsSync(oldManifest) ? digest(oldManifest) : null;
      fs.rmSync(path.join(project, 'node_modules/@expo/cli'), { recursive: true, force: true });
      for (const file of ['package-lock.json', 'node_modules/.package-lock.json'])
        fs.rmSync(path.join(project, file), { force: true });
      result.cliRemovedBeforeInstall = true;
    }
    report.results.push(result);
    save();
    const env = {
      ...process.env,
      CI: '1',
      EXPO_NO_TELEMETRY: '1',
      EXPO_NO_UPDATE_CHECK: '1',
      NODE_PATH: '',
      npm_config_registry: registry.registry,
      npm_config_cache: option('--npm-cache', '/private/tmp/sdk54-m0a-npm-cache'),
      npm_config_fetch_timeout: '120000',
      npm_config_fetch_retries: '2',
      npm_config_maxsockets: '12',
      npm_config_replace_registry_host: 'never',
      M1_APP_NAME: `M1 Harmony ${pm}`,
      M1_BUNDLE_NAME: `com.example.m1${pm}`,
      M1_CASE: 'positive',
      M1_EXPECTED_SNAPSHOT: path.join(project, 'expected-public.json'),
      M1_MOD_TRACE: path.join(project, 'mod-trace.log'),
    };
    result.install = await run(
      pm,
      pm === 'npm'
        ? ['install', '--prefer-offline', '--no-audit', '--no-fund']
        : ['install', '--prefer-offline', '--no-frozen-lockfile'],
      project,
      env,
      `${pm}-install.log`
    );
    check(result, 'REAL_COMPLETE_INSTALL', () => assert.equal(result.install.exitCode, 0));
    save();
    if (result.failures.length) {
      console.log(JSON.stringify({ pm, install: result.install, failures: result.failures }));
      continue;
    }
    const consumerRequire = createRequire(path.join(project, 'package.json'));
    check(result, 'CANDIDATE_IDENTITIES_NO_SOURCE_LINKS', () => {
      for (const item of packages) {
        const installed = path.join(project, 'node_modules', item.installName, 'package.json');
        assert.ok(!fs.realpathSync(installed).startsWith(fs.realpathSync(repository) + path.sep));
        const manifest = readJSON(installed);
        assert.equal(manifest.name, item.name);
        assert.equal(manifest.version, item.version);
      }
      assert.equal(
        consumerRequire('sdk54-m1-harmony-plugin-fixture/package.json').version,
        '1.0.0'
      );
      const pluginRequire = createRequire(
        consumerRequire.resolve('sdk54-m1-harmony-plugin-fixture/package.json')
      );
      assert.equal(pluginRequire('@expo/config-plugins/package.json').version, '54.0.5');
      return { candidates: packages.length };
    });
    let fileCount = 0;
    for (const item of packages) {
      const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-m1-archive-'));
      try {
        await extract({ file: item.archive, cwd: scratch, strict: true });
        check(result, `CANDIDATE_BYTES:${item.installName}`, () => {
          for (const original of tree(path.join(scratch, 'package'))) {
            let installed = path.join(project, 'node_modules', item.installName, original.path);
            if (
              pm === 'npm' &&
              !fs.existsSync(installed) &&
              npmIgnorePaths.has(`${item.installName}/${original.path}`)
            ) {
              installed = installed.replace(/\.gitignore$/, '.npmignore');
              assert.equal(digest(installed), original.sha256);
              result.npmIgnoreMappings.push({
                package: item.installName,
                originalPath: original.path,
                installedPath: original.path.replace(/\.gitignore$/, '.npmignore'),
                sha256: original.sha256,
              });
            }
            if (original.link) assert.equal(fs.readlinkSync(installed), original.link);
            else
              assert.equal(
                digest(installed),
                original.sha256,
                `Installed byte drift: ${item.installName}/${original.path}`
              );
            fileCount++;
          }
        });
      } finally {
        fs.rmSync(scratch, { recursive: true, force: true });
      }
    }
    result.candidateFilesChecked = fileCount;
    result.types = await run(
      process.execPath,
      [
        consumerRequire.resolve('typescript/bin/tsc'),
        '--noEmit',
        '--strict',
        '--esModuleInterop',
        '--moduleResolution',
        'node',
        '--target',
        'ES2022',
        '--types',
        'node',
        'contract.ts',
      ],
      project,
      env,
      `${pm}-types.log`,
      60000
    );
    check(result, 'STRICT_PUBLIC_TYPES_NO_SKIP_LIB_CHECK', () =>
      assert.equal(result.types.exitCode, 0)
    );
    const cli = consumerRequire.resolve('expo/bin/cli');
    result.prebuild = await run(
      process.execPath,
      [cli, 'prebuild', '--platform', 'harmony', '--no-install', '--clean'],
      project,
      env,
      `${pm}-positive-prebuild.log`,
      180000
    );
    check(result, 'PREBUILD_SUCCESS', () => assert.equal(result.prebuild.exitCode, 0));
    check(result, 'DYNAMIC_TYPESCRIPT_ENVIRONMENT_EVALUATED_ONCE', () =>
      assertEvaluation(project, 'positive')
    );
    check(result, 'PLUGIN_NATIVE_CONSTANTS_MEDIA_OUTPUTS', () => assertNative(project, pm, result));
    save();
    if (!result.failures.length) {
      const sentinel = path.join(project, 'harmony', 'm1-preserve-sentinel.txt');
      fs.writeFileSync(sentinel, `M1 ${pm} must survive failed --clean\n`);
      const before = tree(path.join(project, 'harmony'));
      for (const [scenario, pattern] of [
        ['missing', /Failed to resolve|Cannot find|not found/i],
        ['unsupported', /declare Harmony|unsupported/i],
        ['invalid-export', /valid config plugin|does not contain|not a function|invalid/i],
        ['duplicate', /Duplicate Harmony plugin/],
        ['duplicate-alias', /Duplicate Harmony plugin/],
        ['failure', /M1_FIXTURE_MOD_FAILURE/],
        ['empty', /empty Harmony implementation/],
        ['identity-drift', /must match the resolved configuration snapshot/],
        ['non-json', /Invalid native JSON/],
        ['invalid-version', /version|schema/i],
      ]) {
        fs.rmSync(path.join(project, 'evaluations.log'), { force: true });
        fs.rmSync(path.join(project, 'mod-trace.log'), { force: true });
        const command = await run(
          process.execPath,
          [cli, 'prebuild', '--platform', 'harmony', '--no-install', '--clean'],
          project,
          { ...env, M1_CASE: scenario },
          `${pm}-negative-${scenario}.log`,
          90000
        );
        const negative = { scenario, command, checks: [], failures: [] };
        result.negatives.push(negative);
        check(negative, 'CLI_FAILS_WITH_TARGET_DIAGNOSTIC', () => {
          assert.notEqual(command.exitCode, 0);
          assert.match(fs.readFileSync(path.join(evidence, command.log), 'utf8'), pattern);
        });
        check(negative, 'FAILED_CLEAN_PRESERVES_OLD_NATIVE_TREE_AND_SENTINEL', () =>
          assert.deepEqual(tree(path.join(project, 'harmony')), before)
        );
        check(negative, 'DYNAMIC_CONFIG_EVALUATED_ONCE', () => assertEvaluation(project, scenario));
        if (negative.failures.length)
          result.failures.push(...negative.failures.map((failure) => `${scenario}: ${failure}`));
        save();
      }
    }
    console.log(
      JSON.stringify({
        pm,
        checks: result.checks.length,
        failures: result.failures,
        negativeCases: result.negatives.length,
      })
    );
  }
  report.completed = true;
  report.fullPackageManagerMatrix = managers.length === 2;
  report.passed =
    report.results.length === managers.length &&
    report.results.every(
      (result) =>
        !result.failures.length &&
        result.negatives.length === 10 &&
        result.negatives.every((item) => !item.failures.length)
    );
} catch (error) {
  report.error = error.stack;
  process.exitCode = 1;
} finally {
  if (registry) await registry.close();
  save();
}
console.log(`M1 consumer evidence: ${reportFile}`);
if (!report.passed) process.exitCode = 1;
