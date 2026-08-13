import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { resolveCommand } from '../src/utils/exec';

interface PackFile {
  path: string;
}

interface PackedPackageJson {
  name?: string;
  bin?: Record<string, string>;
  publishConfig?: Record<string, unknown>;
  repository?: { url?: string; directory?: string };
  bugs?: { url?: string };
  homepage?: string;
  dependencies?: Record<string, string>;
}

function packageRoot(): string {
  return path.resolve(__dirname, '..');
}

function dryRunPackFiles(cwd: string): string[] {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-pack-cache-'));
  try {
    const output = execFileSync(resolveCommand('npm'), ['pack', '--dry-run', '--json'], {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        npm_config_cache: cacheDir,
        npm_config_loglevel: 'silent',
      },
    });
    const parsed = JSON.parse(output) as Array<{ files: PackFile[] }>;
    return parsed[0].files.map(file => file.path).sort();
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
}

function readPnpmPackedPackageJson(cwd: string): PackedPackageJson {
  const destination = fs.mkdtempSync(path.join(os.tmpdir(), 'pnpm-pack-'));
  try {
    execFileSync(resolveCommand('pnpm'), ['pack', '--pack-destination', destination], { cwd, stdio: 'ignore' });
    const tarball = fs.readdirSync(destination).find(file => file.endsWith('.tgz'));
    if (!tarball) throw new Error('pnpm pack did not produce a tarball');
    const content = execFileSync('tar', ['-xOf', path.join(destination, tarball), 'package/package.json'], {
      encoding: 'utf8',
    });
    return JSON.parse(content) as PackedPackageJson;
  } finally {
    fs.rmSync(destination, { recursive: true, force: true });
  }
}

function assertPackedDistContainsStartHarmonyScript(cwd: string, files: string[]): void {
  expect(files).toContain('dist/injector/start-harmony.js');
  const writer = fs.readFileSync(path.join(cwd, 'dist/injector/start-harmony.js'), 'utf8');
  const packageJson = fs.readFileSync(path.join(cwd, 'dist/injector/package-json.js'), 'utf8');
  expect(writer).toContain('start-harmony.js');
  expect(writer).toContain("runHdcRport(hdc, 'tcp:8888', 'tcp:8888')");
  expect(writer).toContain("runHdcRport(hdc, 'tcp:8081', 'tcp:8888')");
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
  expect(content).toContain("'@babel/runtime'");
  expect(content).toContain('VERSION_MATRIX.babelRuntime');
  expect(content).toContain("'@react-navigation/elements'");
  expect(content).toContain('VERSION_MATRIX.reactNavigationElements');
  expect(content).toContain("'@react-native/metro-config'");
  expect(content).toContain('VERSION_MATRIX.reactNative');
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

describe('expo-harmony-cli npm pack files', () => {
  it('ships CLI dist output and Harmony content assets', () => {
    const cwd = packageRoot();
    const files = dryRunPackFiles(cwd);

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
    expect(files).toContain('content/patches/@react-native-oh+react-native-harmony+0.77.71.patch');
    expect(files).toContain('content/docs/README.md');
    expect(files).toContain('content/docs/AGENTS.md');
    expect(files).toContain('content/docs/HARMONY.md');
    expect(files).toContain('content/skills/expo-harmony-adapter/SKILL.md');
    expect(files).toContain('content/skills/harmony-plugin-integration/SKILL.md');
    expect(files).toContain('templates/harmony-template.manifest.json');
    expect(files).toContain('templates/harmony/entry/src/main/cpp/CMakeLists.txt');
    expect(files).toContain('templates/harmony/entry/src/main/resources/rawfile/.gitkeep');
    expect(files.some(file => file.startsWith('examples/'))).toBe(false);
    expect(files.some(file => file.startsWith('.github/'))).toBe(false);

    assertPackedDistContainsRequiredPackageJsonDependencies(cwd, files);
    assertPackedContentContainsHarmonyRuntimeShims(cwd, files);
    assertPackedDistContainsStartHarmonyScript(cwd, files);
    assertPackedDistContainsReleaseBundleScript(cwd, files);
    assertPackedDistContainsIconSymbolFallback(cwd, files);
    assertPackedContentDoesNotContainLocalState(cwd, files);
  });

  it('pnpm pack 是自包含的，不声明已合并的内部包依赖', () => {
    const packedPackageJson = readPnpmPackedPackageJson(packageRoot());
    expect(packedPackageJson.name).toBe('expo-harmony-cli');
    expect(packedPackageJson.bin).toEqual({ 'expo-harmony-cli': 'dist/index.js' });
    expect(packedPackageJson.publishConfig).toBeUndefined();
    expect(packedPackageJson.repository?.url).toBe('https://github.com/stonehill-2345/expo-harmony-cli.git');
    expect(packedPackageJson.repository?.directory).toBeUndefined();
    expect(packedPackageJson.bugs?.url).toBe('https://github.com/stonehill-2345/expo-harmony-cli/issues');
    expect(packedPackageJson.homepage).toBe('https://github.com/stonehill-2345/expo-harmony-cli#readme');
    expect(packedPackageJson.dependencies?.['expo-harmony-project']).toBeUndefined();
    expect(packedPackageJson.dependencies?.['harmony-skills']).toBeUndefined();
  });
});
