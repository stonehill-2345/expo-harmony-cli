// Uses the installed RNOH bundler for native diagnostics, not Expo public acceptance.
const path = require('node:path');
const fs = require('node:fs');
const { createRequire } = require('node:module');
if (process.argv.length < 4 || process.argv.length > 5) throw new Error('Usage: bundle-direct.cjs FIXTURE RN_DEPENDENCY_ROOT [--release]');
const [fixture, dependencyRoot] = process.argv.slice(2, 4).map((p) => fs.realpathSync(p));
const dev = !process.argv.includes('--release');
const requireDependencies = createRequire(path.join(dependencyRoot, 'package.json'));
const { getDefaultConfig, mergeConfig } = requireDependencies('@react-native/metro-config');
const { createHarmonyMetroConfig } = requireDependencies('@react-native-oh/react-native-harmony/metro.config');
const metro = requireDependencies('metro');
async function build() {
  const root = path.join(fixture, 'js');
  process.chdir(root);
  fs.mkdirSync(path.join(fixture, 'entry/src/main/resources/rawfile'), { recursive: true });
  const config = mergeConfig(getDefaultConfig(root), createHarmonyMetroConfig({
    reactNativeHarmonyPackageName: '@react-native-oh/react-native-harmony',
  }), {
    projectRoot: root,
    watchFolders: [root, dependencyRoot],
    maxWorkers: 2,
    resolver: { nodeModulesPaths: [path.join(dependencyRoot, 'node_modules')] },
  });
  await metro.runBuild(config, {
    entry: 'direct.js', platform: 'harmony', dev, minify: false,
    out: path.join(fixture, 'entry/src/main/resources/rawfile/bundle.harmony.js'),
  });
  console.log('LINKING_DIRECT_BUNDLE_READY');
}
build().catch((error) => { console.error(error); process.exitCode = 1; });
