import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import fsDefault from 'fs';
import * as path from 'path';
import * as os from 'os';
import JSON5 from 'json5';
import { runHarmonyGeneration, syncHarmonyAutolinking } from '../standalone';
import { readManagedState as readManagedStateFor } from '../../lifecycle/managed-state';
import { VERSION_MATRIX } from '../../version-matrix';

// vitest 下 import * as fs 得到冻结 namespace、spyOn 拦不到被测模块内部调用；
// 用文件级 vi.mock 让测试与被测模块共享同一 vi.fn（默认透传真实实现，不影响上方既有用例）。
// 真实实现从 default 对象取（default = 工厂闭包里的 actual，未被 mock 污染）。
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    writeFileSync: vi.fn(actual.writeFileSync),
    renameSync: vi.fn(actual.renameSync),
    default: actual,
  };
});

describe('runHarmonyGeneration (integration)', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-'));
    fs.mkdirSync(
      path.join(tmp, 'node_modules', '@react-native-ohos', 'react-native-safe-area-context'),
      { recursive: true },
    );
    fs.mkdirSync(path.join(tmp, 'node_modules', '@react-native-oh', 'react-native-harmony'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tmp, 'node_modules', '@react-native-ohos', 'react-native-safe-area-context', 'harmony'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'node_modules', '@react-native-ohos', 'react-native-safe-area-context', 'harmony', 'safe_area.har'), 'har');
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('生成 harmony/ 骨架 + autolinking 三文件 + app.json5 bundleName', async () => {
    fs.mkdirSync(path.join(tmp, 'node_modules', '@react-native-ohos', 'react-native-svg'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tmp, 'node_modules', '@react-native-ohos', 'react-native-svg', 'harmony'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'node_modules', '@react-native-ohos', 'react-native-svg', 'harmony', 'svg.har'), 'har');
    await runHarmonyGeneration(tmp, { name: 'MyApp', slug: 'myapp' } as any, {});
    const harmonyDir = path.join(tmp, 'harmony');
    expect(fs.existsSync(path.join(harmonyDir, 'AppScope/app.json5'))).toBe(true);
    expect(fs.existsSync(path.join(harmonyDir, 'hvigor/hvigor-config.json5'))).toBe(true);
    expect(fs.existsSync(path.join(harmonyDir, 'entry/src/main/cpp/CMakeLists.txt'))).toBe(true);
    expect(fs.existsSync(path.join(harmonyDir, 'entry/src/main/ets/PackageProvider.ets'))).toBe(true);
    expect(
      fs.existsSync(path.join(harmonyDir, 'entry/src/main/resources/rawfile/.gitkeep')),
    ).toBe(true);
    expect(fs.existsSync(path.join(harmonyDir, '.gitignore'))).toBe(true);
    const app = fs.readFileSync(path.join(harmonyDir, 'AppScope/app.json5'), 'utf8');
    expect(app).toContain('"bundleName": "com.myapp.app"');
    expect(app).toContain('"label": "$string:app_name"');
    expect(app).toContain('"icon": "$media:layered_image"');
    expect(app).not.toContain('$media:app_icon');
    const str = fs.readFileSync(
      path.join(harmonyDir, 'AppScope/resources/base/element/string.json'),
      'utf8',
    );
    expect(str).toContain('"value": "MyApp"');
    const ohPkg = fs.readFileSync(path.join(harmonyDir, 'oh-package.json5'), 'utf8');
    expect(ohPkg).toContain('"@rnoh/react-native-openharmony"');
    expect(ohPkg).toContain('safe_area.har');
    expect(ohPkg).toContain('svg.har');
    expect(
      fs.readFileSync(path.join(harmonyDir, 'entry/src/main/ets/RNOHPackagesFactory.ets'), 'utf8'),
    ).toContain('SafeAreaViewPackage');
    expect(
      fs.readFileSync(path.join(harmonyDir, 'entry/src/main/ets/RNOHPackagesFactory.ets'), 'utf8'),
    ).toContain('SvgPackage');
    expect(
      fs.readFileSync(path.join(harmonyDir, 'entry/src/main/cpp/RNOHPackagesFactory.h'), 'utf8'),
    ).toContain('SafeAreaViewPackage.h');
    expect(
      fs.readFileSync(path.join(harmonyDir, 'entry/src/main/cpp/autolinking.cmake'), 'utf8'),
    ).toContain('rnoh_safe_area');
    expect(
      fs.readFileSync(path.join(harmonyDir, 'entry/src/main/cpp/autolinking.cmake'), 'utf8'),
    ).toContain('rnoh_svg');
  });

  it('harmony/ 已存在且未传 force → 抛错', async () => {
    fs.mkdirSync(path.join(tmp, 'harmony'));
    await expect(runHarmonyGeneration(tmp, { name: 'X', slug: 'x' } as any, {})).rejects.toThrow(
      /prebuild --platform harmony --force/,
    );
  });

  it('sync 仅刷新 autolinking 托管文件，保留签名与应用配置', async () => {
    await runHarmonyGeneration(tmp, { name: 'Sync', slug: 'sync' } as any, {});
    const harmonyDir = path.join(tmp, 'harmony');
    const appScopePath = path.join(harmonyDir, 'AppScope/app.json5');
    const appScopeBefore = fs.readFileSync(appScopePath, 'utf8');
    const signPath = path.join(harmonyDir, 'sign/keep.txt');
    fs.mkdirSync(path.dirname(signPath), { recursive: true });
    fs.writeFileSync(signPath, 'keep');
    fs.mkdirSync(path.join(tmp, 'node_modules', '@react-native-ohos', 'react-native-webview'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tmp, 'node_modules', '@react-native-ohos', 'react-native-webview', 'harmony'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'node_modules', '@react-native-ohos', 'react-native-webview', 'harmony', 'rn_webview.har'), 'har');

    const result = await syncHarmonyAutolinking(tmp);

    expect(result.linked).toContain('@react-native-ohos/react-native-webview');
    expect(fs.readFileSync(appScopePath, 'utf8')).toBe(appScopeBefore);
    expect(fs.readFileSync(signPath, 'utf8')).toBe('keep');
    expect(fs.readFileSync(path.join(harmonyDir, 'entry/src/main/ets/RNOHPackagesFactory.ets'), 'utf8'))
      .toContain('WebViewPackage');
  });

  it('sync 在 harmony/ 不存在时提示先执行首次 prebuild', async () => {
    await expect(syncHarmonyAutolinking(tmp)).rejects.toThrow(/harmony.*prebuild/i);
  });

  it('force=true 覆盖已存在 harmony/', async () => {
    fs.mkdirSync(path.join(tmp, 'harmony'));
    await expect(
      runHarmonyGeneration(tmp, { name: 'X', slug: 'x' } as any, { force: true }),
    ).resolves.toBeUndefined();
  });

  it('Hvigor 插件 fallback 使用 VERSION_MATRIX.rnohCli', async () => {
    const original = VERSION_MATRIX.rnohCli;
    (VERSION_MATRIX as { rnohCli: string }).rnohCli = '9.9.9';
    try {
      await runHarmonyGeneration(tmp, { name: 'Matrix', slug: 'matrix' } as any, {});
      const config = fs.readFileSync(path.join(tmp, 'harmony/hvigor/hvigor-config.json5'), 'utf8');
      expect(config).toContain('rnoh-hvigor-plugin-9.9.9.tgz');
    } finally {
      (VERSION_MATRIX as { rnohCli: string }).rnohCli = original;
    }
  });

  it('多包端到端：5 包同时命中按 npmPackageName 字典序链接（gesture-handler < reanimated < safe-area-context < screens < webview）', async () => {
    // safe-area-context 由 beforeEach 建好，补齐另外 4 包
    for (const pkg of [
      '@react-native-ohos/react-native-gesture-handler',
      '@react-native-ohos/react-native-reanimated',
      '@react-native-ohos/react-native-screens',
      '@react-native-ohos/react-native-webview',
    ]) {
      fs.mkdirSync(path.join(tmp, 'node_modules', pkg), { recursive: true });
    }
    const hars: Record<string, string> = { 'react-native-gesture-handler': 'gesture_handler.har', 'react-native-reanimated': 'reanimated.har', 'react-native-screens': 'screens.har', 'react-native-webview': 'rn_webview.har' };
    for (const [pkg, har] of Object.entries(hars)) {
      const dir = path.join(tmp, 'node_modules', '@react-native-ohos', pkg, 'harmony');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, har), 'har');
    }

    await runHarmonyGeneration(tmp, { name: 'Multi', slug: 'multi' } as any, {});
    const harmonyDir = path.join(tmp, 'harmony');

    // RNOHPackagesFactory.ets：5 个 import + 5 个 new XxxPackage(ctx)，返回 RNPackage[] 避免 ArkTS 不重叠类型强转
    const ets = fs.readFileSync(
      path.join(harmonyDir, 'entry/src/main/ets/RNOHPackagesFactory.ets'),
      'utf8',
    );
    expect(ets).toContain(
      "import GestureHandlerPackage from '@react-native-ohos/react-native-gesture-handler';",
    );
    expect(ets).toContain(
      "import { ReanimatedPackage } from '@react-native-ohos/react-native-reanimated/ts';",
    );
    expect(ets).toContain(
      "import { SafeAreaViewPackage } from '@react-native-ohos/react-native-safe-area-context/ts';",
    );
    expect(ets).toContain(
      "import RNOHScreensPackage from '@react-native-ohos/react-native-screens';",
    );
    expect(ets).toContain(
      "import { WebViewPackage } from '@react-native-ohos/react-native-webview/ts';",
    );
    expect(ets).toContain(
      "import type { RNPackage, RNPackageContext } from '@rnoh/react-native-openharmony';",
    );
    expect(ets).toContain('export function createRNOHPackages(ctx: RNPackageContext): RNPackage[]');
    expect(ets).toContain('new GestureHandlerPackage(ctx)');
    expect(ets).toContain('new ReanimatedPackage(ctx)');
    expect(ets).toContain('new SafeAreaViewPackage(ctx)');
    expect(ets).toContain('new RNOHScreensPackage(ctx)');
    expect(ets).toContain('new WebViewPackage(ctx)');
    expect(ets).not.toContain('as RNOHPackage');

    // 字典序：用 new XxxPackage(ctx) 行位置验证（每包恰好一行，无 { } 干扰）
    const linkedOrder = [
      'GestureHandlerPackage',
      'ReanimatedPackage',
      'SafeAreaViewPackage',
      'RNOHScreensPackage',
      'WebViewPackage',
    ];
    const positions = linkedOrder.map(cls => ets.indexOf(`new ${cls}(ctx)`));
    expect(positions.every(p => p >= 0)).toBe(true); // 都存在
    expect([...positions].sort((a, b) => a - b)).toEqual(positions); // 严格按字典序

    // autolinking.cmake：4 个 add_subdirectory
    const cmakeLists = fs.readFileSync(path.join(harmonyDir, 'entry/src/main/cpp/CMakeLists.txt'), 'utf8');
    expect(cmakeLists).toContain('function(resolve_oh_package_cpp out_var package_name)');
    expect(cmakeLists).toContain('@rnoh/react-native-openharmony');

    const cmake = fs.readFileSync(
      path.join(harmonyDir, 'entry/src/main/cpp/autolinking.cmake'),
      'utf8',
    );
    const cppFactory = fs.readFileSync(path.join(harmonyDir, 'entry/src/main/cpp/RNOHPackagesFactory.h'), 'utf8');
    expect(cppFactory).toContain('std::make_shared<ScreensPackage>(ctx)');
    expect(cppFactory).not.toContain('std::make_shared<rnoh::ScreensPackage>(ctx)');

    expect(cmake).toContain('resolve_oh_package_cpp(AUTOLINKED_CPP_DIR "@react-native-ohos/react-native-gesture-handler")');
    expect(cmake).toContain('add_subdirectory("${AUTOLINKED_CPP_DIR}" ./rnoh_gesture_handler)');
    expect(cmake).toContain('${NODE_MODULES}/@react-native-ohos/react-native-webview/harmony/rn_webview/src/main/cpp');
    expect(cmake).toContain('add_subdirectory("${AUTOLINKED_CPP_DIR}" ./rnoh_webview)');
    expect((cmake.match(/add_subdirectory/g) || []).length).toBe(5);

    // 根 oh-package.json5：5 个 har 引用 + @rnoh/react-native-openharmony
    const ohPkg = fs.readFileSync(path.join(harmonyDir, 'oh-package.json5'), 'utf8');
    expect(ohPkg).toContain('@rnoh/react-native-openharmony');
    expect(ohPkg).toContain('gesture_handler.har');
    expect(ohPkg).toContain('reanimated.har');
    expect(ohPkg).toContain('safe_area.har');
    expect(ohPkg).toContain('screens.har');
    expect(ohPkg).toContain('rn_webview.har');
  });

  it('幂等：force 重新生成产出一致（app.json5 / RNOHPackagesFactory.ets / 根 oh-package.json5）', async () => {
    await runHarmonyGeneration(tmp, { name: 'X', slug: 'x' } as any, {});
    const harmonyDir = path.join(tmp, 'harmony');
    const app1 = fs.readFileSync(path.join(harmonyDir, 'AppScope/app.json5'), 'utf8');
    const ets1 = fs.readFileSync(
      path.join(harmonyDir, 'entry/src/main/ets/RNOHPackagesFactory.ets'),
      'utf8',
    );
    const oh1 = fs.readFileSync(path.join(harmonyDir, 'oh-package.json5'), 'utf8');

    // 第二次：harmony/ 已存在，必须 force 才能覆盖重生成
    await runHarmonyGeneration(tmp, { name: 'X', slug: 'x' } as any, { force: true });
    const app2 = fs.readFileSync(path.join(harmonyDir, 'AppScope/app.json5'), 'utf8');
    const ets2 = fs.readFileSync(
      path.join(harmonyDir, 'entry/src/main/ets/RNOHPackagesFactory.ets'),
      'utf8',
    );
    const oh2 = fs.readFileSync(path.join(harmonyDir, 'oh-package.json5'), 'utf8');

    expect(app2).toBe(app1);
    expect(ets2).toBe(ets1);
    expect(oh2).toBe(oh1);
  });

  it('entry 侧声明 ArkTS 编译依赖 / appName + Expo appKey / EntryAbility_label', async () => {
    await runHarmonyGeneration(tmp, { name: 'MyApp', slug: 'myapp' } as any, {});
    const harmonyDir = path.join(tmp, 'harmony');

    // entry/oh-package.json5：ArkTS 编译入口在 entry 模块内，必须能解析 RNOH 与被 import 的三方包。
    const entryOhPkgPath = path.join(harmonyDir, 'entry/oh-package.json5');
    expect(fs.existsSync(entryOhPkgPath)).toBe(true);
    const entryOhPkg = fs.readFileSync(entryOhPkgPath, 'utf8');
    const parsed = JSON5.parse(entryOhPkg);
    expect(parsed.name).toBe('entry');
    expect(parsed.dependencies['@rnoh/react-native-openharmony']).toBe(
      'file:../../node_modules/@react-native-oh/react-native-harmony/react_native_openharmony.har',
    );
    expect(parsed.dependencies['@react-native-ohos/react-native-safe-area-context']).toBe(
      'file:../../node_modules/@react-native-ohos/react-native-safe-area-context/harmony/safe_area.har',
    );

    // Index.ets：rnInstanceConfig.name 使用应用名；Expo registerRootComponent 注册的 appKey 固定为 main。
    const indexEts = fs.readFileSync(
      path.join(harmonyDir, 'entry/src/main/ets/pages/Index.ets'),
      'utf8',
    );
    expect(indexEts).toContain('name: "MyApp"');
    expect(indexEts).toContain('appKey: "main"');
    expect(indexEts).toContain("import { preferences } from '@kit.ArkData';");
    expect(indexEts).toContain("dataPreferences.getSync('devHostAndPortAddress', '')");
    expect(indexEts).toContain("'localhost:8081'");
    expect(indexEts).toContain('createMetroJSBundleProvider(this.rnohCoreContext)');
    expect(indexEts).toContain("'bundle.harmony.js'");
    expect(indexEts).toContain('new AnyJSBundleProvider([');
    expect(indexEts).toContain('new ResourceJSBundleProvider');
    expect(indexEts).not.toContain('hermes_bundle.hbc');
    expect(indexEts).not.toContain('new MetroJSBundleProvider()');

    const entryAbility = fs.readFileSync(
      path.join(harmonyDir, 'entry/src/main/ets/entryability/EntryAbility.ets'),
      'utf8',
    );
    expect(entryAbility).toContain("import { RNAbility }");
    expect(entryAbility).toContain("extends RNAbility");
    expect(entryAbility).toContain("super.onWindowStageCreate(windowStage)");

    const entryBuildProfile = fs.readFileSync(path.join(harmonyDir, 'entry/build-profile.json5'), 'utf8');
    expect(entryBuildProfile).toContain('"externalNativeOptions"');
    expect(entryBuildProfile).toContain('"path": "./src/main/cpp/CMakeLists.txt"');

    const generatedPackage = fs.readFileSync(
      path.join(harmonyDir, 'entry/src/main/cpp/generated/RNOHGeneratedPackage.h'),
      'utf8',
    );
    expect(generatedPackage).toContain('class RNOHGeneratedPackage');

    // entry module.json5/string.json：不用 module_desc，避免资源名冲突；EntryAbility_label value=appName
    const moduleJson5 = fs.readFileSync(path.join(harmonyDir, 'entry/src/main/module.json5'), 'utf8');
    expect(moduleJson5).toContain('$string:EntryAbility_desc');
    expect(moduleJson5).not.toContain('module_desc');

    const entryString = fs.readFileSync(
      path.join(harmonyDir, 'entry/src/main/resources/base/element/string.json'),
      'utf8',
    );
    expect(entryString).not.toContain('module_desc');
    expect(entryString).toContain('"EntryAbility_label"');
    expect(entryString).toContain('"value": "MyApp"');
  });
});

