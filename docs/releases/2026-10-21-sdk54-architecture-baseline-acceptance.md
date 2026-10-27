# SDK54 Harmony 架构完成路线：当前基线验收记录

日期：2026-10-21。
性质：规划前的源码核查与有限自动化验证，不是 M0-M8 阶段完成报告。
核查 revision：`22cb245f383a194b52f94127f95bce534258b8cc`。
关联：[阶段开发计划](../superpowers/plans/2026-10-21-sdk54-architecture-completion.md)、[总设计](../superpowers/specs/2026-10-21-sdk54-architecture-completion-design.md)、[覆盖清单](../superpowers/specs/2026-10-21-sdk54-platform-coverage-inventory.md)、[AI 验证设计](../superpowers/specs/2026-10-21-sdk54-ai-e2e-validation-design.md)。

## 1. 当前结论

已有 Harmony CLI、Autolinking、Core 和首批模块实现及历史发布基础；本轮架构完成条件尚未满足，M0-M8 均不能据当前证据关闭。

- 创建工具源码、完整配置核心源码与全量覆盖枚举仍有缺口。
- 配置插件执行、单一配置快照、事务生成、无状态文件的平台识别有可定位的实现缺口。
- AI 统一 runner 尚不存在；本轮未执行真实新创建工具的四项目验收、Debug/Release 构建或设备冷启动。
- 当前工具测试即使通过，也只证明已有工具行为，不证明新架构阶段完成；其中含待清理的旧 SDK54 patch 行为测试。

本文将“实际检查结果”和“后续应达到的验收结果”分开。完整预期结果见阶段计划各 `M*-A*` 用例。

## 2. 本轮实际执行结果

执行环境：本地现有 macOS 工作区；Node `v22.20.0`、pnpm `10.19.0`。本轮没有核验完整 DevEco/SDK/签名/设备环境，不宣称它们可用或缺失。下列 PASS 均仅对应本表命令的检查范围。

| 检查 ID | 实际命令/检查 | 实际结果 | 判定与限制 |
| --- | --- | --- | --- |
| BASE-01 | `git rev-parse HEAD`、`git status --short` | 核查开始时工作区干净，revision 如上 | PASS；设计与计划目录另受 gitignore 规则影响，见第 7 节 |
| BASE-02 | `pnpm type-check` | 退出码 0 | PASS；只运行 `expo-harmony-cli` 的 tsc，不覆盖全部适配包 |
| BASE-03 | `node --test scripts/sdk54/__tests__/*.test.mjs` | 重跑退出码 0；238 tests、238 pass、0 fail/cancelled/skipped/todo，耗时约 27.3 秒 | PASS；129 个顶层用例含子用例共 238 项，只覆盖当前 SDK54 工具行为 |
| BASE-04 | `node scripts/sdk54/validate-catalog.mjs` | 退出码 0；14 packages、22 internalEdges、`failures: []` | PASS；只是当前 catalog，不是固定 SDK54 全量清单；`publishable: []` 不能解释为已发布 |
| BASE-05 | `node scripts/sdk54/check-repository.mjs` | 退出码 0；publishable 为 expo-harmony-cli；forbiddenFiles、forbiddenText、failures 均为空 | PASS；这是当前仓库发布边界检查，不证明所有适配包或设备通过 |
| BASE-06 | 核对根 `package.json`、CI 与各包测试入口 | 根 build/type-check/test 主要路由到产品 CLI；另有 SDK54 工具/包审计检查，适配包也存在独立测试入口 | PASS：覆盖归属已核对；未执行所有适配包测试，不能报告全仓测试通过 |
| BASE-07 | 核对 create/config 源码目录及 AI runner 路径 | 当前顶层没有 create-expo-app、四个完整 config 核心包源码目录，也没有 `scripts/sdk54/ai-e2e/` | PASS：目录现状核查；不等于没有安装这些依赖，也不等于必须全部 fork |

BASE-02/04/05 的结果已在本会话完成收集，未单独落盘原始日志；不得将本文升级为带完整原始证据的阶段验收。BASE-03 中断前的运行未收集到最终状态，不用于判定；上述 PASS 来自完整重跑，原始 TAP 日志保存在 `outputs/sdk54/architecture-baseline-20261021/sdk54-tools.tap.log`。该输出目录按当前仓库规则忽略，证据位于本机。

