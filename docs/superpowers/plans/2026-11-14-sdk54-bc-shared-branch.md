# 1.7.0 B/C 同分支并行交付计划

> **历史参考，停止作为执行任务单。** 已由 [1.7.0 B/C 收敛开发执行计划](2026-11-14-v1.7.0-bc-execution.md) 取代。下文任务编号、人员限制、阶段前置及报告要求不得自动继续执行；仅按新计划按需引用技术事实、原契约与证据。

> **最新版本范围（2026-11-14，用户已确认）：** 先读 [1.7.0 支持范围与收敛交付计划](2026-11-14-v1.7.0-delivery-scope.md)。1.7.0 交付完整标准开发流程与明确首批能力；全量 M7/M8 转为后续路线。新计划覆盖本文冲突的范围、执行顺序及报告要求；范围内质量门槛不降，历史失败与阶段状态不改。下文旧全量要求不再直接作为 1.7.0 发布门槛。

> 执行方式：B/C 各自按本计划执行已分配任务；可使用 executing-plans，不自动创建子代理、不自动联系另一会话、不自动提交。此计划覆盖旧文档中的人员、工作区和先后分工；原范围、性能与证据门槛不变。

**目标：** 完成 SDK54 Harmony 新架构约定范围及 M8 最终验收，而不是只关闭当前 M4。
**架构：** 同一分支协作，具体文件唯一写入者；B 负责产品与执行采集，C 负责独立验收与公开关系。源码共享不等于共享消费者或复用验收结论。
**工具链：** Node22.20.0、pnpm10.19.0、Python3、DevEco SDK/HDC。
**依据：** `../specs/2026-10-21-sdk54-architecture-completion-design.md`、`2026-10-21-sdk54-architecture-completion.md`、`../../releases/sdk54-abc-20261111/COMMON.md`、`BC-20261113.md`、最新 result/commands 原件。

## 目标与范围

- 适配版 create-expo-app 和标准 Expo install/prebuild/run/start/export/config 原生支持 Harmony；SDK54 不依赖独立 expo-harmony-cli、创建后 patch/源码替换/shim 才启用平台。
- 应用开发、模块作者接入、维护发行三个闭环；新增模块无需修改 CLI 或 Autolinking 白名单。
- 固定 SDK54 全量包、公开 API、组件属性/事件、内置插件逐项评估；约定适用项实现并验收，M7 转交不是豁免。
- default 与 blank-typescript，npm/pnpm，Debug/Release；资源、导航、生命周期、reload、错误与恢复均有真实证据。
- SDK54 仅新方案；SDK52 保留现状及共享能力。受控 scoped 包/alias/overrides/tgz 合法，不要求 Expo 官方合入。
- 明确暂缓：Expo Go、EAS、expo-updates、expo-dev-client、云发布自动化、SDK55+ 等总设计明确排除项。不把新增缺实现自行改为暂缓。

## 开工现场

2026-11-14 只读核对原工作区 `/Users/wum/2345/expo-harmony-cli`：分支 `feat/sdk54-a-modules`，HEAD `abfcd1e`，已有 C 修复已提交。开工重新核对，不能假定 HEAD 不变。
旧候选仍绑定 `5971df0`，不可把工作分支 HEAD 变化自动当作新候选；验收工具变化本身不要求产品重冻结。
最新本机记录 `outputs/sdk54-abc/20261114-C-status-boot-review/`：1461 pass/0 fail/20 skip；公开面 Metro 4条差异 + scope incomplete；HDC 无目标。不是最终通过。

## 文件唯一写入者

