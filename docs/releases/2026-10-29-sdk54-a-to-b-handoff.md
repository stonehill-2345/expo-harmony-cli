# SDK54 A → B 首批交接单

## 2026-11-10 当前交接

本机 A 已提交为 `0fcde72`，包含 B 合并提交 `5526a30`；7 项审查修复仍未暂存。最新源码快照、15 个正式命名候选、原始证据与复核边界统一见 [本轮交接单](2026-11-10-sdk54-integrated-handoff.md)。下面所有“未提交”、旧候选、NOT_RUN 和缺失记录均为对应日期的历史快照，不代表当前总进度。

## 2026-10-29 历史快照

日期：2026-10-29。状态：本地待 B 接入，未发送外部消息。执行与证据详见 [A 首批记录](2026-10-29-sdk54-a-first-batch.md)。

后续更新：用户确认来源工件丢失后，A 已从官方固定 SDK54 源码重建 `public-surface.json`、`source-census.json` 及上游语义图，并通过现有公开范围裁定构建器生成新 `public-dispositions.json`。见[重建报告](2026-10-29-sdk54-source-evidence-reconstruction.md)。请使用新目录/哈希，以下首次执行时的缺失记录继续保留；历史范围决议、插件契约和成员闭包仍需补齐，A-01 尚未关闭。

共同基点：`19a0375cff7e0ef3bc62d54fd5ed57b913bb2000`。A 分支 `feat/sdk54-a-modules`，工作区 `/Users/zhansh/project/expo-harmony-cli-a`。改动未暂存/提交；B 不应假设分支名已包含可 cherry-pick 的提交。

## 2026-10-30 增量交接

同日后续已完成 [Core HAP 四组合专项](2026-10-30-sdk54-a-core-hap-acceptance.md)：npm/pnpm × Debug/Release 各首次 50/50、三次 public reload 每次 50/50，两种 Release 离线冷启动 50/50。固定 Core 候选 SHA-256 为 `8ea209c457f34f3dcc178387baded2fecb2dfd66a82a60c461f0a4579f652523`，与下文较早的独立二进制专项分开记录。

本批新增两项修复：Core 设备 checker 检查准确用例名和每轮生命周期证据；Core 示例 bundler 从声明依赖的 Metro config 包解析 Metro，修复 pnpm `MODULE_NOT_FOUND`。修改均在 Core 包内。设备交互有一次注入点击未触发 API、再次点击才成功，原因尚未确定；保留失败记录，不将它写成已修复。完整证据在 `outputs/sdk54/ai-e2e/20261030-a02-v2/`。

A-B-02/03 已有本地源码候选的真实双包管理器、类型及四 HAP 证据，但 B 的正式发行组合/新鲜度门禁仍需接入。A-01 全量冻结、A-02 总任务的完整范围与正式组合复核仍未关闭。请 B 将本报告结果登记到总规划，并保留上述边界和异常。两款本轮 Release 测试应用已停止并保留，模拟器已释放。

此前独立二进制专项结果见 [A 范围与 Core 专项验收](2026-10-30-sdk54-a-scope-core-acceptance.md)，证据目录 `outputs/sdk54/ai-e2e/20261030-a01/`。以下条目为较早快照，NOT_RUN/缺失项保留为历史；Core HAP 的当前结果以上方四组合专项报告为准。

- A-B-01 已补来源插件契约及有限成员可达关系：202/202 插件、1,091 条选项路径；M4 范围 7,724 条、零未分类。历史能力映射/最终闭包仍未恢复，当前生成物/原生面/发行包闭环仍缺，A-01 保持 PARTIAL。请勿将 `member-reachability.json` 当作 `final-public-closure.json`。
- 新增 A 专用 `a-m4-evidence.mjs check` 可从固定源码重放，拒绝删成员、删选项和改哈希。公共工具应由 B 接入新路径及身份，不覆盖旧工件或绕过旧哈希检查。
- Core 在 nova16 Pro 的当前源码独立二进制：Debug/Release 各 runtime 20/20、async 8/8，远端退出 0；原生动态视图配置、事件、资源、异步取消与 runtime 隔离从准备状态推进为专项 PASS。实际 Fabric 视图生命周期、RNOH 调度/错误桥接、HAP/reload 仍 NOT_RUN，A-02 保持 PARTIAL。
- RNOH 0.82.30 Package 编译检查通过，宿主最终 15/15；声明测试绑定 A 工作区，不能代替 A-B-02/03 的最终 tgz/兼容 HAR 与 npm/pnpm 实装检查。
- A 本轮未修改公共 catalog/打包器/锁文件/台账。请 B 在总规划第 10 节按上述边界登记结果。M4 维持 0/7，default/ExpoImage 未解阻。
- 本轮设备目录已清理，模拟器已停止，HDC `[Empty]`，无本轮转发或应用占用；B 可以安排后续设备/性能时段。

