# SDK54 Harmony 平台覆盖核查清单

日期：2026-10-21。
状态：初始核查清单，未完成上游全量枚举；不能作为支持承诺或完成报告。

2026-10-22 来源进度：已完成[包级来源索引](../../releases/2026-10-22-sdk54-m0-source-index-acceptance.md)、[六插件选项展开](../../releases/2026-10-22-sdk54-m0-plugin-surface-acceptance.md)及[workspace 插件入口/内置插件/provider 来源索引](../../releases/2026-10-22-sdk54-m0-plugin-index-acceptance.md)。下文为初始核查输入，最新来源展开与差异以这些结构化清单和报告为准；Harmony 实现、全量公开面及 M0 仍未完成。
关联设计：[SDK54 新架构完成路线](2026-10-21-sdk54-architecture-completion-design.md)。
验证方案：[AI 端到端构建验证](2026-10-21-sdk54-ai-e2e-validation-design.md)。

## 本轮范围与版本边界

- SDK54 只支持新方案；不保留旧 SDK54 patch/legacy 的项目识别、补丁管理、专属诊断或命令兼容，不提供迁移工具或迁移支持。SDK54 验证工程统一重新创建。
- SDK52 保留现有项目识别、创建和运行，不改用 SDK54 新方案、不统一重构；清理前按实际调用保留 SDK52 使用的共享扫描、注入、补丁和工具能力。
- Expo Go、EAS Build、EAS 云端更新/提交、商店发布自动化，以及 expo-updates 和 expo-dev-client 均暂缓，包括本地更新与失败恢复、自定义开发客户端及其相关 API、插件。仍登记来源和范围，不要求本轮实现、测试或发行，不阻断本轮验收，不计为已完成或平台不适用。
- 标准 CLI、Metro、普通 Debug 应用、本地 Debug/Release 构建、签名接入、设备运行和 Release 内嵌资源仍为必达。认证模块仍按对应批次逐项评估；共享依赖按本轮实际用途核验，不随暂缓模块整包排除。后续新增暂缓项必须另行确认。

| 范围 ID | 功能 / 来源定位 | 本轮状态与处理 | 批次 |
| --- | --- | --- | --- |
| DEFER-GO | Expo Go 容器及专属接入；固定上游容器、CLI 分支和相关模块入口由 M0 定位 | 暂缓；不要求容器构建/分发，不作为完成项 | M7.5 范围登记 |
| DEFER-EAS-BUILD | EAS Build 云构建及托管凭据；外部服务/工具单独记录其来源版本 | 暂缓；本地 Hvigor 构建和本地签名接入仍必达 | M7.5 范围登记 |
| DEFER-EAS-SERVICES | EAS 托管更新、提交及商店发布自动化；相关包按具体 API/插件选项关联 | 暂缓；本地 Updates 另见 DEFER-UPDATES，普通认证仍逐项核验 | M7.5 范围登记 |
| DEFER-UPDATES | expo-updates 的更新、资源管理与失败恢复等能力及相关 API、插件 | 暂缓；包括本地能力，不要求本轮实现或设备验收；Release 内嵌资源加载仍必达 | M7.5 范围登记 |
| DEFER-DEV-CLIENT | expo-dev-client 的自定义开发客户端及相关 API、插件 | 暂缓；包括本地能力；普通 Debug 应用连接 Metro、本地构建仍必达 | M7.5 范围登记 |
| KEEP-SDK52 | 当前 SDK52 识别、创建、运行及实际调用的共享模块 | 保持现状；删除 SDK54 旧代码前后分别回归 | M0/M6/M8 |
| REMOVE-SDK54-OLD | `apps/cli/src/sdk54`、命令分流、SDK54 patch 内容与脚本中的旧方案职责 | 待按调用图清理；有效新方案发行能力移交适配工具链，SDK52 共享能力保留，不按目录一刀切删除 | M0/M0A/M6/M8 |

SDK54 旧方案清理检查项（仅规划，尚未执行删除）：

| 检查项 | 当前输入位置 | 清理与保留规则 |
| --- | --- | --- |
| 旧项目分类与命令路由 | `apps/cli/src/sdk54/project-state.ts`，`apps/cli/src/commands/doctor.ts`、`prebuild.ts`、`scan.ts`、`sync.ts` | 删除旧 SDK54 分类/诊断/兼容路由；新方案识别归适配 Expo，SDK52 原有分流保留；通用未知 SDK 写入保护不能删除 |
| 应用侧补丁与替换 | `apps/cli/src/sdk54/install-patches.ts`、`patch-manifest.ts`、`default-image-substitution.ts`，`apps/cli/content/patches/sdk-54` | 删除旧 SDK54 补丁安装/管理及模板替换；SDK 内部有效修复归受控发行，SDK52 使用的独立或共享补丁能力保留 |
| 创建与发行 helper | `apps/cli/src/sdk54/create.ts`、`create-release.ts`、`release-manifest.ts`、`release-runtime.ts` | 移除产品 CLI 的 SDK54 创建入口；新方案所需模板/发行身份/校验逻辑迁入适配工具链，不保留对过渡 CLI 内部 dist 源码的依赖 |
| 旧脚本与新发行依赖 | `scripts/sdk54/generate-cli-patches.mjs`、`audit-cli-patches.mjs`、`release-catalog.mjs`、`test-release-install.mjs` | 清理旧 patch 工作流；先解除 release catalog 等对 SDK54 patch manifest 的取数依赖，再保留/改造新方案所需发布和验证脚本 |
| 测试与共享调用 | `apps/cli/__tests__/sdk54`、`scripts/sdk54/__tests__`、SDK52 命令实际调用链 | 旧兼容断言随功能删除，新方案使用全新工程；共享文件按调用图判定，不按名称或目录整批删除；SDK52 原流程前后回归 |

