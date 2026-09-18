import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { log } from '../src/utils/log';

describe('log.task', () => {
  let isTTYDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    isTTYDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: false });
  });

  afterEach(() => {
    if (isTTYDescriptor) {
      Object.defineProperty(process.stdout, 'isTTY', isTTYDescriptor);
    } else {
      delete (process.stdout as NodeJS.WriteStream & { isTTY?: boolean }).isTTY;
    }
    vi.restoreAllMocks();
  });

  it('非交互终端使用稳定的开始/完成日志', () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const task = log.task('创建模板');
    task.success();

    expect(output).toHaveBeenCalledWith(expect.stringContaining('创建模板...'));
    expect(output).toHaveBeenCalledWith(expect.stringContaining('创建模板'));
    expect(output.mock.calls.flat().join('\n')).not.toContain('\x1b[2K');
  });
});
