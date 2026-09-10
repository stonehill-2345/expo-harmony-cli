import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

vi.mock('../src/utils/exec', () => ({ runFile: vi.fn() }));
const { runFile: mockRunFile } = await import('../src/utils/exec');

vi.mock('../src/harmony-project', () => ({ syncHarmonyAutolinking: vi.fn(() => ({ linked: [], skipped: [] })) }));
const { syncHarmonyAutolinking: mockSyncHarmonyAutolinking } = await import('../src/harmony-project');

describe('runInstall', () => {
  let tmp: string;
  beforeEach(() => {
    vi.resetModules();
    mockRunFile.mockClear();
    mockSyncHarmonyAutolinking.mockClear();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'install-'));
    fs.writeFileSync(path.join(tmp, 'app.json'), JSON.stringify({ expo: { slug: 'x' } }));
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ dependencies: {} }));
    fs.mkdirSync(path.join(tmp, 'shims'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'shims/.alias-map.json'), '{}');
    process.chdir(tmp);
  });
  afterEach(() => { process.chdir(__dirname); fs.rmSync(tmp, { recursive: true, force: true }); });

  it('expo install 调用 + adaptPackage 命中 alias-only → 不自动 sync', async () => {
    const { runInstall } = await import('../src/installer/installer');
    await runInstall(['@shopify/flash-list']);
    expect(mockRunFile).toHaveBeenCalledWith('npx', ['expo', 'install', '--pnpm', '@shopify/flash-list'], expect.anything());
    expect(mockRunFile).toHaveBeenCalledWith('pnpm', ['install'], expect.anything());
    expect(mockSyncHarmonyAutolinking).not.toHaveBeenCalled();
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    expect(pkg.dependencies['@react-native-ohos/flash-list']).toBe('2.1.1-rc.1');
  });

  it('显式包管理器覆盖默认 pnpm 并透传给 expo install', async () => {
    const { runInstall } = await import('../src/installer/installer');

    await runInstall(['lodash', '--npm']);

    expect(mockRunFile).toHaveBeenCalledWith('npx', ['expo', 'install', '--npm', 'lodash'], expect.anything());
  });

  it('项目已安装 permissions 时，后续 expo install 前补齐插件配置', async () => {
    const packagePath = path.join(tmp, 'package.json');
    fs.writeFileSync(packagePath, JSON.stringify({ dependencies: { 'react-native-permissions': '5.3.0' } }));
    const { runInstall } = await import('../src/installer/installer');

    await runInstall(['react-native-video']);

    const app = JSON.parse(fs.readFileSync(path.join(tmp, 'app.json'), 'utf8'));
    expect(app.expo.plugins).toContainEqual(['react-native-permissions', { iosPermissions: [] }]);
    expect(mockRunFile).toHaveBeenCalledWith('npx', ['expo', 'install', '--pnpm', 'react-native-video'], expect.anything());
  });

  it('命中适配表的原版包注册比对用鸿蒙版包名，不以原版名误报未注册', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    fs.mkdirSync(path.join(tmp, 'harmony'));
    // 装原版 react-native-video：适配表命中并装入鸿蒙版，sync 的 linked 存鸿蒙版包名
    mockSyncHarmonyAutolinking.mockResolvedValueOnce({
      linked: ['@react-native-ohos/react-native-video'],
      linkedSources: { '@react-native-ohos/react-native-video': 'official' },
      skipped: [],
    } as any);
    const { runInstall } = await import('../src/installer/installer');

    await runInstall(['react-native-video']);

    const text = output.mock.calls.flat().join('\n');
    expect(text).toContain('@react-native-ohos/react-native-video 已完成 HarmonyOS 原生注册（官方 autolink）');
    expect(text).not.toContain('未能完成 HarmonyOS 原生注册');
    output.mockRestore();
  });

  it('expo install 调用 + 已有 harmony/ + native → 自动增量 sync', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    fs.mkdirSync(path.join(tmp, 'harmony'));
    const { runInstall } = await import('../src/installer/installer');
    await runInstall(['react-native-webview']);
    expect(mockRunFile).toHaveBeenCalledWith('npx', ['expo', 'install', '--pnpm', 'react-native-webview'], expect.anything());
    expect(mockSyncHarmonyAutolinking).toHaveBeenCalledWith(fs.realpathSync(tmp), { force: false, quiet: true });
    expect(output.mock.calls.flat().join('\n')).toContain('cd harmony && ohpm install');
    output.mockRestore();
  });

  it('native 包但尚无 harmony/ → 不自动建工程，提示首次 prebuild', async () => {
    const info = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { runInstall } = await import('../src/installer/installer');

    await runInstall(['react-native-webview']);

    expect(mockSyncHarmonyAutolinking).not.toHaveBeenCalled();
    expect(info.mock.calls.flat().join('\n')).toContain('prebuild --platform harmony');
    info.mockRestore();
  });

  it('未命中适配表 → 使用未自动适配警告，不 auto-prebuild', async () => {
    const info = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { runInstall } = await import('../src/installer/installer');
    await runInstall(['lodash']);
    expect(mockRunFile).toHaveBeenCalledWith('npx', ['expo', 'install', '--pnpm', 'lodash'], expect.anything());
    expect(mockSyncHarmonyAutolinking).not.toHaveBeenCalled();
    const output = info.mock.calls.map(call => call.join(' ')).join('\n');
    expect(output).toContain('未自动适配 HarmonyOS : lodash');
    expect(output).toContain('纯 JS 包：可直接运行');
    expect(output).toContain('包含原生模块：请勿直接在 HarmonyOS 使用');
    expect(output).toContain('expo-harmony-adapter');
    info.mockRestore();
  });

  it('未适配原生包 → 输出醒目的 HarmonyOS 适配风险提示', async () => {
    const warn = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { runInstall } = await import('../src/installer/installer');

    await runInstall(['react-native-image-picker']);

    const blankLineIndex = warn.mock.calls.findIndex(call => call.length === 0);
    expect(blankLineIndex).toBeGreaterThan(0);
    const output = warn.mock.calls[blankLineIndex + 1].join(' ');
    expect(output).toContain('未自动适配 HarmonyOS : react-native-image-picker');
    expect(output).toContain('react-native-image-picker\n请先确认：');
    expect(output).not.toContain('react-native-image-picker\n\n请先确认：');
    expect(output).toContain('纯 JS 包：可直接运行');
    expect(output).toContain('包含原生模块：请勿直接在 HarmonyOS 使用');
    expect(output).toContain('.agent/skills/expo-harmony-adapter/SKILL.md');
    warn.mockRestore();
  });

  it('blob-util → 原生同步后自动安装 ohpm 依赖并执行 codegen', async () => {
    fs.mkdirSync(path.join(tmp, 'harmony'));
    const generatedDir = path.join(tmp, 'harmony/entry/src/main/cpp/generated');
    fs.mkdirSync(generatedDir, { recursive: true });
    fs.writeFileSync(path.join(generatedDir, 'ReactNativeBlobUtil.cpp'), '// generated');
    const { runInstall } = await import('../src/installer/installer');
    await runInstall(['react-native-blob-util']);
    expect(mockRunFile).toHaveBeenCalledWith('npx', ['expo', 'install', '--pnpm', 'react-native-blob-util'], expect.anything());
    expect(mockRunFile).toHaveBeenCalledWith('pnpm', ['install'], expect.anything());
    expect(mockSyncHarmonyAutolinking).toHaveBeenCalledWith(fs.realpathSync(tmp), { force: false, quiet: true });
    expect(mockRunFile).toHaveBeenCalledWith(expect.any(String), ['install'], { cwd: path.join(fs.realpathSync(tmp), 'harmony', 'entry') });
    expect(mockRunFile).toHaveBeenCalledWith('pnpm', ['codegen'], { cwd: fs.realpathSync(tmp) });
    expect(mockRunFile.mock.calls.map(([file, args]) => [file, args])).toEqual([
      ['npx', ['expo', 'install', '--pnpm', 'react-native-blob-util']],
      ['pnpm', ['install']],
      [expect.any(String), ['install']],
      ['pnpm', ['codegen']],
    ]);
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    expect(pkg.dependencies['react-native-blob-util']).toBe('0.19.6');
    expect(pkg.dependencies['@react-native-oh-tpl/react-native-blob-util']).toBe('0.19.7-rc.1');
  });

  it('TurboModule codegen 未生成 C++ 文件时中止安装流程', async () => {
    fs.mkdirSync(path.join(tmp, 'harmony'));
    const { runInstall } = await import('../src/installer/installer');

    await expect(runInstall(['react-native-blob-util'])).rejects.toThrow('codegen 未生成 C++ 文件');
    expect(mockRunFile).toHaveBeenCalledWith(expect.any(String), ['install'], { cwd: path.join(fs.realpathSync(tmp), 'harmony', 'entry') });
    expect(mockRunFile).toHaveBeenCalledWith('pnpm', ['codegen'], { cwd: fs.realpathSync(tmp) });
  });

  it('install 命中 patch-only → 锁定原包版本并复制 patch', async () => {
    const { runInstall } = await import('../src/installer/installer');
    await runInstall(['expo-constants']);
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    expect(pkg.dependencies['expo-constants']).toBe('17.0.8');
    expect(fs.existsSync(path.join(tmp, 'patches/expo-constants+17.0.8.patch'))).toBe(true);
    expect(mockSyncHarmonyAutolinking).not.toHaveBeenCalled();
  });

  it('--skip-harmony → 跳过 adaptPackage + sync', async () => {
    const { runInstall } = await import('../src/installer/installer');
    await runInstall(['@shopify/flash-list', '--skip-harmony']);
    expect(mockSyncHarmonyAutolinking).not.toHaveBeenCalled();
  });

  it('--skip-native → alias-only 不自动 sync（但 adaptPackage 仍跑）', async () => {
    const { runInstall } = await import('../src/installer/installer');
    await runInstall(['@shopify/flash-list', '--skip-native']);
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    expect(pkg.dependencies['@react-native-ohos/flash-list']).toBe('2.1.1-rc.1');
    expect(mockSyncHarmonyAutolinking).not.toHaveBeenCalled();
  });

  it('缺包名 → 报错', async () => {
    const { runInstall } = await import('../src/installer/installer');
    await expect(runInstall([])).rejects.toThrow(/用法|pkg|包名/i);
  });

  it('非项目根 → 报项目根错误而不是裸 ENOENT', async () => {
    fs.unlinkSync(path.join(tmp, 'package.json'));
    const { runInstall } = await import('../src/installer/installer');
    await expect(runInstall(['lodash'])).rejects.toThrow('当前目录非项目根（缺 package.json）');
  });

  // drift preflight：真实链路（assertNoDrift 走 harmony-project/standalone 子模块，不受 index mock 影响）
  const buildDriftProject = async () => {
    const { syncHarmonyAutolinking: syncReal } = await import('../src/harmony-project/standalone');
    fs.mkdirSync(path.join(tmp, 'harmony', 'entry'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'harmony', 'oh-package.json5'), JSON.stringify({ dependencies: {} }));
    fs.writeFileSync(path.join(tmp, 'harmony', 'entry', 'oh-package.json5'), JSON.stringify({ dependencies: {} }));
    fs.mkdirSync(path.join(tmp, 'node_modules', '@react-native-ohos', 'react-native-safe-area-context', 'harmony'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'node_modules', '@react-native-ohos', 'react-native-safe-area-context', 'harmony', 'safe_area.har'), 'har');
    fs.mkdirSync(path.join(tmp, 'node_modules', '@react-native-oh', 'react-native-harmony'), { recursive: true });
    const quiet = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await syncReal(tmp); // 建立真实基线
    } finally {
      quiet.mockRestore();
    }
    fs.writeFileSync(path.join(tmp, 'harmony', 'entry', 'src', 'main', 'ets', 'RNOHPackagesFactory.ets'), '// manual edit\n');
  };

  it('drift（受管文件被手动修改）→ 在任何安装动作前阻断，磁盘快照不变', async () => {
    await buildDriftProject();
    const pkgBefore = fs.readFileSync(path.join(tmp, 'package.json'), 'utf8');
    const { runInstall } = await import('../src/installer/installer');
    await expect(runInstall(['react-native-webview'])).rejects.toThrow(/已阻止本次 install/);
    expect(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8')).toBe(pkgBefore); // 尚未做任何变更
    expect(mockRunFile).not.toHaveBeenCalled(); // 安装动作未发生
  });

  it('drift + --force → 跳过 drift 保护继续安装', async () => {
    await buildDriftProject();
    const { runInstall } = await import('../src/installer/installer');
    await runInstall(['react-native-webview', '--force']);
    expect(mockRunFile).toHaveBeenCalledWith('npx', ['expo', 'install', '--pnpm', 'react-native-webview'], expect.anything());
  });
});

