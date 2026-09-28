jest.unmock('fs');
jest.unmock('fs/promises');
jest.unmock('node:fs');
jest.unmock('node:fs/promises');

import fs from 'fs';
import path from 'path';

const packageRoot = path.resolve(__dirname, '../../..');
const templateRoot = path.join(packageRoot, 'templates', 'harmony');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(templateRoot, relativePath), 'utf8');
}

function listFiles(root: string): string[] {
  return fs
    .readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)))
    .sort();
}

describe('Harmony native project template', () => {
  it('wires generated Expo modules without application shims or test packages', () => {
    const files = listFiles(templateRoot);
    const cmake = read('entry/src/main/cpp/CMakeLists.txt');
    const index = read('entry/src/main/ets/pages/Index.ets');
    const entryAbility = read('entry/src/main/ets/entryability/EntryAbility.ets');
    const allText = files
      .filter((file) => !/\.(png|jpg|jpeg|webp)$/i.test(file))
      .map((file) => read(file))
      .join('\n');

    expect(cmake).toContain('generated/ExpoModulesPackages.cpp');
    expect(cmake).toContain('generated/expo-modules.cmake');
    expect(index).toContain("from '../generated/ExpoModulesPackages'");
    expect(index).toContain("from '../generated/ExpoModulesAppOverlays'");
    expect(index).toContain('new MetroJSBundleProvider');
    expect(index).toContain('new ResourceJSBundleProvider');
    expect(index).not.toContain('AnyJSBundleProvider');
    expect(index.indexOf('ExpoModulesAppOverlays()')).toBeGreaterThan(index.indexOf('RNApp({'));
    expect(entryAbility).toContain('new ExpoModulesLifecycle()');
    expect(entryAbility).toContain('this.expoModulesLifecycle.onCreate(want)');
    expect(entryAbility).toContain('this.expoModulesLifecycle.onNewWant(want)');
    expect(entryAbility).toContain('this.expoModulesLifecycle.onDestroy()');
    expect(entryAbility).not.toContain('ExpoSplashScreenController');
    expect(entryAbility).not.toContain("from 'expo-splash-screen/harmony'");
    expect(index).not.toContain('ExpoSplashScreenView');
    expect(index).not.toContain("@StorageLink('ExpoSplashScreenController')");
    expect(index).not.toContain("from 'expo-splash-screen/harmony'");
    expect(entryAbility).not.toContain('getRNOHWorkerScriptUrl');

    expect(files).not.toContain('metro.config.js');
    expect(files).not.toContain('index.harmony.js');
    expect(files).not.toContain('entry/src/main/ets/workers/RNOHWorker.ets');
    expect(allText).not.toMatch(/ExpoCoreTest|InteropProbe|LaneB|I0_/);
    expect(allText).not.toMatch(/\/private\/tmp|\/tmp\//);
    expect(allText).not.toContain('expo-linking/harmony');
  });

  it('contains only template placeholders for application identity', () => {
    expect(read('AppScope/app.json5')).toContain('__EXPO_BUNDLE_NAME__');
    expect(read('AppScope/resources/base/element/string.json')).toContain('__EXPO_APP_NAME__');
    expect(read('entry/src/main/resources/base/element/string.json')).toContain(
      '__EXPO_APP_NAME__'
    );
  });
});