## 3. 源码核查：实现缺口与对应计划

下表是静态事实，不冒充已运行的失败测试；“未完成”是能力状态，不是虚构的 FAIL 执行结果。

| 核查 ID | 源码事实与定位 | 当前能力结论 | 对应任务及后续验收 |
| --- | --- | --- | --- |
| GAP-01 | `packages/@expo/cli/src/prebuild/harmony/prebuildHarmonyAsync.ts` 调用 `getConfig` 时设置 `skipPlugins: true` | 完整插件执行未完成 | M1-03/04/05；M1-A02/03 验证独立插件真实生效及错误诊断 |
| GAP-02 | `packages/expo-modules-autolinking/src/platforms/harmony/nativeProject.ts` 的 `copyHarmonyTemplateMediaAsync` 直接读取 app.json | 动态配置与媒体单一快照未完成 | M1-01；M1-A01 用无 app.json 的 app.config.ts 验证身份/媒体/Constants 一致 |
| GAP-03 | 同文件首次生成复制媒体；已有工程同步先写身份，再删除生成区，之后重新组装 | 全量事务恢复、媒体增量更新仍需实现与验证 | M2-01/02/03；M2-A01/02/03 验证更新、故障和并发 |
| GAP-04 | `packages/@expo/cli/src/start/index.ts` 的 `enableHarmonyMetroForManagedProject` 读取 managed-state，并校验两种 SDK54 mode | 自动识别仍有旧状态文件依赖 | M0A-03；M0A-A03 删除状态文件后验证标准启动及 bundle 请求 |
| GAP-05 | `apps/cli/src/sdk54/` 仍有 create、project-state、install-patches、doctor、default-image-substitution 等职责 | SDK54 与独立 CLI 解耦及旧方案退出未完成 | M0-05、M0A-04、M6-05；M6-A04 检查实际入口/打包内容及 SDK52 回归 |
| GAP-06 | 根脚本仍有 SDK54 patch generate/audit；发行工具和旧内容之间需按调用关系拆分 | 不能直接删整个 sdk54 或 patch 目录 | M0-05、M6-04/05；先完成 SDK52 共享归属及新发行依赖分析 |
| GAP-07 | 当前覆盖文档明确为初始清单；120 项版本目录与其他种子去重为 130 项 | 固定来源的全量包/API/插件选项枚举尚未完成 | M0-01/02/03；M0-A01/02 通过完整来源双向差异检查 |
| GAP-08 | 当前没有统一 AI runner 源码 | V 自动化门禁未落地 | V-01 至 V-05；需验证真实命令、设备断言、证据及失败状态 |

后续发现具体缺陷时，先补对应的失败测试再修复。本次没有修改实现代码，也未新增为上述现状背书的文本匹配测试。

## 4. 各阶段当前验收状态

| 阶段 | 当前可引用基础 | 当前实际验收状态 | 关闭前必须补齐 |
| --- | --- | --- | --- |
| M0 | 来源 commit、初始覆盖表、现有发行 catalog、部分测试入口 | 未完成；本轮只完成部分现状核查 | 完整来源和公开面枚举、完整性工具、四矩阵现状、SDK52 基线及调用归属 |
| M0A | 现有产品 CLI 创建逻辑、Expo Harmony prebuild/run/start | NOT_RUN：新标准创建入口验收未执行 | 真实适配 create/模板、四项目创建、blank 两项目最小设备运行、无状态依赖 |
| M1 | Expo 配置读取与局部配置生成 | 未完成；动态配置/插件设备验收 NOT_RUN | 快照、类型/schema、Harmony provider、第三方插件真实消费 |
| M2 | 模板、生成区和原生链接生成实现 | 未完成；故障恢复/并发/clean 验收 NOT_RUN | 归属、事务、幂等、增量资源、恢复和发行前兼容修复 |
| M3 | Expo/RNOH 元数据、Core 模块/view 基础 | NOT_RUN：中央名单外第三方模块完整验收未执行 | 元数据/冲突契约、作者范例、安装/移除/重装和生命周期设备验证 |
| M4 | 首批模块实现与历史发布/设备资料 | NOT_RUN：当前候选物的逐 API/插件验收未执行 | M4 必达清单、运行时及插件闭环、转交 M7 条目和当前产物证据 |
| M5 | 既有 Metro/Debug/Release/设备编排 | NOT_RUN：新路径标准命令与四构建运行门禁未执行 | blank 两包管理器完整验收、default 已具备步骤、工具链及设备结果判定 |
| V | 验证设计及部分旧工具测试 | 未完成；统一 runner 未实现 | V 分期设施、设备驱动、报告与必达缺失阻断 |
| M6 | release catalog、确定性打包及历史安装测试 | NOT_RUN：新方案维护/回退/清理验收未执行 | 统一规则、原子依赖维护、候选一致性、旧代码退出和 SDK52 回归 |
| M7.1-M7.6 | 初始分批范围与首批源码 | NOT_RUN：全量逐项验收未执行 | 准确包/API/插件清单、本轮适用项实现/测试/设备/发行关联 |
| M8 | 总设计中的最终验收条目 | NOT_RUN：所有前置阶段尚未关闭 | 最终四项目、八首次构建运行案例及全部生命周期/回归用例 |