describe('runInstall 官方优先（任务五）', () => {
  let tmp: string;
  beforeEach(() => {
    vi.resetModules();
    mockRunFile.mockClear();
    mockSyncHarmonyAutolinking.mockClear();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'install-official-'));
    fs.writeFileSync(path.join(tmp, 'app.json'), JSON.stringify({ expo: { slug: 'x' } }));
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ dependencies: {} }));
    fs.mkdirSync(path.join(tmp, 'shims'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'shims/.alias-map.json'), '{}');
    process.chdir(tmp);
  });
  afterEach(() => { process.chdir(__dirname); fs.rmSync(tmp, { recursive: true, force: true }); });

  it('未命中适配表但有原生痕迹且已有 harmony/ → 尝试官方 autolink 并在成功时报告', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    fs.mkdirSync(path.join(tmp, 'harmony'));
    const pkgDir = path.join(tmp, 'node_modules', 'brand-new-native-pkg', 'harmony');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(tmp, 'node_modules', 'brand-new-native-pkg', 'package.json'),
      JSON.stringify({ name: 'brand-new-native-pkg', harmony: { autolinking: {} } }));
    fs.writeFileSync(path.join(pkgDir, 'x.har'), 'har');
    mockSyncHarmonyAutolinking.mockResolvedValueOnce({ linked: ['brand-new-native-pkg'], skipped: [] } as any);
    const { runInstall } = await import('../src/installer/installer');

    await runInstall(['brand-new-native-pkg']);

    expect(mockSyncHarmonyAutolinking).toHaveBeenCalled();
    const text = output.mock.calls.flat().join('\n');
    expect(text).toContain('尝试官方 autolink');
    expect(text).toContain('brand-new-native-pkg 已完成 HarmonyOS 原生注册（自研补充）');
    output.mockRestore();
  });

  it('install 目标包由官方 autolink 注册时归类输出为官方', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    fs.mkdirSync(path.join(tmp, 'harmony'));
    const pkgDir = path.join(tmp, 'node_modules', 'brand-new-native-pkg', 'harmony');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(tmp, 'node_modules', 'brand-new-native-pkg', 'package.json'),
      JSON.stringify({ name: 'brand-new-native-pkg', harmony: { autolinking: {} } }));
    fs.writeFileSync(path.join(pkgDir, 'x.har'), 'har');
    mockSyncHarmonyAutolinking.mockResolvedValueOnce({
      linked: ['brand-new-native-pkg'],
      linkedSources: { 'brand-new-native-pkg': 'official' },
      skipped: [],
    } as any);
    const { runInstall } = await import('../src/installer/installer');

    await runInstall(['brand-new-native-pkg']);

    const text = output.mock.calls.flat().join('\n');
    expect(text).toContain('brand-new-native-pkg 已完成 HarmonyOS 原生注册（官方 autolink）');
    output.mockRestore();
  });

  it('官方尝试后仍未覆盖 → 输出原因与统一提示', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    fs.mkdirSync(path.join(tmp, 'harmony'));
    const pkgDir = path.join(tmp, 'node_modules', 'brand-new-native-pkg', 'harmony');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(tmp, 'node_modules', 'brand-new-native-pkg', 'package.json'),
      JSON.stringify({ name: 'brand-new-native-pkg', harmony: {} }));
    fs.writeFileSync(path.join(pkgDir, 'x.har'), 'har');
    mockSyncHarmonyAutolinking.mockResolvedValueOnce({
      linked: [],
      skipped: [{ package: 'brand-new-native-pkg', reason: '未适配 HarmonyOS（官方与 mapping 均未覆盖）' }],
    } as any);
    const { runInstall } = await import('../src/installer/installer');

    await runInstall(['brand-new-native-pkg']);

    const text = output.mock.calls.flat().join('\n');
    expect(text).toContain('未能完成 HarmonyOS 原生注册');
    expect(text).toContain('不是所有 Expo / React Native 原生模块都已适配 HarmonyOS');
    output.mockRestore();
  });

  it('未命中适配表且无原生痕迹 → 维持原有警告路径，不调用 sync', async () => {
    const info = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    fs.mkdirSync(path.join(tmp, 'harmony'));
    const { runInstall } = await import('../src/installer/installer');
    await runInstall(['lodash']);
    expect(mockSyncHarmonyAutolinking).not.toHaveBeenCalled();
    expect(info.mock.calls.flat().join('\n')).toContain('未自动适配 HarmonyOS : lodash');
    info.mockRestore();
  });
});
