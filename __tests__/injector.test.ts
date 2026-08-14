import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { injectHarmonyBaseline } from '../src/injector';

describe('injectHarmonyBaseline', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'inj-'));
    fs.writeFileSync(path.join(tmp, 'app.json'), JSON.stringify({ expo: { name: 'MyApp', slug: 'myapp', scheme: 'myapp' } }));
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'myapp', scripts: { start: 'expo start' }, dependencies: { expo: '~52.0.49' } }));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('生成 Harmony 入口、Metro 与 postinstall 脚本，不再写仅用于 Splash 过滤的 app.config.ts', () => {
    injectHarmonyBaseline(tmp, { slug: 'myapp', scheme: 'myapp' });
    expect(fs.existsSync(path.join(tmp, 'app.config.ts'))).toBe(false);
    expect(fs.existsSync(path.join(tmp, 'index.harmony.js'))).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'metro.config.js'))).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'scripts/postinstall-harmony.js'))).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'scripts/start-harmony.js'))).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'scripts/bundle-harmony-dev.js'))).toBe(true);
  });

  it('app.json 注入 harmony 块 + android.package 兜底', () => {
    injectHarmonyBaseline(tmp, { slug: 'myapp', scheme: 'myapp' });
    const app = JSON.parse(fs.readFileSync(path.join(tmp, 'app.json'), 'utf8'));
    expect(app.expo.harmony).toBeDefined();
    expect(app.expo.harmony.package).toBe('com.example.myapp');
    expect(app.expo.android.package).toBe('com.example.myapp');
  });

  it('package.json 合并 G 类 scripts + deps，保留原 scripts/deps', () => {
    injectHarmonyBaseline(tmp, { slug: 'myapp', scheme: 'myapp' });
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    expect(pkg.scripts['start:harmony']).toBe('node scripts/start-harmony.js');
    expect(pkg.scripts['dev:harmony']).toBe('node scripts/bundle-harmony-dev.js');
    expect(pkg.scripts['bundle:harmony:release']).toBe('node scripts/bundle-harmony-release.js');
    expect(pkg.scripts.postinstall).toContain('patch-package');
    expect(pkg.dependencies['@react-native-oh/react-native-harmony']).toBe('0.77.71');
    expect(pkg.dependencies['@babel/runtime']).toBe('7.29.7');
    expect(pkg.dependencies['@react-navigation/elements']).toBe('2.9.30');
    expect(pkg.dependencies['react-native-svg']).toBe('15.12.0');
    expect(pkg.devDependencies['patch-package']).toBe('8.0.0');
    expect(pkg.devDependencies['@react-native/metro-config']).toBe('0.77.1');
    expect(pkg.devDependencies['@react-native-community/cli']).toBe('20.1.1');
    expect(pkg.scripts.start).toBe('expo start');
    expect(pkg.dependencies.expo).toBe('52.0.49');
  });

  it('注入后 package.json 依赖版本必须锁定，不能保留 ~ 或 ^', () => {
    injectHarmonyBaseline(tmp, { slug: 'myapp', scheme: 'myapp' });
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    const versions = Object.values({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }) as string[];
    expect(versions.filter(version => /^[~^]/.test(version))).toEqual([]);
  });

  it('start-harmony.js 统一使用 8081 Metro，单条 hdc 转发，不注入开发态 RN_BUNDLE_PLATFORM', () => {
    injectHarmonyBaseline(tmp, { slug: 'myapp', scheme: 'myapp' });
    const script = fs.readFileSync(path.join(tmp, 'scripts/start-harmony.js'), 'utf8');
    // 端口统一 8081
    expect(script).toContain("'--port'");
    expect(script).toContain("'8081'");
    expect(script).not.toContain("'8888'");
    // 单条 hdc 转发
    expect(script).toContain("runHdcRport(hdc, 'tcp:8081', 'tcp:8081')");
    expect(script).not.toContain("'tcp:8888'");
    // hdc 缺失 / rport 失败 → 硬退出
    expect(script).toContain('process.exit(1)');
    // 启动 expo
    expect(script).toContain("spawn('expo'");
    expect(script).toContain("'start'");
    expect(script).toContain("'--offline'");
    expect(script).toContain('HARMONY_METRO_CLEAR');
    expect(script).toContain("metroArgs.push('--clear')");
    // 开发态不注入 RN_BUNDLE_PLATFORM（分流已改为请求级）
    expect(script).not.toContain('RN_BUNDLE_PLATFORM');
    // LAN 探测与提示
    expect(script).toContain('os.networkInterfaces');
    expect(script).toContain('HARMONY_METRO_HOST');
    expect(script).toContain("process.platform === 'win32'");
    expect(script).toContain('process.env.ProgramFiles');
    expect(script).toContain('hdc.exe');
    expect(script).toContain('EXPO_PACKAGER_HOSTNAME');
    expect(script).toContain('REACT_NATIVE_PACKAGER_HOSTNAME');
    expect(script).toContain('Metro LAN URL');
    expect(script).toContain('RNOH Dev Settings');
    // 8081 复用探测
    expect(script).toContain('isMetroRunningOnPort');
    expect(script).toContain('isMetroRunningOnPort(8081)');
  });

  it('start-harmony.js runHdcRport 依据 rport 输出判定成功（端口冲突失败 exit 仍为 0）', () => {
    injectHarmonyBaseline(tmp, { slug: 'myapp', scheme: 'myapp' });
    const script = fs.readFileSync(path.join(tmp, 'scripts/start-harmony.js'), 'utf8');
    // hdc rport 端口冲突时输出 [Fail] 但 exit code 仍为 0，仅看 status 会误判 ready。
    // 必须依据输出：成功含 "Forwardport result:OK"、失败含 "[Fail]"。
    expect(script).toContain('Forwardport result:OK');
    expect(script).toContain('[Fail]');
    expect(script).toContain('process.exit(1)');
  });

  it('start-harmony.js 在 rport 前清理占用设备 8081 的冲突旧转发规则', () => {
    injectHarmonyBaseline(tmp, { slug: 'myapp', scheme: 'myapp' });
    const script = fs.readFileSync(path.join(tmp, 'scripts/start-harmony.js'), 'utf8');
    // 端口迁移（8888→8081）后旧 rport 规则残留会占用设备 8081，导致新规则建不上。
    // 先 hdc fport ls 列出，再 fport rm 清掉占用设备 8081 的 Reverse 规则，最后 rport。
    expect(script).toContain('clearConflictingRportRules');
    expect(script).toContain("'fport', 'ls'");
    expect(script).toContain("'fport', 'rm'");
    expect(script).toContain('clearConflictingRportRules(hdc, 8081)');
  });

  it('bundle-harmony-release.js 显式生成 rawfile JS bundle 与 assets，并拒绝陈旧产物', () => {
    injectHarmonyBaseline(tmp, { slug: 'myapp', scheme: 'myapp' });
    const script = fs.readFileSync(path.join(tmp, 'scripts/bundle-harmony-release.js'), 'utf8');
    expect(script).toContain("'bundle.harmony.js'");
    expect(script).toContain("'--dev'");
    expect(script).toContain("'false'");
    expect(script).toContain("'--entry-file'");
    expect(script).toContain("'index.harmony.js'");
    expect(script).toContain("'--bundle-output'");
    expect(script).toContain("'--assets-dest'");
    expect(script).toContain("'react-native.cmd' : 'react-native'");
    expect(script).not.toContain("'npx.cmd' : 'npx'");
    expect(script).toContain("require.resolve('@react-native-community/cli/package.json')");
    expect(script).toContain('pnpm add -D @react-native-community/cli@20.1.1');
    expect(script).toContain("fs.rmSync(bundlePath, { force: true })");
    expect(script).toContain("fs.rmSync(assetsDir, { recursive: true, force: true })");
    expect(script).toContain("RN_BUNDLE_PLATFORM: 'harmony'");

    const scriptPath = path.join(tmp, 'scripts/bundle-harmony-release.js');
    const check = spawnSync(process.execPath, ['--check', scriptPath], { encoding: 'utf8' });
    expect(check.stderr).toBe('');
    expect(check.status).toBe(0);
  });

  it('dev:harmony 通过 Node 脚本跨平台设置 Harmony 环境变量', () => {
    injectHarmonyBaseline(tmp, { slug: 'myapp', scheme: 'myapp' });
    const scriptPath = path.join(tmp, 'scripts/bundle-harmony-dev.js');
    const script = fs.readFileSync(scriptPath, 'utf8');
    expect(script).toContain("process.platform === 'win32' ? 'react-native.cmd' : 'react-native'");
    expect(script).toContain("RN_BUNDLE_PLATFORM: 'harmony'");
    expect(script).toContain("'bundle-harmony'");
    expect(script).toContain("'--entry-file'");
    expect(script).toContain("'index.harmony.js'");

    const check = spawnSync(process.execPath, ['--check', scriptPath], { encoding: 'utf8' });
    expect(check.stderr).toBe('');
    expect(check.status).toBe(0);
  });

  it('start-harmony.js 生成后可被 Node 语法检查通过', () => {
    injectHarmonyBaseline(tmp, { slug: 'myapp', scheme: 'myapp' });
    const scriptPath = path.join(tmp, 'scripts/start-harmony.js');
    const script = fs.readFileSync(scriptPath, 'utf8');
    expect(script).toContain("entry.replace(/\\+/g, ' ')");
    expect(script).toContain('10\\.');
    expect(script).toContain('192\\.168\\.');
    expect(script).toContain('2\\d');

    const check = spawnSync(process.execPath, ['--check', scriptPath], { encoding: 'utf8' });
    expect(check.stderr).toBe('');
    expect(check.status).toBe(0);
  });

  it('index.harmony.js {{scheme}} 替换 + 含 globalThis.expo polyfill', () => {
    injectHarmonyBaseline(tmp, { slug: 'myapp', scheme: 'myapp' });
    const entry = fs.readFileSync(path.join(tmp, 'index.harmony.js'), 'utf8');
    expect(entry).not.toContain('{{scheme}}');
    expect(entry).toContain('myapp://');
    expect(entry).toContain('globalThis.expo');
    expect(entry).toContain('renderRootComponent');
  });

  it('index.harmony.js 在 require @expo/metro-runtime 之前触发 RNOH setUpXHR（注入 Web 全局）', () => {
    injectHarmonyBaseline(tmp, { slug: 'myapp', scheme: 'myapp' });
    const entry = fs.readFileSync(path.join(tmp, 'index.harmony.js'), 'utf8');
    // setUpXHR require 必须存在
    expect(entry).toContain("require('@react-native-oh/react-native-harmony/Libraries/Core/setUpXHR')");
    // 且必须在 require('@expo/metro-runtime') 之前：Winter 兼容层引用全局 FormData，setUpXHR 须先执行
    const setUpXHRIdx = entry.indexOf('@react-native-oh/react-native-harmony/Libraries/Core/setUpXHR');
    const metroRuntimeIdx = entry.indexOf("require('@expo/metro-runtime')");
    expect(setUpXHRIdx).toBeGreaterThan(-1);
    expect(metroRuntimeIdx).toBeGreaterThan(-1);
    expect(setUpXHRIdx).toBeLessThan(metroRuntimeIdx);
  });

  it('默认模板移除 Expo Vector Icons 与 Splash 依赖及 plugin', () => {
    const appPath = path.join(tmp, 'app.json');
    const packagePath = path.join(tmp, 'package.json');
    fs.writeFileSync(appPath, JSON.stringify({ expo: { name: 'MyApp', slug: 'myapp', plugins: ['expo-router', ['expo-splash-screen', { image: './splash.png' }]] } }));
    fs.writeFileSync(packagePath, JSON.stringify({ name: 'myapp', dependencies: { expo: '~52.0.49', '@expo/vector-icons': '~14.0.4', 'expo-splash-screen': '~0.29.24' } }));

    injectHarmonyBaseline(tmp, { slug: 'myapp', scheme: 'myapp' });

    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const app = JSON.parse(fs.readFileSync(appPath, 'utf8'));
    expect(pkg.dependencies['@expo/vector-icons']).toBeUndefined();
    expect(pkg.dependencies['@react-native-ohos/react-native-vector-icons']).toBeUndefined();
    expect(pkg.dependencies['expo-splash-screen']).toBeUndefined();
    expect(pkg.dependencies['expo-splash-screen2']).toBeUndefined();
    expect(app.expo.plugins).toEqual(['expo-router']);
  });

  it('Harmony shims copy 到 shims/ + .alias-map.json 初始条目', () => {
    injectHarmonyBaseline(tmp, { slug: 'myapp', scheme: 'myapp' });
    expect(fs.existsSync(path.join(tmp, 'shims/expo-metro-runtime.ts'))).toBe(true);
    // expo-asset 基线 shim（Expo.fx 启动硬依赖，所有 expo 鸿蒙项目都崩）
    // 注：本单测验证注入产物（文件存在 + alias-map 条目）；运行时 polyfill 行为由 Task 2 端到端 gate 覆盖
    expect(fs.existsSync(path.join(tmp, 'shims/expo-asset.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'shims/expo-modules-core/NativeModulesProxy.ts'))).toBe(false);
    const aliasMap = JSON.parse(fs.readFileSync(path.join(tmp, 'shims/.alias-map.json'), 'utf8'));
    expect(aliasMap['@expo/metro-runtime']).toBe('./shims/expo-metro-runtime.ts');
    expect(aliasMap['expo-asset']).toBe('./shims/expo-asset.ts');
    expect(Object.keys(aliasMap).some(key => key.startsWith('expo-modules-core'))).toBe(false);
  });

  it('postinstall-harmony.js 修复 RNOH LogBoxImages 缺失目录', () => {
    injectHarmonyBaseline(tmp, { slug: 'myapp', scheme: 'myapp' });
    const script = fs.readFileSync(path.join(tmp, 'scripts/postinstall-harmony.js'), 'utf8');
    expect(script).toContain('ensureRNOHLogBoxImages');
    expect(script).toContain('LogBoxImages');
    expect(script).toContain('ensurePnpmDecodedRNOHLogBoxImages');
    expect(script).toContain("entry.replace(/\\+/g, ' ')");
    expect(script).toContain('fs.symlinkSync');
    expect(script).toContain('ensureExpoModulesCoreNativeModulesProxyNoWarn');
    expect(script).toContain('NativeModulesProxy.native.ts');
    expect(script).toContain('Object.keys(NativeModules)');
    expect(script).toContain('alert-triangle.png');
    expect(script).toContain('chevron-left.png');
    expect(script).toContain('chevron-right.png');
    expect(script).toContain('close.png');
    expect(script).toContain('loader.png');
  });

  it('横杠 slug 的 bundleName 清洗为下划线（鸿蒙规范，禁止横杠）', () => {
    injectHarmonyBaseline(tmp, { slug: 'my-app', scheme: 'my-app' });
    const app = JSON.parse(fs.readFileSync(path.join(tmp, 'app.json'), 'utf8'));
    expect(app.expo.harmony.package).toBe('com.example.my_app');
    expect(app.expo.android.package).toBe('com.example.my_app');
  });

  it('metro.config.js 请求级 platform 分流，alias 只对 harmony 生效，废弃进程级 RN_BUNDLE_PLATFORM', () => {
    injectHarmonyBaseline(tmp, { slug: 'myapp', scheme: 'myapp' });
    const metro = fs.readFileSync(path.join(tmp, 'metro.config.js'), 'utf8');
    // 请求级分流：platform 条件分支
    expect(metro).toContain("platform === 'harmony'");
    expect(metro).toContain('resolveRequest(context, moduleName, platform)');
    // alias 仅在 harmony 分支内
    expect(metro).toContain('shimAliases[moduleName]');
    expect(metro).toContain('resolveAliasTarget(aliasTarget)');
    // 字段级合并：叠加 platforms 与 sourceExts
    expect(metro).toContain('baseConfig.resolver.platforms');
    expect(metro).toContain('baseConfig.resolver.sourceExts');
    // harmony resolver 兜底
    expect(metro).toContain('harmonyConfig.resolver?.resolveRequest');
    expect(metro).toContain('resolveWithHarmony(context, moduleName, platform)');
    // @/ 别名
    expect(metro).toContain("moduleName.startsWith('@/')");
    expect(metro).toContain('path.resolve(__dirname, moduleName.slice(2))');
    // 双保险：platform 参数 + 离线 RN_BUNDLE_PLATFORM 兜底
    expect(metro).toContain("platform === 'harmony'");
    expect(metro).toContain("process.env.RN_BUNDLE_PLATFORM === 'harmony'");
    // 废弃进程级 if/else 分流
    expect(metro).not.toContain('isHarmonyBundle');
    expect(metro).not.toContain('alias: shimAliases');

    const metroConfigPath = path.join(tmp, 'metro.config.js');
    const check = spawnSync(process.execPath, ['--check', metroConfigPath], { encoding: 'utf8' });
    expect(check.stderr).toBe('');
    expect(check.status).toBe(0);
  });

  it('替换 IconSymbol 为 SVG 图标，避免 ExpoFontLoader 原生模块依赖', () => {
    fs.mkdirSync(path.join(tmp, 'components/ui'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, 'components/ui/IconSymbol.tsx'),
      "import MaterialIcons from '@expo/vector-icons/MaterialIcons';\nexport function IconSymbol() { return null; }\n",
    );

    injectHarmonyBaseline(tmp, { slug: 'myapp', scheme: 'myapp' });

    const icon = fs.readFileSync(path.join(tmp, 'components/ui/IconSymbol.tsx'), 'utf8');
    expect(icon).not.toContain('@expo/vector-icons');
    expect(icon).not.toContain("import { Text } from 'react-native'");
    expect(icon).toContain("from 'react-native-svg'");
    expect(icon).toContain('<Svg');
    expect(icon).toContain('<Path');
    expect(icon).toContain('fill={color}');
    expect(icon).toContain('M3.5 10.25 12 3.5l8.5 6.75');
    expect(icon).toContain('M2.75 3.25 21.25 12 2.75 20.75');
  });
});