## 1. 清单来源与完整性

- Expo 源码起始 revision：`5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`，取自现有 provenance；M0 必须核对其对应的 SDK54 workspace 和模板范围。
- 初始包名种子来自当前 `packages/expo/bundledNativeModules.json` 的 120 项、本仓库 14 个顶层源码包，以及创建/配置核心层显式条目，去重共 130 项。
- bundledNativeModules 文件 SHA256：`c88fa93aaa575a7b00ca5983eb6a0129228461a0faff2b5b639258b25085f763`。表中范围是该文件的当前声明，可能已包含本仓库适配变更，不冒充原始上游版本事实，也不直接用作推荐安装组合。
- 该版本目录含第三方 RN 包与历史/废弃包，也未覆盖全部核心工具、模板和内置插件；因此既不能把它等同于全部 Expo 包，也不能把每一行都视为新增完整第三方适配承诺。
- create-expo-app 必须单独固定来源仓库/revision/版本；不能假定它使用 Expo SDK 的版本号或恰在同一源码树中。
- 已有源码仅证明存在实现输入；下表所有能力结论均需按 API、插件、产物和设备证据核验。

M0 的完整枚举规则：
1. 遍历固定 Expo revision 的 workspace package manifests、平台核心包、SDK54 版本目录、模板及创建工具依赖图，按发布/运行/构建/测试用途分类。
2. 对每个包检查 app.plugin、plugin 导出、内置 unversioned 插件和 mod provider；按插件入口建立独立记录，枚举全部公开 API 和插件全部选项，不以关键 API 抽样代替完整枚举。
3. 来源包、命令、模板、类型/schema、插件和平台枚举分别建索引；包名去重不能吞掉不同入口或平台能力。
4. 将完整来源枚举与本表做双向差异检查。缺源码、缺来源或缺记录的项直接阻断 M0 完成；新增、废弃和重命名项保留原因与来源。
5. 第三方 RN 包单列兼容依赖，覆盖项目使用场景；是否提供额外适配按明确模块任务决定。SDK54 Expo 包全部在总范围内，废弃项也先登记再依据固定版本事实判定。

## 2. 每个条目的必需字段与关闭规则

详细清单应采用可校验的结构化数据，至少包含：

| 字段 | 要求 |
| --- | --- |
| id / kind | 稳定唯一 ID；core、command、template、module、plugin、type/schema、external 或 test/build |
| source | 仓库、revision、包版本、源码相对路径及相关产物 hash |
| name / sourcePath | 包、工具或插件名称及固定 revision 内的源码位置 |
| publicSurface | 全部公开 API、组件属性、插件全部选项及其逐项源码位置，不能仅填包名或抽样关键 API |
| scope / deferReason | 本轮必达或明确暂缓；暂缓引用范围 ID、理由及确认记录，不与平台适用性混用 |
| applicability | 可适用、有限适用或平台不适用；附平台事实、复核人/记录与理由 |
| implementation | Harmony 状态及实现位置；未评估、未完成、实现中、已实现待验收、已验收，与适用性分开记录 |
| nativeDependencies / jsDependencies | 原生与 JS 依赖、版本/身份和前置条目，不能只记录直接 npm 依赖 |
| milestone | M7.1-M7.6 所属适配批次，及关联的 M0-M6 基础工作；跨批阻塞可追踪 |
| stageDisposition | M4 必达项或显式转入 M7 的未完成项；后者必须记录依赖条目 ID、目标批次和验收条件 |
| pluginContract | 插件入口、全部选项、默认值/枚举/优先级、消费的 Expo 配置、Harmony mod 与目标文件、写入归属、删除/幂等/冲突行为 |
| automatedTests | 自动化测试路径、命令、结果、适配源码 revision 和测试产物 hash |
| deviceEvidence | 设备、系统、构建模式、命令、日志和结果；纯工具项注明不需要设备的依据并提供真实消费测试 |
| limitation | 明确缺项和替代行为；是否阻断承诺场景 |
| release | 受控发行物包名、版本、registry 或 tgz、完整性 hash；类型、选项和公共代码关联所属包，无需单独发包；无需新增实现或发布的条目写明依据；官方发行状态可选记录，不参与关闭判定 |

