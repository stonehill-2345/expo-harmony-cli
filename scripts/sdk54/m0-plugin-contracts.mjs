import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

import { buildPluginSourceIndex } from './plugin-source-index.mjs';
import { loadProjectSourceInputs } from './m0-project-context.mjs';
import { createWorkspaceResolver } from './workspace-export-graph.mjs';
import { extractTypeSurfaces, extractSchemaSurface, compareOptionSurfaces } from './plugin-surface-types.mjs';
import { readSourceBlobs, serializeInventory } from './source-inventory.mjs';
import { indexSemanticSurface, semanticTypeReferences, validateConsolidated } from './m0-consolidated.mjs';

const splashRoot = 'packages/@expo/prebuild-config/src/plugins/unversioned/expo-splash-screen/';
const routerPath = 'packages/expo-router/plugin/src/index.ts';
const splashPath = 'packages/expo-splash-screen/plugin/src/withSplashScreen.ts';
const schemaPath = 'packages/expo-router/plugin/options.json';
const schemaRoot = 'packages/@expo/schema-utils/src/';
const asyncConsumerPath = 'packages/@expo/cli/src/start/server/middleware/metroOptions.ts';
const sha = value => createHash('sha256').update(value).digest('hex');
const plain = value => value === undefined ? null : JSON.parse(JSON.stringify(value));

// Only these fixed source files and named probes can execute. Host package resolution is unavailable.
export function createFixedPluginRuntime(files) {
  const allowed = new Set([routerPath, splashPath, schemaPath, 'packages/expo-splash-screen/package.json',
    ...['index.ts', 'deref.ts', 'validate.ts', 'JSONSchema.ts'].map(p => schemaRoot + p),
    ...['getAndroidSplashConfig.ts', 'getIosSplashConfig.ts'].map(p => splashRoot + p)]);
  const modules = new Map(), executed = new Set(), probes = [], infoPlist = [];
  const context = vm.createContext({});
  const configPlugins = {
    createRunOncePlugin: (plugin, name, version) => {
      probes.push({ kind: 'createRunOncePlugin', name, version });
      return plugin;
    },
    withInfoPlist: (config, callback) => { infoPlist.push(callback); return config; },
  };
  const load = file => {
    if (!allowed.has(file)) throw new Error(`Execution outside fixed allowlist: ${file}`);
    if (!files.has(file)) throw new Error(`Missing fixed execution source: ${file}`);
    if (modules.has(file)) return modules.get(file).exports;
    const module = { exports: {} };
    modules.set(file, module);
    executed.add(file);
    if (file.endsWith('.json')) { module.exports = JSON.parse(String(files.get(file))); return module.exports; }
    const requireFixed = request => {
      if (request === 'expo/config-plugins') return configPlugins;
      if (request === '@expo/schema-utils') return load(schemaRoot + 'index.ts');
      if (request === 'expo-splash-screen/package.json') return load('packages/expo-splash-screen/package.json');
      for (const [name, kind] of [['withAndroidSplashScreen', 'android'], ['withIosSplashScreen', 'ios']]) {
        if (request === '@expo/prebuild-config/build/plugins/unversioned/expo-splash-screen/' + name) {
          return { [name]: (config, props) => { probes.push({ kind, props: plain(props) }); return config; } };
        }
      }
      if (request.startsWith('.')) {
        const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), request));
        const resolved = [base, base + '.ts', base + '/index.ts'].find(p => allowed.has(p));
        if (resolved) return load(resolved);
      }
      throw new Error(`Unapproved fixed execution import: ${file} -> ${request}`);
    };
    const result = ts.transpileModule(String(files.get(file)), { fileName: file, reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } });
    const error = result.diagnostics?.find(d => d.category === ts.DiagnosticCategory.Error);
    if (error) throw new Error(`Invalid fixed source ${file}: ${ts.flattenDiagnosticMessageText(error.messageText, ' ')}`);
    context.__require = requireFixed;
    context.__module = module;
    try {
      new vm.Script(`(function(require,module,exports){${result.outputText}\n})(__require,__module,__module.exports)`,
        { filename: file }).runInContext(context, { timeout: 1000 });
    } finally {
      delete context.__require;
      delete context.__module;
    }
    return module.exports;
  };
  return { load, probes, infoPlist, executed };
}

