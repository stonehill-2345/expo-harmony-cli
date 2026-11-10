# SDK54 A：范围证据重放与 Core 原生专项验收

日期：2026-10-30。人员 A，工作区 `/Users/zhansh/project/expo-harmony-cli-a`，分支 `feat/sdk54-a-modules`，共同基点 `19a0375cff7e0ef3bc62d54fd5ed57b913bb2000`。本轮修改未暂存、提交或发布。

**结果：重建来源已可用于继续核对 M4 范围；Core 已知契约的独立原生专项通过。A-01 和 A-02 均为 PARTIAL，M4 仍为 0/7。** 本轮没有最终发行候选或 HAP，不构成 default 首页恢复、完整 Core 模块或阶段通过。

对应[双人规划](../superpowers/plans/2026-10-29-sdk54-ab-parallel-delivery.md)的 A-01、A-02，续接[A 首批记录](2026-10-29-sdk54-a-first-batch.md)与[来源重建报告](2026-10-29-sdk54-source-evidence-reconstruction.md)。总规划与阶段台账由 B 更新，本报告为 A 提供的实际结果。

## 1. 计划与实际结果

| 步骤 | 验收方法 | 实际结果 |
| --- | --- | --- |
| 复核来源并恢复插件/成员范围关系 | 固定 Git 源码重放、工件字节比较、缺项/哈希负例 | PASS，仅来源关系；历史能力映射与最终公开闭包未恢复 |
| 核对当前源码相对官方基线的变化 | 九包双向比较，逐项记录差异与 M4 验收 ID | 17 个变更、4 个新增文件已复核；新增枚举 5 个函数参数/类型参数 |
| 运行 Core 原生专项 | 当前源码全新 Debug/Release 编译，部署哈希、逐项 PASS 集合、远端退出码检查 | 两配置各 runtime 20/20、async 8/8；Hermes 基础求值各另通过 1 项 |
| 复验宿主契约和 RNOH 接口 | 真实插件配置、Platform 类型检查、RNOH Package 编译 | 宿主最终 15/15；RNOH 0.82.30 编译检查通过 |
| 封存结果并交接 | 命令、源码快照、二进制、日志与 SHA-256 清单 | 见本轮证据目录和交接单；完整集成仍待后续执行 |

## 2. 来源与范围

官方 Expo SDK54 固定提交 `5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`，树 `5457e824b21d968e55c8f533cdf1751860160a92`。输入位于 `outputs/sdk54/ai-e2e/20261029-a-evidence-rebuild/`：

| 工件 | SHA-256 |
| --- | --- |
| public-surface.json | `6beb636b564eea1a7d86f54f508b4c4e7a6acc5b02e54e153714c5be49fc83ff` |
| source-census.json | `f25f181b03d267d1e67b4d8791024dc457a7ba1a7a80dfd51c5fd722f30b848c` |
| public-dispositions.json | `00c8f7f12efacaf2867c32fb8bdd8159e4e68f966568e7e7b57275209e4b2c0d` |

新增 A 专用工具 `scripts/sdk54/a-m4-evidence.mjs`，复用现有构建器，不修改 B 所有的公共工具路径/哈希。插件类型契约从上述 Git 源码重放；声明以文件与实际位置关联，不能只按同名符号匹配。202/202 插件来源契约完成关联，保留 1,091 个具体选项路径；`harmonySupportAccepted=false`。

Core/Router 的成员关系通过有限语义图遍历生成，每个可达类型保存公开根和路径见证。5,407 个成员候选中，3,853 个公开可达，其余 1,554 个归入相对于该图的实现类型上下文。后者对应历史报告中两类上下文的总数，但本轮未重建其旧分类理由、能力 ID 或最终公开闭包。未解析类型可能隐藏成员，不能据不可达结果宣布无公开义务。

M4 范围共 7,724 条来源记录：M4_REQUIRED 2,864、M7_TRANSFER 3,093、SOURCE_CONTEXT 1,767，UNDECIDED 为 0。它们包含重叠来源和条件入口，不是独立 API 数或功能通过数。分类复用现有规则，是待完成候选核对的范围草案；`ready=false`、`complete=false`、`historicDecisionsRestored=false`。