## 交接请求

| ID | B 负责的具体工作 | A 提供/继续负责 | 完成条件 |
| --- | --- | --- | --- |
| A-B-01 | 恢复或重建公开关系/插件契约/成员来源输入，公共范围工具支持绑定这些真实输入 | 611 条部分清单、缺失日志、九包 hash；A 继续范围裁定 | 新证据路径、来源版本/hash 可核验；不回填旧路径冒充恢复；A 可重放全量比较，未知项保持未裁定 |
| A-B-02 | 给 Core 发行打包增加受控生成或新鲜度门禁，接入本次回归 | Core 声明及 map 的同步修复、`harmony/tests/platform-declaration.test.mjs` | 旧候选检查必失败；新最终 tgz 接受 Harmony、拒绝非法平台键；源码变化不能悄悄沿用旧声明 |
| A-B-03 | 正式组装 Core 兼容 HAR 与全部候选，运行 npm/pnpm 独立消费者 | A 复核模块源码/类型及设备断言 | 记录最终 integrity、安装包管理器、消费解析、设备/HAP；不得使用 `a-types-only.tgz` 作为完整发行证明 |
| A-B-04 | 将 A 本轮实际结果接入统一报告与总规划；保存被 Git 忽略的证据 | A 复核结论 | 保留 RED、PARTIAL、BLOCKED、NOT_RUN；M4 不因声明单点 PASS 关闭 |

### A-B-01 缺失清单与复现

公共工具完整模式目前在读取以下输入时即失败：

`outputs/sdk54/ai-e2e/20261027-m0-final-closure/public-dispositions.json`

关联的 `final-public-closure.json`、`public-surface.json`、`plugin-contracts.json` 与旧 `scope-reviewed-*.json` 也未找到。重建程序还依赖固定来源索引/源码，不能仅创建空 JSON 消除 ENOENT。

```sh
node scripts/sdk54/m4-scope-inventory.mjs \
  --output outputs/sdk54/ai-e2e/20261029-a01/a/m4-full-scope.json \
  --with-public --with-contracts --with-members --with-closure \
  --with-current --with-current-public --with-current-additions --seed
```

预期当前退出 1；本轮证据为 `scope-full-blocked.log`。A 未改动 B 所有的范围工具、打包器、catalog、根清单或台账。

## A-02 契约与验收准备

以下是从当前源码和现有夹具核对的入口，不是完整公开契约冻结，也不表示原生行为已经复验。没有新增中央模块名单。

