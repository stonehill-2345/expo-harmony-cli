import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '../../..');
const packageRoot = path.join(root, 'packages/create-expo');

function loadSource(file, mocks = {}) {
  const absolute = path.join(packageRoot, file);
  const source = ts.transpileModule(fs.readFileSync(absolute, 'utf8').replace(/^#![^\n]*\n/, ''), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const require = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === 'fs') return fs;
    if (name === 'path') return path;
    if (name === 'child_process') return { execSync };
    if (name.startsWith('.')) {
      const resolved = path.resolve(path.dirname(absolute), name);
      if (fs.existsSync(`${resolved}.ts`)) return loadSource(path.relative(packageRoot, `${resolved}.ts`), mocks);
      if (resolved === path.join(packageRoot, 'package.json')) return JSON.parse(fs.readFileSync(resolved));
    }
    throw new Error(`Unconfigured source dependency: ${name}`);
  };
  const run = vm.runInThisContext(`(function(require,module,exports,console){${source}\n})`, { filename: absolute });
  run(require, module, module.exports, { log() {}, error() {}, warn() {} });
  return module.exports;
}

const chalk = Object.assign((strings, ...values) => strings.reduce((text, part, i) => text + part + (values[i] ?? ''), ''), {
  bold: (value) => value,
});

function createHarness({ installError, configureError } = {}) {
  const events = [];
  const { createAsync } = loadSource('src/createAsync.ts', {
    chalk,
    debug: () => () => {},
    './Examples': {},
    './Template': {
      extractAndPrepareTemplateAppAsync: async (_, options) => events.push(['extract', options.npmPackage]),
      logProjectReady: () => events.push(['ready']),
    },
    './legacyTemplates': { promptTemplateAsync: async () => 'blank-typescript' },
    './log': { Log: { error() {}, exception() {} } },
    './resolvePackageManager': {
      resolvePackageManager: () => 'npm',
      formatSelfCommand: () => 'npx @expo-oh/create-expo',
      configurePackageManager: async () => { events.push(['configure']); if (configureError) throw configureError; },
      installDependenciesAsync: async () => { events.push(['install']); if (installError) throw installError; },
    },
    './resolveProjectRoot': { resolveProjectRootAsync: async (input) => input },
    './telemetry': {
      AnalyticsEventPhases: { ATTEMPT: 'attempt' }, AnalyticsEventTypes: { CREATE_EXPO_APP: 'create' },
      identify() {}, initializeAnalyticsIdentityAsync: async () => {}, track() {},
    },
    './utils/git': { initGitRepoAsync: async () => events.push(['git']) },
    './utils/log': { withSectionLog: async (action) => action() },
  });
  return { createAsync, events };
}

test('installation failure rejects creation before ready and git initialization', async () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-create-install-'));
  const error = new Error('fixture package manager exit 42');
  const { createAsync, events } = createHarness({ installError: error });
  try {
    await assert.rejects(createAsync(project, { yes: true, install: true }), (actual) => actual === error);
    assert.equal(events.some(([event]) => event === 'ready' || event === 'git'), false);
  } finally { fs.rmSync(project, { recursive: true, force: true }); }
});

test('package-manager configuration failure rejects creation', async () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-create-configure-'));
  const error = new Error('fixture configuration failure');
  const { createAsync, events } = createHarness({ configureError: error });
  try {
    await assert.rejects(createAsync(project, { yes: true, install: true }), (actual) => actual === error);
    assert.equal(events.some(([event]) => event === 'install' || event === 'ready'), false);
  } finally { fs.rmSync(project, { recursive: true, force: true }); }
});

test('--no-install skips installation but still prepares project', async () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-create-no-install-'));
  const { createAsync, events } = createHarness();
  try {
    await createAsync(project, { yes: true, install: false });
    assert.deepEqual(events.map(([event]) => event), ['extract', 'configure', 'ready', 'git']);
  } finally { fs.rmSync(project, { recursive: true, force: true }); }
});

test('default and blank-typescript aliases resolve to exact Harmony candidate templates', () => {
  const { resolveHarmonyTemplate } = loadSource('src/harmonyTemplates.ts');
  for (const input of [undefined, null, 'default', 'expo-template-default']) {
    assert.equal(resolveHarmonyTemplate(input), '@expo-oh/expo-template-default@54.0.65');
  }
  for (const input of ['blank-typescript', 'expo-template-blank-typescript']) {
    assert.equal(resolveHarmonyTemplate(input), '@expo-oh/expo-template-blank-typescript@54.0.49');
  }
  for (const input of ['file:./template.tgz', '/tmp/template.tgz', './template.tgz', '@custom/template@1.2.3', 'blank@53']) {
    assert.equal(resolveHarmonyTemplate(input), input);
  }
});

test('template selection reaches extraction using pinned candidates or unchanged local archive', async () => {
  for (const [input, expected] of [
    [undefined, '@expo-oh/expo-template-default@54.0.65'],
    [true, '@expo-oh/expo-template-blank-typescript@54.0.49'],
    ['file:./local.tgz', 'file:./local.tgz'],
  ]) {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-create-template-'));
    const { createAsync, events } = createHarness();
    try {
      await createAsync(project, { yes: true, install: false, template: input });
      assert.deepEqual(events[0], ['extract', expected]);
    } finally { fs.rmSync(project, { recursive: true, force: true }); }
  }
});

test('package-manager detection follows npm_config_user_agent for all original managers', () => {
  const { resolvePackageManager } = loadSource('src/resolvePackageManager.ts', {
    '@expo/package-manager': {}, debug: () => () => {},
  });
  const original = process.env.npm_config_user_agent;
  try {
    for (const manager of ['npm', 'pnpm', 'yarn', 'bun']) {
      process.env.npm_config_user_agent = `${manager}/10.0.0 node/v22.0.0`;
      assert.equal(resolvePackageManager(), manager);
    }
  } finally {
    if (original === undefined) delete process.env.npm_config_user_agent;
    else process.env.npm_config_user_agent = original;
  }
});