未执行不能改写成 BLOCKED：本轮没有实际进行设备/签名前提检查，不能断言“无设备”或“无签名”。后续执行确认前提确实缺失时，再为具体用例记 BLOCKED 并附原因。

## 5. 历史证据可引用范围

| 历史记录 | 记录的结果 | 当前使用限制 |
| --- | --- | --- |
| `docs/releases/2026-10-10-sdk54-expo-oh-readme-release.md` | 15 个 @expo-oh 包发布及完整性核验；四组严格安装/重装/运行探针；工具测试 238 项、发布测试 7 项 | 只引用当时组合与产物；不是本轮重跑结果，也不能关闭新 create/插件/全量模块验收 |
| 同上及 `docs/releases/sdk54-expo-oh-harmony.1.json` | 新旧运行时代码比较，设备证据按既定等价条件沿用首轮 | 当前未重新核验等价关系，不能把历史设备记录标为当前 revision 的设备 PASS |
| 同上“产品 CLI 边界” | 产品 CLI 1.6.0 默认 harmony.0，运行时发布为 harmony.1 | 两清单有独立推进边界；M6 统一 promotion 策略，不自动强迫项目回退 |
| 同上“已知工具表现” | default install --check 对导航依赖合法版本区间有历史误报 | 当前未重新运行消费项目复现；M0 先补最小失败测试，不能声明已修复 |

历史“15 包发布”与本轮 catalog 校验“14 包”覆盖对象不同，不可混作全量完成数量；Screens 衍生包的发行记录亦不能证明全部 Expo 包/API 已支持。

## 6. 下一次可验收的具体交付

首轮优先交付 M0，其后是 M0A 与 M1 的纵向闭环：

1. 取得并核定完整来源；形成可重建、可校验的包/API/插件选项清单及 hash，删除记录可被校验发现。
2. 完成 SDK52 原流程回归、旧代码共享调用归属及 SDK54 四矩阵现状，补版本区间误报失败测试。
3. 从真实 create/模板候选直接创建四项目，blank 两项目设备运行，删除 managed-state 后仍能启动。
4. 无 app.json 的动态配置生成正确身份/图标/Constants；独立插件实际修改 Harmony 配置，无 CLI 中央名单改动。

这些交付分别引用阶段计划 M0-A01 至 M0-A05、M0A-A01 至 M0A-A05、M1-A01 至 M1-A04。完成后新建带原始日志、发布物 hash 和适用设备证据的阶段报告，不覆盖本基线。

## 7. 产物与保存说明

- 开发计划按约定保存在 `docs/superpowers/plans/2026-10-21-sdk54-architecture-completion.md`。
- 当前 `.gitignore` 第 14 行忽略 `docs/superpowers/`；计划已在本机落盘，但不会出现在普通 `git status` 中。未修改忽略规则、未强制暂存、未提交。
- 本记录保存在 `docs/releases/`；后续阶段报告与大体积执行证据分别保存，路径及保留策略见计划第 14 节。
- 本次源码事实和有限检查足以确定开发顺序；不足以给出完成百分比、最终交付日期或设备通过结论。