| 场景 | 当前入口/可复用用例（相对 Core 包） | 要求 B 保留的断言/证据 | 本轮结果 |
| --- | --- | --- | --- |
| 动态视图注册 | `src/NativeViewManagerAdapter.harmony.tsx`；`harmony/tests/RuntimeTest.cpp` | `expo.getViewConfig` 来自原生注册；`Probe` 默认视图属性 `label`、事件 `onValue` → `topValue.registrationName`；命名视图 `Named` 属性 `value`；缺失返回 null、重复/非法事件注册拒绝 | 源码核对；原生 NOT_RUN |
| 缺失视图 | `requireNativeViewManager(moduleName, viewName)` | 缺配置抛 `Native Harmony view is not registered: <module>/<view or default>`；保留 `ExpoImage/default` 原失败，不以删页/shim 替代 | 源码核对；设备 NOT_RUN |
| 挂载/卸载与异常清理 | `harmony/example/tests/view-lifecycle.test.cjs` | mount 读取实际 tag；unmount 先撤销 binding 后清 tag；hook 抛错仍清 tag | 宿主 2/2 PASS；Fabric/ArkUI NOT_RUN |
| 原生视图方法失效 | `harmony/src/main/cpp/ExpoModulesCoreViewBinding.cpp` | 卸载/绑定失效后拒绝；原生组件失效错误 `ERR_VIEW_UNMOUNTED`；独立设备上验证原实例不可继续调用 | 源码核对；设备 NOT_RUN |
| 平台、模块、安装器、编码错误、资源重复释放 | `harmony/example/core-boundary-tests.ts` | `EXPO_CORE_BOUNDARY_RESULTS=` 内固定 5 项全部存在且 passed；特别是 `ERR_CORE_ASYNC_PROBE`/message 不丢失、保留外部 owner 时 release 撤销 JS binding | 夹具核对；设备 NOT_RUN |
| runtime 隔离/销毁与资源 | `harmony/tests/RuntimeTest.cpp` | 独立 runtime、外部持有 state、重复释放与销毁后资源清理；当前二进制实际 test 数 + `CORE_TESTS_PASSED` + 远端退出码 | 夹具核对；设备 NOT_RUN |
| 异步失败、取消、销毁后回调 | `harmony/tests/AsyncTest.cpp` | 真实 Hermes 与 OS 线程；失败/转换异常、取消/晚回调、runtime 销毁后无 JS 回调；不把 queue 替身扩写为完整 RNOH CallInvoker 验收 | 夹具核对；设备 NOT_RUN |
| HAP 集成与 reload | `harmony/example/App.tsx`、`interop-tests.ts`；`harmony/README.md` 原生构建说明 | 真实应用的 `EXPO_CORE_EXAMPLE_RESULTS=`、`EXPO_CORE_INTEROP_RESULTS=`，固定用例集合，Debug/Release 与 reload 前后身份、截图、日志及 HAP/hash | NOT_RUN |

B 的统一 runner 尚未在本轮验收；上述日志前缀只能作为输入，不能以搜索到一行 PASS 判断阶段通过。需检查缺项、重复、失败、超时、设备身份和候选身份。

## 下一次协作边界

- A 继续维护 Core/模块契约、包内修复及上述专用测试。B 在自己的 worktree 修改通用工具和汇总。
- 本轮 A 未占用模拟器、端口转发或性能构建时段。下轮先记录谁占用 nova 16 Pro、起止时间和待验候选，再开展原生/设备测试。
- A-B-01 未解除前，A-01 不关闭，依赖完整范围的 A-02 实施不视为已启动；可继续核对现有契约、准备负例与修复不依赖待裁定范围的确定缺陷。
- A 的类型候选与旧包版本字段相同但 hash 不同，禁止以版本号代替候选身份，禁止直接发布本轮类型候选。

## 2026-10-30 A-03 资源生成接口交接

Font/Asset 的运行时专项及实际结果另见 [A-03 验收记录](2026-10-30-sdk54-a-font-asset-acceptance.md)。本节是新的具体接口需求，不改变前述历史结论。当前公开 Harmony plugin 仅支持 `withHarmonyApp` / `withHarmonyModule` JSON mods；Font/Asset 的 upstream plugin 尚未声明 Harmony 支持，真实校验均返回 `HARMONY_PLUGIN_UNSUPPORTED`（本轮 `plugin-boundary.json`）。A 不会用空插件、忽略错误或直接写生成目录来绕过此缺口。

