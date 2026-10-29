# SDK54 首批 14 个 Expo 包与 Screens 能力差距评估

评估日期：2026-10-21。范围来自 `scripts/sdk54/release-catalog.mjs`，共 15 个交付包。

## 结论与口径

**这 15 个包目前能支撑基础应用运行，但功能尚未补齐，不能按 Android/iOS 同等能力交付。**

已确认的主要缺口：Harmony 配置插件支持、`expo/fetch`、字体转图片、Native Tabs，以及部分浏览器认证能力。

其余标为“待验”的功能，还不能确定是否一致。本次依据本地源码和历史记录，未重新做三端设备回归、核对线上发布包或完整审查 Screens 上游原生源码，缺口清单仍需补充。

分类：

- **缺失**：有明确 API/配置路径或源码证据表明 Harmony 未提供。
- **差异**：已有实现，但语义、技术方案或配置组合与参考平台不同。
- **待验**：现有证据不足以确认一致，也不足以判定未实现。
- **平台专属**：Android/iOS 自身不共有，单列评估，不机械计入共有能力缺失。

Android/iOS 对照以各包固定导入版本源码为准，不以最新主干替代。Screens 的 Harmony 基线是 RNOH 4.9.0 衍生版 4.9.1，不能与普通 `react-native-screens` 4.17.1 当作同版本实现比较。

## 逐包总表

| 包（源码版本 → 衍生发布版本） | 已有 Harmony 能力 | 差距及交付判断 |
| --- | --- | --- |
| `@expo/cli` 54.0.27 → 54.0.28 | install、prebuild、run、Metro、Debug/Release 主链路 | **缺失**配置插件执行；构建产物定位和标准命令/选项矩阵未齐。不能判全量一致 |
| `@expo/metro-config` 54.0.17 → 54.0.18 | Harmony resolver、alias、初始化顺序、平台 serializer | **差异**Harmony 分支绕过已有自定义 resolver；传递 alias 与高级 Metro 组合待验 |
| `expo` 54.0.37 → 54.0.38 | 启动入口、Core 公共导出、两种模板基础运行 | **缺失**`expo/fetch` 对应的 Harmony 原生模块；不只是入口包胶水 |
| `expo-modules-autolinking` 3.0.27 → 3.0.28 | 多种原生模块类型、HAR、C++/ETS、生命周期与 overlay 生成 | 基础机制已实现；**差异**部分导航兼容依赖固定版本映射。复杂依赖图及第三方组合待验，未证实共有 API 必然缺失 |
| `expo-modules-core` 3.0.30 → 3.0.31 | 模块注册、事件、SharedObject/Ref、异步、原生视图基础、reload | **缺失**完整模块定义 DSL/ArkTS 作者接口；原生视图完整契约待验。属于 Core-v1 子集 |
| `expo-asset` 12.0.13 → 12.0.14 | 本地/网络/rawfile 资源、缓存、MD5、基础 Asset JS API | **缺失**资源插件的 Harmony 原生嵌入配置；Updates 资源集成未闭环。基础下载不是全部缺失 |
| `expo-constants` 18.0.14 → 18.0.15 | 应用配置、设备/系统信息、状态栏高度、字体列表、UA | bare 场景主要字段已接入；Updates/Dev Client 上下文待补齐。**未发现足够证据认定其共有基础 API 缺失** |
| `expo-font` 14.0.12 → 14.0.13 | 动态加载、本地字体注册、已加载查询、共享 useFonts | **缺失**`renderToImageAsync`、静态字体插件；明确拒绝 TTC 字体集合 |
| `expo-linking` 8.0.12 → 8.0.13 | Ability URI 生命周期、链接事件、RN Linking 复用 | **缺失**scheme/URI skills/querySchemes 的完整自动配置路径；外部协议查询、系统设置与回跳有平台边界 |
| `expo-router` 6.0.24 → 6.0.25 | 文件路由、Harmony 路由文件、Stack、JS Tabs 基础场景 | **缺失/依赖限制**Native Tabs；Drawer、Sheet、复杂嵌套路由等待验，不能全部判未实现 |
| `expo-splash-screen` 31.0.13 → 31.0.14 | 防自动隐藏、隐藏、内容出现联动、fade/duration | **缺失**完整 splash 插件配置；生成的 RN 覆盖层默认白色，没有注入自定义图片，不能与系统启动图混同 |
| `expo-status-bar` 3.0.9 → 3.0.10 | 共享组件和方法，委托 RNOH StatusBar | **差异/限制**translucent 不可配置；样式、隐藏和动画跨设备一致性待验 |
| `expo-system-ui` 6.0.9 → 6.0.10 | 设置/读取背景色、持久化、null 恢复系统默认色 | 两个公共运行时 API 已实现；**缺失**背景色/主题的 Harmony 插件配置；读取缓存色与实际窗口色语义需核验 |
| `expo-web-browser` 15.0.11 → 15.0.12 | 内嵌网页、关闭/取消、顶层认证重定向、颜色设置 | **差异/缺失**系统浏览器认证会话与 Cookie/SSO 等价性、临时认证会话、多个展示选项、外部 scheme 导航 |
| Screens 4.9.0 → 4.9.1 | 完整 RNOH 包加 overlay，基础 Stack/Modal 返回 | **缺失**Native BottomTabs（候选说明明确不支持）；Sheet detents/高级手势等尚无全量保证 |