公开能力必须覆盖：所有公开函数、类、常量、React 组件及公开属性、事件、回调、错误行为、权限声明、Config Plugin 及全部选项、平台文件和 JS/TS 平台判断、类型声明、原生接口、生命周期、资源，以及安装、移除、Autolinking 和 Prebuild 行为。允许功能组归类，但每项均须追溯到源码。

最终关闭按条目类别判定：

- 适用项须有实现、相应自动化测试和真实发布物关联；原生设备行为须有设备证据，纯工具/类型项使用消费、构建或类型测试并说明无需设备的依据。
- 类型、插件选项、公共代码和单个 API 可关联所属包发布物，不要求逐项独立发包。核验后原样复用的上游依赖记录实际包身份及验证依据，禁止误解析回不兼容版本，不禁止使用官方来源的兼容包。
- “不适用”仅用于 Harmony 确实不存在相应语义的能力，须有依据、替代行为和复核记录；不强求原生实现。对外暴露的拒绝、降级或替代行为须有验证，并关联承载行为的发布物；无需新增实现或发布时记录理由，不能留空冒充完成。
- 有限支持不能关闭仍可实现的缺项。未评估、缺源码、可实现但未完成、缺所需测试或缺应有关联的发布物均不能计为完成。
- M4 显式转入 M7 的能力保持未完成，不阻断已满足必达项的 M4 阶段关闭，但阻断全量清单及 M8 关闭。
- 明确暂缓项保持未交付，不要求本轮实现/测试/发行，但必须完成来源及范围评估并关联范围 ID；不阻断本轮关闭，不计入支持数。其余缺项不能自行改标暂缓。

M7 本轮范围分批关闭后，M8 验证最终发布组合和 AI 端到端报告；不等待上游合入或官方发布，不等待 Expo Go/EAS、expo-updates 和 expo-dev-client 暂缓能力。报告分别列出已验收、不适用、暂缓和未完成数量，不能把“本轮毕业”写成无例外的全部功能支持。

### 2.1 逐能力记录模板与批次

以下为后续结构化清单的必填记录模板。未填写内容视为未完成；字段不适用时须按上述分类规则记录理由和替代证据，不能直接留空。本模板不视为已生成全量 API 清单：

| 来源仓库 / revision | 包、工具或插件 / 源码位置 | 全部公开 API 或插件选项 | Harmony 状态 / 实现位置 | 原生依赖 / JS 依赖 | 自动化测试 | 设备证据 | 发布物身份 / hash | 批次 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 由固定来源核定 | 每个能力组单独记录并关联包级 ID | 逐项列出及定位，不填“主要 API” | 未完成；补齐实际路径 | 分别列出及关联条目 | 实际路径、命令和结果 | 实际日志或有依据的不适用说明 | 真实受控包或 tgz | M7.1-M7.6 |

批次映射：M7.1 创建/CLI/配置/类型/插件/公共工具；M7.2 资源/文件/存储/数据库；M7.3 权限/设备/系统服务；M7.4 媒体/图像/相机/音视频/原生视图；M7.5 本轮开发模块，以及 Expo Go/EAS、expo-updates 和 expo-dev-client 的暂缓登记；M7.6 平台专属及不适用评估。每批记录同一 SDK54 来源基线、独立适配 revision、准确包清单；本轮必达项提供实现、测试、适用设备证据及发布物，暂缓项不要求交付。

## 3. 核心平台、命令与模板的独立检查项

下表为总设计必须覆盖的独立入口，当前均为规划核查项，未声明本次已验收。

