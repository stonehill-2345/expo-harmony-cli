import { expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

it('links scoped screens using its unchanged native package identity', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autolinking-release-'));
  try {
    // Compile the real module without relying on upstream-only tsconfig links.
    for (const file of ['platforms/harmony/rnohConfig', 'ExpoModuleConfig', 'utils']) {
      const source = fs.readFileSync(path.resolve(__dirname, '../../../../packages/expo-modules-autolinking/src', `${file}.ts`), 'utf8');
      const target = path.join(root, 'compiled', `${file}.js`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText);
    }
    const { discoverRnohHarmonyConfigAsync } = createRequire(import.meta.url)(path.join(root, 'compiled/platforms/harmony/rnohConfig.js'));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: '@expo-oh/react-native-screens', version: '4.9.0' }));
    const config = await discoverRnohHarmonyConfigAsync(root, '@react-native-ohos/react-native-screens');
    expect(config).not.toBeNull();
    expect(config?.toJSON().harmony).toMatchObject({
      cpp: { packageClass: 'ScreensPackage', cmakeTarget: 'rnoh_screens' },
      ets: { importPath: '@react-native-ohos/react-native-screens', importKind: 'default' },
      har: { packageName: '@react-native-ohos/react-native-screens', transform: 'screens-content-wrapper-v1' },
    });
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: '@expo-oh/react-native-screens', version: '5.0.0' }));
    expect(await discoverRnohHarmonyConfigAsync(root, '@react-native-ohos/react-native-screens')).toBeNull();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
