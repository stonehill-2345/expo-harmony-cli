# SDK54 M0 第四轮：文档、测试入口与误报基线验收

日期：2026-10-22；run ID：`20261022-m0-validation-baseline`。

**M0 仍未关闭，完成33%（2/6）：M0-01 来源核定、M0-06 文档/测试入口/失败复现已完整交付。**
本轮 BASE-01 至 BASE-08 的基线任务验收通过；产品误报仍为 FAIL，未修复运行时代码。测试矩阵中的5组环境失败和2项未执行均保留，不代表对应模块通过验收。

## 1. 范围与来源

- 总任务：M0-06；总验收 M0-A04 通过，M0-A05 仅测试入口子范围完成，旧代码归属仍待 M0-05。
- [冻结子用例](sdk54-m0-validation-baseline-cases.json)、[进度分母与规则](sdk54-stage-progress-definition.json)、[实际进度](sdk54-stage-progress.json)。
- [设计](../superpowers/specs/2026-10-22-sdk54-m0-validation-baseline-design.md)、[执行卡](../superpowers/plans/2026-10-22-sdk54-m0-validation-baseline.md)。
- 当前适配 HEAD：`22cb245f383a194b52f94127f95bce534258b8cc`，本轮修改尚未提交；以输入快照 hash 标识具体内容。
- Expo 固定来源仍为 `5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`，tree `5457e824b21d968e55c8f533cdf1751860160a92`。
- 环境：macOS、Node `v22.20.0`、pnpm `10.19.0`、TypeScript `5.9.3`。未新增依赖、未发布 registry。
- 原始证据目录：`outputs/sdk54/ai-e2e/20261022-m0-validation-baseline/`；以下日志均相对此目录。

## 2. 实现与逐项验收

| 步骤 | 实现 | 实际验收 | 结论 |
| --- | --- | --- | --- |
| P1 / BASE-01 | `reproduce-dependency-baseline.mjs` 擦除 TS 类型后执行当前 Router doctor，读取真实 Router manifest、semver 与 debug | bottom-tabs 7.4.0、native 7.1.17、native-stack 7.3.16 均满足允许范围，普通版本谓词返回正确；Router 各产生1条误报 | 复现 PASS；产品 FAIL |
| P1 / BASE-02 | 固定11组合法/非法区间、alias、传递依赖场景；独立期望行为测试 | 11组结果与预定义一致；7项期望行为失败、4项通过；仅传递依赖明确为未检查 | 复现 PASS；不把跳过当兼容 |
| P1 / BASE-03 | 执行真实 `checkPackages.ts`，隔离配置读取、常规依赖采集及进程/终端 IO，禁止安装或交互 | 合法三依赖被 Router 追加诊断；JSON `upToDate:false`、3条 dependencies、隔离退出码1 | 集成复现 PASS；产品 FAIL |
| P2 / BASE-04 | `test-entry-matrix.mjs` 读取 pnpm workspace JSON，逐包索引 manifest/scripts、内嵌 Jest、配置、测试及 Harmony 目录入口，保存 SHA256 | 当前15包、628测试输入、47个 Harmony 目录测试输入；无完全缺少入口的包；删除记录/改测试内容均被重新枚举拒绝 | 索引 PASS；不是628项测试已通过 |
| P2 / BASE-05 | 固定16组执行定义；runner 保存命令、环境、时间、退出码、日志/hash；3次尝试独立保存 | 最终9组 PASS、5组 FAIL、2项 NOT_RUN，详见下表；缺环境失败未改写成 PASS | 矩阵和现状记录 PASS；产品门禁未通过 |
| P3 / BASE-06 | 对齐 Core 两份 README：当前仓库命令、失效进度链接、已有接入源码、历史计数及新架构边界 | 本地相对引用存在；发布 README 绝对链接符合现有 portable 校验；历史原生结果未记为本轮重跑 | PASS |
| P4 / BASE-07 | `stage-progress.mjs` 使用冻结分母，仅完整验收单元计1；接受记录关联报告及内容 hash，关闭另需整阶段退出证据 | 未知/重复ID、缺证据、非PASS、内容hash变化、不完整阶段伪关闭均被拒绝 | PASS；M0 33%，仍未关闭 |
| P4 / BASE-08 | 工具/类型回归、前三轮来源清单复核、catalog/仓库边界、证据hash校验 | 工具278/278，CLI类型检查与三清单复核退出0；catalog/仓库边界通过 | PASS，仅上述范围 |

## 3. 误报证据和修复归属

