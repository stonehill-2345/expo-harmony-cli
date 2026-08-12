import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { resolvePm, installCmd, uninstallCmd, runScriptCmd } from '../src/lib/pkg-manager';

describe('resolvePm', () => {
  let tmp: string;
  beforeEach(() => (tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-'))));
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('显式 --npm/--yarn/--pnpm/--bun 优先', () => {
    expect(resolvePm(['--npm'], tmp)).toBe('npm');
    expect(resolvePm(['--yarn'], tmp)).toBe('yarn');
    expect(resolvePm(['--bun'], tmp)).toBe('bun');
    expect(resolvePm(['--pnpm'], tmp)).toBe('pnpm');
  });

  it('pnpm-lock.yaml → pnpm', () => {
    fs.writeFileSync(path.join(tmp, 'pnpm-lock.yaml'), '');
    expect(resolvePm([], tmp)).toBe('pnpm');
  });

  it('package-lock.json → npm', () => {
    fs.writeFileSync(path.join(tmp, 'package-lock.json'), '');
    expect(resolvePm([], tmp)).toBe('npm');
  });

  it('yarn.lock → yarn', () => {
    fs.writeFileSync(path.join(tmp, 'yarn.lock'), '');
    expect(resolvePm([], tmp)).toBe('yarn');
  });

  it('bun.lockb → bun', () => {
    fs.writeFileSync(path.join(tmp, 'bun.lockb'), '');
    expect(resolvePm([], tmp)).toBe('bun');
  });

  it('无 lockfile + 无 flag → 默认 pnpm', () => {
    expect(resolvePm([], tmp)).toBe('pnpm');
  });

  it('显式 flag 覆盖 lockfile（--npm + yarn.lock → npm）', () => {
    fs.writeFileSync(path.join(tmp, 'yarn.lock'), '');
    expect(resolvePm(['--npm'], tmp)).toBe('npm');
  });
});

describe('installCmd', () => {
  it('各 pm 的 install 命令', () => {
    expect(installCmd('pnpm')).toEqual({ file: 'pnpm', args: ['install'] });
    expect(installCmd('npm')).toEqual({ file: 'npm', args: ['install'] });
    expect(installCmd('yarn')).toEqual({ file: 'yarn', args: [] });
    expect(installCmd('bun')).toEqual({ file: 'bun', args: ['install'] });
  });
});

describe('uninstallCmd', () => {
  it('按包管理器生成卸载命令', () => {
    expect(uninstallCmd('pnpm', ['foo', 'bar'])).toEqual({ file: 'pnpm', args: ['remove', 'foo', 'bar'] });
    expect(uninstallCmd('npm', ['foo'])).toEqual({ file: 'npm', args: ['uninstall', 'foo'] });
    expect(uninstallCmd('yarn', ['foo'])).toEqual({ file: 'yarn', args: ['remove', 'foo'] });
    expect(uninstallCmd('bun', ['foo'])).toEqual({ file: 'bun', args: ['remove', 'foo'] });
  });
});

describe('runScriptCmd', () => {
  it('按包管理器生成 codegen 命令', () => {
    expect(runScriptCmd('pnpm', 'codegen')).toEqual({ file: 'pnpm', args: ['codegen'] });
    expect(runScriptCmd('npm', 'codegen')).toEqual({ file: 'npm', args: ['run', 'codegen'] });
    expect(runScriptCmd('yarn', 'codegen')).toEqual({ file: 'yarn', args: ['codegen'] });
    expect(runScriptCmd('bun', 'codegen')).toEqual({ file: 'bun', args: ['run', 'codegen'] });
  });
});
