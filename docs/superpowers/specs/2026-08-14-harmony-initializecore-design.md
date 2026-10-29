# 鸿蒙核心初始化（InitializeCore）入口预热 — 设计规范（spec）

> 状态：待主公评审
> 日期：2026-08-14
> 主题：HarmonyOS 运行时能力补全（版本路线图 0.4.x）
> 关联：setUpXHR spec（`docs/superpowers/specs/2026-08-13-harmony-web-globals-init-design.md`，本 spec 是其演进）；expo-asset spec（`docs/superpowers/specs/2026-08-14-expo-asset-harmony-shim-design.md`）；记忆 `harmony-runtime-winter-formdata`

## 1. 背景与现状

expo-asset shim 消除 ExpoAsset 红屏后，dev reload 渲染到 HomeScreen 时白屏，错误（所有 Image 组件，含 HomeScreen 图片与 LogBoxInspectorHeaderButton 图标）：

```
(NOBRIDGE) ERROR  TypeError: Cannot read property 'get' of undefined
This error is located at: in Image (created by HomeScreen) ...
```

这是**进步非回归**：expo-asset 打通框架启动后，bundle 首次渲染到含本地图片资源的视图，暴露下一层缺口。

## 2. 根因（已探针验证）

### 2.1 直接原因

渲染期 Image 解析本地 PNG asset → `AssetSourceResolver.fromSource`（第 194 行）/`getScaledAssetPath`（第 40 行）调用 `PixelRatio.get()`。`PixelRatio` 取自模块顶层 `const PixelRatio = require('../Utilities/PixelRatio').default`（[AssetSourceResolver.js:26](node_modules/.pnpm/@react-native-oh+react-native-harmony@0.77.71_@types+react@18.3.12_react-native@0.77.1__e6f11e4b777130474e91d0982c807d09/node_modules/@react-native-oh/react-native-harmony/Libraries/Image/AssetSourceResolver.js#L26)）。渲染期 `PixelRatio` 为 `undefined` → `PixelRatio.get()` → `undefined.get()` → TypeError。

PixelRatio.js / Dimensions.js 源码都正确 `export default`，源码层 `.default` 不该是 undefined。根因不在单个模块导出，而在**整套核心模块的求值时机**。

### 2.2 真因：CLI 丢弃 RNOH serializer（InitializeCore 预热）

RNOH 的 [metro.config.js:138-147](node_modules/.pnpm/@react-native-oh+react-native-harmony@0.77.71_@types+react@18.3.12_react-native@0.77.1__e6f11e4b777130474e91d0982c807d09/node_modules/@react-native-oh/react-native-harmony/metro.config.js#L138-L147) 定义 serializer：

```js
serializer: {
  getModulesRunBeforeMainModule: () => {
    if (REQUEST_RESOLUTION_LATEST_PLATFORM !== 'harmony') return [];
    return [require.resolve('./Libraries/Core/InitializeCore')];
  },
}
```

`InitializeCore` 是 RN 的**核心初始化模块**（[InitializeCore.js:31-50](node_modules/.pnpm/@react-native-oh+react-native-harmony@0.77.71_@types+react@18.3.12_react-native@0.77.1__e6f11e4b777130474e91d0982c807d09/node_modules/@react-native-oh/react-native-harmony/Libraries/Core/InitializeCore.js#L31-L50)），按序 require：`setUpGlobals`/`setUpDOM`/`setUpPerformance`/`setUpErrorHandling`/`polyfillPromise`/`setUpRegeneratorRuntime`/`setUpTimers`/**`setUpXHR`**/`setUpAlert`/`setUpNavigator`/`setUpBatchedBridge`/`setUpSegmentFetcher`/`setUpPlatform`/`AppRegistry`/`GlobalPerformanceLogger`。它预热整套核心模块图，建立稳定的求值顺序。

- **iOS/Android**：RN Metro 自动 `runBeforeMainModule(InitializeCore)`，核心模块在 main module 前完成预热。
- **Harmony**：无 RN 自动机制，靠 RNOH serializer 显式预热 InitializeCore。

CLI 的 `src/injector/metro-config.ts`（[metro-config.ts:17-66](src/injector/metro-config.ts#L17-L66)）叠加 RNOH 配置时，**只取了 `resolver`（platforms/sourceExts/resolveRequest），丢弃了 `serializer`（InitializeCore 预热）和 `transformer`（inlineRequires）**。结果：鸿蒙 bundle 的核心模块（PixelRatio/Dimensions/AssetSourceResolver）未在 main 前预热，渲染期首次 require 时求值顺序异常（循环依赖下 `.default` 被引用时尚未赋值）→ undefined → 崩。

### 2.3 setUpXHR 只是 InitializeCore 的子集

setUpXHR spec（9e1f8d4）已在入口手动 require `setUpXHR`，解决了 Web 全局（FormData/Blob/fetch 等）缺口。但 setUpXHR 只是 InitializeCore 第 38 行的**一项**——它补了 Web 全局，没补 setUpTimers/setUpPlatform/setUpNavigator/AppRegistry 等其余核心预热，也未建立核心模块图的稳定求值顺序。Image/PixelRatio 缺口正是 setUpXHR 之外、InitializeCore 之内的核心预热缺失。

### 2.4 验证证据（probe-metro 探针，2026-08-14）

在 probe-metro `index.harmony.js`：把第 58 行 setUpXHR require 升级为 `require('@react-native-oh/react-native-harmony/Libraries/Core/InitializeCore')`，metro 重 bundle + 鸿蒙 reload。

结果：**白屏消失，Image 正常渲染，HomeScreen 完整起来**。根因方向与修复方案 100% 证实。

（探针仅升级一行 require，InitializeCore 内含 setUpXHR，Web 全局仍由 setUpXHR 覆盖，无回归。）

## 3. 目标与非目标

### 目标

- 鸿蒙 dev/release bundle 的 **Image 渲染崩溃消除**：入口预热 InitializeCore，建立核心模块稳定求值顺序，消除 PixelRatio/Dimensions 渲染期 `.default` undefined。
- 改动复用现有入口注入机制（`content/templates/index.harmony.js` 经 `harmony-entry.ts` 写入），将 setUpXHR 升级为 InitializeCore（InitializeCore 内含 setUpXHR）。
- iOS/Android 行为零变化（index.harmony.js 不被三端共用，iOS/Android 走 index.ts）。

### 非目标

- **不**合并 RNOH serializer 到 metro-config.ts（方案 C，serializer 依赖 `REQUEST_RESOLUTION_LATEST_PLATFORM` 脆弱、合并复杂；入口显式 require 已探针验证、更可控）。metro-config 丢弃 transformer(inlineRequires) 亦不在本 spec 范围，留作观察。
- **不**改动 expo-asset / setUpXHR 已验证行为（InitializeCore 内含 setUpXHR，Web 全局与 expo-asset shim 不受影响）。
- **不**改动 RNOH 本体、不动 InitializeCore.js 源码。

## 4. 方案

### 4.1 注入点：入口预热（非 serializer 合并）

CLI 现有两条补"RNOH 缺失的标准机制"路径：
- **入口显式 require**（`content/templates/index.harmony.js`）：setUpXHR、expo globals polyfill。
- **metro-config 合并**（`src/injector/metro-config.ts`）：resolver 字段叠加。

InitializeCore 选**入口显式 require**：探针已验证入口 require InitializeCore 可行；serializer 合并（C 方案）依赖 `REQUEST_RESOLUTION_LATEST_PLATFORM`（metro 多平台解析顺序的全局变量），脆弱且合并语义复杂；入口显式更可控、改动面最小。

### 4.2 改动点

**A. `content/templates/index.harmony.js`**：第 59 行 setUpXHR require 升级为 InitializeCore require（替换，非补充——InitializeCore 第 38 行内含 setUpXHR，保留两者冗余）。注释更新为"核心初始化"。

```js
// ===== 2.5 RN Harmony 核心初始化：预热 RN 核心模块图（含 Web 全局）=====
// InitializeCore = RN 核心初始化（setUpGlobals/setUpTimers/setUpXHR/setUpPlatform/AppRegistry 等），
// 按序预热核心模块，建立稳定求值顺序（iOS/Android 由 Metro runBeforeMainModule 自动执行）。
// 鸿蒙 CLI 的 metro-config 仅叠加 RNOH resolver、未带 RNOH serializer(InitializeCore)，故入口显式预热。
// 必须在 require expo/expo-router 之前：InitializeCore 内含 setUpXHR，注入 Winter 引用的全局 FormData。
require('@react-native-oh/react-native-harmony/Libraries/Core/InitializeCore');
```

**B. `__tests__/injector.test.ts`**：第 178-189 行 setUpXHR 回归用例升级为 InitializeCore（断言 require 存在 + 在 `@expo/metro-runtime` 之前）。

**C. 文档/记忆**：setUpXHR spec（2026-08-13）补注"被 InitializeCore 演进"；记忆 `harmony-runtime-winter-formdata` 更新（setUpXHR→InitializeCore，InitializeCore 是更完整修复）。

### 4.3 为何替换而非补充 setUpXHR

InitializeCore 第 38 行即 `require('./setUpXHR')`。入口 require InitializeCore 会经模块缓存触发 setUpXHR 的全部副作用（Web 全局注入），与原 setUpXHR require 等价。保留独立 setUpXHR require 在语义上冗余（"补了 setUpXHR 又补含 setUpXHR 的 InitializeCore"），且 InitializeCore 是标准 RN 核心初始化、概念更正确。故替换。

## 5. 改动文件

| 文件 | 改动 | 行数 |
|---|---|---|
| `content/templates/index.harmony.js` | setUpXHR → InitializeCore + 注释 | 改约 5 |
| `__tests__/injector.test.ts` | 回归断言 setUpXHR → InitializeCore | 改约 6 |
| `docs/superpowers/specs/2026-08-13-harmony-web-globals-init-design.md` | 补注 InitializeCore 演进 | +约 2 |
| 记忆 `harmony-runtime-winter-formdata.md` | setUpXHR→InitializeCore 更新 | 改约 3 |

**无新增依赖、无新增文件**（复用现有入口模板 + 注入机制）。

## 6. 验证策略

| 层级 | 方法 | 状态 |
|---|---|---|
| 根因验证 | probe-metro 探针（入口 InitializeCore → 白屏消失） | ✅ 已通过 |
| 单元测试 | injector.test 断言 InitializeCore require 存在 + 顺序 | 待实现 |
| dev 实测 | probe-metro reload（Image 渲染、HomeScreen 完整） | ✅ 已验证 |
| release 实测 | `pnpm bundle:harmony:release` + 鸿蒙 release 包确认 | 待实现（主公环境，与 expo-asset release gate 合并做） |
| Web 全局无回归 | InitializeCore 内含 setUpXHR，FormData/Blob/fetch 等仍注入 | 由 InitializeCore 依赖 setUpXHR 保证 |
| 三端正交 | index.harmony.js 不被 iOS/Android 使用 | 入口隔离保证 |

## 7. 边缘情况与残余风险（CLAUDE.md 第4条）

- **R1 InitializeCore 早期 require 安全性**：InitializeCore 第 50 行 require `AppRegistry`、第 44 行（__DEV__）require `LogBox`/`setUpDeveloperTools`。探针在 setUpXHR 原位置（window.location polyfill 之后、expo-router 之前）require InitializeCore，reload 无冲突、白屏消失。**处置**：探针已验证该位置安全；若个别项目早期 require AppRegistry 触发问题，记录具体错误。
- **R2 require 顺序约束**：InitializeCore（含 setUpXHR）必须在 `@expo/metro-runtime`/expo-router 之前（Winter 引用全局 FormData）。保留 setUpXHR spec 的"必须在 expo-router 之前"断言（升级为 InitializeCore 版）。**处置**：injector.test 断言 InitializeCore 索引 < @expo/metro-runtime 索引。
- **R3 release 实测**：探针仅 dev 实测。release 下入口 require 同样生效（入口不分 dev/release），但需实测。**处置**：与 expo-asset release gate 合并做（主公环境）。
- **R4 metro-config 丢弃 transformer(inlineRequires)**：本 spec 不修。探针证明入口 InitializeCore 已消除白屏，inlineRequires 若引发独立问题（如性能/其他模块）留作观察。**处置**：版本升级或新缺口出现时复核 metro-config 是否需补 inlineRequires。
- **R5 三端正交**：index.harmony.js 是鸿蒙专属入口（iOS/Android 走 index.ts → registerRootComponent），iOS/Android bundle 不含此 require，零影响。

## 8. 测试用例（RED→GREEN）

更新现有用例 `index.harmony.js 在 require @expo/metro-runtime 之前触发 RNOH setUpXHR`（`__tests__/injector.test.ts:178`），升级为：

```ts
it('index.harmony.js 在 require @expo/metro-runtime 之前预热 RNOH InitializeCore（核心初始化，含 setUpXHR）', () => {
  injectHarmonyBaseline(tmp, { slug: 'myapp', scheme: 'myapp' });
  const entry = fs.readFileSync(path.join(tmp, 'index.harmony.js'), 'utf8');
  // InitializeCore 预热 RN 核心模块图（含 setUpXHR 注入 Web 全局），消除 Image/PixelRatio 渲染期 .default undefined
  expect(entry).toContain("require('@react-native-oh/react-native-harmony/Libraries/Core/InitializeCore')");
  // setUpXHR 不再单独 require（InitializeCore 第38行内含 setUpXHR，替换非补充）
  expect(entry).not.toContain("require('@react-native-oh/react-native-harmony/Libraries/Core/setUpXHR')");
  // 且必须在 require('@expo/metro-runtime') 之前：InitializeCore 含 setUpXHR，Winter 引用全局 FormData 须先注入
  const initCoreIdx = entry.indexOf('@react-native-oh/react-native-harmony/Libraries/Core/InitializeCore');
  const metroRuntimeIdx = entry.indexOf("require('@expo/metro-runtime')");
  expect(initCoreIdx).toBeGreaterThan(-1);
  expect(metroRuntimeIdx).toBeGreaterThan(-1);
  expect(initCoreIdx).toBeLessThan(metroRuntimeIdx);
});
```

## 9. 决策记录

| 决策 | 选项 | 结论 | 理由 |
|---|---|---|---|
| 修复落点 | 入口显式 require / metro-config serializer 合并 / 两者 | **入口显式 require** | 探针验证入口 require InitializeCore 可行且白屏消失；serializer 合并依赖 `REQUEST_RESOLUTION_LATEST_PLATFORM`（多平台解析顺序全局变量）脆弱、合并语义复杂；入口显式改动面最小、可控。 |
| setUpXHR 处置 | 替换为 InitializeCore / 保留 setUpXHR 并补充 InitializeCore | **替换** | InitializeCore 第 38 行内含 setUpXHR，Web 全局副作用等价；保留两者语义冗余；InitializeCore 是标准 RN 核心初始化、概念更正确。 |
| metro-config transformer(inlineRequires) | 一并补 / 本 spec 不修 | **不修** | 探针证明入口 InitializeCore 已消除白屏；inlineRequires 缺失未见独立症状；YAGNI，留作观察。 |

## 10. 验收标准

- [ ] `content/templates/index.harmony.js` 含 `require('.../Core/InitializeCore')`，不含单独 setUpXHR require，注释为"核心初始化"。
- [ ] `__tests__/injector.test.ts` 用例 RED→GREEN（InitializeCore 断言 + setUpXHR 不存在断言 + 顺序断言），全量通过、type-check 干净、build 成功。
- [ ] probe-metro dev 实测：白屏不再出现、Image 正常渲染（✅ 已验证）。
- [ ] release 实测（R3）：InitializeCore 在 offline bundle 下生效（待与 expo-asset release gate 合并实测）。
- [ ] 三端 bundle 不受影响（iOS/Android 不走 index.harmony.js）。
