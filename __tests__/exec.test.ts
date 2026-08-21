import { describe, expect, it } from 'vitest';
import { resolveCommand, resolveCommandInvocation } from '../src/utils/exec';

describe('resolveCommand', () => {
  it('Windows 使用 .cmd 启动 Node CLI 命令', () => {
    expect(resolveCommand('npx', 'win32')).toBe('npx.cmd');
    expect(resolveCommand('pnpm', 'win32')).toBe('pnpm.cmd');
    expect(resolveCommand('react-native', 'win32')).toBe('react-native.cmd');
    expect(resolveCommand('ohpm', 'win32')).toBe('ohpm.cmd');
  });

  it('非 Windows 或已有扩展名时保留原命令', () => {
    expect(resolveCommand('npx', 'darwin')).toBe('npx');
    expect(resolveCommand('npx.cmd', 'win32')).toBe('npx.cmd');
    expect(resolveCommand('/usr/local/bin/npx', 'win32')).toBe('/usr/local/bin/npx');
  });

  it('Windows 的 .cmd 命令必须通过 shell 执行，避免 spawn EINVAL', () => {
    expect(resolveCommandInvocation('npx', 'win32')).toEqual({ command: 'npx.cmd', shell: true });
    expect(resolveCommandInvocation('npx.cmd', 'win32')).toEqual({ command: 'npx.cmd', shell: true });
    expect(resolveCommandInvocation('ohpm', 'win32')).toEqual({ command: 'ohpm.cmd', shell: true });
    expect(resolveCommandInvocation('npx', 'darwin')).toEqual({ command: 'npx', shell: false });
    expect(resolveCommandInvocation('/usr/local/bin/npx', 'win32')).toEqual({ command: '/usr/local/bin/npx', shell: false });
  });
});
