import { describe, it, expect } from 'vitest';
import { resolveTasks } from '../src/prebuild/runner';

describe('resolveTasks', () => {
  it('无 --platform → 三端（runNative + runHarmony）', () => {
    const r = resolveTasks([]);
    expect(r.runNative).toBe(true);
    expect(r.runHarmony).toBe(true);
    expect(r.nativeArgs).toEqual([]);
  });

  it('--platform ios → 仅 native（ios 走 expo，不跑 harmony）', () => {
    const r = resolveTasks(['--platform', 'ios']);
    expect(r.runNative).toBe(true);
    expect(r.runHarmony).toBe(false);
    expect(r.nativeArgs).toEqual(['--platform', 'ios']);
  });

  it('--platform harmony → 仅 harmony（不调 expo prebuild）', () => {
    const r = resolveTasks(['--platform', 'harmony']);
    expect(r.runNative).toBe(false);
    expect(r.runHarmony).toBe(true);
    expect(r.nativeArgs).toEqual([]);
  });

  it('--platform ios,harmony → 两者都跑（ios 走 expo，harmony 走生成器）', () => {
    const r = resolveTasks(['--platform', 'ios', '--platform', 'harmony']);
    expect(r.runNative).toBe(true);
    expect(r.runHarmony).toBe(true);
    expect(r.nativeArgs).toEqual(['--platform', 'ios']);
  });

  it('--platform android → runNative，nativeArgs 含 android', () => {
    const r = resolveTasks(['--platform', 'android']);
    expect(r.runNative).toBe(true);
    expect(r.runHarmony).toBe(false);
    expect(r.nativeArgs).toEqual(['--platform', 'android']);
  });

  it('其它参数（--clean/--no-install）保留到 nativeArgs', () => {
    const r = resolveTasks(['--clean', '--no-install']);
    expect(r.runNative).toBe(true);
    expect(r.runHarmony).toBe(true);
    expect(r.nativeArgs).toEqual(['--clean', '--no-install']);
  });
});