const route = (id, props, accepted = true, extra = {}) => ({ id: 'ROUTER-' + id, target: 'router', props,
  expect: { accepted, ...extra } });
const splash = (id, props, calls) => ({ id: 'SPLASH-' + id, target: 'splash', props, expect: { accepted: true, calls } });
const getter = (id, target, config, props, subset) => ({ id: 'GETTER-' + id, target, config, props,
  expect: { accepted: true, subset } });
const asyncCase = (id, setting, mode, platform, result) => ({ id: 'ASYNC-' + id, target: 'asyncConsumer',
  props: { asyncRoutes: setting }, mode, platform, expect: { accepted: true, subset: result } });

export function loadFixedAsyncConsumer(files) {
  const text = files.get(asyncConsumerPath);
  if (text === undefined) throw new Error(`Missing fixed consumer ${asyncConsumerPath}`);
  const source = ts.createSourceFile(asyncConsumerPath, text, ts.ScriptTarget.Latest, true);
  const matches = source.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'getAsyncRoutesFromExpoConfig');
  if (matches.length !== 1 || source.parseDiagnostics.length) throw new Error('Expected one valid fixed asyncRoutes consumer');
  const node = matches[0], slice = node.getText(source);
  const compiled = ts.transpileModule(slice, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  const context = vm.createContext({ exports: {} });
  new vm.Script(compiled.outputText, { filename: asyncConsumerPath }).runInContext(context, { timeout: 1000 });
  return { run: context.exports.getAsyncRoutesFromExpoConfig, source: { path: asyncConsumerPath,
    line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
    start: node.getStart(source), end: node.end, sliceSha256: sha(slice), fileSha256: sha(text) },
  executionMode: 'EXACT_TOP_LEVEL_FUNCTION_SLICE', fullModuleAcceptance: 'NOT_RUN' };
}

