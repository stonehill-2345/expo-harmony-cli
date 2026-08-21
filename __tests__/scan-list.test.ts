import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('scan 命令', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-cmd-'));
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ dependencies: { 'expo-haptics': '~14.0.1' } }));
    fs.mkdirSync(path.join(tmp, 'shims'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'shims/.alias-map.json'), '{}');
    process.chdir(tmp);
  });
  afterEach(() => { process.chdir(__dirname); fs.rmSync(tmp, { recursive: true, force: true }); });

  it('scan 默认只读预览，--apply 才删除 expo-haptics', async () => {
    const { scan } = await import('../src/commands/scan');
    await scan([]);
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    expect(pkg.dependencies['expo-haptics']).toBe('~14.0.1');
    await scan(['--apply']);
    const applied = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    expect(applied.dependencies['expo-haptics']).toBeUndefined();
  });

  it('已有 harmony/ 时提示安装依赖后执行 sync', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    fs.mkdirSync(path.join(tmp, 'harmony'));
    const { scan } = await import('../src/commands/scan');
    await scan(['--apply']);
    expect(output.mock.calls.flat().join('\n')).toContain('pnpm install，然后执行 pnpm dlx expo-harmony-cli sync');
    output.mockRestore();
  });

  it('非项目根 → 报错', async () => {
    fs.unlinkSync(path.join(tmp, 'package.json'));
    const { scan } = await import('../src/commands/scan');
    await expect(scan([])).rejects.toThrow(/项目根|package\.json/i);
  });
});

describe('list 命令', () => {
  it('list 不抛错（列 compat-table）', async () => {
    const { list } = await import('../src/commands/list');
    expect(() => list()).not.toThrow();
  });
});