| 负责人 | 独占写入范围 |
| --- | --- |
| B | 产品 packages/**（含原 A 模块/native/plugin/包内测试、Screens 转换器）；apps/cli；根 package/lock；catalog/release/打包安装/benchmark；ai-e2e run/process/preflight/device/registry/run+case schema 及对应测试 |
| B | abc/b-* 与原 A 准备/采集/契约工具及相应测试，除下列 C 例外；COMMON/阶段台账由 B 串行维护 |
| C | abc/c-*、公开关系/来源/范围重建工具及测试；a-verify-device/image/default 与已接管证据测试；ai-e2e report/evidence/results schema 及对应测试 |
| C（明确例外） | abc/b-run-m4.mjs、__tests__/abc-b-m4-runner.test.mjs、abc/check-other-log.cjs、abc-c-other-log.test.mjs、abc-other-log-fixtures.mjs、c-m4-replay-contract.md |

B 不改 C 断言以通过；C 不修产品绕过失败。双方只读复核对方，不同时编辑同一文件。新归属不明文件先在执行单明确唯一负责人。

## 第一批 Must：立即并行

### B-01 产品与采集链（不等待 C 新报告）
- [ ] 读取现有 Metro 差异、真实设备问题及本轮 checker 三项修复，先复核规则与夹具是否一致；只读给出具体差异。
- [ ] 审计 build/src 生成链并准备 Metro 最小修复、影响范围和复现；此前保留 blocker 的决定继续有效，不擅自换基线/改产品。需要改变该决定时一次提交具体方案供用户决断，其他任务继续。
- [ ] Other 采集按现有多应用夹具逐 case 输出，保留每项真实 bundle/PID/HAP/boot/target；不要为迁就单身份清单新增合并应用。
- [ ] 负责采集/producer、run manifest schema 和命令计划；恢复可获得的截图、layout、hilog 原件；缺历史原件则准备按现契约重新采集，不伪造历史 PASS。
- [ ] 继续资源/Sheet/Drawer/方向/default/ExpoImage 已知产品缺口的复现及最小修复，完善 M5 命令与性能执行链。
- [ ] 每个可验收单元立即交付候选身份/原件清单，不等整个矩阵完成才交 C。

### C-01 验收与公开关系（不等待新候选或设备）
- [ ] 继续逐项核对 Other 真实语义与夹具；优先真实假 PASS/误拒绝，先红测后修复，禁止按合成日志反推产品契约。
- [ ] 多应用绑定按稳定 case ID 解析对应 capture；保留 Core 单应用入口和历史 fail-closed。缺任何独立身份、命令或原件不通过。
- [ ] 复用已有像素/布局/图像解码能力，明确每项截图能证明的内容；确缺原件则保留具体阻塞，不只要求找回历史脚本。
- [ ] 核对 scope complete=false 的逐条未决关系，确定性重建能恢复的项；不能直接翻为 true，不把全量适配误缩为当前包数。
- [ ] 提前准备独立消费者、重放脚本与 B 原件接收检查；只运行受影响专项，收到对应切片即可验收。

### 多应用接口：共同固定的最小约定

以 registry 原 case ID 为键建立采集引用，每个引用指向独立 capture，capture 含候选 hash、target/系统版本、bundle/PID、HAP hash、mode/bootIds、captureCwd、安装/PID/hilog命令及截图/layout引用。同一次 Splash/StatusBar 采集可被两个 case 引用，但身份必须相同。
B 写 producer/run schema，C 写消费校验，两者按本约定各自用合成结构测试开发；合成证据不写入验收 PASS。B 在 `b-*` 文档固化准确 JSON 示例，C 在 `c-*` 文档列拒绝规则。命名/版本差异只阻塞接口接合，双方继续无依赖项；不得新增通用框架。

## 同分支执行规则

- 不切换/重置/清理共同分支，不 stash 他人改动，不自动 add/commit/push。不同 checkout 的同步由现有授权流程负责；不强制新建角色分支。
- 若共用同一工作目录，B 独占 install/build/pack/生成等会写共享构建产物的操作；C 使用源码只读快照、外部临时消费者及专属输出。C 不同时执行会触发共享 build 的全量检查。
- C 验收以明确的源码快照、工具 hash、候选 hash 为准；源文件在测试期间变化则本次记录不可作为该版本最终验收。
- B/C 各用独立输出目录和消费者，不覆盖历史 JSON、不拼接旧 PASS。打包前核对变化清单；dirty 如实记录，不为冻结而自行提交。
- 同一设备串行：B 先复现/采集，C 再独立重跑；B 占设备时 C 做语义/公开关系，C 占设备时 B 做代码/文档。性能采样期间另一方停止重 CPU/IO 操作，继续阅读与审查。
- 单元完成先跑受影响检查；集成批次由 B 执行一轮完整检查，C 复核证据并运行独立验收，避免双方重复全量构建。
- 不自动联系另一会话。通过本分支文件与独立交付目录交接；用户可转交本执行单。缺对方产物只阻塞依赖它的验收项，不阻塞整个角色。

## 后续批次与汇合门

1. M4/M5/V 与性能并行收敛；第3步公开关系及专项门通过后才能正式关闭统一矩阵。
2. M6：B 主责诊断、组合更新/回退、发行事务与 SDK54 旧入口退出；C 主责冲突/中断/混装负例、SDK52 保留能力及候选身份独立验收。
3. M7：按固定清单分批。B 实现产品与各包能力；C 同步做来源/API/插件范围、契约测试和真实消费验收。不得把所有 M7 预先展开为无边界开发，也不得遗漏已约定适用项。
4. M8：B 冻结同一正式候选并提交自验；C 独立消费、设备与性能复核，分别记录功能、安全边缘、真实实跑、最终验收、阶段关闭。全部必达通过才建议交付。

Should：简化交接、修正文档陈旧状态。Could：报告便利功能。Won't：重复验证平台、为了减 blocker 改 scope/阈值、擅自实现暂缓范围、自动发布。
每轮按 COMMON 输出代码差异、commands及原始日志/hash/时间、result/requests/artifacts、replay 与完整 HTML。

## 启动提示词

B：先读本计划和总设计，再读 COMMON、B.md 与最新 C 交付。你是 B，与 C 同分支，按本计划唯一文件归属推进 B-01；产品与采集归你，b-run-m4/check-other-log及对应测试归 C。先开展不依赖 C 的产品/采集/M5/性能工作，原件切片交付，不等待全矩阵。保留既有 Metro 决断，不降门槛，不自动提交/推送/发布/联系他人。

C：先读本计划和总设计，再读 COMMON、C.md 与最新 result/原始日志。你是 C，与 B 同分支，推进 C-01；继续 Other 语义、多应用消费绑定、图像验收与 scope 关系闭合，不写产品或 B 采集器。不等待新候选；有材料即独立复算，有设备再独立实跑，两者分开。保留缺口，按 COMMON 交付，不自动提交/推送/发布/联系他人。