| ID | 单元 | 必查能力与交付 |
| --- | --- | --- |
| CREATE | create-expo-app | 源码同步、天然兼容 Harmony 的模板、包管理器、依赖初始化、无后处理创建、受控构建/发布；不预设平台参数 |
| TEMPLATE-DEFAULT | SDK54 default | 固定源码、Router/图片等原始依赖与页面、零源码替换、Debug/Release |
| TEMPLATE-BLANK | SDK54 blank-typescript | 固定模板来源、类型配置、无独立 CLI 创建与运行 |
| CLI-PREBUILD | @expo/cli prebuild | 平台参数、配置/插件、链接、增量生成、clean、失败恢复 |
| CLI-RUN | @expo/cli run:harmony | 工具链、构建、签名/产物、安装启动、设备反馈 |
| CLI-START | @expo/cli start | 平台识别、无 managed-state、端口、刷新、错误呈现、多平台请求 |
| CLI-INSTALL | @expo/cli install | 包身份、版本区间、peer、check/fix、补装、组合更新；卸载由包管理器完成 |
| CLI-EXPORT | @expo/cli export | Harmony 平台识别、bundle/静态资源、运行时依赖与输出布局 |
| CLI-CONFIG | @expo/cli config | 动态配置、类型/schema、平台字段、插件求值/输出、敏感配置边界 |
| CONFIG | @expo/config | 动态/静态配置、环境、平台配置流转、解析与插件执行 |
| CONFIG-TYPES | @expo/config-types | Harmony 平台类型、模块扩展、公共声明与 schema 对齐 |
| CONFIG-PLUGINS | @expo/config-plugins | Harmony mods/provider、编译阶段、执行顺序、平台隔离和插件诊断 |
| PREBUILD-CONFIG | @expo/prebuild-config | 内置默认配置插件逐项枚举、Harmony 实现与基线配置 |
| AUTOLINKING | expo-modules-autolinking | Expo/RNOH 元数据、别名/依赖图、HAR、C++/ETS、生命周期、冲突及卸载清理 |
| CORE | expo-modules-core | 模块/事件/异步/错误/资源/view、线程、销毁及 reload 隔离 |
| METRO | @expo/metro 与 @expo/metro-config | 平台解析、用户配置组合、serializer、资源打包、跨平台隔离 |
| METRO-RUNTIME | @expo/metro-runtime | 初始化、错误/刷新与平台运行依赖 |
| ROUTER | expo-router | 平台入口、路由发现、导航、深链、系统返回与类型 |
| ASSET | expo-asset | 插件资源、Metro/rawfile、下载缓存、离线 Release 与资源清理 |
| UPDATES | expo-updates | 登记来源与公开能力，关联 DEFER-UPDATES；本地更新、失败恢复及相关 API/插件均暂缓，不要求本轮实现、设备验收或发行 |
| DEV-CLIENT | expo-dev-client | 登记来源与公开能力，关联 DEFER-DEV-CLIENT；本地开发客户端及相关 API/插件均暂缓，不要求本轮实现、设备验收或发行 |
| SDK-PACKAGES | SDK54 全量 Expo 包 | 固定上游逐包枚举；每包全部公开 API、内置插件及全部选项独立登记，M7 分批关闭，M8 最终验收 |
| QUALITY | 所有受影响包 | 测试、公共类型、文档、源码构建、许可证和发布配置，关联同一候选物 |
| SDK-BOUNDARY | SDK52 保留 / SDK54 新方案 | SDK52 原有识别/创建/运行及共享能力回归；旧 SDK54 识别/补丁管理/专属诊断/兼容分流和迁移入口删除，SDK54 测试重新创建 |
| AI-E2E | CLI 开发后的独立验证 | 单元测试之外，由 AI 实际创建、配置、构建、安装、运行与冷启动；证据关联发布物，不用旧项目或源码软链接 |

## 4. 本仓库已有源码包与插件入口

仅扫描顶层源码包和 app.plugin.js，不代表已经完整枚举上游插件导出。

| 包 | 源码版本 | 路径 | 当前可见插件入口 |
| --- | --- | --- | --- |
| `@expo/cli` | 54.0.27 | `packages/@expo/cli` | 未发现 app.plugin.js；其他入口需按源码核查 |
| `@expo/metro-config` | 54.0.17 | `packages/@expo/metro-config` | 未发现 app.plugin.js；其他入口需按源码核查 |
| `expo` | 54.0.37 | `packages/expo` | 未发现 app.plugin.js；其他入口需按源码核查 |
| `expo-asset` | 12.0.13 | `packages/expo-asset` | `packages/expo-asset/app.plugin.js`，实现需逐项核验 |
| `expo-constants` | 18.0.14 | `packages/expo-constants` | 未发现 app.plugin.js；其他入口需按源码核查 |
| `expo-font` | 14.0.12 | `packages/expo-font` | `packages/expo-font/app.plugin.js`，实现需逐项核验 |
| `expo-linking` | 8.0.12 | `packages/expo-linking` | 未发现 app.plugin.js；其他入口需按源码核查 |
| `expo-modules-autolinking` | 3.0.27 | `packages/expo-modules-autolinking` | 未发现 app.plugin.js；其他入口需按源码核查 |
| `expo-modules-core` | 3.0.30 | `packages/expo-modules-core` | 未发现 app.plugin.js；其他入口需按源码核查 |
| `expo-router` | 6.0.24 | `packages/expo-router` | `packages/expo-router/app.plugin.js`，实现需逐项核验 |
| `expo-splash-screen` | 31.0.13 | `packages/expo-splash-screen` | `packages/expo-splash-screen/app.plugin.js`，实现需逐项核验 |
| `expo-status-bar` | 3.0.9 | `packages/expo-status-bar` | 未发现 app.plugin.js；其他入口需按源码核查 |
| `expo-system-ui` | 6.0.9 | `packages/expo-system-ui` | `packages/expo-system-ui/app.plugin.js`，实现需逐项核验 |
| `expo-web-browser` | 15.0.11 | `packages/expo-web-browser` | `packages/expo-web-browser/app.plugin.js`，实现需逐项核验 |

