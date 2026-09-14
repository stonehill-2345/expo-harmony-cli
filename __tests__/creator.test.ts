import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// mock @inquirer/prompts select（避免交互式阻塞）
vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(() => Promise.resolve('sdk-54')),
}));

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
        scripts: { start: 'expo start' },
        dependencies: {
          expo: '~54.0.12',
          react: '19.1.0',
          'react-dom': '19.1.0',
          'react-native': '0.81.4',
          'react-native-screens': '~4.16.0',
          'react-native-reanimated': '~4.1.1',
          'react-native-worklets': '0.5.1',
          'react-native-gesture-handler': '~2.28.0',
          'react-native-safe-area-context': '~5.6.0',
          'expo-router': '~6.0.10',
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
        devDependencies: {
          '@types/react': '~19.1.0',
        },
      }));
      // 假模版 TSX（H 类清理验证用）—— C-1: useFonts 参数含 require() 嵌套括号（真实 default 形态）
      fs.writeFileSync(path.join(dir, 'app/_layout.tsx'), "import { useFonts } from 'expo-font';\nimport * as SplashScreen from 'expo-splash-screen';\nconst [loaded] = useFonts({\n  SpaceMono: require('./assets/fonts/SpaceMono-Regular.ttf'),\n});\nSplashScreen.preventAutoHideAsync();\n");
      fs.writeFileSync(path.join(dir, 'components/haptic-tab.tsx'), "import * as Haptics from 'expo-haptics';\nHaptics.impactAsync();\n");
      fs.writeFileSync(path.join(dir, 'components/ui/icon-symbol.tsx'), "import MaterialIcons from '@expo/vector-icons/MaterialIcons';\nexport function IconSymbol() { return <MaterialIcons name=\"home\" />; }\n");
      fs.writeFileSync(path.join(dir, 'components/ui/icon-symbol.ios.tsx'), "import { SymbolView } from 'expo-symbols';\n");
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
  const streams = [process.stdin, process.stdout];
  const ttyDescriptors = streams.map(stream => Object.getOwnPropertyDescriptor(stream, 'isTTY'));
  afterEach(() => {
    streams.forEach((stream, index) => {
      const descriptor = ttyDescriptors[index];
      if (descriptor) Object.defineProperty(stream, 'isTTY', descriptor);
      else Reflect.deleteProperty(stream, 'isTTY');
    });
  });
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    streams.forEach(stream => Object.defineProperty(stream, 'isTTY', { configurable: true, value: true }));
  });

  it('编排：拉模版 → 注入基线 → 文档/skill → 扫描 → H清理', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'create-'));
    const { runCreate } = await import('../src/creator');
    await runCreate(['myapp'], { cwd: tmp });
    const { runFileQuiet } = await import('../src/utils/exec');
    const { log } = await import('../src/utils/log');
    expect(runFileQuiet).toHaveBeenCalledWith(
      'npx',
      ['create-expo-app', 'myapp', '--template', 'default@sdk-54', '--no-install'],
      { cwd: tmp },
    );
    expect(log.task).toHaveBeenCalledWith('1/4 创建 Expo SDK 54 模板');
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

    // package.json 合并
    const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
    expect(pkg.scripts.start).toBe('expo start');
    expect(pkg.scripts.postinstall).toContain('patch-package');
    expect(pkg.dependencies['react-native-svg']).toBe('15.15.0');
    expect(pkg.dependencies['@react-native-ohos/react-native-svg']).toBe('15.13.1');
    expect(pkg.dependencies['react-native-webview']).toBeUndefined();
    expect(pkg.dependencies['@react-native-ohos/react-native-webview']).toBeUndefined();
    expect(fs.existsSync(path.join(projectDir, 'patches/@react-native-oh+react-native-harmony+0.82.30.patch'))).toBe(true);

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
    const hapticTab = fs.readFileSync(path.join(projectDir, 'components/haptic-tab.tsx'), 'utf8');
    expect(hapticTab).not.toContain('Haptics');

    // IconSymbol 必须替换为 SVG，避免 @expo/vector-icons -> ExpoFontLoader 原生模块依赖。
    const iconSymbol = fs.readFileSync(path.join(projectDir, 'components/ui/icon-symbol.tsx'), 'utf8');
    expect(iconSymbol).not.toContain('@expo/vector-icons');
    expect(iconSymbol).not.toContain('MaterialIcons');
    expect(iconSymbol).toContain("from 'react-native-svg'");
    expect(iconSymbol).toContain('export function IconSymbol');

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('选择 SDK 52 → 使用 sdk-52 模板与矩阵', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'create-'));
    const prompts = await import('@inquirer/prompts');
    vi.mocked(prompts.select).mockResolvedValueOnce('sdk-52');

    const { runCreate } = await import('../src/creator');
    await runCreate(['myapp'], { cwd: tmp });

    const { runFileQuiet } = await import('../src/utils/exec');
    expect(runFileQuiet).toHaveBeenCalledWith(
      'npx',
      ['create-expo-app', 'myapp', '--template', 'default@sdk-52', '--no-install'],
      { cwd: tmp },
    );

    const { log } = await import('../src/utils/log');
    expect(log.task).toHaveBeenCalledWith('1/4 创建 Expo SDK 52 模板');

    const projectDir = path.join(tmp, 'myapp');
    expect(fs.existsSync(path.join(projectDir, 'patches/@react-native-oh+react-native-harmony+0.77.71.patch'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'index.harmony.js'))).toBe(true);

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it.each([
    ['52', ['myapp', '--sdk=52']],
    ['54', ['myapp', '--sdk=54']],
    ['52', ['myapp', '--sdk', '52']],
    ['54', ['myapp', '--sdk', '54']],
    ['52', ['--sdk', '52', 'myapp']],
  ])('非交互显式 SDK %s：%j → 使用对应模板且不询问', async (sdk, args) => {
    streams.forEach(stream => Object.defineProperty(stream, 'isTTY', { configurable: true, value: false }));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'create-sdk-'));
    try {
      const { runCreate } = await import('../src/creator');
      const { runFileQuiet } = await import('../src/utils/exec');
      const { select } = await import('@inquirer/prompts');
      await runCreate(args as string[], { cwd: tmp });
      expect(select).not.toHaveBeenCalled();
      expect(runFileQuiet).toHaveBeenCalledWith('npx',
        ['create-expo-app', 'myapp', '--template', `default@sdk-${sdk}`, '--no-install'], { cwd: tmp });
      const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'myapp/package.json'), 'utf8'));
      expect(pkg.dependencies.expo).toMatch(new RegExp(`^${sdk}\\.`));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it.each([
    ['--sdk', '53'], ['--sdk=53'], ['--sdk'], ['--sdk='],
    ['--sdk', '--pnpm'], ['--sdk=52=54'], ['--sdk=52', '--sdk', '54'],
  ].map(flags => [flags]))('非法 SDK 参数 %j → 创建前报错', async flags => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'create-sdk-'));
    try {
      const { runCreate } = await import('../src/creator');
      const { runFileQuiet } = await import('../src/utils/exec');
      const { select } = await import('@inquirer/prompts');
      await expect(runCreate(['myapp', ...flags], { cwd: tmp })).rejects.toThrow(/--sdk/);
      expect(runFileQuiet).not.toHaveBeenCalled();
      expect(select).not.toHaveBeenCalled();
      expect(fs.readdirSync(tmp)).toEqual([]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it.each([0, 1])('输入或输出非 TTY（%s）且无 SDK → 提示显式指定，不进入交互', async index => {
    Object.defineProperty(streams[index], 'isTTY', { configurable: true, value: false });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'create-sdk-'));
    try {
      const { runCreate } = await import('../src/creator');
      const { runFileQuiet } = await import('../src/utils/exec');
      const { select } = await import('@inquirer/prompts');
      await expect(runCreate(['myapp'], { cwd: tmp })).rejects.toThrow(/非交互.*--sdk/);
      expect(select).not.toHaveBeenCalled();
      expect(runFileQuiet).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
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
    await expect(runCreate(['myapp'], { cwd: tmp })).rejects.toThrow(/创建 Expo SDK 54 模板失败.*network unavailable/s);
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
