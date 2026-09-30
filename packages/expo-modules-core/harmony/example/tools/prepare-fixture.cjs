// Build local validation artifacts, not a complete Expo monorepo/type build.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { parseArgs } = require('node:util');
const { values } = parseArgs({ options: {
  'sdk-root': { type: 'string' }, 'fixture-root': { type: 'string' },
  'tooling-root': { type: 'string' }, 'har': { type: 'string' },
  'prepare-only': { type: 'boolean', default: false },
  'i0': { type: 'boolean', default: false },
  'linking': { type: 'boolean', default: false },
  'router': { type: 'boolean', default: false },
  'font': { type: 'boolean', default: false },
  'status-bar': { type: 'boolean', default: false },
} });
for (const name of ['sdk-root', 'fixture-root', 'tooling-root']) {
  if (!values[name]) throw new Error(`--${name} is required`);
}
if (values.router) { values.i0 = true; values.linking = true; }
if (values.linking && !values.i0) throw new Error('--linking requires --i0');
if (values.font && !values.i0) throw new Error('--font requires --i0');
if (values['status-bar'] && !values.i0) throw new Error('--status-bar requires --i0');
const sdk = path.resolve(values['sdk-root']);
const root = path.resolve(values['fixture-root']);
if (fs.existsSync(root)) throw new Error(`Fixture already exists: ${root}; use a new directory`);
const ts = createRequire(path.join(path.resolve(values['tooling-root']), 'package.json'))('typescript');
const example = path.join(sdk, 'packages/expo-modules-core/harmony/example');
const sha = (data) => createHash('sha256').update(data).digest('hex');
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    .filter((e) => !['node_modules', '.git', '.DS_Store'].includes(e.name))
    .flatMap((e) => e.isDirectory() ? files(path.join(dir, e.name)).map((n) => e.name + '/' + n) : [e.name]);
}
fs.cpSync(path.join(example, 'host'), root, { recursive: true });
for (const name of ['App.tsx', 'index.ts', 'expo-entry.ts', 'interop-tests.ts', 'core-context-tests.ts', 'core-uuid-tests.ts', 'core-boundary-tests.ts', 'CoreViewBoundary.tsx']) {
  fs.copyFileSync(path.join(example, name), path.join(root, name));
}
fs.copyFileSync(path.join(example, 'tests/platform-types.fixture.ts'), path.join(root, 'platform-types.ts'));
fs.copyFileSync(path.join(example, '../src/main/ets/ExpoModulesCorePackage.ets'), path.join(root, 'harmony/entry/src/main/ets/ExpoModulesCorePackage.ets'));
fs.copyFileSync(path.join(example, 'ets/ExpoCoreInteropProbePackage.ets'), path.join(root, 'harmony/entry/src/main/ets/ExpoCoreInteropProbePackage.ets'));
fs.mkdirSync(path.join(root, 'harmony/entry/src/main/resources/rawfile'), { recursive: true });
fs.mkdirSync(path.join(root, 'artifacts'));
const manifest = {
  baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sdk, encoding: 'utf8' }).trim(),
  dirty: execFileSync('git', ['status', '--porcelain'], { cwd: sdk, encoding: 'utf8' }).trim(),
  sdk, node: process.version, typescript: ts.version,
  buildScope: 'Core ships current TS/C++ sources; all Metro runtime TS transpiled; Platform declaration regenerated; other existing declarations retained, not full monorepo/typecheck',
  packages: {},
};
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
const packages = [['expo-modules-core', 'packages/expo-modules-core'], ['@expo/metro-config', 'packages/@expo/metro-config']];
if (values.i0) packages.push(
  ['expo-constants', 'packages/expo-constants'],
  ['expo-asset', 'packages/expo-asset'],
  ['expo-system-ui', 'packages/expo-system-ui'],
);
if (values.linking) packages.push(['expo-linking', 'packages/expo-linking']);
if (values.router) packages.push(
  ['expo-router', 'packages/expo-router'],
  ['expo-splash-screen', 'packages/expo-splash-screen'],
);
if (values.font) packages.push(['expo-font', 'packages/expo-font']);
if (values['status-bar']) packages.push(['expo-status-bar', 'packages/expo-status-bar']);
for (const [name, relative] of packages) {
  const source = path.join(sdk, relative);
  const stage = path.join(root, '.source-build', name, 'package');
  const hashes = {};
  for (const file of files(source)) {
    const data = fs.readFileSync(path.join(source, file));
    hashes[file] = sha(data);
    const target = path.join(stage, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  }
  if (name === 'expo-modules-core') {
    require('./emit-platform-types.cjs')(ts, stage, path.resolve(values['tooling-root']));
  }
  const sourceFolders = name === 'expo-constants' ? ['src', 'scripts/src'] : ['src'];
  if (name !== 'expo-modules-core') {
    for (const folder of sourceFolders) {
      for (const file of files(path.join(source, folder))) {
        if (!/\.tsx?$/.test(file) || file.endsWith('.d.ts') || /__(tests|mocks)__/.test(file)) continue;
        const result = ts.transpileModule(fs.readFileSync(path.join(source, folder, file), 'utf8'), {
          fileName: file, reportDiagnostics: true,
          compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, sourceMap: false },
        });
        if (result.diagnostics?.some((d) => d.category === ts.DiagnosticCategory.Error)) throw new Error(`Transpile failed: ${file}`);
        const target = path.join(stage, folder.replace(/src$/, 'build'), file.replace(/\.tsx?$/, '.js'));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, result.outputText);
        // Published source maps must not misrepresent the newly compiled JS.
        fs.rmSync(target + '.map', { force: true });
      }
    }
  }
  const version = JSON.parse(fs.readFileSync(path.join(stage, 'package.json'))).version;
  const archive = `${name.replace('@', '').replace('/', '-')}-${version}-source.tgz`;
  execFileSync('tar', ['--no-xattrs', '-czf', path.join(root, 'artifacts', archive), '-C', path.dirname(stage), 'package'], {
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  });
  manifest.packages[name] = { version, archive, sha256: sha(fs.readFileSync(path.join(root, 'artifacts', archive))), files: hashes };
  pkg.dependencies[name] = 'file:artifacts/' + archive;
}
if (values.i0) {
  require('./prepare-i0.cjs')(sdk, root);
  manifest.integration = 'I0 Constants/Asset/SystemUI; Core-only assertions retained';
}
if (values.linking) {
  require('./prepare-linking.cjs')(sdk, root, ts);
  manifest.integration += '; Linking public API (Router excluded)';
}
if (values.font) {
  require('./prepare-font.cjs')(sdk, root, pkg);
  manifest.integration += '; Font runtime and MaterialIcons (Router excluded)';
}
if (values['status-bar']) {
  require('./prepare-status-bar.cjs')(sdk, root);
  manifest.integration += '; expo-status-bar via RNOH StatusBarManager';
}
if (values.har) {
  const har = path.resolve(values.har);
  fs.copyFileSync(har, path.join(root, 'artifacts/react_native_openharmony.har'));
  manifest.har = { source: har, sha256: sha(fs.readFileSync(har)) };
  fs.writeFileSync(path.join(root, 'harmony/entry/oh-package.json5'), JSON.stringify({
    name: 'entry', version: '0.1.0', dependencies: { '@rnoh/react-native-openharmony': 'file:../../artifacts/react_native_openharmony.har' },
  }, null, 2));
}
if (values.router) {
  manifest.navigation = require('./prepare-router.cjs')(sdk, root, pkg, ts);
  manifest.integration = 'Router official entry with Core/Constants/Asset/Linking/Screens/SafeArea; navigation acceptance separate from Core50/I0 suites';
}
fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'source-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
if (!values['prepare-only']) {
  execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: root, stdio: 'inherit' });
  if (values.i0) execFileSync(process.execPath, [path.join(root, 'node_modules/expo-constants/scripts/getAppConfig.js'), root, path.join(root, 'harmony/entry/src/main/resources/rawfile')], { stdio: 'inherit' });
}
console.log(`CORE_FIXTURE_READY=${root}`);
