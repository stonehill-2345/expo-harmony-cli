import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { readPackedCli } from './helpers/packed-cli';

interface PackedPackageJson {
  name?: string;
  bin?: Record<string, string>;
  publishConfig?: Record<string, unknown>;
  repository?: { url?: string; directory?: string };
  bugs?: { url?: string };
  homepage?: string;
  dependencies?: Record<string, string>;
}

function assertPackedDistContainsStartHarmonyScript(cwd: string, files: string[]): void {
  expect(files).toContain('dist/injector/start-harmony.js');
  const writer = fs.readFileSync(path.join(cwd, 'dist/injector/start-harmony.js'), 'utf8');
  const packageJson = fs.readFileSync(path.join(cwd, 'dist/injector/package-json.js'), 'utf8');
  expect(writer).toContain('start-harmony.js');
  expect(writer).toContain("runHdcRport(hdc, 'tcp:8081', 'tcp:8081')");
  expect(writer).toContain('os.networkInterfaces');
  expect(writer).toContain('HARMONY_METRO_HOST');
  expect(writer).toContain('EXPO_PACKAGER_HOSTNAME');
  expect(writer).toContain('REACT_NATIVE_PACKAGER_HOSTNAME');
  expect(packageJson).toContain('node scripts/start-harmony.js');
  expect(packageJson).toContain('node scripts/bundle-harmony-dev.js');
}

function assertPackedDistContainsReleaseBundleScript(cwd: string, files: string[]): void {
  expect(files).toContain('dist/commands/sync.js');
  expect(files).toContain('dist/injector/bundle-harmony-dev.js');
  expect(files).toContain('dist/injector/bundle-harmony-release.js');
  const devWriter = fs.readFileSync(path.join(cwd, 'dist/injector/bundle-harmony-dev.js'), 'utf8');
  const writer = fs.readFileSync(path.join(cwd, 'dist/injector/bundle-harmony-release.js'), 'utf8');
  expect(devWriter).toContain('writeBundleHarmonyDev');
  expect(devWriter).toContain("'react-native.cmd' : 'react-native'");
  const syncCommand = fs.readFileSync(path.join(cwd, 'dist/commands/sync.js'), 'utf8');
  expect(syncCommand).toContain('syncHarmonyAutolinking');
  expect(writer).toContain('writeBundleHarmonyRelease');
  expect(writer).toContain('bundle.harmony.js');
  expect(writer).toContain('--bundle-output');
  expect(writer).toContain('--assets-dest');
  expect(writer).toContain("RN_BUNDLE_PLATFORM: 'harmony'");
}

function assertPackedDistContainsIconSymbolFallback(cwd: string, files: string[]): void {
  expect(files).toContain('dist/injector/icon-symbol.js');
  expect(files).toContain('dist/injector/index.js');
  const iconFallback = fs.readFileSync(path.join(cwd, 'dist/injector/icon-symbol.js'), 'utf8');
  const injector = fs.readFileSync(path.join(cwd, 'dist/injector/index.js'), 'utf8');
  expect(iconFallback).not.toContain('@expo/vector-icons');
  expect(iconFallback).not.toContain('MaterialIcons');
  expect(iconFallback).toContain('writeHarmonyIconSymbolFallback');
  expect(injector).toContain('writeHarmonyIconSymbolFallback');
}

function assertPackedDistContainsRequiredPackageJsonDependencies(cwd: string, files: string[]): void {
  expect(files).toContain('dist/injector/package-json.js');
  const content = fs.readFileSync(path.join(cwd, 'dist/injector/package-json.js'), 'utf8');
  // v1.3.0: getVersionMatrix(sdk) 动态获取矩阵，bundled JS 不再包含字面 VERSION_MATRIX
  expect(content).toContain("'@babel/runtime'");
  expect(content).toContain('getVersionMatrix');
  expect(content).toContain("'@react-navigation/elements'");
  expect(content).toContain("'@react-native/metro-config'");
}

