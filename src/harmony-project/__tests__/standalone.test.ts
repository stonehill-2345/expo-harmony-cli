import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import JSON5 from 'json5';
import { runHarmonyGeneration, syncHarmonyAutolinking } from '../standalone';

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
      /already initialized/,
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

    const result = syncHarmonyAutolinking(tmp);

    expect(result.linked).toContain('@react-native-ohos/react-native-webview');
    expect(fs.readFileSync(appScopePath, 'utf8')).toBe(appScopeBefore);
    expect(fs.readFileSync(signPath, 'utf8')).toBe('keep');
    expect(fs.readFileSync(path.join(harmonyDir, 'entry/src/main/ets/RNOHPackagesFactory.ets'), 'utf8'))
      .toContain('WebViewPackage');
  });

  it('sync 在 harmony/ 不存在时提示先执行首次 prebuild', () => {
    expect(() => syncHarmonyAutolinking(tmp)).toThrow(/harmony.*prebuild/i);
  });

  it('force=true 覆盖已存在 harmony/', async () => {
    fs.mkdirSync(path.join(tmp, 'harmony'));
    await expect(
      runHarmonyGeneration(tmp, { name: 'X', slug: 'x' } as any, { force: true }),
    ).resolves.toBeUndefined();
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
    expect(indexEts).toContain("'localhost:8888'");
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
