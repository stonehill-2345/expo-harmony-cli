# 鸿蒙运行时 Web 全局对象补全 — 设计规范（spec）

> 状态：待主公评审
> 日期：2026-08-13
> 主题：HarmonyOS 运行时能力补全（版本路线图 0.4.x）
> 关联：8081 端口统一 spec（已验证打通 bundle 加载，首次暴露本问题）；项目记忆 `harmony-runtime-winter-formdata`

## 1. 背景与现状

8081 端口统一 spec 验证打通鸿蒙 dev bundle 加载后，鸿蒙红屏：

```
ReferenceError: Property 'FormData' doesn't exist
  at installFormDataPatch (expo/src/winter/runtime.native.ts:33)
```

这是**进步非回归**：此前鸿蒙从未真正加载到 bundle，端口打通后才首次暴露。bundle 内容本身不变，8888 时代若能加载同样会报。

## 2. 根因（已实测验证）

### 2.1 直接原因

Expo SDK52 的 Winter 兼容层 `expo/src/winter/runtime.native.ts` 加载时执行 `installFormDataPatch(FormData)`，把**全局 `FormData`** 当值传入。鸿蒙 JS 运行时未注入该全局 → 崩。

### 2.2 为什么 iOS/Android 不报

iOS/Android 由 React Native runtime 自动注入 Web 全局：RN Metro bundle 经 `runBeforeMainModule` 机制，在用户主模块之前自动执行 `InitializeCore.js`，其中 `require('./setUpXHR')` 一次性 polyfill 全部 Web 标准全局对象：

```
XMLHttpRequest, FormData, fetch, Headers, Request, Response,
WebSocket, Blob, File, FileReader, URL, URLSearchParams,
AbortController, AbortSignal
```

### 2.3 为什么鸿蒙报

鸿蒙 RNOH **没有 `runBeforeMainModule` 这类自动初始化机制**；且 Expo 鸿蒙入口 `index.harmony.js` 从未 require RNOH 的包入口（`@react-native-oh/react-native-harmony` 的 `InitializeCore`/`setUpXHR`）→ 全局 `FormData` 等始终未注入 → Winter 引用时崩。

### 2.4 验证证据（probe-metro 实测，2026-08-13）

在 `probe-metro/index.harmony.js` 的 `window.location` polyfill 之后、`require('@expo/metro-runtime')` 之前插入：

```js
require('@react-native-oh/react-native-harmony/Libraries/Core/setUpXHR');
```

重跑后 **FormData 红屏消失**（转变为下一个无关问题 `Cannot find native module 'ExpoAsset'`，属"Expo 原生模块鸿蒙缺失"主题，本 spec 不处理）。根因方向 100% 证实。

### 2.5 子路径 require 可行性（已确认）

- `@react-native-oh/react-native-harmony@0.77.71` 的 `package.json` **无 `exports` 字段** → 子路径 `Libraries/Core/setUpXHR` 不受限。
- `require.resolve('@react-native-oh/react-native-harmony/Libraries/Core/setUpXHR.js')` 通过。
- 实测 dev bundle 下该 require 正常执行。

## 3. 目标与非目标

### 目标

- 鸿蒙 dev/release bundle 的 **Web 标准全局对象补全**：通过在鸿蒙入口显式触发 RNOH 的 `setUpXHR`，注入 FormData/Blob/File/Headers/fetch/XMLHttpRequest/URL/URLSearchParams/AbortController/AbortSignal/WebSocket/Request/Response/FileReader。
- 改动收敛在 CLI 模板 `index.harmony.js`，不引入新依赖、不动 metro.config、不加 shim 文件。
- iOS/Android 行为零变化。

### 非目标（范围拆分，另起 spec）

- **不**处理 `ExpoAsset` 等 Expo 原生模块在鸿蒙的缺失（属"Expo 原生模块鸿蒙缺失/shim"主题）。
- **不**提供鸿蒙侧 release 资源下载的原生实现（超出 CLI 职责）。
- **不**改动 RNOH 包本体、不动 `InitializeCore.js`。