## 确定差距与源码依据

### 1. CLI 与配置插件：多个包共享的阻塞

`packages/@expo/cli/src/prebuild/harmony/prebuildHarmonyAsync.ts:59` 使用 `skipPlugins: true`，随后直接调用 Harmony 自动链接与工程生成。不是已经具备 Harmony mods 的标准配置插件执行链。

下列插件仍只调用 Android/iOS 分支：

| 能力 | 对照源码 | Harmony 影响 |
| --- | --- | --- |
| 静态资源嵌入 | `packages/expo-asset/plugin/src/withAssets.ts` | `plugins: [["expo-asset", { assets: [...] }]]` 缺少原生资源生成路径 |
| 构建时嵌入字体 | `packages/expo-font/plugin/src/withFonts.ts` | 不能用同一插件配置完成字体嵌入；动态 loadAsync 是另一能力 |
| 启动屏配置 | `packages/expo-splash-screen/plugin/src/withSplashScreen.ts` | imageWidth、resizeMode、dark 等没有对应 Harmony 插件路径 |
| 根背景色和主题 | `packages/expo-system-ui/plugin/src/withSystemUI.ts` | 运行时改色可用，不代表配置生成时的背景色和主题已生效 |

这应作为一个横向能力修复，再逐包验收，不能通过多处手写工程绕过后宣称配置闭环。

构建层 `packages/@expo/cli/src/harmony/build.ts:41` 使用固定 `entry/build/default/outputs/default/entry-default-unsigned.hap` 定位产物，不能据默认工程成功推断多 module/product/签名产物均支持。`expo export`、config introspect、设备选择及各命令选项需逐项审计；本次不把未审完的命令一概列为不存在。

### 2. expo：缺少 expo/fetch 原生后端

- `packages/expo/fetch.js` 导出 `src/winter/fetch/index`。
- `packages/expo/src/winter/fetch/ExpoFetchModule.ts:3` 强制 `requireNativeModule('ExpoFetchModule')`。
- Android：`packages/expo/android/src/main/java/expo/modules/fetch/ExpoFetchModule.kt:44` 注册模块，并提供 NativeRequest/NativeResponse。
- iOS：`packages/expo/ios/Fetch/ExpoFetchModule.swift:18` 注册同名模块。
- `packages/expo/expo-module.config.json` 只有 apple/android，未提供 Harmony 模块；本地 Harmony Core、工程模板和 overlay 未发现替代实现。

因此当前受控组合中，业务直接导入 `expo/fetch` 存在模块不可用的问题。RNOH 的全局 `fetch` 不能自动替代这个模块，也不能据此推断流式响应、取消等接口已等价。

### 3. Font：动态字体只是部分能力

Harmony `packages/expo-font/harmony/src/main/ets/ExpoFontLoaderTurboModule.ets` 提供 loadAsync/getLoadedFonts；共享 JS 会先经 Asset 下载，因此不能误判远程字体全部不支持。

`packages/expo-font/src/FontUtils.ts:21` 在 ExpoFontUtils 不存在时抛 UnavailabilityError；Android 的 FontUtilsModule.kt 和 iOS 的 FontUtilsModule.swift 都实现 renderToImageAsync，Harmony 没有对应模块。这是两端共有 API 的确定缺失。

