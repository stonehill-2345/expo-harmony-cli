import { describe, it, expect } from 'vitest';
import { resolveBundleName, resolveAppName } from '../config-merger';

describe('config-merger', () => {
  it('优先 harmony.package', () => {
    expect(resolveBundleName({ harmony: { package: 'com.foo.bar' }, android: { package: 'com.baz' }, slug: 'x' } as any))
      .toBe('com.foo.bar');
  });
  it('次选 android.package', () => {
    expect(resolveBundleName({ android: { package: 'com.baz.qux' }, slug: 'myapp' } as any)).toBe('com.baz.qux');
  });
  it('兜底 com.{slug}.app', () => {
    expect(resolveBundleName({ slug: 'myapp' } as any)).toBe('com.myapp.app');
  });
  it('slug 含非法字符时归一化（连字符→下划线，补齐三段）', () => {
    expect(resolveBundleName({ slug: 'my-cool-app' } as any)).toBe('com.my_cool_app.app');
  });
  it('appName 取 expoConfig.name', () => {
    expect(resolveAppName({ name: 'My App' } as any)).toBe('My App');
  });
});
