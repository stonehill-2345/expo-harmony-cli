import { describe, it, expect } from 'vitest';
import { sanitizeBundleSegment, buildBundleName } from '../src/utils/bundle-name';

describe('sanitizeBundleSegment', () => {
  it('保留合法字符（字母/数字/下划线）', () => {
    expect(sanitizeBundleSegment('myapp')).toBe('myapp');
    expect(sanitizeBundleSegment('my_app')).toBe('my_app');
    expect(sanitizeBundleSegment('MyApp123')).toBe('MyApp123');
  });

  it('横杠 → 下划线（鸿蒙 bundleName 段不允许横杠）', () => {
    expect(sanitizeBundleSegment('my-app')).toBe('my_app');
  });

  it('点 → 下划线', () => {
    expect(sanitizeBundleSegment('my.app')).toBe('my_app');
  });

  it('连续非法字符逐个替换', () => {
    expect(sanitizeBundleSegment('my-cool.app')).toBe('my_cool_app');
  });
});

describe('buildBundleName', () => {
  it('com.example.<清洗后 slug>', () => {
    expect(buildBundleName('myapp')).toBe('com.example.myapp');
    expect(buildBundleName('my-app')).toBe('com.example.my_app');
  });
});