| ID | B 负责的生成器契约 | A 提供与继续负责 | 双方验收条件 |
| --- | --- | --- | --- |
| A-B-05 | 提供受生成事务管理的资源贡献入口；输入至少包含 plugin/package 身份、来源路径、内容 hash、相对输出位置与资源 owner；定义允许目录、路径规范化与冲突规则 | Font/Asset 插件的 SDK54 选项语义、资源类型与校验；接口明确后实现包内 Harmony 适配 | 相同配置重复生成无变化；配置新增/改名/替换可追溯；非法路径/冲突/源缺失明确失败且不留下半成品 |
| A-B-06 | 维护生成资源清单，定义配置删除和 plugin 移除时的清理；受保护的用户文件不能被覆盖或误删；生成失败回滚 | 字体实际呈现、内嵌 Asset 的离线读取与内容 hash 断言；构造删除/用户文件冲突样例 | 删除配置或插件只清理该 owner 的生成资源；新 HAP 不含旧资源；用户文件及其他插件资源保留；失败可重试 |
| A-B-07 | 将 A-03 包候选、实际 bundle 入口和像素门禁纳入正式发行与 npm/pnpm × Debug/Release runner | `FontAssetApp.tsx`、精确 11 项 API 用例和独立 PNG 像素检查；A 复核模块结论 | 不能仅凭页面/API `11/11` 判通过；两个自定义图标必须有真实像素并匹配 MaterialIcons home 字形、颜色/alpha/尺寸；绑定最终包、HAP、设备及启动身份 |

以上接口不要求 B 先实现 Font/Asset 包内业务。B 可并行完成事务/清单/runner，A 可继续完成格式、异常与模块行为；资源插件的端到端验收在双方接口接合后进行。完整 A-03 和 M4 不因本次运行时专项通过而关闭。

A-03 最终本地 v7 结果：宿主 33/33；nova API 22 的 npm Release 首启、3 次 reload、离线冷启动均为 API 11/11 + PNG 24/24。已修复自定义字体透明图片与额外高度问题，保留各失败候选。请 B 将总规划的 A-03 从「未开始 / NOT_RUN」登记为「进行中 / PARTIAL（运行时专项 PASS）」；声明式资源、全格式、正式四组合仍未通过。具体候选 SHA、截图和证据以 [A-03 验收记录](2026-10-30-sdk54-a-font-asset-acceptance.md) 为准。设备已释放，无转发，未发送外部消息。

## 2026-10-30 A-03 格式与错误处理增量

详见 [字体格式专项](2026-10-30-sdk54-a-font-format-acceptance.md)。新增原生解码预检，修复「结构合法但不能解码仍可能被记为 loaded」；TTF/CFF-OTF 的原生 Text 与 PNG、并发幂等、失败后重试已在 nova API 22 验证。宿主 35/35，npm Release 首次启动、3 次 reload、离线冷启动每轮 API 13/13 + 像素 21/21。TTC、WOFF/WOFF2 为实际验证的拒绝边界，不能登记为支持。A-03 继续 PARTIAL，M4 仍为 0/7。

B 接入正式候选时需同步新的 FontLoader/FontFile 与 README、包内 tests/formats 夹具，按报告绑定新 tgz/HAP 哈希；共享生成镜像、patch/catalog 与正式四组合仍由 B 维护，本轮 A 未修改。不得把新版源码能力推定为已发布版本能力。资源事务 A-B-05/06 仍未解除；设备已释放，未发送外部消息。

## 2026-10-30 A-04 SystemUI 增量

详见 [SystemUI 生命周期专项](2026-10-30-sdk54-a-system-ui-acceptance.md)。修复窗口已改变但 getter 等待 flush、逆序 flush 覆盖新值及保存失败留下旧 getter 的问题；宿主 RED 6/9 → GREEN 12/12（含颜色用例）。nova API 22 的 npm Release 在 11 个稳定点通过 getter/真实窗口像素检查，包括并发设置、深浅主题 null reset、前后台、3 次 reload、离线冷启动；状态栏仅验证主题 auto 图标。保留按钮定位及逐字节像素门禁两次失败，最终允许每通道误差 ≤1，错色反例仍拒绝。

B 接入时绑定报告中的 tgz/HAP/hash 和包内 `harmony/example/SystemUIApp.tsx`，按精确 stage、boot、PID、窗口像素和 StatusBarOracle 核验，不能只搜索 PASS。SystemUI tgz 为 `7f15082de766d735aea2cb9795f8808d55eb64eca326cdc782544895346bf6c1`；本地 Release HAP 为 `4d57deaaac99b997c170be9bf335b1c58aee5223055b178676d5aaebcd99e21b`。共享镜像、patch/catalog、正式四组合仍由 B 维护。本轮 A 未修改共享工具/总规划，未发送外部消息。

