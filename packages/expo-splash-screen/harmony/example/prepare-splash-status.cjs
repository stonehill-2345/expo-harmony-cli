const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const [sdkArg, rootArg] = process.argv.slice(2);
if (!sdkArg || !rootArg) throw new Error('Usage: prepare-splash-status.cjs <sdk> <prepared-fixture>');
const sdk = path.resolve(sdkArg);
const root = path.resolve(rootArg);
const source = path.join(sdk, 'packages/expo-splash-screen');
const main = path.join(root, 'harmony/entry/src/main');
const sha = (data) => createHash('sha256').update(data).digest('hex');

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    .filter((entry) => !['node_modules', '.git', '.DS_Store'].includes(entry.name))
    .flatMap((entry) => entry.isDirectory()
      ? files(path.join(dir, entry.name)).map((name) => entry.name + '/' + name)
      : [entry.name]);
}

const stage = path.join(root, '.source-build/expo-splash-screen/package');
const hashes = {};
for (const file of files(source)) {
  const data = fs.readFileSync(path.join(source, file));
  hashes[file] = sha(data);
  const target = path.join(stage, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, data);
}
const version = JSON.parse(fs.readFileSync(path.join(source, 'package.json'))).version;
const archive = `expo-splash-screen-${version}-source.tgz`;
execFileSync('tar', ['--no-xattrs', '-czf', path.join(root, 'artifacts', archive), '-C', path.dirname(stage), 'package'], {
  env: { ...process.env, COPYFILE_DISABLE: '1' },
});
const manifestPath = path.join(root, 'source-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath));
manifest.packages['expo-splash-screen'] = {
  version,
  archive,
  sha256: sha(fs.readFileSync(path.join(root, 'artifacts', archive))),
  files: hashes,
};
manifest.integration += '; ExpoSplashScreen native overlay and StatusBar lifecycle';
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath));
pkg.dependencies['expo-splash-screen'] = 'file:artifacts/' + archive;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

fs.cpSync(path.join(source, 'harmony/src/main/ets'), path.join(main, 'ets/splash'), { recursive: true });
fs.copyFileSync(path.join(source, 'harmony/example/SplashStatusApp.tsx'), path.join(root, 'SplashStatusApp.tsx'));
fs.copyFileSync(path.join(source, 'harmony/example/native/EntryAbility.ets'), path.join(main, 'ets/entryability/EntryAbility.ets'));
fs.copyFileSync(path.join(source, 'harmony/example/native/Index.ets'), path.join(main, 'ets/pages/Index.ets'));
fs.copyFileSync(path.join(source, 'harmony/example/native/SplashOraclePackage.ets'), path.join(main, 'ets/SplashOraclePackage.ets'));

fs.writeFileSync(path.join(root, 'index.ts'), "import './expo-entry';\n");
fs.writeFileSync(path.join(root, 'expo-entry.ts'),
  "import { registerRootComponent } from 'expo';\nimport App from './SplashStatusApp';\nregisterRootComponent(App);\n");

const etsPath = path.join(main, 'ets/PackageProvider.ets');
let ets = fs.readFileSync(etsPath, 'utf8');
ets = "import { ExpoSplashScreenPackage } from './splash/ExpoSplashScreenPackage';\n" +
  "import { ExpoSplashScreenController } from './splash/ExpoSplashScreenController';\n" +
  "import { SplashOraclePackage } from './SplashOraclePackage';\n" + ets;
ets = ets.replace('  return [', "  const splash = AppStorage.get<ExpoSplashScreenController>('A04Splash');\n  if (!splash) throw new Error('Missing A04 Splash lifecycle');\n  return [new ExpoSplashScreenPackage(ctx, splash), new SplashOraclePackage(ctx), ");
fs.writeFileSync(etsPath, ets);

const cppPath = path.join(main, 'cpp/PackageProvider.cpp');
let cpp = fs.readFileSync(cppPath, 'utf8');
cpp = cpp.replace('using namespace rnoh;',
  '#include "ExpoSplashScreenPackage.h"\n#include "SplashOraclePackage.h"\nusing namespace rnoh;');
cpp = cpp.replace(
  'std::make_shared<expo::statusbar::testing::StatusBarOraclePackage>(ctx)};',
  'std::make_shared<expo::statusbar::testing::StatusBarOraclePackage>(ctx),\n' +
  '      std::make_shared<expo::splashscreen::harmony::ExpoSplashScreenPackage>(ctx),\n' +
  '      std::make_shared<expo::splashscreen::testing::SplashOraclePackage>(ctx)};'
);
if (!cpp.includes('SplashOraclePackage>(ctx)')) throw new Error('Unexpected C++ PackageProvider shape');
fs.writeFileSync(cppPath, cpp);

fs.appendFileSync(path.join(main, 'cpp/CMakeLists.txt'),
  '\nadd_subdirectory("${NODE_MODULES}/expo-splash-screen/harmony/src/main/cpp" expo-splash-screen)\n' +
  'target_include_directories(rnoh_app PRIVATE "${NODE_MODULES}/expo-splash-screen/harmony/example/native")\n' +
  'target_link_libraries(rnoh_app PUBLIC rnoh_expo_splash_screen)\n');

const appPath = path.join(root, 'harmony/AppScope/app.json5');
const app = JSON.parse(fs.readFileSync(appPath));
app.app.bundleName = 'dev.expo.a04.splashstatus';
fs.writeFileSync(appPath, JSON.stringify(app, null, 2) + '\n');

const element = path.join(main, 'resources/base/element');
fs.writeFileSync(path.join(element, 'float.json'), JSON.stringify({
  float: [{ name: 'expo_splash_image_width', value: '144vp' }],
}, null, 2) + '\n');
const stringPath = path.join(element, 'string.json');
const strings = JSON.parse(fs.readFileSync(stringPath));
strings.string.push({ name: 'expo_splash_resize_mode', value: 'contain' });
fs.writeFileSync(stringPath, JSON.stringify(strings, null, 2) + '\n');
console.log(`A04_SPLASH_STATUS_FIXTURE=${root}`);
