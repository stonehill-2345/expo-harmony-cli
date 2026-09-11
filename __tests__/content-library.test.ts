import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { copyFromLibrary } from '../src/utils/content-library';
import { log } from '../src/utils/log';

const CONTENT = path.join(__dirname, '..', 'content');

function expectPatchHunksToBeWellFormed(patchPath: string): void {
  const lines = fs.readFileSync(patchPath, 'utf8').split('\n');
  if (lines.at(-1) === '') lines.pop();

  for (let index = 0; index < lines.length; index++) {
    const header = lines[index].match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (!header) continue;
    const headerLine = lines[index];

    let originalLines = 0;
    let patchedLines = 0;
    for (index += 1; index < lines.length && !lines[index].startsWith('@@ ') && !lines[index].startsWith('diff --git '); index++) {
      if (lines[index].startsWith('\\ No newline at end of file')) continue;
      if (!lines[index].startsWith('+')) originalLines++;
      if (!lines[index].startsWith('-')) patchedLines++;
    }
    index--;

    expect(originalLines, `${patchPath}: ${headerLine}`).toBe(Number(header[2] ?? 1));
    expect(patchedLines, `${patchPath}: ${headerLine}`).toBe(Number(header[4] ?? 1));
  }
}

describe('content-library', () => {
  it('内容库同时包含 SDK 52 和 SDK 54 两套 patch', () => {
    const patches = fs.readdirSync(path.join(CONTENT, 'patches')).filter(f => f.endsWith('.patch'));

    // SDK 54 patches
    expect(patches).toContain('@react-native-oh+react-native-harmony+0.82.30.patch');
    expect(patches).toContain('expo-router+6.0.24.patch');
    expect(patches).toContain('expo-linear-gradient+15.0.8.patch');
    expect(patches).toContain('expo-document-picker+14.0.8.patch');
    expect(patches).toContain('expo-constants+18.0.14.patch');
    expect(patches).toContain('expo-linking+8.0.12.patch');
    expect(patches).toContain('expo-image+3.0.11.patch');

    // SDK 52 patches
    expect(patches).toContain('@react-native-oh+react-native-harmony+0.77.71.patch');
    expect(patches).toContain('expo-router+4.0.22.patch');
    expect(patches).toContain('@react-native-oh-tpl+react-native-fast-image+8.6.3-0.4.17.patch');
    expect(patches).toContain('expo-constants+17.0.8.patch');
    expect(patches).toContain('expo-linking+7.0.5.patch');
    expect(patches).toContain('expo-image+2.0.7.patch');
    expect(patches).toContain('expo-clipboard+7.0.1.patch');
    expect(patches).toContain('expo-linear-gradient+14.0.2.patch');
    expect(patches).toContain('expo-image-picker+16.0.6.patch');
    expect(patches).toContain('expo-media-library+17.0.6.patch');
    expect(patches).toContain('expo-document-picker+13.0.3.patch');
    expect(patches).toContain('expo-modules-core+2.2.3.patch');

    // 共用 patch
    expect(patches).toContain('expo-status-bar+3.0.9.patch');
    expect(patches).toContain('@react-navigation+bottom-tabs+7.4.0.patch');
  });

  it('expo-metro-runtime shim 存在且导出 withErrorOverlay 透传', () => {
    const shim = fs.readFileSync(path.join(CONTENT, 'shims', 'expo-metro-runtime.ts'), 'utf8');
    expect(shim).toContain('export function withErrorOverlay');
  });

  it('expo-av shim 存在（install 按需）', () => {
    expect(fs.existsSync(path.join(CONTENT, 'shims', 'expo-av', 'index.ts'))).toBe(true);
  });

  it('所有 patch 的 hunk header 行数可被 patch-package 严格解析', () => {
    const patchDir = path.join(CONTENT, 'patches');
    for (const file of fs.readdirSync(patchDir).filter(name => name.endsWith('.patch'))) {
      expectPatchHunksToBeWellFormed(path.join(patchDir, file));
    }
  });

  it('用户修改内容库目标文件时跳过覆盖并发出警告', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'content-library-'));
    const targetPath = 'shims/expo-metro-runtime.ts';
    fs.mkdirSync(path.dirname(path.join(tmp, targetPath)), { recursive: true });
    fs.writeFileSync(path.join(tmp, targetPath), 'user modification');
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => undefined);

    expect(copyFromLibrary('content/shims/expo-metro-runtime.ts', tmp, targetPath)).toBe(false);
    expect(fs.readFileSync(path.join(tmp, targetPath), 'utf8')).toBe('user modification');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(targetPath));

    warn.mockRestore();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('6 文档模板存在 + 含占位符', () => {
    for (const doc of ['README.md', 'AGENTS.md', 'HARMONY.md', 'PATCHES.md', 'SIGNING.md', 'TROUBLESHOOTING.md']) {
      const content = fs.readFileSync(path.join(CONTENT, 'docs', doc), 'utf8');
      expect(content).toMatch(/\{\{appName\}\}|\{\{slug\}\}|\{\{bundleName\}\}|\{\{rnohVersion\}\}|\{\{expoSdk\}\}/);
    }
  });
});
