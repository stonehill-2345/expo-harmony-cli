// Generates an isolated HAR project using real RNOH headers/ArkTS, without modifying the donor.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const [output, rnohRoot] = process.argv.slice(2).map(value => path.resolve(value));
assert.ok(output && rnohRoot, 'Usage: prepare-native-check.cjs <new-output-dir> <RNOH-0.82.30-root>');
assert.ok(!fs.existsSync(output), 'Output must be a new directory');
const rnohManifest = fs.readFileSync(path.join(rnohRoot, 'oh-package.json5'), 'utf8');
const rnohVersion = rnohManifest.match(/^(?:\s*)["']?version["']?\s*:\s*["']([^"']+)["']/m)?.[1];
assert.equal(rnohVersion, '0.82.30');
const ts = createRequire(path.join(process.env.EXPO_HARMONY_TOOLING_ROOT, 'package.json'))('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText, file);

const packagesRoot = path.resolve(__dirname, '../../..');
const { renderExpoModulesAppOverlays, renderExpoModulesLifecycle } = require(
  path.join(packagesRoot, 'expo-modules-autolinking/src/platforms/harmony/nativeProject.ts')
);
function write(file, value) {
  const target = path.join(output, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}

write('oh-package.json5', { modelVersion: '6.0.2', name: 'web-browser-check', version: '1.0.0' });
write('build-profile.json5', {
  app: {
    products: [{ name: 'default', compatibleSdkVersion: '6.0.0(20)', targetSdkVersion: '6.0.2(22)', runtimeOS: 'HarmonyOS' }],
    buildModeSet: [{ name: 'debug' }, { name: 'release' }],
  },
  modules: [{ name: 'browser', srcPath: './browser', targets: [{ name: 'default', applyToProducts: ['default'] }] }],
});
write('hvigor/hvigor-config.json5', { modelVersion: '6.0.2', dependencies: {} });
write('hvigorfile.ts', "import { appTasks } from '@ohos/hvigor-ohos-plugin';\nexport default { system: appTasks };\n");
write('AppScope/app.json5', { app: {
  bundleName: 'com.expo.webbrowser.check', vendor: 'expo', versionCode: 1, versionName: '1.0.0',
  icon: '$media:app_icon', label: '$string:app_name',
} });
write('AppScope/resources/base/element/string.json', { string: [{ name: 'app_name', value: 'WebBrowser check' }] });
write('AppScope/resources/base/media/app_icon.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="white"/></svg>');
write('browser/hvigorfile.ts', "import { harTasks } from '@ohos/hvigor-ohos-plugin';\nexport default { system: harTasks };\n");
write('browser/build-profile.json5', { apiType: 'stageMode', targets: [{ name: 'default' }] });
write('browser/oh-package.json5', { name: 'browser', version: '1.0.0', main: 'Index.ets', dependencies: { '@rnoh/react-native-openharmony': '0.82.30' } });
write('browser/src/main/module.json5', { module: { name: 'browser', type: 'har', deviceTypes: ['phone', 'tablet'] } });

const modules = ['expo-splash-screen', 'expo-web-browser'].map(packageName => {
  const source = path.join(packagesRoot, packageName, 'harmony');
  const target = path.join(output, 'browser/src/main/ets', packageName);
  fs.mkdirSync(target, { recursive: true });
  fs.copyFileSync(path.join(source, 'index.ets'), path.join(target, 'index.ets'));
  fs.cpSync(path.join(source, 'src'), path.join(target, 'src'), { recursive: true });
  return { packageName, lifecycleDependencies: require(path.join(packagesRoot, packageName, 'expo-module.config.json')).harmony.lifecycleDependencies };
});
for (const [name, render] of [['ExpoModulesAppOverlays', renderExpoModulesAppOverlays], ['ExpoModulesLifecycle', renderExpoModulesLifecycle]]) {
  let generated = render(modules);
  for (const module of modules) generated = generated.replaceAll(`${module.packageName}/harmony`, `./${module.packageName}/index`);
  write(`browser/src/main/ets/${name}.ets`, generated);
}
write('browser/Index.ets', "export * from './src/main/ets/expo-web-browser/index';\nexport { ExpoModulesAppOverlays } from './src/main/ets/ExpoModulesAppOverlays';\nexport { ExpoModulesLifecycle } from './src/main/ets/ExpoModulesLifecycle';\n");
fs.mkdirSync(path.join(output, 'browser/oh_modules/@rnoh'), { recursive: true });
fs.symlinkSync(rnohRoot, path.join(output, 'browser/oh_modules/@rnoh/react-native-openharmony'));
console.log(output);
