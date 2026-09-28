const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = fs.realpathSync(process.argv[2]);
const mode = process.argv[3];
if (!['debug', 'release'].includes(mode)) throw new Error('Expected debug or release');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'source-manifest.json')));
if (!manifest.integration) throw new Error('Prepare with --i0 first');
const dev = mode === 'debug';
const embeddedBundlePath = path.join(root, 'harmony/entry/src/main/resources/rawfile/bundle.harmony.js');
if (dev) fs.rmSync(embeddedBundlePath, { force: true });
fs.writeFileSync(path.join(root, 'expected-build.json'), JSON.stringify({
  debugMode: dev, runId: `i0-${mode}-${Date.now()}`,
}) + '\n');
execFileSync(process.execPath, [path.join(root, 'node_modules/expo-constants/scripts/getAppConfig.js'),
  root, path.join(root, 'harmony/entry/src/main/resources/rawfile')], {
  stdio: 'inherit', env: { ...process.env, NODE_ENV: dev ? 'development' : 'production' },
});
const devUrl = require('./router-entry.cjs')(root, true) || 'http://127.0.0.1:8081/expo-entry.bundle?platform=harmony&dev=true&minify=false';
const provider = dev ? `new MetroJSBundleProvider('${devUrl}', ['main'])`
  : "new ResourceJSBundleProvider(this.ctx.uiAbilityContext.resourceManager, 'bundle.harmony.js')";
const indexPath = path.join(root, 'harmony/entry/src/main/ets/pages/Index.ets');
let page = fs.readFileSync(indexPath, 'utf8');
const imports = /RNApp, (?:MetroJSBundleProvider, )?ResourceJSBundleProvider/;
const bundleProvider = /^(\s*)jsBundleProvider: .*,$/m;
if (!imports.test(page) || !bundleProvider.test(page)) throw new Error('Generated Index bundle provider changed');
page = page.replace(imports, 'RNApp, MetroJSBundleProvider, ResourceJSBundleProvider');
page = page.replace(bundleProvider, `$1jsBundleProvider: ${provider},`);
fs.writeFileSync(indexPath, page);
