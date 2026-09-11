import * as fs from 'fs';
import * as path from 'path';
import type { SdkVersion } from '../version-matrix';

/** 写 index.harmony.js（{{scheme}} 替换）+ copy Harmony shims + 初始 .alias-map.json。*/
export function writeHarmonyEntry(targetDir: string, scheme: string, sdk: SdkVersion): void {
  fs.writeFileSync(
    path.join(targetDir, 'index.js'),
    "// Keep the standard Expo Router bootstrap for iOS, Android, and web.\nrequire('expo-router/entry');\n",
  );

  // index.harmony.js（从 content/templates 读 + 替换 {{scheme}}）
  const templateSrc = path.join(__dirname, '..', '..', 'content', 'templates', 'index.harmony.js');
  const content = fs.readFileSync(templateSrc, 'utf8').split('{{scheme}}').join(scheme);
  fs.writeFileSync(path.join(targetDir, 'index.harmony.js'), content);

  // Harmony runtime shims
  const shimsDir = path.join(targetDir, 'shims');
  fs.mkdirSync(shimsDir, { recursive: true });
  const shimsSrc = path.join(__dirname, '..', '..', 'content', 'shims');
  fs.copyFileSync(
    path.join(shimsSrc, 'expo-metro-runtime.ts'),
    path.join(shimsDir, 'expo-metro-runtime.ts'),
  );
  fs.copyFileSync(
    path.join(shimsSrc, 'expo-asset.ts'),
    path.join(shimsDir, 'expo-asset.ts'),
  );
  fs.copyFileSync(
    path.join(shimsSrc, 'harmony-form-data.js'),
    path.join(shimsDir, 'harmony-form-data.js'),
  );

  // 从 SDK 对应目录复制所有 patch 到项目（patch-package 在 postinstall 阶段 apply）
  const patchesDir = path.join(targetDir, 'patches');
  fs.mkdirSync(patchesDir, { recursive: true });
  const patchesSrc = path.join(__dirname, '..', '..', 'content', 'patches', sdk);
  if (fs.existsSync(patchesSrc)) {
    for (const f of fs.readdirSync(patchesSrc)) {
      if (f.endsWith('.patch')) {
        fs.copyFileSync(path.join(patchesSrc, f), path.join(patchesDir, f));
      }
    }
  }

  // 初始 .alias-map.json（scanAndAdapt Task 6 会合并更多）
  const aliasMap = {
    '@expo/metro-runtime': './shims/expo-metro-runtime.ts',
    '@expo/metro-runtime/error-overlay': './shims/expo-metro-runtime.ts',
    'expo-asset': './shims/expo-asset.ts',
  };
  fs.writeFileSync(path.join(shimsDir, '.alias-map.json'), JSON.stringify(aliasMap, null, 2));
}