请将 A-04 登记为 PARTIAL（SystemUI 本地专项 PASS）；Splash、StatusBar 完整生命周期、Linking/Router/WebBrowser 继续未完成，M4 保持 0/7。getter 对外部窗口直接修改的观测、null/并发后的专门冷启动与真实存储故障仍为未覆盖边界。设备已释放，可由 B 安排后续时段。

## 2026-10-30 A-04 Splash / StatusBar 增量

详见 [Splash / StatusBar 生命周期专项](2026-10-30-sdk54-a-splash-status-acceptance.md)。修复淡出视图卸载后的晚回调，以及 RNOH `CONTENT_APPEARED` 早于 JS 顶层 prevent 导致官方 `preventAutoHideAsync()` 无效的问题。最终 host 16/16、StatusBar 组装 1/1；nova API 22 npm Release 通过用户/Router/自动隐藏、真实淡出像素、同进程 public reload、前后台与 StatusBar 六阶段最终属性。v1 编译失败、v2 设备时序失败均保留。

B 接入时绑定 expo-splash-screen tgz `8955730405d35e527f7051deb816f0d8fda0af42c5528a1c033fc11c18b59636`、expo-status-bar tgz `5da63fa12be1ddc954c4b7dc236da1a1aa3f5bdf7e6cefd2ea0cfb624dfe19ff` 与 HAP `09d9d1a46313323f9a016b029c31c8ef9213cfff4f71015a829dab86f937e8d5`。正式 runner 必须检查 marker 顺序、boot/PID、覆盖层像素和原生窗口属性，不能只搜索 hidden/PASS。共享镜像、patch/catalog 和 npm/pnpm × Debug/Release 仍由 B 维护。

请继续将 A-04 登记为 PARTIAL。Ability `onDestroy` 在 Back/force-stop 路径没有设备日志，保持 NOT_OBSERVED；多 RN instance marker 隔离、精确动画计时、translucency/no-op 边界和完整 Router/Linking/WebBrowser 仍未完成。M4 保持 0/7，`ExpoImage/default` 未解阻。设备已释放，未发送外部消息。

## 2026-10-30 A-04 Linking / Router 增量

详见 [Linking / Router 本地专项](2026-10-30-sdk54-a-linking-router-acceptance.md)。
Linking 主机 9/9、Router 17/17、fixture/Screens/Worklets 各 1/1；nova API 22 的
npm Release 已通过 Tabs、动态参数、push/replace、UI Back、系统 Back、404 恢复、
冷/热深链、public reload 与前后台保持。v1 Splash 构造参数编译失败、v2 reload
回到冷启动 URL 的失败证据均保留；v3 修复后同 PID reload 保持热链 `/details/7`。

最终 HAP 为 `165f48523f8f46dea74104284943a21df0d077ff94fa678f7384df3c317c815c`，
bundle 为 `3fc0d43f88cdbe19d0917ca19200f5de69e40762fd50a970cdd778d7bf99ef23`，
Screens/Worklets HAR 分别为
`78287fa54f91de5e345b88c678d47cc1b3f03f1f7af156ad899a24a4903c061b` 和
`29c396e1f71d9e4a5347e9aa7aba7040724027ce558bde5ca677ee003887fce4`。
B 的正式 runner 必须绑定这些身份并检查 boot/PID/latestURL，不得用页面文字单点代替。

请继续将 A-04 登记为 PARTIAL：WebBrowser 已由下文后续独立专项通过；设备日志仍报告
`fullScreenSwipeEnabled` 类型不一致，手势返回、Native Tabs、Drawer、sheet detents
均未验收。正式 npm/pnpm × Debug/Release 矩阵仍由 B 维护；M4 保持 0/7，
`ExpoImage/default` 仍未解阻。

## 2026-10-30 A-04 WebBrowser 增量

详见 [WebBrowser 本地专项](2026-10-30-sdk54-a-web-browser-acceptance.md)。包内/fixture
主机 19/19；nova API 22 的 npm Release 已通过真实 ArkWeb、Close、系统 Back、程序
dismiss、普通/认证并发、认证成功和错误回调、连接失败、pending public reload、前后台
及冷启动隔离。最终 v2 tgz/HAP/bundle SHA-256 分别为
`e6bbd0dbcfa45b839327adc27ae5b79b699cfd8bd4122c512bf43631fee74338`、
`3c4320c0355f33939e6cc1eaf871d9e6c97e8bb2da476bb4449c87680cb628fe`、
`c53da025ebd575609d4bb58a3d1781cc5fe60157320207f03eaac84a09007a03`。

