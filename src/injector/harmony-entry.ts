import * as fs from 'fs';
import * as path from 'path';

/** 写 index.harmony.js（{{scheme}} 替换）+ copy Harmony shims + 初始 .alias-map.json。*/
export function writeHarmonyEntry(targetDir: string, scheme: string): void {
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

  // 初始 .alias-map.json（scanAndAdapt Task 6 会合并更多）
  const aliasMap = {
    '@expo/metro-runtime': './shims/expo-metro-runtime.ts',
  };
  fs.writeFileSync(path.join(shimsDir, '.alias-map.json'), JSON.stringify(aliasMap, null, 2));
}
