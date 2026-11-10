# SDK54 A-06 ExpoImage 前期准备

日期：2026-11-02  
分支：`feat/sdk54-a-modules`  
基点：`19a0375cff7e0ef3bc62d54fd5ed57b913bb2000`

## 结论

A-06 前期准备为 **PASS**：`expo-image@3.0.11` 的官方 Git/npm 来源、发布差异、公开
属性/事件/方法、原生身份、资源用法、Core 依赖和 nova16 原始失败基线已经冻结，并由
可重复执行的脚本和负例保护。

这不是 ExpoImage 的实现或设备通过结论。当前
`implementationStatus=NOT_STARTED`、`stageClosable=false`；没有新增
`packages/expo-image/`，没有消除 `ExpoImage/default` 错误，也不关闭 GI、expo-image 模块、
M7.4 或任一发行阶段。下一步可以基于本清单进入 A-07 的 ExpoImage 注册与实际渲染实现，
但正式 M7 交付仍遵守 M6 前置和 A/B 最终组合复验。

结构化清单：
[2026-11-02-sdk54-a06-expo-image-contract.json](2026-11-02-sdk54-a06-expo-image-contract.json)。

## 固定来源与发布对账

| 项目 | 固定值 / 结果 |
| --- | --- |
| npm 包 | `expo-image@3.0.11` |
| Expo Git commit / npm `gitHead` | `172a69f5f70c1d0e043e1532f924de97210cabc3` |
| npm integrity | `sha512-4TudfUCLgYgENv+f48omnU8tjS2S0Pd9EaON5/s1ZUBRwZ7K8acEr4NfvLPSaeXvxW24iLAiyQ7sV7BXQH3RoA==` |
| TGZ SHA-1 | `54195565dc710e632c10414c3609deebb7149ac5` |
| TGZ SHA-256 | `e17879a4cc6cebdf50efadf3170956b2601363f1525f0426b10859a6154178bb` |
| Git / npm 文件数 | 199 / 217；同名 192 |
| 同名文件逐字一致 | 190/192 |

仅有两个同名文件发生预期发布改写：npm `package.json` 增加上述 `gitHead`；npm
`expo-module.config.json` 增加 Android local Maven publication。删除这两个字段后与 Git
源码逐字段一致。

Git 独有 7 个文件：`.npmignore`、Android `.gitignore`、Babel 配置和 4 个 RSC 测试文件。
npm 独有 25 个文件，均为 `local-maven-repo` 下的 Android AAR、sources JAR、POM、
module、metadata 及其哈希。脚本冻结完整文件名，不仅检查数量。

官方配置为：

```json
{
  "platforms": ["apple", "android"]
}
```

因此当前缺少 Harmony 不是偶发注册失败。包中没有 `app.plugin.js`、package plugin 字段或
`plugin/` 源码目录，A-06 明确记录“无 config plugin”，不建立空插件或虚构插件能力。

## 公开契约

公开契约由 TypeScript 5.9 AST 读取，不使用正则拼接口。

| 契约 | 冻结结果 |
| --- | --- |
| 入口 | `Image`、`ImageBackground`、`useImage`，以及 `Image.types` 全量类型导出 |
| 类型 | 19 个导出声明，包括 `ImageProps`、事件 payload、`ImageRef`、`ImageNativeModule` |
| `ImageProps` | 33 个自有属性，其中 6 个事件、4 个 deprecated 兼容属性 |
| 静态方法 | `prefetch`、`clearMemoryCache`、`clearDiskCache`、`getCachePathAsync`、`generateBlurhashAsync`、`generateThumbhashAsync`、`loadAsync` |
| 实例方法 | `startAnimating`、`stopAnimating`、`lockResourceAsync`、`unlockResourceAsync`、`reloadAsync` |
| `ImageRef` | `SharedRef<'image'>`；`width`、`height`、`scale`、`mediaType`、`isAnimated` |
| 原生模块 | `requireNativeModule('ExpoImage')` |
| 原生视图 | `requireNativeViewManager('ExpoImage')`，Harmony 身份 `ExpoImage/default`，预计组件名 `ViewManagerAdapter_ExpoImage` |

6 个事件为 `onLoadStart`、`onLoad`、`onProgress`、`onError`、`onLoadEnd`、`onDisplay`；
清单同时保存 `ImageLoadEventData`、`ImageProgressEventData`、`ImageErrorEventData` 的字段和
完整类型文本。4 个 deprecated 属性为 `defaultSource`、`loadingIndicatorSource`、
`resizeMode`、`fadeDuration`。