`harmony/src/main/ets/FontFile.ts` 明确拒绝 ttcf/TTC。这是额外格式限制；是否要求与两端所有字体格式一致，需补充逐格式基线，不能直接承诺所有系统支持格式。

### 4. Splash：系统启动图与 RN 覆盖层需一起验收

`packages/expo-splash-screen/harmony/src/main/ets/ExpoSplashScreenView.ets` 已实现 fade/duration，不能列为缺失。但其默认 splashContent 是纯白背景。

`packages/expo-modules-autolinking/src/platforms/harmony/nativeProject.ts:650` 的 overlay 生成只注入 controller，没有传 splashContent。另一方面，首次工程创建会把 `expo.splash.image` 或 icon 复制为 startIcon.png，供原生启动资源使用。**系统有图不代表 JS 加载阶段的覆盖层也有相同图。**

媒体复制直接读取 app.json，且位于首次创建流程；动态配置、插件参数、后续修改资源后的同步，都不能按 Android/iOS 标准配置生成行为认定已完成。

### 5. WebBrowser：打开网页成功不等于认证能力一致

`packages/expo-web-browser/harmony/src/main/ets/ExpoWebBrowserController.ts` 与 ExpoWebBrowserView.ets 使用内嵌 ArkWeb；参考实现分别依赖 Custom Tabs / Safari 与系统认证会话。

- 当前读取 toolbarColor、controlsColor；并在 auth + preferEphemeralSession 时明确报不支持。
- 非 HTTP(S) 导航有限制，顶层认证 redirect 有实现，不能认定任意 OAuth/外部 App 跳转都已覆盖。
- 未消费 showTitle、enableBarCollapsing 等参考平台选项；iOS presentationStyle/readerMode 与 Android browserPackage 等应按各自平台归属列为替代能力设计，不强求一一复制操作系统机制。
- 系统浏览器 Cookie/登录态共享和 SSO 体验不能用内嵌 Web 默认替代。需要真实身份提供方与重定向用例验证。

Android-only 的 warmUp/coolDown/mayInitWithURL、Web-only 的 maybeCompleteAuthSession 不作为两端共有缺失统计。

### 6. Router / Screens：必须按同一导航栈验收

`docs/harmony/packages/react-native-screens.md` 明确 Native BottomTabs 在该 RNOH 候选中不支持。Router Native Tabs 依赖原生 Screens，这项不能因 JS 文件可导入就视为支持。

普通 Stack、Modal、dismissTo、系统返回已有历史记录；它们不能证明 Sheet detents、嵌套导航、交互手势、转场中断、内存恢复全部一致。

Drawer/Sheet 等目前应标“待验”，不是据未验收文档直接断言全部没实现。iOS Link preview/Handoff 本来有平台归属，也不作为 Android/iOS 共有缺失。

### 7. Core：已有基础桥接，尚非完整模块作者能力

`packages/expo-modules-core/harmony/src/main/cpp/ExpoModulesCoreRuntime.h` 有运行时、模块注册、资源和视图配置；配套 async/view adapter 提供真实实现，不能说 Core 只有空壳。

`packages/expo-modules-core/harmony/README.md` 明确限定 Core-v1，完整 ModuleDefinition DSL、ArkTS 作者接口未完成。Android/Kotlin 与 iOS/Swift 的声明式模块能力尚没有完整的 Harmony 对等契约；新模块接入仍需按 Harmony C++/ETS 机制实现。

视图属性/事件/布局/卸载、SharedObject、异常、取消、热重载需用实际模块验证完整生命周期。当前还依赖受控 RNOH 兼容 HAR；并发异步任务负载是待测项，不能用基础 fixture 证明生产负载一致。

该 README 中“autolinking/prebuild 未实现”等旧描述已被后续源码超过，本报告不沿用这些过时判断。

### 8. Metro / Autolinking：区分机制与组合边界

`packages/@expo/metro-config/src/withHarmony.ts:65` 的 Harmony resolver 分支直接转交 RNOH，不调用保存的原自定义 resolver；已有应用自定义解析器的行为存在差异。alias 扫描面向根依赖，传递 scoped alias、monorepo、多版本图需专项用例。