describe('syncHarmonyAutolinking drift 保护', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-'));
    // fixture 自包含：mergeOhPackageDependencies 直接读取两个 oh-package.json5，必须预置；
    // @react-native-oh/react-native-harmony 目录与既有 fixture 同款（autolinking 探测需要）。
    fs.mkdirSync(path.join(tmp, 'harmony', 'entry'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'harmony', 'oh-package.json5'), JSON.stringify({ dependencies: {} }));
    fs.writeFileSync(path.join(tmp, 'harmony', 'entry', 'oh-package.json5'), JSON.stringify({ dependencies: {} }));
    fs.mkdirSync(path.join(tmp, 'node_modules', '@react-native-ohos', 'react-native-safe-area-context', 'harmony'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'node_modules', '@react-native-ohos', 'react-native-safe-area-context', 'harmony', 'safe_area.har'), 'har');
    fs.mkdirSync(path.join(tmp, 'node_modules', '@react-native-oh', 'react-native-harmony'), { recursive: true });
    await syncHarmonyAutolinking(tmp); // 建立基线
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const etsPath = () => path.join(tmp, 'harmony', 'entry', 'src', 'main', 'ets', 'RNOHPackagesFactory.ets');

  const collectLeftovers = (root: string, suffixes: string[]): string[] => {
    const leftovers: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (suffixes.some(s => full.endsWith(s))) leftovers.push(full);
      }
    };
    walk(root);
    return leftovers;
  };

  it('首次 sync 写入 autolinking 文件并建立基线', () => {
    const state = readManagedStateFor(tmp);
    expect(state.generatedFiles?.[path.join('harmony', 'entry', 'src', 'main', 'ets', 'RNOHPackagesFactory.ets')]).toBeTruthy();
    expect(state.generatedFiles?.[path.join('harmony', 'entry', 'src', 'main', 'cpp', 'autolinking.cmake')]).toBeTruthy();
  });

  it('手改 A 类文件 → 抛错且文件未被覆盖', async () => {
    fs.writeFileSync(etsPath(), '// user manual edit\n');
    await expect(syncHarmonyAutolinking(tmp)).rejects.toThrow(/受管文件/);
    // 阻断提示需指路：自定义 Package 去 PackageProvider（用户区）
    await expect(syncHarmonyAutolinking(tmp)).rejects.toThrow(/PackageProvider/);
    expect(fs.readFileSync(etsPath(), 'utf8')).toBe('// user manual edit\n');
  });

  it('--force → 覆盖并更新基线', async () => {
    fs.writeFileSync(etsPath(), '// user manual edit\n');
    await expect(syncHarmonyAutolinking(tmp, { force: true })).resolves.toBeTruthy();
    expect(fs.readFileSync(etsPath(), 'utf8')).not.toContain('user manual edit');
    await expect(syncHarmonyAutolinking(tmp)).resolves.toBeTruthy(); // 基线已更新
  });

  it('新增依赖库（内容变化但磁盘与旧基线一致）→ 不阻断', async () => {
    fs.mkdirSync(path.join(tmp, 'node_modules', '@react-native-ohos', 'react-native-svg', 'harmony'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'node_modules', '@react-native-ohos', 'react-native-svg', 'harmony', 'svg.har'), 'har');
    await expect(syncHarmonyAutolinking(tmp)).resolves.toBeTruthy();
    expect(fs.readFileSync(etsPath(), 'utf8')).toContain('SvgPackage');
  });

  it('已有基线时手改根 oh-package 托管条目（B 类）→ 抛错', async () => {
    const ohPkg = path.join(tmp, 'harmony', 'oh-package.json5');
    const json = JSON5.parse(fs.readFileSync(ohPkg, 'utf8'));
    json.dependencies['@react-native-ohos/react-native-safe-area-context'] = '1.0.0';
    fs.writeFileSync(ohPkg, JSON.stringify(json, null, 2));
    await expect(syncHarmonyAutolinking(tmp)).rejects.toThrow(/react-native-safe-area-context/);
  });

  it('unmanaged 条目被改 → 放行（非托管修改不属保护范围，保留逻辑照常回写）', async () => {
    const ohPkg = path.join(tmp, 'harmony', 'oh-package.json5');
    const json = JSON5.parse(fs.readFileSync(ohPkg, 'utf8'));
    json.dependencies['my-own-lib'] = '^1.0.0';
    fs.writeFileSync(ohPkg, JSON.stringify(json, null, 2));
    await expect(syncHarmonyAutolinking(tmp)).resolves.toBeTruthy();
    const after = JSON5.parse(fs.readFileSync(ohPkg, 'utf8'));
    expect(after.dependencies['my-own-lib']).toBe('^1.0.0'); // 未被删除
  });

  it('无 B 类基线（形状退化）：改为 1.0.0 → 阻断；改为其他 file: 值 → 放行', async () => {
    const ohPkg = path.join(tmp, 'harmony', 'oh-package.json5');
    const dep = '@react-native-ohos/react-native-safe-area-context';
    const statePath = path.join(tmp, '.expo-harmony', 'managed-state.json');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    delete state.managedEntries; // 模拟迁移/早期状态（A 类基线保留）
    fs.writeFileSync(statePath, JSON.stringify(state));

    const json = JSON5.parse(fs.readFileSync(ohPkg, 'utf8'));
    json.dependencies[dep] = '1.0.0';
    fs.writeFileSync(ohPkg, JSON.stringify(json, null, 2));
    await expect(syncHarmonyAutolinking(tmp)).rejects.toThrow(/safe-area-context/); // 脱离 file: 家族

    json.dependencies[dep] = 'file:../custom_location/x.har';
    fs.writeFileSync(ohPkg, JSON.stringify(json, null, 2));
    await expect(syncHarmonyAutolinking(tmp)).resolves.toBeTruthy(); // file: 家族放行
  });

  it('B 类合法升级：现值 = 基线记录值 ≠ 当前期望 → 放行覆盖（与 A 类升级哲学对齐）', async () => {
    const ohPkg = path.join(tmp, 'harmony', 'oh-package.json5');
    const rel = path.join('harmony', 'oh-package.json5');
    const dep = '@react-native-ohos/react-native-safe-area-context';
    const oldSpec = 'file:../node_modules/@react-native-ohos/react-native-safe-area-context/harmony/old_name.har';
    const newSpec = 'file:../node_modules/@react-native-ohos/react-native-safe-area-context/harmony/safe_area.har';
    // 磁盘现值 = 旧 spec（模拟旧版 CLI 写入）
    const json = JSON5.parse(fs.readFileSync(ohPkg, 'utf8'));
    json.dependencies[dep] = oldSpec;
    fs.writeFileSync(ohPkg, JSON.stringify(json, null, 2));
    // B 类基线记录值 = 旧 spec（A 类基线未动，无 A 类 drift）
    const statePath = path.join(tmp, '.expo-harmony', 'managed-state.json');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    state.managedEntries = { [`${rel}:${dep}`]: { path: rel, dependency: dep, spec: oldSpec, cliVersion: '1.1.0' } };
    fs.writeFileSync(statePath, JSON.stringify(state));

    await expect(syncHarmonyAutolinking(tmp)).resolves.toBeTruthy();
    const after = JSON5.parse(fs.readFileSync(ohPkg, 'utf8'));
    expect(after.dependencies[dep]).toBe(newSpec); // 覆盖为新期望并更新基线
    const stateAfter = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    expect(stateAfter.managedEntries?.[`${rel}:${dep}`]?.spec).toBe(newSpec);
  });

  it('删除基线后手改文件（新 clone 场景）→ 放行并重建基线', async () => {
    fs.rmSync(path.join(tmp, '.expo-harmony'), { recursive: true, force: true });
    fs.writeFileSync(etsPath(), '// user manual edit\n');
    await expect(syncHarmonyAutolinking(tmp)).resolves.toBeTruthy();
    expect(fs.readFileSync(etsPath(), 'utf8')).not.toContain('user manual edit');
  });

  it('sync --force 只覆盖受管文件，harmony/ 其余内容保留（与 prebuild --force 整目录删除对照）', async () => {
    fs.writeFileSync(etsPath(), '// user manual edit\n');
    const customFile = path.join(tmp, 'harmony', 'my-signing-notes.txt');
    fs.writeFileSync(customFile, '签名信息');
    await expect(syncHarmonyAutolinking(tmp, { force: true })).resolves.toBeTruthy();
    expect(fs.readFileSync(customFile, 'utf8')).toBe('签名信息');
  });

  it('已有基线 + prebuild --force（runHarmonyGeneration）→ 不因残余基线误阻断（force 透传链）', async () => {
    // prebuild --force 删除整个 harmony/ 重建，但 .expo-harmony/ 状态（含 v2 基线）保留；
    // 若 force 未透传到 syncHarmonyAutolinking，此处会误抛"受管文件被手动修改"。
    fs.writeFileSync(etsPath(), '// user manual edit\n');
    await expect(
      runHarmonyGeneration(tmp, { name: 'X', slug: 'x' } as any, { force: true }),
    ).resolves.toBeUndefined();
    expect(fs.readFileSync(etsPath(), 'utf8')).not.toContain('user manual edit');
  });

  it('暂存阶段：第二个 tmp 写失败 → 干净失败，目标文件与基线不变、无 .cli-tmp 残留', async () => {
    const etsBefore = fs.readFileSync(etsPath(), 'utf8');
    const stateBefore = JSON.stringify(readManagedStateFor(tmp));
    const realWrite = fsDefault.writeFileSync;
    // files 顺序 ets → h → cmake → oh-package：让 ets 之外的第一个 tmp 写失败
    vi.mocked(fs.writeFileSync).mockImplementation(((p: any, data: any, ...rest: any[]) => {
      if (typeof p === 'string' && p.endsWith('.cli-tmp') && !p.endsWith('.ets.cli-tmp')) {
        throw new Error('mock 磁盘故障');
      }
      return (realWrite as any)(p, data, ...rest);
    }) as any);
    try {
      await expect(syncHarmonyAutolinking(tmp, { force: true })).rejects.toThrow(/写入失败/);
    } finally {
      vi.mocked(fs.writeFileSync).mockImplementation(realWrite);
    }
    expect(fs.readFileSync(etsPath(), 'utf8')).toBe(etsBefore);        // rename 未发生
    expect(JSON.stringify(readManagedStateFor(tmp))).toBe(stateBefore); // 基线未写
    expect(collectLeftovers(tmp, ['.cli-tmp'])).toEqual([]);            // tmp 全部清理
  });

  it('五阶段事务：替换阶段第 2 个 rename 失败 → 回滚成功，全部文件恢复原内容、无 tmp/bak 残留、基线未动', async () => {
    const before = new Map<string, string>();
    const targets = [
      path.join(tmp, 'harmony', 'entry', 'src', 'main', 'ets', 'RNOHPackagesFactory.ets'),
      path.join(tmp, 'harmony', 'entry', 'src', 'main', 'cpp', 'RNOHPackagesFactory.h'),
      path.join(tmp, 'harmony', 'entry', 'src', 'main', 'cpp', 'autolinking.cmake'),
      path.join(tmp, 'harmony', 'oh-package.json5'),
      path.join(tmp, 'harmony', 'entry', 'oh-package.json5'),
    ];
    for (const t of targets) before.set(t, fs.readFileSync(t, 'utf8'));
    const stateBefore = fs.readFileSync(path.join(tmp, '.expo-harmony', 'managed-state.json'), 'utf8');

    const realRename = fsDefault.renameSync;
    let tmpRenames = 0;
    vi.mocked(fs.renameSync).mockImplementation(((from: any, to: any) => {
      if (typeof from === 'string' && from.endsWith('.cli-tmp')) {
        tmpRenames += 1;
        if (tmpRenames === 2) throw new Error('mock rename 故障'); // 备份 rename 不受影响
      }
      return (realRename as any)(from, to);
    }) as any);
    try {
      await expect(syncHarmonyAutolinking(tmp, { force: true })).rejects.toThrow(/已回滚/);
    } finally {
      vi.mocked(fs.renameSync).mockImplementation(realRename);
    }
    for (const [t, content] of before) {
      expect(fs.readFileSync(t, 'utf8')).toBe(content); // 含第 1 个已替换文件也被回滚
    }
    expect(fs.readFileSync(path.join(tmp, '.expo-harmony', 'managed-state.json'), 'utf8')).toBe(stateBefore);
    expect(collectLeftovers(tmp, ['.cli-tmp', '.cli-bak'])).toEqual([]);
    await expect(syncHarmonyAutolinking(tmp)).resolves.toBeTruthy(); // 回滚后普通 sync 可直接通过
  });

  it('五阶段事务：状态落账失败（managed-state rename 抛错）→ 同一回滚，文件恢复原内容、旧基线未动、无 tmp/bak/state-tmp 残留、普通 sync 直接通过', async () => {
    const before = new Map<string, string>();
    const targets = [
      path.join(tmp, 'harmony', 'entry', 'src', 'main', 'ets', 'RNOHPackagesFactory.ets'),
      path.join(tmp, 'harmony', 'entry', 'src', 'main', 'cpp', 'RNOHPackagesFactory.h'),
      path.join(tmp, 'harmony', 'entry', 'src', 'main', 'cpp', 'autolinking.cmake'),
      path.join(tmp, 'harmony', 'oh-package.json5'),
      path.join(tmp, 'harmony', 'entry', 'oh-package.json5'),
    ];
    for (const t of targets) before.set(t, fs.readFileSync(t, 'utf8'));
    const statePath = path.join(tmp, '.expo-harmony', 'managed-state.json');
    const stateBefore = fs.readFileSync(statePath, 'utf8');

    const realRename = fsDefault.renameSync;
    vi.mocked(fs.renameSync).mockImplementation(((from: any, to: any) => {
      // 仅拦截 managed-state 的 tmp → rename（第 ④ 阶段），受管文件替换不受影响
      if (typeof from === 'string' && from.endsWith('managed-state.json.cli-tmp')) {
        throw new Error('mock state rename 故障');
      }
      return (realRename as any)(from, to);
    }) as any);
    try {
      await expect(syncHarmonyAutolinking(tmp)).rejects.toThrow(/基线状态写入失败/);
    } finally {
      vi.mocked(fs.renameSync).mockImplementation(realRename);
    }
    for (const [t, content] of before) {
      expect(fs.readFileSync(t, 'utf8')).toBe(content); // 全部恢复原内容（含已替换的）
    }
    expect(fs.readFileSync(statePath, 'utf8')).toBe(stateBefore); // 旧基线未动，无"新文件+旧基线"错配
    expect(collectLeftovers(tmp, ['.cli-tmp', '.cli-bak'])).toEqual([]); // 无 tmp/bak/state-tmp 残留
    await expect(syncHarmonyAutolinking(tmp)).resolves.toBeTruthy(); // 普通 sync 直接通过
  });

  it('五阶段事务：替换失败且回滚中恢复也失败 → 保留原始错误并列出未能恢复的文件（回滚不静默中断）', async () => {
    const realRename = fsDefault.renameSync;
    let tmpRenames = 0;
    vi.mocked(fs.renameSync).mockImplementation(((from: any, to: any) => {
      if (typeof from === 'string' && from.endsWith('.cli-tmp')) {
        tmpRenames += 1;
        if (tmpRenames === 1) throw new Error('mock rename 故障'); // 替换阶段第 1 个失败
      }
      if (typeof from === 'string' && from.endsWith('.cli-bak')) {
        throw new Error('mock 回滚故障'); // 回滚阶段的 bak 恢复也全部失败
      }
      return (realRename as any)(from, to);
    }) as any);
    let message = '';
    try {
      await syncHarmonyAutolinking(tmp, { force: true });
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    } finally {
      vi.mocked(fs.renameSync).mockImplementation(realRename);
    }
    expect(message).toMatch(/mock rename 故障/);   // 原始错误未被回滚失败掩盖
    expect(message).toMatch(/未能自动恢复/);        // 明确告知存在未恢复文件
    expect(message).toContain('RNOHPackagesFactory.ets.cli-bak'); // 列出具体文件
    // bak 残留（回滚恢复失败 → 目标缺失 + bak 并存 = 唯一副本形态），
    // 下次 sync 步骤 0 自动恢复后正常通过，闭环自愈
    expect(collectLeftovers(tmp, ['.cli-bak']).length).toBeGreaterThan(0);
    await expect(syncHarmonyAutolinking(tmp)).resolves.toBeTruthy();
    expect(collectLeftovers(tmp, ['.cli-bak'])).toEqual([]);
  });

  it('启动时残留检查：.cli-tmp 残留 → 自动清理后正常写入（步骤 0）', async () => {
    fs.writeFileSync(`${etsPath()}.cli-tmp`, 'garbage');
    await expect(syncHarmonyAutolinking(tmp)).resolves.toBeTruthy();
    expect(fs.existsSync(`${etsPath()}.cli-tmp`)).toBe(false);
    expect(fs.readFileSync(etsPath(), 'utf8')).not.toBe('garbage'); // tmp 未被误用
  });

  it('启动时残留检查：.cli-bak 且目标文件缺失 → 自动恢复原文件后正常写入（bak 是唯一副本）', async () => {
    const original = fs.readFileSync(etsPath(), 'utf8');
    fs.renameSync(etsPath(), `${etsPath()}.cli-bak`); // 模拟备份后被杀、替换未发生
    // 未恢复时 ets 缺失 → A 类基线 hash 对不上 → 阻断；resolves 成功本身即证明恢复发生
    await expect(syncHarmonyAutolinking(tmp)).resolves.toBeTruthy();
    expect(fs.existsSync(`${etsPath()}.cli-bak`)).toBe(false); // 已恢复或被正常流程消费
    expect(fs.readFileSync(etsPath(), 'utf8')).toBe(original); // 恢复后幂等重写，内容不变
  });

  it('启动时残留检查：.cli-bak 且目标文件并存 → 阻断并给双出口（sync --force 或手动恢复）；--force 清理残留并重建', async () => {
    fs.copyFileSync(etsPath(), `${etsPath()}.cli-bak`); // 模拟 ③④ 间被杀（新内容+旧基线+bak）
    await expect(syncHarmonyAutolinking(tmp)).rejects.toThrow(/上次中断遗留的备份/);
    await expect(syncHarmonyAutolinking(tmp)).rejects.toThrow(/手动/); // 双出口：不止 sync --force 一个出口
    expect(fs.existsSync(`${etsPath()}.cli-bak`)).toBe(true); // 绝不静默覆盖有价值的 bak
    await expect(syncHarmonyAutolinking(tmp, { force: true })).resolves.toBeTruthy();
    expect(fs.existsSync(`${etsPath()}.cli-bak`)).toBe(false); // force 清理残留
  });

  it('prebuild --force 输出破坏性警告（runHarmonyGeneration，规范 3.5 命令输出）', async () => {
    const warnings: string[] = [];
    // log.warn 走 console.log（chalk 黄色 ⚠ 前缀），spy console.log 而非 console.warn
    const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      warnings.push(args.join(' '));
    });
    try {
      await runHarmonyGeneration(tmp, { name: 'X', slug: 'x' } as any, { force: true });
    } finally {
      spy.mockRestore();
    }
    expect(warnings.join('\n')).toContain('删除整个 harmony/ 目录');
    // 警告需点名 PackageProvider 自定义代码会被重置，并给出备份指引
    expect(warnings.join('\n')).toContain('PackageProvider');
    expect(warnings.join('\n')).toContain('git');
  });

  it('A 类基线在 sync 成功后记录 contentHash 与 cliVersion', () => {
    const state = readManagedStateFor(tmp);
    const keys = Object.keys(state.generatedFiles ?? {});
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      expect(state.generatedFiles?.[k]?.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(typeof state.generatedFiles?.[k]?.cliVersion).toBe('string');
    }
  });
});