`dependency-baseline.json` 保存4份实际源码/manifest hash、11个逐项输入、真实诊断/异常/警告、普通版本谓词和 CLI 集成结果。
fixture 中的 version 是受控测试输入，不声称来自独立消费项目的已安装包。

| 场景 | 当前实际行为 | 正确行为与后续工作 |
| --- | --- | --- |
| 三项合法精确版本、兼容子区间 | `subset(allowedRange, usersRange)` 反向比较，产生误报 | 后续 M5/M6 统一版本与解析身份契约；补跑本轮失败断言 |
| 不兼容 `^6.0.0` / 完整兼容 `^7.1.8` | 前者1条诊断，后者无诊断 | 控制组通过，防止通过删除所有校验来修复 |
| 兼容 alias / 错目标 alias | semver 抛 `Invalid comparator` | 分别解析目标身份与版本；不应直接抛解析异常 |
| 仅传递依赖 | 无显式声明时跳过 | 当前无法据此判断传递依赖兼容性，需后续真实依赖解析 |
| 不同路径、未 exclude | 无重复版本警告 | 当前警告条件要求 excluded，未排除时遗漏；后续检查来源身份 |
| 不同路径、已 exclude | 1条警告、无版本诊断 | 保留当前控制行为；不代表排除机制全部正确 |
| CLI JSON | 三合法依赖导致 false 与退出1 | 当前源码级复现；未运行 tgz 消费或真实 install/check/fix 全链路 |

独立失败测试：`scripts/sdk54/fixtures/dependency-baseline/desired-behavior.test.mjs`，12项中4通过、8失败、退出1。
`dependency-desired-red.tap.log` 保留真实断言失败。该文件不在常规工具测试 glob 中，尚未修复前应保持失败。
工具契约只验证缺陷是否稳定复现，并明确输出 `productFixed:false`。

## 4. 测试入口与实际状态

[全包发现索引](sdk54-workspace-test-matrix.json)、[执行定义](sdk54-test-execution-definition.json)、[最终选择与原始记录hash](sdk54-m0-test-execution-results.json) 分开保存。索引包含各包完整本地测试入口，执行仅选择代表集合；其余未选测试未执行，包括 Expo/StatusBar 全套及各包其他 Jest 测试。

| 执行 ID | 最终实际状态 | 证据/前提/限制 |
| --- | --- | --- |
| CLI-PRODUCT | PASS：500/500，53文件 | `CLI-PRODUCT.log`；仅产品 CLI Vitest |
| CLI-HARMONY | FAIL：无法启动套件 | `CLI-HARMONY.log`；Jest launcher 缺 `jest/package.json` |
| AUTOLINKING-HARMONY | FAIL：无法启动套件 | `AUTOLINKING-HARMONY.log`；同上 |
| CORE-PLATFORM | FAIL：无法启动套件 | `CORE-PLATFORM.log`；同上，未运行多平台 Platform 测试 |
| METRO-HARMONY | FAIL：无法启动套件 | `METRO-HARMONY.log`；同上 |
| CORE-HOST | FAIL：18/19通过 | `attempt-2/CORE-HOST.log`；fixture 类型输出缺 react/react-native 类型与 `__DEV__` 环境；日志解析测试通过不算设备通过 |
| MODULE-ASSET | PASS：10/10 | `attempt-2/MODULE-ASSET.log`；隔离原生导入的宿主契约 |
| MODULE-CONSTANTS | PASS：4/4 | `MODULE-CONSTANTS.log`；宿主数据测试 |
| MODULE-FONT | PASS：7/7 | `attempt-2/MODULE-FONT.log`；隔离原生导入的宿主契约 |
| MODULE-LINKING | PASS：9/9 | `attempt-3/MODULE-LINKING.log`；含既有 build/Linking.js、validateURL.js，未重新构建候选物 |
| MODULE-SPLASH | PASS：11/11 | `attempt-2/MODULE-SPLASH.log`；宿主契约 |
| MODULE-SYSTEM-UI | PASS：7/7 | `attempt-2/MODULE-SYSTEM-UI.log`；宿主契约 |
| MODULE-BROWSER | PASS：18/18 | `attempt-2/MODULE-BROWSER.log`；宿主生命周期与准备工具测试 |
| MODULE-ROUTER | PASS：16/16 | `attempt-3/MODULE-ROUTER.log`；部分路径/类型测试使用既有 build，不是新候选物验收 |
| CORE-NATIVE-COMPILE | NOT_RUN | 需显式 SDK、解包 RNOH HAR 与全新构建目录；命令见定义与 Core Harmony README |
| CORE-DEVICE | NOT_RUN | 需本轮固定hash的 Debug/Release 二进制、库、目标设备与部署；要求结果计数及远端退出0 |