`packages/expo-modules-autolinking/src/platforms/harmony/harmony.ts` 已支持 rnoh-reuse、har、rnoh-package、turbo-module、view、ability-lifecycle；不应将这些列为尚未实现。

`rnohConfig.ts` 包含固定版本导航兼容映射，也支持通用 RNOH 元数据。它不等于“只支持五个包”，但也没有证明任意第三方 RNOH 模块和升级组合都兼容。需验证递归发现、重复依赖、exclude、多个 HAR、版本冲突与增删依赖后的原生同步。

### 9. Constants / SystemUI / StatusBar / Linking 的准确边界

| 包 | 不应误判的项目 | 需要补齐或验证的项目 |
| --- | --- | --- |
| Constants | bare、appOwnership=null、platform.harmony 不含 ios/android，不自动算缺失；两端裸应用本来也有 bare/null 场景 | 嵌入配置更新、缺失/损坏配置行为、Updates/Dev Client 上下文、状态栏动态变化、UA |
| SystemUI | set/get 两 API 已有；null 恢复默认、持久化并非鸿蒙独有，iOS/Android 也有相应逻辑 | Harmony get 读取 currentColor，参考端读实际根视图背景，外部改色后的可见值可能不同；主题配置及切换待验 |
| StatusBar | 网络活动指示器属于 iOS 平台历史 API；动画未保证不等于已证明无实现 | README 明确 translucent 不可配置；false 无法退出沉浸布局，需定义鸿蒙替代语义；新系统参考端也需考虑 edge-to-edge 限制 |
| Linking | sendIntent 是 Android 专属；getInitialURL 与 getLinkingURL 本来不是同一个概念 | scheme/URI skills/querySchemes 自动声明、冷/热启动回跳、tel/sms/第三方协议、openSettings；部分限制来自 RNOH，尚需核对完整依赖源码 |

Asset 的 file/http/rawfile 基础路径已经实现，不能把不支持任意 URI scheme 写成确定的共有缺失；需先建立 Android/iOS 同场景支持基线。Updates 离线/OTA 资源是跨包集成缺口，不应混同 Asset.downloadAsync 不存在。

## 首批交付建议与测试边缘

建议按下列顺序关闭问题，缺口实现前先建立对应失败用例；本次只形成评估，不修改实现。

| 顺序 | 工作 | 关键验收/边缘用例 |
| --- | --- | --- |
| P0 | Harmony 配置插件及工程同步 | 动态 app.config、静态字体/资源、深链声明、主题/splash；二次 prebuild、clean、删除配置和资源后无残留 |
| P0 | expo/fetch | 模块可导入、GET/POST、二进制/流式响应、上传、Abort、重定向、TLS 错误、断网、reload 中取消 |
| P0 | 导航支持矩阵与 Native Tabs | 明确交付是否含 Native Tabs；Stack/JS Tabs/Modal/dismissTo、嵌套、Sheet、手势中断、系统返回、重复进出和 reload |
| P0 | WebBrowser 认证与退出 | OAuth 成功/取消/关闭、错误 redirect、非顶层跳转、并发会话、外部 App 回跳、Cookie/SSO、临时会话能力策略 |
| P1 | Font 与 Splash 补齐 | renderToImage 的尺寸/缩放/空文字/中文；字体重复加载、损坏/不支持格式；系统启动图到 RN overlay 连续、深浅色、慢加载 |
| P1 | Core 完整契约 | 作者 API、Promise/错误/事件、SharedObject 释放、复杂视图 props/ref/布局、卸载后回调、热重载与并发压力 |
| P1 | 工具链复杂组合 | 自定义 resolver、monorepo、pnpm/npm、传递 alias、HAR 冲突、依赖增删、失败恢复、签名及不同产品构建 |
| P1 | 基础系统 API 对照 | Constants 字段/损坏配置、SystemUI 外部改色/深浅色切换、StatusBar 隐藏和布局、Linking 查询与生命周期 |

关闭标准：每项记录参考平台行为、Harmony 实际行为、代码版本、测试环境、可重复证据及明确限制。平台专属能力允许设计等效交互，但必须说明取舍；“未验证”不能转写成“已一致”。

本报告未运行新的原生/设备测试。历史默认模板 Debug/Release 验收仅能证明对应场景；既有 SDK 分流单测也不能证明本报告涉及的 API 平价。