export const PLUGIN_CONTRACT_CASES = [
  route('omitted', undefined), route('null', null), route('empty', {}),
  route('origin-false', { origin: false }), route('origin-number', { origin: 3 }, false),
  route('async-boolean', { asyncRoutes: true }), route('async-production', { asyncRoutes: 'production' }),
  route('async-invalid', { asyncRoutes: 'invalid' }, false),
  route('async-platforms', { asyncRoutes: { ios: 'development', android: true, web: 'production', default: false } }),
  route('async-open-harmony-key', { asyncRoutes: { harmony: { arbitrary: true } } }),
  route('async-known-platform-invalid', { asyncRoutes: { ios: 3 } }, false),
  route('typed-name-rejected', { partialTypedGroups: true }, false),
  route('schema-name-accepted', { partialRouteTypes: true }),
  route('platformRoutes', { platformRoutes: false }),
  route('headers-string', { headers: { 'X-Test': 'yes' } }),
  route('headers-array', { headers: { 'X-Test': ['a', 'b'] } }),
  route('headers-number', { headers: { 'X-Test': 3 } }, false),
  route('redirects', { redirects: [{ source: '/a', destination: '/b', methods: ['GET', 'POST'] }] }, true,
    { absent: ['extra.router.redirects.0.permanent', 'extra.router.redirects.0.middleware'] }),
  route('rewrites', { rewrites: [{ source: '/a', destination: '/b' }] }),
  route('redirect-source-required', { redirects: [{ destination: '/b' }] }, false),
  route('rewrite-destination-required', { rewrites: [{ source: '/a' }] }, false),
  route('method-enum', { redirects: [{ source: '/a', destination: '/b', methods: ['TRACE'] }] }, false),
  route('method-duplicates', { redirects: [{ source: '/a', destination: '/b', methods: ['GET', 'GET'] }] }, false),
  route('redirect-duplicates', { redirects: [{ source: '/a', destination: '/b' }, { source: '/a', destination: '/b' }] }, false),
  route('unknown-root', { harmony: true }, false),
  { ...route('merge', { origin: 'new' }, true, { subset: { extra: { retained: 1, router: { oldUnknown: 2, origin: 'new' } } } }),
    config: { extra: { retained: 1, router: { oldUnknown: 2, origin: 'old' } } } },
  route('no-default-injection', {}, true, { absent: ['extra.router.sitemap', 'extra.router.headers', 'extra.router.asyncRoutes'] }),
  { id: 'ROUTER-infoPlist-deduplicate', target: 'infoPlist', expect: { accepted: true,
    subset: { NSUserActivityTypes: ['existing', '$(PRODUCT_BUNDLE_IDENTIFIER).expo.index_route'] } } },
  { id: 'ROUTER-infoPlist-replace-nonarray', target: 'infoPlist', config: { NSUserActivityTypes: 'invalid' },
    expect: { accepted: true, subset: { NSUserActivityTypes: ['$(PRODUCT_BUNDLE_IDENTIFIER).expo.index_route'] } } },
  splash('omitted-legacy', undefined, [{ kind: 'android', props: null }, { kind: 'ios', props: null }]),
  splash('null-legacy', null, [{ kind: 'android', props: null }, { kind: 'ios', props: null }]),
  splash('empty-modern', {}, [{ kind: 'android', props: { resizeMode: 'contain', dark: {} } },
    { kind: 'ios', props: { resizeMode: 'contain', dark: {} } }]),
  splash('android-only', { android: { image: 'a' } }, [{ kind: 'android', props: { image: 'a', resizeMode: 'contain', dark: {} } }, { kind: 'ios', props: null }]),
  splash('ios-only', { ios: { image: 'i' } }, [{ kind: 'android', props: null }, { kind: 'ios', props: { image: 'i', resizeMode: 'contain', dark: {} } }]),
  splash('native-common', { resizeMode: 'native' }, [{ kind: 'android', props: { resizeMode: 'native', dark: {} } }, { kind: 'ios', props: { resizeMode: 'contain', dark: {} } }]),
  splash('platform-native', { ios: { resizeMode: 'native' }, android: {} }, [{ kind: 'android', props: { resizeMode: 'contain', dark: {} } }, { kind: 'ios', props: { resizeMode: 'native', dark: {} } }]),
  splash('nested-dark-precedence', { image: 'common', dark: { image: 'dark', backgroundColor: '#111' },
    android: { image: 'android', dark: { backgroundColor: '#222' } }, ios: { dark: { image: 'ios-dark' } } },
  [{ kind: 'android', props: { image: 'android', resizeMode: 'contain', dark: { image: 'dark', backgroundColor: '#222' } } },
    { kind: 'ios', props: { image: 'common', resizeMode: 'contain', dark: { image: 'ios-dark', backgroundColor: '#111' } } }]),
  splash('shared-with-platform', { backgroundColor: '#333', ios: { image: 'i' } },
    [{ kind: 'android', props: { backgroundColor: '#333', resizeMode: 'contain', dark: {} } },
      { kind: 'ios', props: { backgroundColor: '#333', image: 'i', resizeMode: 'contain', dark: {} } }]),
  getter('android-none', 'android', {}, null, null),
  getter('android-props-default', 'android', {}, { image: 'a' }, { imageWidth: 100, mdpi: 'a', xxxhdpi: 'a', resizeMode: 'contain' }),
  getter('android-density', 'android', {}, { image: 'a', mdpi: 'm', imageWidth: 0 }, { mdpi: 'm', hdpi: 'a', imageWidth: 0 }),
  getter('android-platform-legacy', 'android', { splash: { image: 'top' }, android: { splash: { image: 'platform' } } }, null,
    { image: 'platform', imageWidth: 200 }),
  getter('android-top-legacy', 'android', { splash: { image: 'top' } }, null, { image: 'top', imageWidth: 200 }),
  getter('android-props-replace-legacy', 'android', { android: { splash: { image: 'legacy', backgroundColor: '#111' } } }, {},
    { imageWidth: 100, resizeMode: 'contain' }),
  getter('android-dark-none', 'androidDark', {}, null, null),
  getter('android-dark-light-mode', 'androidDark', {}, { resizeMode: 'cover', drawable: { icon: 'icon', darkIcon: 'dark-icon' },
    dark: { image: 'd', resizeMode: 'native', mdpi: 'dm' } },
  { image: 'd', mdpi: 'dm', hdpi: 'd', resizeMode: 'cover', drawable: { icon: 'icon', darkIcon: 'dark-icon' } }),
  getter('android-dark-legacy', 'androidDark', { android: { splash: { resizeMode: 'cover', dark: { image: 'd', resizeMode: 'native' } } } }, null,
    { image: 'd', resizeMode: 'cover' }),
  getter('ios-none', 'ios', {}, null, { backgroundColor: '#ffffff', resizeMode: 'contain', enableFullScreenImage_legacy: true, imageWidth: 200 }),
  getter('ios-props-default', 'ios', {}, {}, { backgroundColor: '#ffffff', resizeMode: 'contain' }),
  getter('ios-platform-legacy', 'ios', { splash: { image: 'top' }, ios: { splash: { image: 'i', tabletImage: 't' } } }, null,
    { image: 'i', tabletImage: 't', imageWidth: 200, enableFullScreenImage_legacy: true }),
  getter('ios-top-legacy', 'ios', { splash: { image: 'top' } }, null, { image: 'top', imageWidth: 200 }),
  getter('ios-dark-tablet', 'ios', {}, { imageWidth: 0, tabletImage: 't', dark: { image: 'd', tabletImage: 'dt', tabletBackgroundColor: '#222' } },
    { imageWidth: 0, tabletImage: 't', dark: { image: 'd', tabletImage: 'dt', tabletBackgroundColor: '#222' } }),
  asyncCase('true', true, 'production', 'ios', true),
  asyncCase('false', false, 'development', 'web', false),
  asyncCase('development-match', 'development', 'development', 'android', true),
  asyncCase('development-mismatch', 'development', 'production', 'web', false),
  asyncCase('production-native-function', 'production', 'production', 'android', true),
  asyncCase('platform-priority', { ios: false, default: true }, 'development', 'ios', false),
  asyncCase('default-fallback', { web: false, default: 'development' }, 'development', 'android', true),
  asyncCase('platform-mode', { web: 'production' }, 'production', 'web', true),
  asyncCase('harmony-key-boolean', { harmony: true }, 'development', 'harmony', true),
  asyncCase('harmony-key-object', { harmony: { arbitrary: true } }, 'development', 'harmony', false),
  asyncCase('harmony-default', { default: true }, 'development', 'harmony', true),
  asyncCase('undefined', undefined, 'development', 'web', false),
];