B 接入时必须保留应用内 ArkWeb 与系统浏览器/Custom Tabs 的能力边界，并绑定上述三组
身份检查 PID/boot、精确 callback URL、错误 code、reload 前后 overlay 和无 Metro 条件。
Debug/pnpm、生产 OAuth/SSO、TLS/renderer 错误、Splash 共存叠层仍未完成；A-04 继续
PARTIAL，M4 继续 0/7，`ExpoImage/default` 未解阻。

## 2026-10-30 A-04 Screens boolean / 全屏手势增量

详见 [Screens boolean / 全屏手势专项](2026-10-30-sdk54-a-screens-gestures-acceptance.md)。
修复 `@react-native-ohos/react-native-screens@4.9.0` 在 Harmony Fabric 路径把
`fullScreenSwipeEnabled` 转成字符串的问题；src、CommonJS、ESM overlay 均仅在
Harmony 直接返回 boolean。nova 16 Pro 的 npm Release 已通过全屏长滑返回、短滑
取消、UI Back、系统 Back、public reload 与前后台恢复，全部日志均无 boolean 转换
错误。

patched Screens tgz、bundle、HAP SHA-256 分别为
`07a2a26e88ea386de175ce1c4c4d0e701faab6c32e903332792ba4dc06f39231`、
`bf1b3222c4ddd6786675c171fc10d1a517e7470d66fc8ed6451de2b4c7edae14`、
`16f3b397c5ec1c6bb32549332dc900363e2c94f39ca7fa1d102534806bb72494`。
B 的正式 runner 必须绑定专项 manifest 中的 tgz/HAR/bundle/HAP，并检查 pathname、
boot UUID、PID、错误负例和截图，不能只检查页面文字。

请继续将 A-04 登记为 PARTIAL：Screens boolean / 全屏手势专项为 PASS，但 Native
Tabs、Drawer、sheet detents 和正式 npm/pnpm x Debug/Release 矩阵仍未完成；M4
继续 0/7，`ExpoImage/default` 仍未解阻。本增量不修改已封存的 Router/WebBrowser
证据归档。

## 2026-10-30 A-04 Native Tabs 增量

详见 [Native Tabs 专项](2026-10-30-sdk54-a-native-tabs-acceptance.md)。固定 Screens HAR
已补齐 `RNSBottomTabs` / `RNSBottomTabsScreen` 的 C++ descriptor、JSI binder 和 ETS
builder 三条注册链。nova 16 Pro 的 npm Release 已真实显示 Home / Settings 原生标签栏，
并通过双向切换、public reload、前后台恢复和安全区检查。最初内容被状态栏裁切及仅改
`SafeAreaView` 仍无效的两版失败证据均保留，最终 fixture 使用显式 inset。

navigation-v3 HAR、最终 bundle、最终 HAP SHA-256 分别为
`dcccd7e52ac1615a2d74f30f32e222ae48431d748013bb2d093d24e1f522bd6c`、
`a357ba9a6457f1a68a6b86b3d1ecd3536ad29b4f4f12caeabe30874994d766e7`、
`d35734cbe6804ea6ad07581f9622d55600207350e23279114c6631ed4f7daf87`。
B 的正式 runner 必须绑定专项 manifest 中的输入与产物，检查标题 bounds、pathname、
tab index、boot/PID、精确组件名错误负例和截图；不能只检查标签栏存在。

请继续将 A-04 登记为 PARTIAL：Native Tabs 本地专项为 PASS，但 Drawer、sheet detents
和正式 npm/pnpm x Debug/Release 矩阵仍未完成；M4 继续 0/7，`ExpoImage/default`
仍未解阻。RNGH 的 `getConstants` binder 查询和 reload 旧 surface 回收日志作为非阻断
宿主观察项保留，不能与 Native Tabs 注册链错误混淆。