JS/Core 依赖同时冻结：`expo` 的 `NativeModule`、`SharedRef`、`SharedRefType`、
`requireNativeModule`；`expo-modules-core` 的 `Platform`、`createSnapshotFriendlyRef`、
`requireNativeViewManager`；以及 React / React Native 的组件、样式和事件类型。包清单仍是
零 direct dependency，peer dependency 为 `expo`、`react`、`react-native` 和可选
`react-native-web`。

## default 资源与失败基线

原始 default 未删页、未改用 React Native `Image`、未替换图片：

| 页面 | 原始资源 | 资源像素 | 显示尺寸 |
| --- | --- | --- | --- |
| `app/(tabs)/index.tsx` | `partial-react-logo.png` | 518 x 316 | 290 x 178 |
| `app/(tabs)/explore.tsx` | `react-logo.png` | 100 x 100 | 100 x 100 |

脚本绑定两个页面和两个 PNG 的 SHA-256，并用 AST 检查 `expo-image` 导入、`Image` JSX、
本地 `require(...)` 数字资源及尺寸；`package.json` 继续声明 `expo-image: 3.0.11` 和
`expo-router/entry`。

2026-10-29 nova16 证据继续是 **FAIL**：首次运行和冷启动各有一张通过一致性检查的错误
画面，`default-debug-hilog.txt` 两次出现：

```text
Native Harmony view is not registered: ExpoImage/default
```

失败基线绑定日志、Debug HAP、模块配置和两张截图的实际 SHA-256，也核对
`artifact-index.json`。如果模块配置出现 Harmony、缺少任一画面、日志不足两次或工件字节
变化，旧证据会立即失效，不能继续被算作当前基线。

## 可复用验收断言

后续实现至少按以下顺序判定，三个结论不得合并：

1. **GI 解阻**：新鲜构建的原始 default 中不再出现 `ExpoImage/default` 注册错误；两个原始
   页面不替换，真实 PNG 有可见像素。
2. **expo-image 模块**：逐项覆盖本清单冻结的属性、6 个事件、静态/实例方法、缓存、
   `ImageRef` 和错误行为；加载失败可由 `onError` / `onLoadEnd` 观察，卸载/reload 不产生
   过期回调。
3. **M7.4 批次**：在 GI 和模块结果之外，继续完成该批次的媒体、原生 view/Screens 及
   Native Tabs 关联义务，并绑定 B 的正式 npm/pnpm x Debug/Release 候选。

首页能进入只满足第一层，不代表模块或 M7.4 已通过。

## 自动化门禁

```sh
node --test scripts/sdk54/__tests__/a-expo-image-evidence.test.mjs

node scripts/sdk54/a-expo-image-evidence.mjs \
  --source-repo /Users/zhansh/project/sdk54-ab-a-sources/expo-image-3.0.11/git/expo \
  --archive /Users/zhansh/project/sdk54-ab-a-sources/expo-image-3.0.11/npm/expo-image-3.0.11.tgz \
  --default-project /Users/zhansh/project/sdk54-nova16-acceptance-20261029/default-npm \
  --default-evidence /Users/zhansh/project/expo-harmony-cli/outputs/sdk54/emulator-20261029-nova16 \
  --output docs/releases/2026-11-02-sdk54-a06-expo-image-contract.json \
  --check
```

专项负例为 5/5 PASS，覆盖：固定 commit/version/integrity 被篡改、AST 读取、公开 API
缺失、任一 default 页面图片用法缺失、冷启动复现/错误次数不足，以及模块配置新增 Harmony
后旧失败证据失效。

`pnpm test:sdk54-tools` 全量执行 1,074 项：1,041 PASS、13 FAIL、20 SKIP。A-06 新增
用例均通过；失败项不引用 A-06 文件，分为已有
`screens-harmony-boolean.test.mjs` 缺少 `./utils.cjs` 的 2 项 ownership 检查，以及 M0
原生语义解析的 11 项（本地 Groovy/Kotlin parser 工具缓存缺失或既有语法边界断言）。本轮
不修改这些其他任务文件；因此 A-06 专项目标通过，但不能把仓库全量 SDK54 工具门禁登记为
全绿。

## 边界与交接

- 本轮只新增证据生成器、测试、结构化清单和本报告，没有修改运行时包或消费工程。
- 原始失败 HAP 证明当前缺口，不是实现候选；A-07 必须产生新鲜包、HAP 和设备证据。
- A-07 首批可先完成注册与原始 PNG 实际渲染，再按冻结清单补齐模块全范围；不能用 shim、
  删除页面或改用其他图片组件关闭失败。
- B 后续接入正式组合时应直接执行同一生成器；A/B 任一侧来源、页面或证据漂移都必须先
  重新对账，不能沿用本清单的 PASS。

本轮未执行 `git add`、提交、推送或发布。