function assertSubset(actual, expected, label = '$') {
  if (expected === null || typeof expected !== 'object' || Array.isArray(expected)) return assert.deepEqual(actual, expected, label);
  assert.ok(actual !== null && typeof actual === 'object', label);
  for (const [key, value] of Object.entries(expected)) assertSubset(actual[key], value, label + '.' + key);
}

export function runPluginContractCases(files, cases = PLUGIN_CONTRACT_CASES) {
  const runtime = createFixedPluginRuntime(files);
  const router = runtime.load(routerPath).default, splashPlugin = runtime.load(splashPath).default;
  const android = runtime.load(splashRoot + 'getAndroidSplashConfig.ts');
  const ios = runtime.load(splashRoot + 'getIosSplashConfig.ts');
  const asyncConsumer = loadFixedAsyncConsumer(files);
  const results = cases.map(test => {
    runtime.probes.length = 0;
    runtime.infoPlist.length = 0;
    const config = structuredClone(test.config ?? {}), props = structuredClone(test.props);
    let output, error;
    try {
      if (test.target === 'router') output = router(config, props);
      else if (test.target === 'splash') output = splashPlugin(config, props);
      else if (test.target === 'android') output = android.getAndroidSplashConfig(config, props);
      else if (test.target === 'androidDark') output = android.getAndroidDarkSplashConfig(config, props);
      else if (test.target === 'ios') output = ios.getIosSplashConfig(config, props);
      else if (test.target === 'asyncConsumer') {
        const configured = router(config, props);
        output = asyncConsumer.run(configured, test.mode, test.platform);
      }
      else if (test.target === 'infoPlist') {
        router({}, {});
        const modConfig = { modResults: test.config ? config : { NSUserActivityTypes: ['existing'] } };
        const callback = runtime.infoPlist[0];
        callback(modConfig); callback(modConfig);
        output = modConfig.modResults;
      } else throw new Error(`Unknown contract target ${test.target}`);
    } catch (caught) { error = caught; }
    const actual = { accepted: !error, output: plain(output), calls: plain(runtime.probes), infoPlistRegistrations: runtime.infoPlist.length,
      error: error ? { name: error.name, message: error.message, errors: plain(error.errors) } : null };
    let failure = null;
    try {
      assert.equal(actual.accepted, test.expect.accepted);
      if (!test.expect.accepted) {
        assert.equal(actual.error.name, 'ValidationError');
        assert.equal(actual.infoPlistRegistrations, 0, 'Rejected props must not reach mod registration');
      }
      if (test.target === 'router' && test.expect.accepted) {
        assert.equal(actual.infoPlistRegistrations, 1);
        assertSubset(actual.output, { extra: { router: plain(test.props ?? {}) } });
      }
      if (Object.hasOwn(test.expect, 'subset')) assertSubset(actual.output, test.expect.subset);
      if (test.expect.calls) assert.deepEqual(actual.calls, test.expect.calls);
      for (const field of test.expect.absent ?? []) {
        let value = actual.output;
        for (const key of field.split('.')) value = value?.[key];
        assert.equal(value, undefined, field);
      }
    } catch (caught) { failure = caught.message; }
    return { ...test, props: test.props === undefined ? { omitted: true } : test.props,
      status: failure ? 'FAIL' : 'PASS', failure, actual };
  });
  return { results, executed: [...runtime.executed].sort(), passed: results.filter(r => r.status === 'PASS').length,
    failed: results.filter(r => r.status === 'FAIL').length, runtimeAcceptance: 'FIXED_SOURCE_WITH_NAMED_MOD_PROBES',
    asyncConsumer: { source: asyncConsumer.source, executionMode: asyncConsumer.executionMode,
      fullModuleAcceptance: asyncConsumer.fullModuleAcceptance },
    nativeModsAcceptance: 'NOT_RUN', deviceAcceptance: 'NOT_RUN', runOnceWrapperAcceptance: 'NOT_RUN' };
}

