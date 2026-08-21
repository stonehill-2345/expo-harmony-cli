import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { copyFromLibrary } from '../src/utils/content-library';
import { log } from '../src/utils/log';

const CONTENT = path.join(__dirname, '..', 'content');

describe('content-library', () => {
  it('14 patch 存在', () => {
    const patches = fs.readdirSync(path.join(CONTENT, 'patches')).filter(f => f.endsWith('.patch'));
    expect(patches.length).toBe(14);
    expect(patches).toContain('@react-native-oh+react-native-harmony+0.77.71.patch');
    expect(patches).toContain('expo-modules-core+2.2.3.patch');
    expect(patches).toContain('expo-router+4.0.22.patch');
  });

  it('expo-metro-runtime shim 存在且导出 withErrorOverlay 透传', () => {
    const shim = fs.readFileSync(path.join(CONTENT, 'shims', 'expo-metro-runtime.ts'), 'utf8');
    expect(shim).toContain('export function withErrorOverlay');
  });

  it('expo-av shim 存在（install 按需）', () => {
    expect(fs.existsSync(path.join(CONTENT, 'shims', 'expo-av', 'index.ts'))).toBe(true);
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