`plugins`、`scope` 两步重新生成的五份主工件与首次结果逐字节一致。新增只读 `check` 从来源重建后比较已保存工件；实际工件负例删除公开成员、删除当前新增成员、篡改来源哈希、删除插件选项均退出 1。工件原字节在每个负例后恢复，错误工件另以 gzip 保留。

## 3. 当前源码差异复核

九包当前来源比较：389 个一致、17 个变更、4 个新增、0 个缺失。完整文件/哈希/解释见 `current-source-review.json`，实际差异见 `current-source.diff`。

| 变化 | 关联验收 | 本轮结论 |
| --- | --- | --- |
| 九包 package.json 的 private 字段 | M4-A07 | 未改变包版本或公开 API；发行机制仍需 B 核对 |
| Core Platform Harmony 类型及 global 平台说明 | M4-A06/A07 | 首批声明同步修复复验通过；不证明最终包新鲜度 |
| Linking openURL 的 void 成功值归一 | M4-A04 | 来源变化已核对；当前候选设备回归待执行 |
| Router Harmony 路由后缀、原生 dismiss 分支 | M4-A04 | 来源变化已核对；嵌套路由与设备返回待验 |
| Router app.plugin.js 包装 | M4-A04/A07 | 真实插件宿主夹具确认 JS 配置保留，原平台 mods 存在 |
| Splash app.plugin.js 配置映射 | M4-A03/A07 | 真实插件夹具确认浅/深色资源、Harmony 覆盖优先级、无效资源/宽度拒绝；iOS legacy fullscreen 不计 Harmony 支持 |
| WebBrowser Harmony 认证分支和会话限制说明 | M4-A05 | 来源变化已核对；真实会话/取消/销毁待验 |
| Core 两个 Harmony 入口、Router _ctx 与 native-dismiss 四个新增文件 | M4-A06/A04 | 源码与显式导出纳入范围；不计完整当前签名/原生面覆盖 |

相对历史 7,719 条记录新增的五条，是 `requireNativeViewManager` 的 `moduleName`、`viewName`、类型参数 `P`，以及 `emitHarmonyNativeDismissTo` 的 `action`、`navigationState`；分别关联 M4-A06、M4-A04。这是补充枚举，没有新增产品功能。

## 4. Core 原生专项

- 设备：本轮启动已有 **nova 16 Pro**，coldboot 保留数据；HDC `127.0.0.1:5555`，aarch64，系统 `emulator 6.0.0.130(SP7DEVC00E130R4P11)`，API 22。
- 工具：DevEco Native SDK `6.1.1.125` / API 24，Clang 15.0.4，真实 RNOH `0.82.30` 解包依赖。构建 SDK 版本不等于声明最低平台兼容性。
- 当前 A 源码在独立 `native-debug`、`native-release` 目录从头编译，不复用历史测试程序；部署两个可执行文件、libjsi、Hermes 和 libc++，逐文件核对远端 SHA-256。
- 2026-10-30 09:27:49—09:27:50（北京时间）完成四次测试执行；每次检查当前源文件列出的用例名完整有序出现、计数、无 FAIL 和唯一 `EXPO_CORE_TEST_EXIT=0`，不能只信 HDC 的宿主退出码。

| 配置 | Runtime | Async | 远端退出码 |
| --- | --- | --- | --- |
| Debug | 20/20，另有真实 Hermes 求值 PASS | 8/8 | 两次均 0 |
| Release | 20/20，另有真实 Hermes 求值 PASS | 8/8 | 两次均 0 |

覆盖真实模块注册/初始化失败回滚、视图配置与事件名归一、退订、SharedObject/SharedRef 身份及重复释放、GC、跨 runtime 隔离、销毁清理、线程异步成功与编码错误、取消和晚回调丢弃。异步夹具使用确定性的测试 CallInvoker 队列，未验证 HAP 中 RNOH 实际队列。

另以真实 RNOH 头文件和 CMake target 编译 `expo_core_package_compile_check`，通过 PackageProvider 调用和 GlobalJSIBinder 接口检查；这是编译检查，不是完整原生链接或应用运行。

