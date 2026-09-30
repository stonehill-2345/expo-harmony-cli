import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { renameSync } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { renameAtomic } from '../atomic-rename';

// vitest 下 import * as fs 得到冻结 namespace、default 与被测模块引用分离，
// spyOn 无法拦截被测模块内部调用；用文件级 vi.mock 让测试与被测共享同一 vi.fn。
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, renameSync: vi.fn(actual.renameSync), default: actual };
});

describe('renameAtomic（win32 语义，规范第 6 节）', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aren-'));
    vi.mocked(renameSync).mockRestore();
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const eperm = () => Object.assign(new Error('mock EPERM'), { code: 'EPERM' });

  it('win32：EPERM 前两次失败第三次成功 → 最终成功（重试生效）', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32' as any);
    const from = path.join(tmp, 'from.txt');
    const to = path.join(tmp, 'to.txt');
    fs.writeFileSync(from, 'x');
    fs.writeFileSync(to, 'old');
    // default 对象 = 工厂闭包里的 actual，未被 namespace mock 污染，取真实实现
    const real = fs.renameSync;
    let calls = 0;
    vi.mocked(renameSync).mockImplementation(((f: any, t: any) => {
      calls += 1;
      if (calls <= 2) throw eperm();
      return (real as any)(f, t);
    }) as any);
    try {
      expect(() => renameAtomic(from, to)).not.toThrow();
      expect(calls).toBe(3);
      expect(fs.readFileSync(to, 'utf8')).toBe('x');
    } finally {
      vi.mocked(renameSync).mockImplementation(real);
      vi.restoreAllMocks();
    }
  });

  it('win32：EPERM 三次全失败 → 抛最后一个错误，目标未被破坏', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32' as any);
    const from = path.join(tmp, 'from.txt');
    const to = path.join(tmp, 'to.txt');
    fs.writeFileSync(from, 'x');
    fs.writeFileSync(to, 'old');
    vi.mocked(renameSync).mockImplementation(() => { throw eperm(); });
    try {
      expect(() => renameAtomic(from, to)).toThrow(/EPERM/);
      expect(fs.readFileSync(to, 'utf8')).toBe('old');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('非 win32 平台 EPERM → 不重试直接抛', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin' as any);
    vi.mocked(renameSync).mockImplementation(() => { throw eperm(); });
    try {
      expect(() => renameAtomic('a', 'b')).toThrow(/EPERM/);
      expect(renameSync).toHaveBeenCalledTimes(1);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