### 4.1 已有六个包插件的选项与功能核查

以下根据当前本地源码补充，不代表全部上游内置插件已枚举。共同阻塞：`packages/@expo/cli/src/prebuild/harmony/prebuildHarmonyAsync.ts` 仍使用 skipPlugins，六个入口未形成完整 Harmony mod 执行链。下列 Harmony 工作均是未完成要求，不能据本表宣称插件已适配。

| ID / 插件 | 本地源码位置 | 当前可见的全部选项或消费字段 | Harmony 功能与状态 | 依赖 / 批次 |
| --- | --- | --- | --- | --- |
| PLG-ASSET / expo-asset | `packages/expo-asset/plugin/src/withAssets.ts` | `assets?: string[]`；缺 props/空数组行为也需核验 | 未完成：按目录/文件声明嵌入资源，稳定命名与访问映射，删除声明后清理受管资源 | JS 配置/资源解析、Harmony rawfile 与 Asset；M4/M7.2 |
| PLG-FONT / expo-font | `packages/expo-font/plugin/src/withFonts.ts` | `fonts[]`；`android.fonts[]` 可为路径或对象，对象含 `fontFamily`、`fontDefinitions[].path/weight/style(normal/italic)`；`ios.fonts[]` | 未完成：静态字体复制、注册及 family/weight/style 行为；通用项与平台专属项分别评估，不能直接将 android/ios 选项写入 Harmony | 配置插件、字体资源与运行时；M4/M7.2 |
| PLG-SPLASH / expo-splash-screen | `packages/expo-splash-screen/plugin/src/withSplashScreen.ts` | `backgroundColor`、`imageWidth`、`enableFullScreenImage_legacy`、`image`、`resizeMode(contain/cover/native)`、`dark.image/backgroundColor`、`android`、`ios`；后两者导入的类型尚未完整展开，见下文阻塞 | 未完成：启动窗口和 RN overlay 图片/颜色/尺寸一致，深浅色、缩放、旧配置兼容及平台覆盖优先级逐项评估 | prebuild-config 导入类型、媒体转换、资源与生命周期；M4/M7.4 |
| PLG-SYSTEM-UI / expo-system-ui | `packages/expo-system-ui/plugin/src/withSystemUI.ts` 及同目录各平台实现 | 无独立 props；读取 `backgroundColor`、`userInterfaceStyle(automatic/light/dark)` 以及 `android/ios` 对应覆盖字段 | 未完成：Harmony 根视图/窗口背景和主题生成、优先级、删除/恢复默认；运行时 set/get 不能替代插件配置 | 配置快照、系统主题与 SystemUI；M4/M7.3 |
| PLG-ROUTER / expo-router | `packages/expo-router/plugin/src/index.ts`、`packages/expo-router/plugin/options.json` | schema：`origin(string/boolean)`、`headOrigin`、`root`、`platformRoutes`、`sitemap`、`asyncRoutes`、`partialRouteTypes`、`redirects`、`rewrites`、`headers`、`unstable_useServerMiddleware`；TS 另有 `partialTypedGroups`，类型与 schema 有差异 | 未完成：Harmony 配置流转及路由选项；iOS Handoff、Web 服务端选项按语义独立评估，不能全部照搬成 Harmony 原生配置 | schema 校验、CLI/Metro/Router、链接；M4/M7.1 |
| PLG-WEB-BROWSER / expo-web-browser | `packages/expo-web-browser/plugin/src/withWebBrowser.ts`、`withWebBrowserAndroid.ts` | `experimentalLauncherActivity?: boolean`；缺 props/false 返回不改配置 | 待评估：现有功能是 Android LauncherActivity，需确认 Harmony 是否存在对应语义和替代行为；不能因无 Harmony 分支直接标不适用，也不能据浏览器运行时可用标插件完成 | Android 专属 Activity 语义、Harmony Ability 生命周期；M4/M7.6 |

Router 嵌套选项必须继续逐项登记：

- `asyncRoutes` schema 接受 development/production 或 boolean，也接受含 ios/android/web/default 的对象，并允许额外键；当前 TS 参数类型更窄。Harmony 分支的新增/继承规则由适配设计确定，不能因 schema 接受额外键就声称已支持 harmony。
- `redirects[]`：source、destination、permanent、methods；`rewrites[]`：source、destination、methods。methods 枚举为 GET/POST/PUT/DELETE/PATCH/OPTIONS/HEAD。
- `headers`：键到 string 或 string[] 的映射。root、origin、异步路由、重定向等选项还需追溯 CLI/Metro/Router 的实际消费路径；插件转存 extra.router 不等于功能已生效。
- origin/asyncRoutes、partialRouteTypes/partialTypedGroups 及其他类型/schema 差异必须有对照记录和测试，不能只扫描一种声明后声称全部选项齐全。

