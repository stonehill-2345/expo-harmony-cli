import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { resolvePm, installCmd, uninstallCmd } from '../src/lib/pkg-manager';

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
    expect(installCmd('pnpm')).toBe('pnpm install');
    expect(installCmd('npm')).toBe('npm install');
    expect(installCmd('yarn')).toBe('yarn');
    expect(installCmd('bun')).toBe('bun install');
  });
});

describe('uninstallCmd', () => {
  it('按包管理器生成卸载命令', () => {
    expect(uninstallCmd('pnpm', ['foo', 'bar'])).toBe('pnpm remove foo bar');
    expect(uninstallCmd('npm', ['foo'])).toBe('npm uninstall foo');
    expect(uninstallCmd('yarn', ['foo'])).toBe('yarn remove foo');
    expect(uninstallCmd('bun', ['foo'])).toBe('bun remove foo');
  });
});
