import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// mock exec（避免真跑 create-expo-app）
vi.mock('../src/utils/exec', () => ({
  runFileQuiet: vi.fn((file: string, args: string[], opts: { cwd?: string }) => {
    // 模拟 create-expo-app 产物：在 cwd 下建 <projectName>/ 含 app.json + package.json
    if (file === 'npx' && args[0] === 'create-expo-app') {
      const projectName = args[1];
      const dir = path.join(opts.cwd || process.cwd(), projectName);
      fs.mkdirSync(path.join(dir, 'app'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'components', 'ui'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'app.json'), JSON.stringify({ expo: { name: projectName, slug: projectName, scheme: projectName } }));
      // 假 default 模版 package.json（含 B/C/H/A′ 各类依赖）
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
        name: projectName,
        dependencies: {
          expo: '~52.0.49',
          'react-native': '0.76.9',
          'react-native-screens': '4.4.0',
          'expo-router': '~4.0.22',
          'react-native-webview': '~13.15.0',
          'expo-haptics': '~14.0.1',
          'expo-blur': '~14.0.3',
          'expo-symbols': '~0.2.0',
          'expo-splash-screen': '~0.29.24',
          '@expo/vector-icons': '~14.0.4',
          'expo-constants': '~17.0.8',
          // H 类清理验证用：expo-font 删除 → 删 _layout 的 useFonts
          'expo-font': '~13.0.4',
        },
      }));
      // 假模版 TSX（H 类清理验证用）—— C-1: useFonts 参数含 require() 嵌套括号（真实 default 形态）
      fs.writeFileSync(path.join(dir, 'app/_layout.tsx'), "import { useFonts } from 'expo-font';\nimport * as SplashScreen from 'expo-splash-screen';\nconst [loaded] = useFonts({\n  SpaceMono: require('./assets/fonts/SpaceMono-Regular.ttf'),\n});\nSplashScreen.preventAutoHideAsync();\n");
      fs.writeFileSync(path.join(dir, 'components/HapticTab.tsx'), "import * as Haptics from 'expo-haptics';\nHaptics.impactAsync();\n");
      fs.writeFileSync(path.join(dir, 'components/ui/IconSymbol.tsx'), "import MaterialIcons from '@expo/vector-icons/MaterialIcons';\nexport function IconSymbol() { return <MaterialIcons name=\"home\" />; }\n");
      fs.writeFileSync(path.join(dir, 'components/ui/IconSymbol.ios.tsx'), "import { SymbolView } from 'expo-symbols';\n");
      fs.writeFileSync(path.join(dir, 'components/ui/TabBarBackground.tsx'), "export default undefined;\n\nexport function useBottomTabOverflow() {\n  return 0;\n}\n");
      fs.writeFileSync(path.join(dir, 'components/ui/TabBarBackground.ios.tsx'), "import { BlurView } from 'expo-blur';\n");
    }
  }),
}));

vi.mock('../src/utils/log', () => ({
  log: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    step: vi.fn(),
    task: vi.fn(() => ({ success: vi.fn(), fail: vi.fn() })),
  },
}));

