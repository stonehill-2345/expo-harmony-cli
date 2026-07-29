import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { resolveCommand } from '../../utils/exec';

interface PackFile {
  path: string;
}

function packageRoot(): string {
  return path.resolve(__dirname, '..', '..', '..');
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

function assertPackedDistContainsMetro8888Provider(cwd: string, files: string[]): void {
  expect(files).toContain('dist/harmony-project/templates/EntryIndexTemplate.js');
  const content = fs.readFileSync(path.join(cwd, 'dist/harmony-project/templates/EntryIndexTemplate.js'), 'utf8');
  expect(content).toContain('localhost:8888');
  expect(content).toContain('createMetroJSBundleProvider(this.rnohCoreContext)');
  expect(content).not.toContain('new MetroJSBundleProvider()');
  expect(content).not.toContain('localhost:8081');
}

function assertPackedFilesDoNotContainLocalState(cwd: string, files: string[]): void {
  const forbidden = [/\/Users\/wum\//, /\/Users\/wum\/tmp/, /\b172\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/, /file:\/Users\//, /file:\/private\//];
  const textExtensions = new Set(['.ets', '.ts', '.js', '.json', '.json5', '.txt', '.cmake', '.h', '.cpp', '.c', '.md', '.xml', '']);

  for (const packedFile of files) {
    if (!packedFile.startsWith('templates/harmony/')) continue;
    const absolutePath = path.join(cwd, packedFile);
    if (!fs.existsSync(absolutePath) || !textExtensions.has(path.extname(absolutePath))) continue;
    const content = fs.readFileSync(absolutePath, 'utf8');
    for (const pattern of forbidden) {
      expect(content, `${packedFile} should not contain ${pattern}`).not.toMatch(pattern);
    }
  }
}

describe('内置 HarmonyOS 生成器 pack 文件', () => {
  it('ships the bundled HarmonyOS template, manifest, and runtime build output', () => {
    const cwd = packageRoot();
    const files = dryRunPackFiles(cwd);

    expect(files).toContain('dist/harmony-project/index.js');
    expect(files).toContain('dist/harmony-project/template-source.js');
    expect(files).toContain('dist/harmony-project/template-validator.js');
    expect(files).toContain('templates/harmony-template.manifest.json');
    expect(files).toContain('templates/harmony/entry/src/main/cpp/CMakeLists.txt');
    expect(files).toContain('templates/harmony/entry/src/main/cpp/generated/RNOHGeneratedPackage.h');
    expect(files).not.toContain('templates/harmony/.hvigor/dependencyMap/dependencyMap.json5');
    expect(files).not.toContain('templates/harmony/.idea/.deveco/module/entry.cache.json');

    assertPackedDistContainsMetro8888Provider(cwd, files);
    assertPackedFilesDoNotContainLocalState(cwd, files);
  });
});
