import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ensureNpmrcHoisted } from '../src/injector/npmrc';

describe('ensureNpmrcHoisted', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'npmrc-'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('pnpm + 无 .npmrc → 创建含 node-linker=hoisted + 管理标记', () => {
    fs.writeFileSync(path.join(tmp, 'pnpm-lock.yaml'), '');
    ensureNpmrcHoisted(tmp);
    const npmrc = fs.readFileSync(path.join(tmp, '.npmrc'), 'utf8');
    expect(npmrc).toContain('node-linker=hoisted');
    expect(npmrc).toContain('expo-harmony-cli:managed');
  });

  it('pnpm + 有 .npmrc 无 node-linker → 追加 hoisted，保留原内容', () => {
    fs.writeFileSync(path.join(tmp, 'pnpm-lock.yaml'), '');
    fs.writeFileSync(path.join(tmp, '.npmrc'), 'registry=https://registry.npmmirror.com\n');
    ensureNpmrcHoisted(tmp);
    const npmrc = fs.readFileSync(path.join(tmp, '.npmrc'), 'utf8');
    expect(npmrc).toContain('registry=https://registry.npmmirror.com');
    expect(npmrc).toContain('node-linker=hoisted');
  });

  it('pnpm + 已有 node-linker=hoisted（无管理标记）→ 幂等不动', () => {
    fs.writeFileSync(path.join(tmp, 'pnpm-lock.yaml'), '');
    const original = 'node-linker=hoisted\n';
    fs.writeFileSync(path.join(tmp, '.npmrc'), original);
    ensureNpmrcHoisted(tmp);
    expect(fs.readFileSync(path.join(tmp, '.npmrc'), 'utf8')).toBe(original);
  });

  it('pnpm + 已有管理标记 → 幂等不动', () => {
    fs.writeFileSync(path.join(tmp, 'pnpm-lock.yaml'), '');
    const original = '# expo-harmony-cli:managed\nnode-linker=hoisted\n';
    fs.writeFileSync(path.join(tmp, '.npmrc'), original);
    ensureNpmrcHoisted(tmp);
    expect(fs.readFileSync(path.join(tmp, '.npmrc'), 'utf8')).toBe(original);
  });

  it('npm（package-lock.json）→ 不创建 .npmrc', () => {
    fs.writeFileSync(path.join(tmp, 'package-lock.json'), '');
    ensureNpmrcHoisted(tmp);
    expect(fs.existsSync(path.join(tmp, '.npmrc'))).toBe(false);
  });

  it('pnpm + node-linker=pnp（非 hoisted）→ 不覆盖，保留 pnp + warn', () => {
    fs.writeFileSync(path.join(tmp, 'pnpm-lock.yaml'), '');
    const original = 'node-linker=pnp\n';
    fs.writeFileSync(path.join(tmp, '.npmrc'), original);
    ensureNpmrcHoisted(tmp);
    const npmrc = fs.readFileSync(path.join(tmp, '.npmrc'), 'utf8');
    expect(npmrc).toBe(original);
    expect(npmrc).not.toContain('node-linker=hoisted');
    expect(console.warn).toHaveBeenCalled();
  });

  it('pnpm + node-linker = hoisted（等号两侧空格）→ 容忍，幂等不动', () => {
    fs.writeFileSync(path.join(tmp, 'pnpm-lock.yaml'), '');
    const original = 'node-linker = hoisted\n';
    fs.writeFileSync(path.join(tmp, '.npmrc'), original);
    ensureNpmrcHoisted(tmp);
    expect(fs.readFileSync(path.join(tmp, '.npmrc'), 'utf8')).toBe(original);
  });

  it('无 lockfile → resolvePm 默认 pnpm → 注入 hoisted', () => {
    ensureNpmrcHoisted(tmp);
    const npmrc = fs.readFileSync(path.join(tmp, '.npmrc'), 'utf8');
    expect(npmrc).toContain('node-linker=hoisted');
  });
});