`native-acceptance.json` 记录源文件、二进制和结果；`native-source-snapshot.tar.gz` 保存源码快照；`native-compiler-inputs.json` 记录实际编译依赖及工具共 1,406 项。所有命令和日志单独保存。此证据绑定本轮独立测试二进制，没有最终模块 tgz、兼容 HAR 组合、npm/pnpm 消费或 HAP 身份。

09:31:40 已清除本轮专属设备目录 `/data/local/tmp/expo-core-a-20261030`，停止本轮启动的模拟器，HDC 恢复 `[Empty]`。未安装/替换应用，没有创建端口转发。本轮构建与设备执行不作为性能采样。

## 5. 宿主结果与保留的失败

最终 `final-host-tests-green.log` 为 15/15：四个新成员/插件关联测试、七个现有插件契约测试、两个真实 default 插件测试、两个 Core 声明检查。

首次合并运行遗漏 `EXPO_HARMONY_CONSUMER_NODE_MODULES`，两个声明检查按设计拒绝缺少真实 React Native 类型环境；`final-host-tests.log` 保留 13/15。补设为 `/Users/zhansh/project/sdk54-prebuild-perf-20261029/project/node_modules` 后通过，没有据此修改产品代码或降低检查条件。此处默认检查 A 工作区声明，不是新发行包验收。

实际工件负例脚本首次在选择插件选项时未处理 `strictExpansion=null`，前三个范围负例已完成，第四个尚未修改工件便失败。保留原脚本和失败说明，修正测试脚本后单独执行第四个负例并确认拒绝。该脚本错误不计为产品缺陷，也不冒充负例成功。

## 6. 剩余任务与交接

| 责任 | 下一项 | 通过条件 |
| --- | --- | --- |
| A：A-01 | 对当前变更签名、生成 JS/类型、原生入口及候选包做双向核对，补能力/验收映射 | 不以本轮零未分类项代替完整冻结；保留尚未恢复的闭包限制 |
| A：A-02 | 实际 Fabric/ArkUI 挂载卸载、失效视图调用、错误桥接和应用 reload | 真实 HAP 内固定用例全集，旧 runtime 回调不泄漏，Debug/Release，绑定新候选与设备日志 |
| B：A-B-02/03 | 生成新鲜度门禁、Core 兼容 HAR 与完整组合，npm/pnpm 独立消费 | 正式候选哈希、安装解析及源码/类型一致；类型专用包不能充当完整 Core 候选 |
| B：A-B-01/04 | 公共工具显式绑定新证据；更新总规划与结果登记 | 不回填历史路径，不把本轮有限图冒充旧 final-public-closure；保留 PARTIAL/NOT_RUN |

A 可以继续已明确的 Core 契约与模块开发。A-01 的完整范围/候选冻结和 A-02 的完整集成验收仍不能关闭；Font/Asset、系统 UI、Linking/Router、WebBrowser 未因本轮测试自动通过。ExpoImage/default 仍是已知后续阻塞，本轮没有修改它，也没有进入 M7.4 交付。

## 7. 重放与证据入口

本轮目录：[outputs/sdk54/ai-e2e/20261030-a01](../../outputs/sdk54/ai-e2e/20261030-a01/)。主要入口：`scope-summary.json`、`scope-seeded.json`、`current-source-review.json`、`artifact-replay-checks.json`、`native-acceptance.json`、`native-device-commands.json`、`rnoh-commands.json`、`evidence-manifest.json`。归档与 SHA-256 见同目录的 `evidence-bundle.json`。

从 A 工作区运行来源重放（需要前轮重建源码及依赖）：

```sh
node --max-old-space-size=6144 scripts/sdk54/a-m4-evidence.mjs check \
  outputs/sdk54/ai-e2e/20261029-a-evidence-rebuild \
  outputs/sdk54/ai-e2e/20261030-a01
```

`native-build-commands.json` 保存实际构建参数，`run-native.py` 保存部署/运行步骤。设备已释放；后续重跑应使用新一轮目录并重新记录设备身份，不能覆盖本轮已封存结果。
