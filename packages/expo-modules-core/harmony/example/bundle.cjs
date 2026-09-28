const path = require('node:path');
const { createRequire } = require('node:module');

const root = path.resolve(process.argv[2]);
const dev = process.argv.includes('--dev');
const requireApp = createRequire(path.join(root, 'package.json'));
const { getDefaultConfig } = requireApp('@expo/metro-config');
const metro = requireApp('@expo/metro/metro');
const { loadConfig } = requireApp('@expo/metro/metro-config');
process.chdir(root);
async function build() {
const config = await loadConfig({ cwd: root }, getDefaultConfig(root, { platform: 'harmony' }));
config.maxWorkers = 2;
config.reporter = { update(event) { if (event.type === 'bundling_error') console.error(event.error); } };
const bundle = await metro.runBuild(config, {
  assets: true,
  entry: require('./tools/router-entry.cjs')(root) || (process.argv.includes('--expo') ? 'expo-entry.ts' : 'index.ts'),
  platform: 'harmony', dev, minify: false,
  out: path.join(root, 'harmony/entry/src/main/resources/rawfile/bundle.harmony.js'),
});
const { copyAssets } = requireApp('@react-native-oh/react-native-harmony-cli/dist/assetResolver');
await copyAssets({ info() {}, warn: console.warn }, bundle.assets,
  path.join(root, 'harmony/entry/src/main/resources/rawfile/assets'));
console.log('CORE_EXAMPLE_BUNDLE_READY');
}
build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