Splash 完整枚举阻塞：`AndroidSplashConfig`/`IOSSplashConfig` 来自尚未完整纳入的 `@expo/prebuild-config`。M0 必须取得固定来源版本的两类定义及其消费实现，展开全部子选项、默认值、旧字段与优先级，再关闭 PLG-SPLASH 的枚举项；本表顶层选项不替代该工作。

上述六项的 Harmony 实现位置：尚无可验收的完整插件路径；实际完成后登记对应 mod/provider 与资源生成源码。自动化与设备证据：本轮未重新执行，保持未验收。发布关联：各自所属受控包及相同组合的 CLI/config-plugins/prebuild-config，最终版本和 hash 由实现后的候选物记录，不能借历史 15 包发布记录关闭插件项。

### 4.2 公共插件底座与默认配置功能

以下是平台必须提供的功能组，属于工作清单，不冒充已经存在的 Harmony API 名或完整上游插件清单。M0 仍需从固定来源枚举 `@expo/prebuild-config` 的全部默认/版本化插件、平台 mods、导出入口及其选项，与这些功能组双向核对。

| ID | 功能与输入 | Harmony 目标 / 必查行为 | 来源及实现状态 | 批次 |
| --- | --- | --- | --- | --- |
| PLG-CORE-LOAD | plugins 数组、字符串/元组/本地插件、插件选项、动态配置 | 正确解析/校验插件身份、执行顺序、run-once 与版本；缺包/无实现不能假成功 | `@expo/config`、`@expo/config-plugins` 固定源码待完整导入；Harmony 链路未完成 | M1/M7.1 |
| PLG-CORE-MODS | Harmony mod provider、编译与结果输出 | 系统配置、资源、工程构建文件按受管字段提交；平台隔离，Android/iOS mods 不得改 Harmony 文件 | provider/字段名由 M1 详细设计定义，尚未实现完整契约 | M1/M2/M7.1 |
| PLG-APP | 应用名、包名、版本与 build 标识 | AppScope/entry 的 JSON5 与字符串资源；覆盖优先级、合法值、增量更新和字段移除 | 上游默认插件需逐一定位；现有 nativeProject 仅局部生成，不算完整插件实现 | M1/M2/M7.1 |
| PLG-MEDIA | icon、splash 及其深浅色/尺寸选项 | 图片转换、目标资源及启动窗口/覆盖层；同名冲突、缺文件、修改与删除 | 同时关联 PLG-ASSET/FONT/SPLASH，不能由首次媒体复制关闭 | M4/M7.2/M7.4 |
| PLG-LINKS | scheme、查询协议、路由/回跳配置 | URI skills、querySchemes、Ability 生命周期；冷/热启动和重复声明 | 具体 Harmony 字段由 M1 确定；未完成 | M1/M4/M7.1 |
| PLG-PERMISSIONS | 公共/模块权限声明、用途说明及移除规则 | module.json5 权限、原因/场景等平台要求；权限合并、共享归属、用户声明保留和错误诊断 | 由固定包插件与平台事实逐项建立映射，不预设 Android 权限名可直用 | M1/M2/M7.3 |
| PLG-WINDOW | 方向、背景色、主题、状态栏等配置 | Ability/窗口与资源配置，启动状态和运行时一致 | 上游对应默认插件逐项定位；与 SystemUI/StatusBar 验证关联 | M1/M4/M7.3 |
| PLG-NATIVE | 包要求的 HAR、构建设置和原生扩展 | 与 Autolinking 分工明确，事务写入、冲突报告；不补丁化依赖源码/HAR | 固定包实现及配置契约逐项核验；未完成 | M2/M3/M7.1 |

无独立 app.plugin.js 的 Constants、Linking、StatusBar 等包，仍须检查默认插件、间接导出、配置生成脚本和平台判断，不可直接写“无插件功能”。Expo Go/EAS、expo-updates 和 expo-dev-client 的相关插件/选项逐项关联暂缓范围 ID；其他本轮必达项及其共享依赖继续实施。

### 4.3 插件验收与 AI 端到端用例

| 测试 ID | 必须观察的结果 |
| --- | --- |
| PLG-T01 配置与类型 | app.json/app.config.js/app.config.ts、环境变量、默认值、非法值、空值、平台覆盖；schema/TS/生成结果一致 |
| PLG-T02 生成与幂等 | 首次/重复/增量/clean 生成；JSON5 语法、注释和非受管字段策略；相同输入无实质差异 |
| PLG-T03 修改与删除 | 更新或移除单个选项、整个插件和依赖后清理受管配置/资源；共享权限或传递依赖仍保留 |
| PLG-T04 错误与隔离 | 缺插件、资源缺失、重复插件、字段冲突、无 Harmony 实现、插件中途失败；不执行其他平台操作，失败恢复有效 |
| PLG-T05 独立扩展 | 真实发行的第三方 Harmony 测试插件修改系统配置；无需改中央名单，安装/调用/移除/重装均验证 |
| PLG-T06 设备行为 | 字体可显示、资源可离线访问、Splash 连续、主题/状态栏生效、深链回跳及权限声明有效；按功能选取真实操作与日志 |
| PLG-T07 范围与回归 | 暂缓项只按范围标识；SDK54 新工程通过 npm/pnpm 和 Debug/Release，SDK52 原流程未受影响 |