## 4. 方案

### 4.1 改动点

在 CLI 模板 `content/templates/index.harmony.js` 现有结构

```
§1 Expo globals polyfill (globalThis.expo)
§2 window.location polyfill
§3 require('@expo/metro-runtime') → expo-router bootstrap
```

的 **§2 与 §3 之间**插入 §2.5：

```js
// ===== 2.5 RN Harmony 全局初始化：注入 FormData/Blob/File/Headers/fetch/XMLHttpRequest/URL 等 Web 全局 =====
// RNOH 的 setUpXHR 一次性 polyfill 这些全局；鸿蒙入口需显式触发
// （iOS/Android 由 RN Metro runBeforeMainModule 自动注入 InitializeCore→setUpXHR）。
// 必须在 require expo/expo-router（其触发 Winter 兼容层、引用全局 FormData）之前执行。
require('@react-native-oh/react-native-harmony/Libraries/Core/setUpXHR');
```

### 4.2 位置依据

- **必须在 `require('@expo/metro-runtime')` 之前**：后者经 metro.config alias 后仍触发 expo-router/Winter 兼容层，Winter 引用全局 `FormData`，setUpXHR 必须先于它执行。
- **在 expo globals / window.location 之后**：三者均为无依赖的早期全局准备，按依赖顺序聚集在 bootstrap 区间。setUpXHR 不依赖前两者。

### 4.3 为什么用 setUpXHR 而非 InitializeCore

- `InitializeCore.js` 除 setUpXHR 外还会初始化大量 RN 核心子系统（Bridge、RedBox、performance、polyfillPerformanceNow 等），其中部分依赖鸿蒙 RNOH 已就绪的运行时上下文，贸然整包 require 有未知副作用与加载顺序风险。
- `setUpXHR.js` 职责单一（仅 polyfill Web 全局），依赖面小，实测安全。YAGNI：只补缺的那一层。

## 5. 改动文件

| 文件 | 改动 | 行数 |
|---|---|---|
| `content/templates/index.harmony.js` | 插入 §2.5（setUpXHR require + 注释） | +5 |
| `__tests__/injector.test.ts` | 新增 1 个测试用例（setUpXHR require 存在 + 顺序） | +若干 |

**无新增依赖**（`@react-native-oh/react-native-harmony@0.77.71` 已是 CLI 注入依赖）。

## 6. 验证策略

| 层级 | 方法 | 状态 |
|---|---|---|
| 根因验证 | probe-metro 探针实测（FormData 红屏消失） | ✅ 已通过 |
| 子路径可解析 | `require.resolve` + 无 exports 字段 | ✅ 已通过 |
| 单元测试 | injector.test.ts 断言注入产物含 setUpXHR + 顺序 | 待实现 |
| dev bundle 实测 | probe-metro `pnpm start:harmony` 重跑，确认无 FormData 类红屏 | 待实现（主公环境） |
| release bundle 实测 | `pnpm bundle:harmony:release` 生成离线 bundle，确认 setUpXHR 在 release 下可执行 | 待实现（主公环境，见 §7 风险 R1） |
| 三端正交 | android/ios bundle 不含 setUpXHR 改动影响（入口文件隔离） | 由 `.harmony.js` sourceExt 保证 |

## 7. 边缘情况与残余风险（CLAUDE.md 第4条）

