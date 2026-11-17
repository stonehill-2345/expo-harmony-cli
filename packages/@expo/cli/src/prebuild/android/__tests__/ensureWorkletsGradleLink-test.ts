import { vol } from 'memfs';

import {
  ensureWorkletsGradleLink,
  removeManagedBlock,
  WORKLETS_GRADLE_MARKER,
} from '../ensureWorkletsGradleLink';

const BASE_GRADLE = `// Android project
buildscript { repositories { google() } }
apply plugin: 'com.android.library'
`;

function withSupportedVersions(extra: Record<string, string> = {}) {
  return {
    '/app/android/build.gradle': BASE_GRADLE,
    '/app/node_modules/react-native-reanimated/package.json': JSON.stringify({
      name: 'react-native-reanimated',
      version: '4.2.1',
    }),
    '/app/node_modules/react-native-worklets/package.json': JSON.stringify({
      name: 'react-native-worklets',
      version: '0.7.1',
    }),
    ...extra,
  };
}

describe(ensureWorkletsGradleLink, () => {
  afterEach(() => vol.reset());

  it('injects the managed block when the supported combo is installed', () => {
    vol.fromJSON(withSupportedVersions());

    const result = ensureWorkletsGradleLink('/app');

    expect(result).toEqual({ patched: true });
    const patched = vol.toJSON()['/app/android/build.gradle'] as string;
    expect(patched.startsWith(BASE_GRADLE.trimEnd())).toBe(true);
    // 契约：任务链（dependsOn 生产任务）、覆盖更新、变体+ABI 绑定来源
    expect(patched).toContain(WORKLETS_GRADLE_MARKER);
    expect(patched).toContain('// END expo-harmony-cli:worklets-so-link');
    expect(patched).toContain('reanimatedTask.dependsOn __ehcProvider');
    expect(patched).toContain('StandardCopyOption.REPLACE_EXISTING');
    expect(patched).toContain("buildCMake${__ehcStaging}[${__ehcAbi}][worklets]");
    // 路径由 Gradle 子工程解析，不烘焙绝对路径
    expect(patched).not.toMatch(/new File\('\/|new File\("\/|\/app\/node_modules/);
  });

  it('is idempotent when the managed block already exists', () => {
    vol.fromJSON(withSupportedVersions());
    ensureWorkletsGradleLink('/app');
    const once = vol.toJSON()['/app/android/build.gradle'] as string;

    const second = ensureWorkletsGradleLink('/app');

    expect(second).toEqual({ patched: false, reason: 'already patched' });
    expect(vol.toJSON()['/app/android/build.gradle']).toBe(once);
  });

  it('removes the managed block and keeps user content when the combo is upgraded away', () => {
    vol.fromJSON(
      withSupportedVersions({
        // 已注入后用户又升级了依赖（例如 reanimated 4.3.4 + worklets 0.8.3）
        '/app/node_modules/react-native-reanimated/package.json': JSON.stringify({ version: '4.3.4' }),
        '/app/node_modules/react-native-worklets/package.json': JSON.stringify({ version: '0.8.3' }),
        '/app/android/build.gradle':
          BASE_GRADLE +
          `// 用户自定义内容开始\ntask myTask {}\n` +
          WORKLETS_GRADLE_MARKER +
          '\n// managed content here\n// END expo-harmony-cli:worklets-so-link\n',
      })
    );

    const result = ensureWorkletsGradleLink('/app');

    expect(result.patched).toBe(false);
    expect(result.removedStale).toBe(true);
    const after = vol.toJSON()['/app/android/build.gradle'] as string;
    expect(after).toContain('task myTask {}');
    expect(after).not.toContain(WORKLETS_GRADLE_MARKER);
    expect(after).not.toContain('managed content here');
  });

  it('migrates the legacy single-marker block to the managed block on supported versions', () => {
    vol.fromJSON(
      withSupportedVersions({
        '/app/android/build.gradle':
          BASE_GRADLE + '// expo-harmony-cli:worklets-so-link (old)\nsubprojects { sp -> }\n',
      })
    );

    const result = ensureWorkletsGradleLink('/app');

    expect(result).toEqual({ patched: true, reason: 'migrated legacy block to managed block' });
    const after = vol.toJSON()['/app/android/build.gradle'] as string;
    expect(after).toContain(WORKLETS_GRADLE_MARKER);
    expect(after).not.toContain('subprojects { sp -> }');
    expect(after.startsWith(BASE_GRADLE.trimEnd())).toBe(true);
  });

  it('is a no-op without injection when the combo is unsupported and nothing is managed', () => {
    vol.fromJSON({
      '/app/android/build.gradle': BASE_GRADLE,
      '/app/node_modules/react-native-reanimated/package.json': JSON.stringify({ version: '4.3.4' }),
    });

    const result = ensureWorkletsGradleLink('/app');

    expect(result.patched).toBe(false);
    expect(result.removedStale).toBeUndefined();
    expect(result.reason).toContain('worklets absent');
    expect(vol.toJSON()['/app/android/build.gradle']).toBe(BASE_GRADLE);
  });

  it('is a no-op when android/build.gradle does not exist', () => {
    vol.fromJSON({ '/app/package.json': '{}' });

    const result = ensureWorkletsGradleLink('/app');

    expect(result).toEqual({ patched: false, reason: 'no android/build.gradle' });
  });

  it('removeManagedBlock strips a legacy marker block to end of file', () => {
    const source = 'a\nb\n// expo-harmony-cli:worklets-so-link (old)\nlegacy\ncontent\n';
    expect(removeManagedBlock(source)).toBe('a\nb\n');
  });
});