function assertPackedContentContainsHarmonyRuntimeShims(cwd: string, files: string[]): void {
  expect(files).toContain('content/shims/expo-metro-runtime.ts');
  expect(files).not.toContain('content/shims/expo-modules-core/NativeModulesProxy.ts');
  expect(files).toContain('content/templates/postinstall-harmony.js');

  const postinstall = fs.readFileSync(path.join(cwd, 'content/templates/postinstall-harmony.js'), 'utf8');
  expect(postinstall).toContain('ensureRNOHLogBoxImages');
  expect(postinstall).toContain('LogBoxImages');
}

function assertPackedContentDoesNotContainLocalState(cwd: string, files: string[]): void {
  const forbidden = [/\/Users\/wum\//, /\/Users\/wum\/tmp/, /\b172\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/, /file:\/Users\//, /file:\/private\//];
  const textExtensions = new Set(['.ts', '.js', '.json', '.md', '.patch', '.txt', '']);

  for (const packedFile of files) {
    if (!packedFile.startsWith('content/')) continue;
    const absolutePath = path.join(cwd, packedFile);
    if (!fs.existsSync(absolutePath) || !textExtensions.has(path.extname(absolutePath))) continue;
    const content = fs.readFileSync(absolutePath, 'utf8');
    for (const pattern of forbidden) {
      expect(content, `${packedFile} should not contain ${pattern}`).not.toMatch(pattern);
    }
  }
}

describe('expo-harmony-cli 实际打包产物', () => {
  it('从源码生成入口，并清理旧编译文件', () => {
    const { files } = readPackedCli();
    expect(files).toContain('dist/index.js');
    expect(files).not.toContain('dist/obsolete.js');
  });

  it('ships CLI dist output and Harmony content assets', () => {
    const { root: cwd, files, archiveName } = readPackedCli();

    expect(archiveName).toBe('expo-harmony-cli-1.5.1.tgz');
    expect(files).toContain('dist/index.js');
    expect(files).toContain('README.md');
    expect(files).toContain('CHANGELOG.md');
    expect(files).toContain('NOTICE.md');
    expect(files).toContain('dist/commands/prebuild.js');
    expect(files).toContain('dist/commands/uninstall.js');
    expect(files).toContain('dist/installer/uninstaller.js');
    expect(files).toContain('dist/lifecycle/managed-state.js');
    expect(files).toContain('content/templates/index.harmony.js');
    expect(files).toContain('content/templates/postinstall-harmony.js');
    expect(files).toContain('content/shims/expo-metro-runtime.ts');
    expect(files).toContain('content/patches/sdk-54/manifest.json');
    const sdk54Manifest = JSON.parse(fs.readFileSync(path.join(cwd, 'content/patches/sdk-54/manifest.json'), 'utf8'));
    expect(sdk54Manifest.patches.filter((patch: any) => patch.name in sdk54Manifest.catalog.expo)).toHaveLength(14);
    expect(sdk54Manifest.patches).toHaveLength(15);
    for (const patch of sdk54Manifest.patches) {
      const relative = `content/patches/sdk-54/${patch.file}`;
      expect(files).toContain(relative);
      const actualSha = createHash('sha256').update(fs.readFileSync(path.join(cwd, relative))).digest('hex');
      expect(actualSha).toBe(patch.sha256);
      for (const license of patch.licenses) expect(files).toContain(`content/patches/sdk-54/${license}`);
    }
    const declaredSdk54Assets = new Set([
      'content/patches/sdk-54/manifest.json',
      ...sdk54Manifest.patches.flatMap((patch: any) => [
        `content/patches/sdk-54/${patch.file}`,
        ...patch.licenses.map((license: string) => `content/patches/sdk-54/${license}`),
      ]),
    ]);
    expect(files.filter(file => file.startsWith('content/patches/sdk-54/')).sort())
      .toEqual([...declaredSdk54Assets].sort());
    for (const runtimeFile of [
      'dist/sdk54/create-options.js', 'dist/sdk54/create.js', 'dist/sdk54/default-image-substitution.js',
      'dist/sdk54/docs.js', 'dist/sdk54/doctor.js', 'dist/sdk54/file-transaction.js',
      'dist/sdk54/install-patches.js', 'dist/sdk54/package-json.js', 'dist/sdk54/patch-manifest.js',
      'dist/sdk54/project-state.js', 'dist/sdk54/template-contract.js', 'dist/sdk54/verify-runtime.js',
    ]) expect(files).toContain(runtimeFile);
    expect(files).toContain('content/docs/sdk-54/HARMONY.md');
    expect(files).toContain('content/docs/README.md');
    expect(files).toContain('content/docs/AGENTS.md');
    expect(files).toContain('content/docs/HARMONY.md');
    expect(files).toContain('content/skills/expo-harmony-adapter/SKILL.md');
    expect(files).toContain('content/skills/harmony-plugin-integration/SKILL.md');
    expect(files).toContain('templates/harmony-sdk-54.manifest.json');
    expect(files).toContain('templates/harmony/entry/src/main/cpp/CMakeLists.txt');
    expect(files).toContain('templates/harmony/entry/src/main/resources/rawfile/.gitkeep');
    expect(files.some(file => file.startsWith('examples/'))).toBe(false);
    expect(files.some(file => file.startsWith('.github/'))).toBe(false);
    expect(files.some(file => !file.startsWith('templates/harmony') && /(^|\/)(?:__tests__|tests?|node_modules)(\/|$)|\.(?:test|spec)\.[^.]+$|\.(?:tgz|hap|har)$|(?:acceptance|evidence|release-report).*\.json$/i.test(file))).toBe(false);
    const packedPackageJson = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
    expect(packedPackageJson.version).toBe('1.5.1');
    const sensitive = [/\/Users\//, /\/private\/tmp\//, /[A-Za-z]:\\Users\\/, /\b10\.(?:\d{1,3}\.){2}\d{1,3}\b/, /\b192\.168\.(?:\d{1,3}\.)\d{1,3}\b/, /\b172\.(?:1[6-9]|2\d|3[01])\.(?:\d{1,3}\.)\d{1,3}\b/];
    const textExtensions = new Set(['.js', '.mjs', '.cjs', '.json', '.md', '.ts', '.patch', '.txt', '.json5', '.ets', '.cpp', '.h', '.cmake', '.yaml', '.yml', '.xml', '.properties', '.gradle', '']);
    for (const file of files) {
      const absolute = path.join(cwd, file);
      if (!fs.existsSync(absolute) || !textExtensions.has(path.extname(file))) continue;
      const content = fs.readFileSync(absolute, 'utf8');
      for (const pattern of sensitive) expect(content, `${file} contains ${pattern}`).not.toMatch(pattern);
    }

    assertPackedDistContainsRequiredPackageJsonDependencies(cwd, files);
    assertPackedContentContainsHarmonyRuntimeShims(cwd, files);
    assertPackedDistContainsStartHarmonyScript(cwd, files);
    assertPackedDistContainsReleaseBundleScript(cwd, files);
    assertPackedDistContainsIconSymbolFallback(cwd, files);
    assertPackedContentDoesNotContainLocalState(cwd, files);
  });

  it('pnpm pack 是自包含的，不声明已合并的内部包依赖', () => {
    const { root } = readPackedCli();
    const packedPackageJson: PackedPackageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(packedPackageJson.name).toBe('expo-harmony-cli');
    expect(packedPackageJson.bin).toEqual({ 'expo-harmony-cli': 'dist/index.js' });
    expect(packedPackageJson.publishConfig).toBeUndefined();
    expect(packedPackageJson.repository?.url).toBe('https://github.com/stonehill-2345/expo-harmony-cli.git');
    expect(packedPackageJson.repository?.directory).toBe('apps/cli');
    expect(packedPackageJson.bugs?.url).toBe('https://github.com/stonehill-2345/expo-harmony-cli/issues');
    expect(packedPackageJson.homepage).toBe('https://github.com/stonehill-2345/expo-harmony-cli#readme');
    expect(packedPackageJson.dependencies?.['expo-harmony-project']).toBeUndefined();
    expect(packedPackageJson.dependencies?.['harmony-skills']).toBeUndefined();
  });
});