describe('runCreate', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('编排：拉模版 → 注入基线 → 文档/skill → 扫描 → H清理', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'create-'));
    const { runCreate } = await import('../src/creator');
    await runCreate(['myapp'], { cwd: tmp });
    const { runFileQuiet } = await import('../src/utils/exec');
    const { log } = await import('../src/utils/log');
    expect(runFileQuiet).toHaveBeenCalledWith(
      'npx',
      ['create-expo-app', 'myapp', '--template', 'default@sdk-52', '--no-install'],
      { cwd: tmp },
    );
    expect(log.task).toHaveBeenCalledWith('1/4 创建 Expo SDK 52 模板');
    expect(log.task).toHaveBeenCalledWith('2/4 注入 HarmonyOS 基线');
    expect(log.task).toHaveBeenCalledWith('3/4 适配默认模板依赖');
    expect(log.task).toHaveBeenCalledWith('4/4 写入开发资料');
    for (const result of vi.mocked(log.task).mock.results) {
      expect(result.value.success).toHaveBeenCalledOnce();
      expect(result.value.fail).not.toHaveBeenCalled();
    }
    const projectDir = path.join(tmp, 'myapp');

    // 注入基线（Task 4）
    expect(fs.existsSync(path.join(projectDir, 'app.config.ts'))).toBe(false);
    expect(fs.existsSync(path.join(projectDir, 'index.harmony.js'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'metro.config.js'))).toBe(true);

    // app.json harmony 块
    const app = JSON.parse(fs.readFileSync(path.join(projectDir, 'app.json'), 'utf8'));
    expect(app.expo.harmony.package).toBe('com.example.myapp');

    // 扫描产物（Task 6）：react-native bump + 鸿蒙包 + 删 H
    const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
    expect(pkg.dependencies['react-native']).toBe('0.77.1');
    expect(pkg.dependencies['@react-native-oh/react-native-harmony']).toBe('0.77.71');
    expect(pkg.dependencies['react-native-screens']).toBe('4.8.0');
    expect(pkg.dependencies['@react-native-ohos/react-native-screens']).toBe('4.8.1-rc.7');
    expect(pkg.dependencies['@babel/runtime']).toBe('7.29.7');
    expect(pkg.dependencies['@react-navigation/elements']).toBe('2.9.30');
    expect(pkg.devDependencies['@react-native/metro-config']).toBe('0.77.1');
    expect(pkg.dependencies['expo-haptics']).toBeUndefined();
    expect(pkg.dependencies['expo-splash-screen']).toBeUndefined();
    expect(pkg.dependencies['expo-splash-screen2']).toBeUndefined();
    expect(pkg.dependencies['@expo/vector-icons']).toBeUndefined();
    expect(pkg.dependencies['@react-native-ohos/react-native-vector-icons']).toBeUndefined();
    expect(fs.existsSync(path.join(projectDir, 'components/ui/IconSymbol.ios.tsx'))).toBe(false);
    expect(fs.existsSync(path.join(projectDir, 'components/ui/TabBarBackground.ios.tsx'))).toBe(false);
    const tabBarBackground = fs.readFileSync(path.join(projectDir, 'components/ui/TabBarBackground.tsx'), 'utf8');
    expect(tabBarBackground).toContain('useBottomTabBarHeight');
    expect(tabBarBackground).toContain("Platform.OS === 'ios' ? tabHeight : 0");
    expect(pkg.dependencies['react-native-svg']).toBe('15.12.0');
    expect(pkg.dependencies['@react-native-ohos/react-native-svg']).toBe('15.12.1');
    expect(pkg.dependencies['react-native-webview']).toBeUndefined();
    expect(pkg.dependencies['@react-native-ohos/react-native-webview']).toBeUndefined();
    expect(fs.existsSync(path.join(projectDir, 'patches/@react-native-oh+react-native-harmony+0.77.71.patch'))).toBe(true);

    const versions = Object.values({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }) as string[];
    expect(versions.filter(version => /^[~^]/.test(version))).toEqual([]);

    // 文档 + skill（Task 8）
    expect(fs.existsSync(path.join(projectDir, 'README.md'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'AGENTS.md'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'docs/HARMONY.md'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'docs/PATCHES.md'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'docs/TROUBLESHOOTING.md'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'CLAUDE.md'))).toBe(false);
    expect(fs.existsSync(path.join(projectDir, 'HARMONY_DEV_GUIDE.md'))).toBe(false);
    expect(fs.existsSync(path.join(projectDir, 'PATCHES.md'))).toBe(false);
    expect(fs.existsSync(path.join(projectDir, 'docs/PLUGIN_INTEGRATION_GUIDE.md'))).toBe(false);
    expect(fs.existsSync(path.join(projectDir, '.agent/skills/expo-harmony-adapter/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, '.claude'))).toBe(false);
    expect(fs.existsSync(path.join(projectDir, '.claude/skills/expo-harmony-adapter/SKILL.md'))).toBe(false);

    // H 类代码清理（Task 7）：useFonts 与 SplashScreen 均已移除
    const layout = fs.readFileSync(path.join(projectDir, 'app/_layout.tsx'), 'utf8');
    expect(layout).not.toContain('useFonts');
    expect(layout).not.toContain('SplashScreen');
    expect(layout).not.toContain('expo-splash-screen');
    // C-1: 确认无损坏残留（const [loaded] = , 或 const [loaded] = ;）
    expect(layout).not.toMatch(/const\s*\[.*\]\s*=\s*[,;]/);
    const hapticTab = fs.readFileSync(path.join(projectDir, 'components/HapticTab.tsx'), 'utf8');
    expect(hapticTab).not.toContain('Haptics');

    // IconSymbol 必须替换为 SVG，避免 @expo/vector-icons -> ExpoFontLoader 原生模块依赖。
    const iconSymbol = fs.readFileSync(path.join(projectDir, 'components/ui/IconSymbol.tsx'), 'utf8');
    expect(iconSymbol).not.toContain('@expo/vector-icons');
    expect(iconSymbol).not.toContain('MaterialIcons');
    expect(iconSymbol).toContain("from 'react-native-svg'");
    expect(iconSymbol).toContain('export function IconSymbol');

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('缺项目名 → 报错', async () => {
    const { runCreate } = await import('../src/creator');
    await expect(runCreate([])).rejects.toThrow(/项目名|project-name/i);
  });

  it.each(['../outside', 'my app', 'my;app', '/tmp/app'])('非法项目名 %s → 不执行创建命令', async (projectName) => {
    const { runCreate } = await import('../src/creator');
    const { runFileQuiet } = await import('../src/utils/exec');
    await expect(runCreate([projectName])).rejects.toThrow(/项目名/);
    expect(runFileQuiet).not.toHaveBeenCalled();
  });

  it('模板创建失败 → 收敛为可读错误并保留底层原因', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'create-'));
    const { runFileQuiet } = await import('../src/utils/exec');
    vi.mocked(runFileQuiet).mockImplementationOnce(() => {
      throw new Error('network unavailable');
    });
    const { runCreate } = await import('../src/creator');
    await expect(runCreate(['myapp'], { cwd: tmp })).rejects.toThrow(/创建 Expo SDK 52 模板失败.*network unavailable/s);
    const { log } = await import('../src/utils/log');
    expect(vi.mocked(log.task).mock.results[0].value.fail).toHaveBeenCalledOnce();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('模板命令成功但 app.json 缺失 → 提示删除目录后重试', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'create-'));
    const { runFileQuiet } = await import('../src/utils/exec');
    vi.mocked(runFileQuiet).mockImplementationOnce((_file, args, opts) => {
      const projectDir = path.join(opts?.cwd || tmp, args[1]);
      fs.mkdirSync(projectDir, { recursive: true });
      return Promise.resolve();
    });
    const { runCreate } = await import('../src/creator');
    await expect(runCreate(['myapp'], { cwd: tmp })).rejects.toThrow(/模板.*不完整.*删除.*重试/s);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