- **R1（需实现阶段实测）release bundle**：探针仅在 dev bundle 实测。setUpXHR 内部若引用某些仅在 dev runtime 就绪的 RNOH 全局，release（offline）下可能行为不同。**处置**：实现阶段补一次 release bundle 实测；若失败，回退评估（如改用更细粒度的 FormData 单点 polyfill）。
- **R2（残余风险）RNOH 未来加 exports 限制**：当前 0.77.71 无 exports，子路径稳定。若未来 RNOH 版本锁定 exports，子路径 require 将失效。**处置**：版本升级时复核；必要时改相对路径或 metro alias。
- **幂等**：Metro 模块缓存保证 setUpXHR 只执行一次；重复 prebuild/sync 不会重复 polyfill，无副作用。
- **三端正交**：`index.harmony.js` 是鸿蒙专属入口（经 `.harmony.js` sourceExt 解析），iOS/Android 走 `index.ts` → `registerRootComponent`，不加载此文件，零影响。
- **setUpXHR 内部全局覆盖语义**：setUpXHR 以 `global.X = ...` 形式注入；若 `index.harmony.js` §1 的 expo globals polyfill 未来也注入了同名全局（当前未注入 Web 全局，不冲突），需保证 setUpXHR 在后覆盖。当前顺序（§1→§2→§2.5 setUpXHR）满足。

## 8. 测试用例（RED→GREEN）

新增用例（插入 `index.harmony.js {{scheme}} 替换` 用例之后）：

1. **存在性**：注入后 `index.harmony.js` 含字符串 `require('@react-native-oh/react-native-harmony/Libraries/Core/setUpXHR')`。
2. **顺序**：setUpXHR require 的索引 `<` `require('@expo/metro-runtime')` 的索引（`indexOf` 比较）。
3. **不回归**：现有断言（`globalThis.expo`、`renderRootComponent`、`myapp://`/`{{scheme}}` 替换）仍通过。

## 9. 决策记录

| 决策 | 选项 | 结论 | 理由 |
|---|---|---|---|
| spec 边界 | A 收口于 setUpXHR / B 扩展到 ExpoAsset shim | **A** | ExpoAsset 属"Expo 原生模块缺失"，与"Web 全局补全"性质不同；A 聚焦可独立验证，避免打地鼠（ExpoAsset 可能只是第一个原生缺失）。主公 2026-08-13 拍板。 |
| 初始化层 | setUpXHR / InitializeCore / 全量 | **setUpXHR** | 职责单一、依赖面小、实测安全；InitializeCore 副作用与加载顺序风险未知。YAGNI。 |
| 触发方式 | 入口显式 require / metro alias shim | **入口显式 require** | 最小改动、零新文件、与现有 §1/§2 polyfill 模式一致。 |

## 10. 验收标准

- [ ] `content/templates/index.harmony.js` 含 §2.5 setUpXHR require，位置在 `require('@expo/metro-runtime')` 之前。
- [ ] `__tests__/injector.test.ts` 新增用例 RED→GREEN，全量测试通过、type-check 干净、build 成功。
- [ ] probe-metro dev bundle 实测：FormData 类红屏不再出现（允许出现下一层 ExpoAsset，属非目标）。
- [ ] release bundle 实测（R1）：setUpXHR 在 offline bundle 下可执行，无新红屏（或明确记录回退）。
- [ ] 三端 bundle 不受影响（android/ios 入口隔离）。

---

## 演进记录（2026-08-14）

本 spec 的 setUpXHR 入口预热已**升级为 InitializeCore**（见 `docs/superpowers/specs/2026-08-14-harmony-initializecore-design.md`）。

- `InitializeCore`（`@react-native-oh/react-native-harmony/Libraries/Core/InitializeCore`）按序 require setUpGlobals/setUpDOM/setUpTimers/**setUpXHR**/setUpPlatform/AppRegistry 等，预热整套核心模块图。
- setUpXHR（本 spec 主题）是 InitializeCore 第 38 行的**子集**。CLI 入口模板已把 `require('.../Core/setUpXHR')` 替换为 `require('.../Core/InitializeCore')`（替换非补充），Web 全局仍由 setUpXHR 覆盖，且额外消除 Image/PixelRatio 渲染期 `.default` undefined 白屏（CLI metro-config 丢 RNOH serializer 的 InitializeCore 预热所致）。
- 本 spec §4.3「为何用 setUpXHR 而非 InitializeCore」当时的顾虑（副作用/加载顺序风险未知）已被 probe-metro 探针证伪：入口 require InitializeCore 后白屏消失、Image 正常，无副作用。
