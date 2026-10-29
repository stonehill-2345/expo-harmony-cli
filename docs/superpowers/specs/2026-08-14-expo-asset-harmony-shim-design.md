# expo-asset 鸿蒙 shim — 设计规范（spec）

> 状态：待主公评审
> 日期：2026-08-14
> 主题：HarmonyOS 运行时能力补全（版本路线图 0.4.x）
> 关联：setUpXHR spec（`docs/superpowers/specs/2026-08-13-harmony-web-globals-init-design.md`，已验证打通 Web 全局）；项目记忆 `harmony-runtime-winter-formdata`

## 1. 背景与现状

setUpXHR spec 验证打通鸿蒙 dev bundle 的 Web 全局补全后，红屏由 `ReferenceError: Property 'FormData' doesn't exist` 推进到 Expo 框架初始化层：

```
Cannot find native module 'ExpoAsset'
  at requireNativeModule (expo-modules-core/src/requireNativeModule.js:17)
  at expo-asset/build/ExpoAsset.js:2
```

这是**进步非回归**：setUpXHR 打通 Web 全局后，bundle 首次加载到 Expo 框架聚合初始化，暴露下一层缺口。

## 2. 根因（已实测验证）

### 2.1 直接原因

Expo SDK52 的聚合初始化模块 `Expo.fx`（由 `require('expo')`/`expo-router` 触发加载）顶层**副作用 import** expo-asset：

```ts
// expo/build/Expo.fx.d.ts:2
import 'expo-asset';
```

该 import 仅取副作用——触发 expo-asset 入口加载。expo-asset 入口 `build/ExpoAsset.js` 在模块顶层执行：

```js
import { requireNativeModule } from 'expo-modules-core';
const AssetModule = requireNativeModule('ExpoAsset');   // ← 顶层立即调用
```

`requireNativeModule('ExpoAsset')` 在 expo-modules-core 内查 `NativeModulesProxy['ExpoAsset']`，鸿蒙 RNOH 未注册该原生模块（`@react-native-ohos` 无 expo-asset 端口）→ 抛 `Cannot find native module 'ExpoAsset'`。

### 2.2 为什么所有 expo 鸿蒙项目都崩

Expo.fx 是 Expo 框架级聚合初始化，**即使用户代码不直接用 expo-asset**（不用 `Asset.loadAsync`、不用 `useAssets`），只要 require expo/expo-router，就会触发 Expo.fx → import expo-asset → 崩。这与“业务可选的原生模块缺失”（如 expo-av）性质不同——expo-asset 是**框架启动硬依赖**。

### 2.3 与 setUpXHR 的区别

| 维度 | setUpXHR | expo-asset |
|---|---|---|
| 缺口性质 | Web 全局 JS 对象缺失 | Expo 原生模块鸿蒙缺失 |
| 修复层 | 入口显式 require（注入全局） | metro alias shim（JS 降级） |
| 鸿蒙是否有原生实现 | 有（RNOH setUpXHR 存在，只是入口未触发） | 无（无 expo-asset 端口） |

### 2.4 验证证据（probe-metro 探针，2026-08-14）

在 probe-metro：
1. 新增 `shims/expo-asset.ts`（no-op Asset 类 + useAssets 空数组）。
2. `shims/.alias-map.json` 加 `"expo-asset": "./shims/expo-asset.ts"`。
3. 重启 metro + 鸿蒙 app reload。

结果：**ExpoAsset 红屏消失**，app 渲染到 HomeScreen（ExpoRoot、Tab 导航全起来）。根因方向与 shim 方案 100% 证实。

（reload 后冒出独立的 `Image: Cannot read property 'get' of undefined`（PixelRatio），属“RNOH 图片资源系统”缺口，本 spec 非目标，另起 spec。）

## 3. 目标与非目标

### 目标

- 鸿蒙 dev/release bundle 的 **expo-asset 启动崩溃消除**：通过 metro alias 把 `expo-asset` 重定向到降级 shim，绕过 `requireNativeModule('ExpoAsset')`。
- 改动复用 CLI 现有 shim 机制（`content/shims/` + `harmony-entry.ts` 基线注入 + `.alias-map.json`），与 expo-metro-runtime 同款。
- iOS/Android 行为零变化（alias 仅 harmony platform 分支）。

### 非目标（范围拆分，另起 spec）

