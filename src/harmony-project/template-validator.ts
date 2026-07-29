import * as fs from 'fs';
import * as path from 'path';
import type { HarmonyTemplateManifest } from './template-manifest';

const TEXT_EXTENSIONS = new Set([
  '.ets', '.ts', '.js', '.json', '.json5', '.txt', '.cmake', '.h', '.cpp', '.c', '.md', '.xml', '',
]);

const macHomeSegment = 'Us' + 'ers';
const privateTmpSegment = 'pri' + 'vate/tmp';
const fileScheme = 'file:/' + '/';

const FORBIDDEN_PATTERNS: Array<[RegExp, string]> = [
  [new RegExp(`/${macHomeSegment}/`), 'macOS home path'],
  [new RegExp(`/${privateTmpSegment}`), 'local temp path'],
  [new RegExp(`${fileScheme}${macHomeSegment}/`), 'file URL home path'],
  [new RegExp(`${fileScheme}pri` + 'vate/'), 'file URL local path'],
  [/\b172\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/, '172.x.x.x'],
];

export function validateHarmonyTemplate(templateDir: string, manifest: HarmonyTemplateManifest): void {
  if (!fs.existsSync(templateDir)) {
    throw new Error(`Missing Harmony template directory: ${templateDir}`);
  }

  for (const requiredFile of manifest.requiredFiles) {
    const absolutePath = path.join(templateDir, requiredFile);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Missing Harmony template required file: ${requiredFile}`);
    }
  }

  assertFileContains(templateDir, 'entry/build-profile.json5', '"externalNativeOptions"', 'entry/build-profile.json5 must configure native build externalNativeOptions');
  assertFileContains(templateDir, 'entry/build-profile.json5', '"path": "./src/main/cpp/CMakeLists.txt"', 'entry/build-profile.json5 must point to ./src/main/cpp/CMakeLists.txt');
  assertFileContains(templateDir, 'entry/src/main/cpp/generated/RNOHGeneratedPackage.h', 'class RNOHGeneratedPackage', 'RNOHGeneratedPackage.h must define RNOHGeneratedPackage');
  assertFileContains(templateDir, 'entry/src/main/ets/entryability/EntryAbility.ets', 'extends RNAbility', 'EntryAbility.ets must extend RNAbility');
  assertFileContains(templateDir, 'entry/src/main/ets/entryability/EntryAbility.ets', 'super.onWindowStageCreate(windowStage)', 'EntryAbility.ets must call super.onWindowStageCreate(windowStage)');
  assertFileContains(templateDir, 'entry/src/main/cpp/CMakeLists.txt', 'resolve_oh_package_cpp(RNOH_CPP_DIR "@rnoh/react-native-openharmony")', 'CMakeLists.txt must resolve RNOH through resolve_oh_package_cpp');
  assertFileContains(templateDir, 'entry/src/main/cpp/CMakeLists.txt', '/.ohpm/${package_key}*/oh_modules/${package_name}/src/main/cpp', 'CMakeLists.txt must resolve ohpm .ohpm package layout');
  assertFileContains(templateDir, 'entry/oh-package.json5', '"@rnoh/react-native-openharmony"', 'entry/oh-package.json5 must declare @rnoh/react-native-openharmony for ArkTS imports');
  assertFileContains(templateDir, 'AppScope/app.json5', '"icon": "$media:layered_image"', 'AppScope/app.json5 must reference $media:layered_image');
  assertFileNotContains(templateDir, 'AppScope/app.json5', '$media:app_icon', 'AppScope/app.json5 must not reference undefined $media:app_icon');

  for (const file of listTemplateFiles(templateDir)) {
    if (!isTextFile(file)) continue;
    const relativePath = normalizeRelativePath(path.relative(templateDir, file));
    const content = fs.readFileSync(file, 'utf8');
    for (const [pattern, label] of FORBIDDEN_PATTERNS) {
      if (pattern.test(content)) {
        throw new Error(`Harmony template file ${relativePath} contains forbidden local pattern: ${label}`);
      }
    }
  }
}

function assertFileContains(templateDir: string, relativePath: string, expected: string, message: string): void {
  const file = path.join(templateDir, relativePath);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing Harmony template required file: ${relativePath}`);
  }
  const content = fs.readFileSync(file, 'utf8');
  if (!content.includes(expected)) {
    throw new Error(message);
  }
}

function assertFileNotContains(templateDir: string, relativePath: string, forbidden: string, message: string): void {
  const file = path.join(templateDir, relativePath);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing Harmony template required file: ${relativePath}`);
  }
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes(forbidden)) {
    throw new Error(message);
  }
}

function listTemplateFiles(dir: string): string[] {
  const result: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...listTemplateFiles(fullPath));
    } else if (entry.isFile()) {
      result.push(fullPath);
    }
  }
  return result;
}

function isTextFile(file: string): boolean {
  return TEXT_EXTENSIONS.has(path.extname(file));
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}