每个插件选项关联适用的 PLG-T01-T07 及 AI 端到端报告中的具体用例；纯配置快照只能证明生成，不能代替设备行为。记录源码 revision、测试命令、生成前后差异、设备日志、所属发布物 hash。CLI 完成后由 AI 实际执行，不能只列测试建议就关闭。

## 5. 初始包名核查种子表

所有行状态均为未完成逐项评估。现有源码包的公开支持记录可作为输入，但本次不重标历史设备验收。只有完整来源枚举完成后，才可确认包级总数。

| 包名 | 当前版本目录声明 | 本仓库顶层源码 | 能力状态 |
| --- | --- | --- | --- |
| `@expo/cli` | 不在该版本目录；由固定来源核定 | `packages/@expo/cli` | 待逐项核验 |
| `@expo/config` | 不在该版本目录；由固定来源核定 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `@expo/config-plugins` | 不在该版本目录；由固定来源核定 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `@expo/config-types` | 不在该版本目录；由固定来源核定 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `@expo/fingerprint` | ~0.15.5 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `@expo/metro` | 不在该版本目录；由固定来源核定 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `@expo/metro-config` | 不在该版本目录；由固定来源核定 | `packages/@expo/metro-config` | 待逐项核验 |
| `@expo/metro-runtime` | ~6.1.2 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `@expo/prebuild-config` | 不在该版本目录；由固定来源核定 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `@expo/ui` | ~0.2.0-beta.9 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `@expo/vector-icons` | ^15.0.3 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `@react-native-async-storage/async-storage` | 2.2.0 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `@react-native-community/datetimepicker` | 8.4.4 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `@react-native-community/netinfo` | 11.4.1 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `@react-native-community/slider` | 5.0.1 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `@react-native-community/viewpager` | 5.0.11 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `@react-native-masked-view/masked-view` | 0.3.2 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `@react-native-oh/react-native-harmony` | 0.82.30 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `@react-native-picker/picker` | 2.11.1 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `@react-native-segmented-control/segmented-control` | 2.5.7 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `@sentry/react-native` | ~7.2.0 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `@shopify/flash-list` | 2.0.2 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `@shopify/react-native-skia` | 2.2.12 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `@stripe/stripe-react-native` | 0.50.3 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `create-expo-app` | 不在该版本目录；由固定来源核定 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `eslint-config-expo` | ~10.0.0 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo` | 不在该版本目录；由固定来源核定 | `packages/expo` | 待逐项核验 |
| `expo-age-range` | ~0.2.1 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-analytics-amplitude` | ~11.3.0 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-app-auth` | ~11.1.0 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-app-loader-provider` | ~8.0.0 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-apple-authentication` | ~8.0.8 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-application` | ~7.0.8 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-asset` | ~12.0.13 | `packages/expo-asset` | 待逐项核验 |
| `expo-audio` | ~1.1.1 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-auth-session` | ~7.0.11 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-av` | ~16.0.8 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-background-fetch` | ~14.0.9 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-background-task` | ~1.0.10 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-battery` | ~10.0.8 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-blur` | ~15.0.8 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-brightness` | ~14.0.8 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-build-properties` | ~1.0.10 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-calendar` | ~15.0.8 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-camera` | ~17.0.10 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-cellular` | ~8.0.8 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-checkbox` | ~5.0.8 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-clipboard` | ~8.0.8 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-constants` | ~18.0.14 | `packages/expo-constants` | 待逐项核验 |
| `expo-contacts` | ~15.0.11 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-crypto` | ~15.0.9 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-dev-client` | ~6.0.21 | 未纳入本仓库顶层源码 | 暂缓（DEFER-DEV-CLIENT）；仍登记来源和公开能力 |
| `expo-device` | ~8.0.10 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-document-picker` | ~14.0.8 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-file-system` | ~19.0.24 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-font` | ~14.0.12 | `packages/expo-font` | 待逐项核验 |
| `expo-gl` | ~16.0.10 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-glass-effect` | ~0.1.10 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-google-app-auth` | ~8.3.0 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-haptics` | ~15.0.8 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-image` | ~3.0.11 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-image-loader` | ~6.0.0 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-image-manipulator` | ~14.0.8 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-image-picker` | ~17.0.11 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-insights` | ~0.10.8 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-intent-launcher` | ~13.0.8 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-keep-awake` | ~15.0.8 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-linear-gradient` | ~15.0.8 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-linking` | ~8.0.12 | `packages/expo-linking` | 待逐项核验 |
| `expo-live-photo` | ~1.0.8 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-local-authentication` | ~17.0.9 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-localization` | ~17.0.9 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-location` | ~19.0.8 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-mail-composer` | ~15.0.8 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-manifests` | ~1.0.11 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-maps` | ~0.12.10 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-mcp` | ~0.2.1 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-media-library` | ~18.2.1 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-mesh-gradient` | ~0.4.8 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-module-template` | ~11.0.19 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-modules-autolinking` | 不在该版本目录；由固定来源核定 | `packages/expo-modules-autolinking` | 待逐项核验 |
| `expo-modules-core` | ~3.0.30 | `packages/expo-modules-core` | 待逐项核验 |
| `expo-navigation-bar` | ~5.0.10 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-network` | ~8.0.8 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-notifications` | ~0.32.17 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-print` | ~15.0.8 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-router` | ~6.0.24 | `packages/expo-router` | 待逐项核验 |
| `expo-screen-capture` | ~8.0.10 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-screen-orientation` | ~9.0.9 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-secure-store` | ~15.0.8 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-sensors` | ~15.0.8 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-server` | ~1.0.7 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-sharing` | ~14.0.8 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-sms` | ~14.0.8 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-speech` | ~14.0.8 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-splash-screen` | ~31.0.13 | `packages/expo-splash-screen` | 待逐项核验 |
| `expo-sqlite` | ~16.0.10 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-status-bar` | ~3.0.9 | `packages/expo-status-bar` | 待逐项核验 |
| `expo-store-review` | ~9.0.9 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-symbols` | ~1.0.8 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-system-ui` | ~6.0.9 | `packages/expo-system-ui` | 待逐项核验 |
| `expo-task-manager` | ~14.0.9 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-tracking-transparency` | ~6.0.8 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-updates` | ~29.0.20 | 未纳入本仓库顶层源码 | 暂缓（DEFER-UPDATES）；仍登记来源和公开能力 |
| `expo-video` | ~3.0.16 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-video-thumbnails` | ~10.0.8 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `expo-web-browser` | ~15.0.11 | `packages/expo-web-browser` | 待逐项核验 |
| `jest-expo` | ~54.0.18 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `lottie-react-native` | ~7.3.1 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `react` | 19.1.1 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `react-dom` | 19.1.0 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `react-native` | 0.82.1 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `react-native-bootsplash` | ^6.3.10 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `react-native-gesture-handler` | ~2.28.0 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `react-native-get-random-values` | ~1.11.0 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `react-native-keyboard-controller` | 1.18.5 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `react-native-maps` | 1.20.1 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `react-native-pager-view` | 6.9.1 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `react-native-reanimated` | ~4.1.1 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `react-native-safe-area-context` | ~5.6.0 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `react-native-screens` | ~4.16.0 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `react-native-svg` | 15.12.1 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `react-native-view-shot` | 4.0.3 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `react-native-web` | ~0.21.0 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `react-native-webview` | 13.15.0 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `react-native-worklets` | 0.5.1 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `react-server-dom-webpack` | ~19.1.4 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `sentry-expo` | ~7.0.0 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `unimodules-app-loader` | ~6.0.8 | 未纳入本仓库顶层源码 | 待逐项核验 |
| `unimodules-image-loader-interface` | ~6.1.0 | 未纳入本仓库顶层源码 | 待逐项核验 |

## 6. 分批交付和验收

- M0：补齐完整上游包/模板/命令/插件来源，生成结构化清单与差异校验；本初始种子表不能代替此门禁。
- M0A/M1：先关闭创建、基础平台识别、配置核心和插件机制条目；M0A 最小运行链路不依赖 M5；单个第三方插件只证明扩展机制。
- M2/M3：关闭工程生成与通用模块接入契约，覆盖增删包、传递共享依赖和残留插件。
- M4：关闭首批 14 个 Expo 包和 Screens 衍生包的必达能力；明确转入 M7 的条目保持未完成，不据此关闭全量 SDK。
- M5/V/M6：完成标准命令、AI 端到端构建门禁、诊断、升级和受控发行维护机制的阶段验证；SDK54 旧兼容代码清理，SDK52 原流程回归。M5 以 blank-typescript 的完整链路为必达，default 尚缺的 M7 模块依赖保持未完成，不能替换模板通过。
- M7.1-M7.6：按依赖批次完成全量评估并关闭本轮 Expo 包、内置插件、公共代码和全部公开 API，各批独立实现、测试、设备验证和交付发布物；Expo Go/EAS、expo-updates 和 expo-dev-client 等明确暂缓项只登记，不计完成。
- M8：本轮范围清单关闭后，使用最终受控发行组合完成两模板/两包管理器 AI 端到端矩阵、标准命令、跨平台回归与 SDK54 解耦复核；expo-harmony-cli 仅服务 SDK52。

受控发行通过即可按本项目规则关闭相应条目；上游是否合入或官方是否发布不构成阻塞，也不据受控发行结果宣称官方已支持。

