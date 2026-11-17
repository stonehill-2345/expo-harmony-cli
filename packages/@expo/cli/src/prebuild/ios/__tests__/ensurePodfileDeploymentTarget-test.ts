import { vol } from 'memfs';

import { ensureIosPodfileDeploymentTarget } from '../ensurePodfileDeploymentTarget';

const BASE_PODFILE = `require File.join(File.dirname(\`node --print require.resolve('react-native/package.json')\`), 'scripts/react_native_pods')

target 'default' do
  use_expo_modules!
  config = use_native_modules!

  post_install do |installer|
    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false,
    )
  end
end
`;

describe(ensureIosPodfileDeploymentTarget, () => {
  afterEach(() => vol.reset());

  it('injects after the react_native_post_install call (verified-consumer position)', () => {
    vol.fromJSON({ '/app/ios/Podfile': BASE_PODFILE });

    const result = ensureIosPodfileDeploymentTarget('/app');

    expect(result).toEqual({ patched: true });
    const patched = vol.toJSON()['/app/ios/Podfile'] as string;
    const lines = patched.split('\n');
    const postInstallIdx = lines.findIndex(l => l.includes('post_install do |installer|'));
    const callCloseIdx = lines.findIndex((l, i) => i > postInstallIdx && /^\s*\)\s*,?\s*$/.test(l));
    const markerIdx = lines.findIndex(l => l.includes('expo-harmony-cli: pod deployment target floor'));
    expect(markerIdx).toBe(callCloseIdx + 1);
    // 阈值语义与已验证消费者一致：低于 15.0 才抬；下限优先取 RN 常量
    expect(patched).toContain(".to_f < 15.0");
    expect(patched).toContain('Pod::Helpers::Constants.min_ios_version_supported');
    expect(patched).toContain("config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = __ehc_min_ios");
  });

  it('falls back to inserting right after post_install when react_native_post_install is absent', () => {
    vol.fromJSON({
      '/app/ios/Podfile': `target 'default' do\n  post_install do |installer|\n    puts 'custom'\n  end\nend\n`,
    });

    const result = ensureIosPodfileDeploymentTarget('/app');

    expect(result).toEqual({ patched: true });
    const patched = vol.toJSON()['/app/ios/Podfile'] as string;
    const lines = patched.split('\n');
    const postInstallIdx = lines.findIndex(l => l.includes('post_install do |installer|'));
    const markerIdx = lines.findIndex(l => l.includes('expo-harmony-cli: pod deployment target floor'));
    expect(markerIdx).toBe(postInstallIdx + 1);
    // 注入内容位于块内（其后仍有 end 行闭合）
    expect(lines.slice(markerIdx).some(l => /^\s*end\s*$/.test(l))).toBe(true);
  });

  it('is idempotent when already patched', () => {
    vol.fromJSON({ '/app/ios/Podfile': BASE_PODFILE });
    ensureIosPodfileDeploymentTarget('/app');
    const once = vol.toJSON()['/app/ios/Podfile'] as string;

    const second = ensureIosPodfileDeploymentTarget('/app');

    expect(second).toEqual({ patched: false, reason: 'already patched' });
    expect(vol.toJSON()['/app/ios/Podfile']).toBe(once);
  });

  it('leaves the Podfile untouched when there is no post_install block', () => {
    vol.fromJSON({ '/app/ios/Podfile': "target 'default' do\n  use_expo_modules!\nend\n" });

    const result = ensureIosPodfileDeploymentTarget('/app');

    expect(result).toEqual({ patched: false, reason: 'no post_install block' });
  });

  it('is a no-op when the Podfile does not exist', () => {
    vol.fromJSON({ '/app/package.json': '{}' });

    expect(ensureIosPodfileDeploymentTarget('/app')).toEqual({ patched: false, reason: 'no Podfile' });
  });
});