- **不**处理 Image/PixelRatio 缺口（探针 reload 后冒出的下一层，属 RNOH 图片资源系统，性质不同）。
- **不**实现 expo-asset 的真实资源下载（`Asset.loadAsync`/`downloadAsync` 的原生下载能力），鸿蒙需原生端口，超 CLI 职责。
- **不**改动 expo-modules-core 本体、不动 requireNativeModule 语义。

## 4. 方案

### 4.1 注入点：基线注入（非按需）

CLI 现有两种 shim 注入模式：
- **基线注入**（`harmony-entry.ts` 无条件 copy + alias-map 初始条目）：expo-metro-runtime、NativeModulesProxy patch。
- **按需注入**（scanAndAdapt 检测业务依赖才注入）：expo-av。

expo-asset 选**基线注入**：因 Expo.fx 是框架启动硬依赖，所有 expo 鸿蒙项目都崩，必须无条件注入。按需注入（scanAndAdapt）会漏掉“项目依赖 expo 但业务代码不直接 import expo-asset”的情况——而这恰是崩溃场景。

### 4.2 改动点

**A. 新增 `content/shims/expo-asset.ts`**（采用探针验证版）：

```ts
/**
 * expo-asset 鸿蒙降级 shim
 *
 * 根因：Expo SDK52 Expo.fx 聚合初始化顶层 `import 'expo-asset'`（副作用），
 * 触发入口 build/ExpoAsset.js 顶层 `requireNativeModule('ExpoAsset')`，
 * 鸿蒙 RNOH 无该原生模块 → 崩。
 *
 * 本 shim 提供 JS 层空实现，让 import 'expo-asset' 不触发原生模块调用。
 * 鸿蒙 app 用 react-native Image + require() 加载本地图片，不依赖 expo-asset
 * 的 Asset 类下载能力，故 no-op 降级不影响启动。
 */
export class Asset {
  uri = '';
  localUri?: string;
  width?: number;
  height?: number;
  downloaded = false;

  // 返回空数组对齐真实 API（真实 loadAsync 返回 Asset[]），避免业务
  // `const [a] = await Asset.loadAsync(1)` 解构时 Asset 不可迭代而崩。
  static async loadAsync(): Promise<Asset[]> {
    return [];
  }
  static async fromMetadata(): Promise<Asset[]> {
    return [];
  }
  async downloadAsync(): Promise<Asset> {
    this.downloaded = true;
    return this;
  }
}

// useAssets 返回 [空数组, false]（loading 位 false 对齐真实 boolean），避免解构后 .map 二次崩溃
export const useAssets = (): [Asset[], boolean] => [[], false];

export default Asset;
```

**B. 改 `src/injector/harmony-entry.ts`**：
- copy：`content/shims/expo-asset.ts` → 项目 `shims/expo-asset.ts`。
- alias-map 初始条目加 `'expo-asset': './shims/expo-asset.ts'`。

**C. 改 `__tests__/injector.test.ts`**：
- 现有 `Harmony shims copy 到 shims/ + .alias-map.json 初始条目` 用例追加 expo-asset 断言（shim 存在 + alias-map 含条目）。

### 4.3 alias 生效路径（复用现有机制，无新机制）

`metro.config.js`（CLI 生成）resolveRequest：

```js
if (platform === 'harmony' || process.env.RN_BUNDLE_PLATFORM === 'harmony') {
  const aliasTarget = shimAliases[moduleName];   // moduleName='expo-asset' → './shims/expo-asset.ts'
  if (aliasTarget) {
    return context.resolveRequest(context, resolveAliasTarget(aliasTarget), platform);
  }
  ...
}
```

Expo.fx 的 `import 'expo-asset'` → moduleName=`expo-asset` → 命中 alias → 解析到 shim → shim 不调 requireNativeModule → 不崩。

探针已验证：alias 顶层包名即足够（Expo.fx 只用顶层 import，无子路径 `expo-asset/build/xxx`）。

## 5. 改动文件

| 文件 | 改动 | 行数 |
|---|---|---|
| `content/shims/expo-asset.ts` | 新增 no-op shim | +约 35 |
| `src/injector/harmony-entry.ts` | copy shim + alias-map 加条目 | +约 3 |
| `__tests__/injector.test.ts` | 现有用例追加 expo-asset 断言 | +约 4 |

**无新增依赖**（纯 JS shim，复用现有 metro alias 机制）。