首批8组模块宿主测试合计82项通过。此计数不包含设备、HAR、原生编译或模块全量 Jest，也不能代替 M3/M4/V 门禁。
本轮未重装整个 workspace；Jest 与 Core 类型环境缺口登记为后续验证设施工作，保留实际 FAIL。

## 5. 可复核命令

```bash
node scripts/sdk54/reproduce-dependency-baseline.mjs --output /tmp/sdk54-dependency-baseline.json
# 当前预期退出1：未修复产品问题
node --test scripts/sdk54/fixtures/dependency-baseline/desired-behavior.test.mjs

node scripts/sdk54/test-entry-matrix.mjs --check docs/releases/sdk54-workspace-test-matrix.json
# 另选全新证据目录，保留已有尝试
node scripts/sdk54/run-validation-baseline.mjs --output /tmp/sdk54-baseline-new-run
node scripts/sdk54/verify-validation-baseline.mjs
node scripts/sdk54/stage-progress.mjs --check docs/releases/sdk54-stage-progress.json
pnpm test:sdk54-tools
pnpm type-check
```

前三轮 source-inventory、plugin-surface、plugin-source-index 均用 `--source /tmp/sdk54-expo-source --check <原清单>` 重建并复核，分别见 `source-inventory-check.log`、`plugin-surface-check.log`、`plugin-index-check.log`。完整清单与 hash 不因本轮修改变化。

## 6. 失败尝试与边缘情况

1. 工具尚不存在时，契约测试退出1：`contract-red.tap.log`、`matrix-progress-red.tap.log`；它们只证明先有契约，不能作为产品缺陷复现。
2. 实际产品失败断言另保存在 `dependency-desired-red.tap.log`；产品失败与复现工具成功分别统计。
3. 第一次宿主执行缺 tooling 环境；第二次设置 `EXPO_HARMONY_TOOLING_ROOT` 为本仓库，Node/TS 模块测试通过。首次所有日志保留。
4. Linking/Router 需要 `--experimental-vm-modules`；第二次的 VM API 失败保留，第三次修正命令后通过。执行定义已包含该参数及既有 build 限制。
5. 新增发布 README 相对链接触发既有 portable 测试失败，工具首次277/278；改为仓库绝对URL，定向回归和最终278/278通过。今后包根README遵循发布可移植性校验，内部源码说明可用本地引用。
6. 每包无测试入口显式标记 MISSING；本轮15包均有入口。删除记录/测试内容变化必须重新枚举，不能仅重算自报hash。
7. 进度部分任务计0，百分比向下取整；100%也不自动关闭。缺证据、重复/未知ID及不完整阶段关闭均拒绝。

## 7. 阶段进度与剩余交付

| 阶段/单元 | 本轮结论 |
| --- | --- |
| M0 | 仍未关闭，33%（2/6）；按冻结原任务等权，不按测试数量或轮数换算 |
| M0-01 | 第一轮来源/工具/模板身份核定完成，计1；create适配和消费仍属于后续阶段 |
| M0-02/03 | 多轮包级/插件来源子集合完成；全量API/属性/选项、依赖/范围完整性仍未完成，均计0 |
| M0-04 | 四项目真实现状、SDK52识别/创建/运行及共享回归未交付，计0 |
| M0-05 | 调用图、逐文件归属和删除/保留/移交表未交付，计0 |
| M0-06 | 本轮文档、测试矩阵、失败复现及基线验收完成，计1；不包含产品修复和设备通过 |
| M0A/M1/M2/M3/M4/M5/V/M6/M7/M8 | 按本计划完整验收单元均为0%，均未关闭；历史代码存在不折算为本计划已验收 |

后续继续 M0-02/03 的全量公开面与差异范围核定，并补齐 M0-04/05；不跳过阶段前置条件。

## 8. 证据保存

本轮 `evidence-index.json` 保存所有原始证据文件 SHA256；`input-snapshot.json` 固定实际源码/定义/文档及被测试引用的既有 build 输入，`report.sha256` 单独固定本报告，避免自引用。
`verify-validation-baseline.mjs` 重跑缺陷复现、重建矩阵、核对16项结果与原始日志/hash、校验Core内部引用。
`stage-progress.mjs --check` 核对冻结分母、接受记录和报告内容hash。

`docs/releases/`、工具源码及包文档可跟踪但未提交。`docs/superpowers/`、`outputs/` 仍受既有忽略规则影响，**设计、执行卡和原始证据目前仅本机可复核**；未提供团队共享归档、未声称正式发行或 V 自动关闭。