export function collectRouterConsumers(files) {
  const facts = [];
  const chain = node => {
    if (ts.isPropertyAccessExpression(node)) return [...chain(node.expression), node.name.text];
    if (ts.isElementAccessExpression(node)) return [...chain(node.expression),
      ts.isStringLiteral(node.argumentExpression) ? node.argumentExpression.text : '[dynamic]'];
    return [node.getText()];
  };
  for (const [file, text] of files) {
    if (!/^packages\/(?:@expo\/cli|expo-router|babel-preset-expo)\//.test(file) || !/\.[jt]sx?$/.test(file) || /\/(?:__tests__|__mocks__|build)\//.test(file)) continue;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const add = (node, field, kind) => {
      const position = source.getLineAndCharacterOfPosition(node.getStart(source));
      facts.push({ id: `ROUTER-CONSUMER:${file}:${node.getStart(source)}:${field}`, field, kind,
        expression: node.getText(source), source: { path: file, line: position.line + 1, column: position.character + 1 } });
    };
    const visit = node => {
      if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
          !((ts.isPropertyAccessExpression(node.parent) || ts.isElementAccessExpression(node.parent)) && node.parent.expression === node)) {
        const parts = chain(node), index = parts.findIndex((part, i) => part === 'extra' && parts[i + 1] === 'router');
        if (index >= 0) add(node, parts[index + 2] ?? '*', parts[index + 2] && parts[index + 2] !== '[dynamic]' ? 'STATIC_ACCESS' : 'ALIAS_OR_DYNAMIC_BOUNDARY');
      }
      if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer) {
        let initializer = node.initializer;
        if (ts.isBinaryExpression(initializer) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(initializer.operatorToken.kind)) initializer = initializer.left;
        const parts = chain(initializer);
        if (parts.at(-2) === 'extra' && parts.at(-1) === 'router') for (const element of node.name.elements) {
          add(element, element.dotDotDotToken ? '*' : element.propertyName?.getText(source) ?? element.name.getText(source),
            element.dotDotDotToken ? 'ALIAS_OR_DYNAMIC_BOUNDARY' : 'DESTRUCTURED_ACCESS');
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return facts.sort((a, b) => a.id.localeCompare(b.id));
}

export function expandPluginIndex(index, input) {
  const descriptors = index.modules.flatMap(module => module.configPlugins.map(candidate => ({ id: candidate.id,
    symbol: candidate.name, sourcePath: candidate.source.path, start: Number(candidate.id.split(':').at(-1)),
    packageId: module.packageId, category: module.category, declaredTypeArgument: candidate.typeArgument,
    candidateKind: 'CONFIG_PLUGIN_DECLARATION_NOT_PUBLIC_ENTRY_ACCEPTANCE' })));
  const resolver = createWorkspaceResolver(input);
  return extractTypeSurfaces(input.files, descriptors, { resolveSource: resolver });
}

function reviewRouterDifference(difference) {
  const field = difference.path.split(/[.[]/)[0];
  const cases = {
    asyncRoutes: ['ROUTER-async-boolean', 'ROUTER-async-production', 'ROUTER-async-invalid', 'ROUTER-async-open-harmony-key',
      'ASYNC-production-native-function', 'ASYNC-platform-priority', 'ASYNC-harmony-key-object'],
    origin: ['ROUTER-origin-false', 'ROUTER-origin-number'],
    headers: ['ROUTER-empty', 'ROUTER-headers-string', 'ROUTER-headers-array', 'ROUTER-headers-number'],
    partialRouteTypes: ['ROUTER-schema-name-accepted'], partialTypedGroups: ['ROUTER-typed-name-rejected'],
    platformRoutes: ['ROUTER-platformRoutes'],
    redirects: ['ROUTER-redirects', 'ROUTER-redirect-source-required', 'ROUTER-method-enum', 'ROUTER-method-duplicates', 'ROUTER-redirect-duplicates'],
    rewrites: ['ROUTER-rewrites', 'ROUTER-rewrite-destination-required'],
  };
  const conclusions = {
    asyncRoutes: 'TS permits arbitrary strings; schema permits two modes or booleans and an open platform object. The exact consumer selects platform ?? default and compares mode/true. Acceptance of a harmony key does not establish bundler/platform support.',
    origin: 'Schema accepts string/boolean while TS permits string. Plugin acceptance and config transfer verified; downstream URL consumers still need flow and platform verification.',
    headers: 'TS requires headers while schema root has no required list; omitted props pass the fixed validator. Value types are checked. Header serving is not verified.',
    partialRouteTypes: 'Schema accepts this name and plugin transfers it; no direct extra.router consumer found by this bounded AST scan. Alias/caller flow remains open.',
    partialTypedGroups: 'TS declares this name but fixed plugin schema rejects it. Typed route generator options require separate caller-flow review; the names cannot be treated as aliases.',
    platformRoutes: 'Schema accepts this name and plugin transfers it; full route-option propagation remains unverified.',
    redirects: 'Schema-only array option. Fixed validation checks required source/destination, method enum and uniqueness; defaults are not inserted. RSC direct access is indexed; redirect execution is not verified.',
    rewrites: 'Schema-only array option. Fixed validation and config transfer verified; RSC direct access is indexed. Rewrite execution is not verified.',
  };
  if (!cases[field]) throw new Error(`Unreviewed Router difference ${difference.path}`);
  return { caseIds: cases[field], conclusion: conclusions[field], implementationBatch: field === 'asyncRoutes' ? 'M0-03/M2/M6' : 'M0-03/M1/M6',
    harmonyAcceptance: 'NOT_VERIFIED' };
}

export function indexPluginTypeContracts({ files, packages, candidates, strictPlugins = [] }) {
  const ids = new Set();
  for (const candidate of candidates) {
    if (!candidate.id || ids.has(candidate.id)) throw new Error(`Duplicate/missing plugin ID ${candidate.id}`);
    ids.add(candidate.id);
  }
  const graph = indexSemanticSurface({ files, packages, pluginCandidates: candidates, exportRoots: false,
    structuralTypeOperations: true });
  const checked = validateConsolidated(graph, graph);
  if (!checked.valid) throw new Error(checked.failures.join('\n'));
  const types = new Map(graph.types.map(t => [t.id, t]));
  const coverage = graph.plugins.map(plugin => {
    const reachable = new Set(), pending = [...plugin.optionsTypeIds];
    for (let i = 0; i < pending.length; i++) {
      const id = pending[i];
      if (reachable.has(id)) continue;
      const type = types.get(id);
      if (!type) throw new Error(`Dangling plugin type ${plugin.id} -> ${id}`);
      reachable.add(id); pending.push(...semanticTypeReferences(type));
    }
    const boundaries = [...reachable].filter(id => types.get(id).boundaries.length).sort().map(id => ({
      typeId: id, reasons: types.get(id).boundaries, declarations: types.get(id).declarations }));
    return { id: plugin.id, source: plugin.source, optionsTypeIds: plugin.optionsTypeIds,
      strictTreeStatus: strictPlugins.find(p => p.id === plugin.id)?.status ?? 'NOT_PROVIDED',
      status: !plugin.optionsTypeIds.length ? 'MISSING_OPTION_TYPE' : boundaries.length ? 'MAPPED_WITH_BOUNDARIES' : 'MAPPED',
      reachableTypeIds: [...reachable].sort(), boundaries,
      sourceDiagnostics: graph.modules.find(m => m.source.path === plugin.source.path)?.diagnostics ?? [] };
  });
  return { graph, coverage, summary: { candidates: candidates.length,
    mapped: coverage.filter(p => p.status === 'MAPPED').length,
    mappedWithBoundaries: coverage.filter(p => p.status === 'MAPPED_WITH_BOUNDARIES').length,
    missing: coverage.filter(p => p.status === 'MISSING_OPTION_TYPE').length,
    types: graph.types.length, calls: graph.types.reduce((n, t) => n + t.calls.length, 0),
    conditionalTypes: graph.types.filter(t => t.kind === 'conditional').length,
    indexedAccessTypes: graph.types.filter(t => t.kind === 'indexed-access').length },
  fullPluginOptionsComplete: false, stageClosable: false,
  limitation: 'Finite source type graph; function and generic structure retained, open/error types and uninstantiated operations remain boundaries; no runtime or Harmony support acceptance' };
}

export function buildPluginContracts({ sourceDir, typeContracts = false }) {
  const index = buildPluginSourceIndex({ sourceDir });
  const input = loadProjectSourceInputs({ sourceDir });
  const missing = index.modules.filter(m => !input.files.has(m.source.path)).map(m => input.entries.find(e => e.path === m.source.path));
  if (missing.some(e => !e || e.mode === '120000')) throw new Error('Missing or unsafe plugin source');
  for (const [file, bytes] of readSourceBlobs(sourceDir, missing)) input.files.set(file, bytes.toString());
  const batch = expandPluginIndex(index, input);
  let pluginTypeContracts;
  if (typeContracts) {
    const paths = new Set([...batch.inputPaths, ...input.packages.map(p => p.sourcePath)]);
    pluginTypeContracts = indexPluginTypeContracts({ files: new Map([...input.files].filter(([file]) => paths.has(file))),
      packages: input.packages, candidates: index.modules.flatMap(m => m.configPlugins), strictPlugins: batch.plugins });
  }
  const router = batch.plugins.find(p => p.sourcePath === routerPath && p.symbol === 'withRouter');
  if (router?.status !== 'EXPANDED') throw new Error('Router type expansion blocked');
  const schema = extractSchemaSurface(JSON.parse(input.files.get(schemaPath)), { id: router.id, sourcePath: schemaPath });
  const consumers = collectRouterConsumers(input.files);
  const differences = compareOptionSurfaces(router.typescript, schema).map(d => ({ ...d,
    consumerIds: consumers.filter(c => c.field === d.path.split(/[.[]/)[0]).map(c => c.id),
    review: reviewRouterDifference(d),
    acceptance: 'UPSTREAM_CONTRACT_DIFFERENCE_RECORDED', fullConsumerFlowAcceptance: 'NOT_VERIFIED' }));
  const execution = runPluginContractCases(input.files);
  const inputs = [...input.files].map(([file, content]) => ({ path: file,
    blob: input.entries.find(e => e.path === file)?.oid ?? null, sha256: sha(content) })).sort((a, b) => a.path.localeCompare(b.path));
  return { schemaVersion: 1, compilerVersion: ts.version, source: input.source, inputs,
    pluginIndexSha256: sha(serializeInventory(index)), batch, router: { id: router.id, schema, differences, consumers,
      limitation: 'AST access inventory only; aliases, writes and dynamic access require flow review; schema acceptance of harmony keys is not Harmony support' },
    ...(pluginTypeContracts ? { pluginTypeContracts } : {}),
    execution, summary: { candidates: batch.plugins.length, expanded: batch.plugins.filter(p => p.status === 'EXPANDED').length,
      noExplicitOptions: batch.plugins.filter(p => p.typescript?.root.kind === 'no-explicit-options').length,
      expandedExplicitOptions: batch.plugins.filter(p => p.status === 'EXPANDED' && p.typescript.root.kind !== 'no-explicit-options').length,
      blocked: batch.plugins.filter(p => p.status !== 'EXPANDED').length,
      optionPaths: batch.plugins.reduce((n, p) => n + (p.typescript?.options.length ?? 0), 0),
      routerDifferences: differences.length, contractPassed: execution.passed, contractFailed: execution.failed },
    stageClosable: false, fullPluginOptionsComplete: false, fullSdkPublicSurfaceComplete: false };
}

export function validatePluginContracts(actual, expected) {
  const failures = [];
  if (expected?.pluginTypeContracts) failures.push(...validateConsolidated(actual?.pluginTypeContracts?.graph, expected.pluginTypeContracts.graph).failures);
  if (serializeInventory(actual) !== serializeInventory(expected)) failures.push('Fixed plugin source/type/schema/execution or completion metadata differs');
  if (actual?.execution?.failed !== 0) failures.push('Plugin contract matrix failed');
  return { valid: failures.length === 0, failures };
}

function main(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--type-contracts' && !options[flag]) { options[flag] = true; continue; }
    if (!['--source', '--output', '--check', '--check-set'].includes(flag) || options[flag] || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Invalid argument ${flag}`);
    options[flag] = argv[++i];
  }
  if (!options['--source'] || ['--output', '--check', '--check-set'].filter(k => options[k]).length !== 1) throw new Error('Usage: m0-plugin-contracts.mjs --source <git-dir> (--output <json> | --check <json> | --check-set <json>) [--type-contracts]');
  const expected = buildPluginContracts({ sourceDir: path.resolve(options['--source']), typeContracts: options['--type-contracts'] === true });
  if (options['--output']) {
    fs.mkdirSync(path.dirname(path.resolve(options['--output'])), { recursive: true });
    fs.writeFileSync(options['--output'], serializeInventory(expected));
    console.log(serializeInventory({ ...expected.summary,
      ...(expected.pluginTypeContracts ? { pluginTypeContracts: expected.pluginTypeContracts.summary } : {}) }).trimEnd());
    if (expected.execution.failed) process.exitCode = 1;
  } else if (options['--check']) {
    const result = validatePluginContracts(JSON.parse(fs.readFileSync(options['--check'], 'utf8')), expected);
    console.log(serializeInventory(result).trimEnd());
    if (!result.valid) process.exitCode = 1;
  } else {
    const checks = JSON.parse(fs.readFileSync(options['--check-set'], 'utf8'));
    const results = checks.map(check => ({ id: check.id, ...validatePluginContracts(JSON.parse(fs.readFileSync(check.path, 'utf8')), expected) }));
    console.log(serializeInventory(results).trimEnd());
    if (results.some(r => !r.valid)) process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