## 6. 验证策略

| 层级 | 方法 | 状态 |
|---|---|---|
| 根因验证 | probe-metro 探针（ExpoAsset 红屏消失） | ✅ 已通过 |
| alias 顶层足够 | 探针验证顶层 alias 后 ExpoAsset 消失 | ✅ 已通过 |
| 单元测试 | injector.test 断言 shim copy + alias-map 条目 | 待实现 |
| dev 实测 | probe-metro reload（ExpoAsset 消失，app 到 HomeScreen） | ✅ 已部分验证（Image 为独立缺口） |
| release 实测 | `pnpm bundle:harmony:release` 生成离线 bundle，确认 shim 在 release 下生效 | 待实现（主公环境） |
| 三端正交 | alias 仅 harmony 分支，iOS/Android 走原 expo-asset | 由 platform 分流保证 |

## 7. 边缘情况与残余风险（CLAUDE.md 第4条）

- **R1（需 release 实测）shim 在 offline release bundle**：探针仅 dev 实测。release 下 metro alias 同样生效（resolveRequest 不分 dev/release），但需实测确认。**处置**：release 实测；若失败记录具体错误。
- **R2 业务用 `Asset.loadAsync` 下载远程资源**：shim 降级（loadAsync 返回空 Asset，无真实下载）。**处置**：指南说明鸿蒙下 expo-asset 资源下载为降级，需远程资源的项目用替代方案（如 expo-image 的 uri）。属已知限制，非崩溃。
- **R3 alias 整包 vs 子路径**：探针验证 Expo.fx 只用顶层 import。若未来 expo 版本引入 `require('expo-asset/build/xxx')` 子路径，顶层 alias 拦不住。**处置**：版本升级时复核；必要时加子路径 alias。
- **三端正交**：alias 在 `platform === 'harmony'` 分支内，iOS/Android 走原 expo-asset 包（其有原生实现），零影响。
- **与 setUpXHR 正交**：setUpXHR 在入口 require 层（注入 Web 全局），expo-asset shim 在 metro alias 层（重定向模块），两者独立，无顺序依赖。

## 8. 测试用例（RED→GREEN）

更新现有用例 `Harmony shims copy 到 shims/ + .alias-map.json 初始条目`（`__tests__/injector.test.ts`），追加：

```ts
// expo-asset 基线 shim（Expo.fx 启动硬依赖）
expect(fs.existsSync(path.join(tmp, 'shims/expo-asset.ts'))).toBe(true);
expect(aliasMap['expo-asset']).toBe('./shims/expo-asset.ts');
```

## 9. 决策记录

| 决策 | 选项 | 结论 | 理由 |
|---|---|---|---|
| 注入点 | 基线注入 / 按需 scanAndAdapt | **基线注入** | Expo.fx 是框架启动硬依赖，所有 expo 鸿蒙项目都崩；按需会漏“依赖 expo 但业务不直接 import expo-asset”的场景。与 expo-metro-runtime 同款。 |
| shim 降级深度 | no-op / 完整 Asset 实现 | **no-op** | 探针验证 no-op 够用（app 到 HomeScreen）；鸿蒙 app 用 RN Image+require 不依赖 Asset 下载；完整实现需原生端口超范围。YAGNI。 |
| alias 范围 | 整包 expo-asset / 子路径 build/ExpoAsset | **整包** | 探针验证 Expo.fx 只用顶层 import，整包 alias 即消除崩溃；整包比子路径更稳健（覆盖所有顶层 require）。 |
| shim 文件结构 | 单文件 .ts / 目录 index.ts | **单文件** | shim 体量小（no-op），与 expo-metro-runtime.ts 一致；无需目录。 |

## 10. 验收标准

- [ ] `content/shims/expo-asset.ts` 存在，含 no-op Asset 类 + useAssets + default 导出。
- [ ] `src/injector/harmony-entry.ts` copy shim + alias-map 含 `'expo-asset': './shims/expo-asset.ts'`。
- [ ] `__tests__/injector.test.ts` 用例 RED→GREEN，全量通过、type-check 干净、build 成功。
- [ ] probe-metro dev 实测：ExpoAsset 红屏不再出现（✅ 已验证）。
- [ ] release 实测（R1）：shim 在 offline bundle 下生效（待实测）。
- [ ] 三端 bundle 不受影响（iOS/Android 入口隔离 + platform 分流）。
