# SDK54 M0-04 现状调查集合验收

日期：2026-10-22；run ID：`20261022-m0-workspace-surface`；任务 M0-04，对应 M0-A03。

**M0-04 调查交付接受；产品全过为 false，设备运行未接受。M0 仍未关闭，完成66%（4/6）。**

## 判定对象与历史结论

原总计划 M0-04 要求记录 default/blank × npm/pnpm 的现有行为、发行身份和 SDK52 原流程基线。M0-A03 的预期明确为“有真实命令、结果、环境和版本记录；已有失败保留为失败，不要求用旧路径冒充新架构通过”。本轮逐项核对该原始契约后接受调查对象，未改变定义或六任务分母。

第九、十轮当时均未接受 M0-04，其产品失败/NOT_RUN、候选、报告和所有原始结果保持不变。本轮纠正了把产品全过作为调查交付必要条件的判定：调查完整性、产品通过和阶段关闭分别验收。今后先核对任务的验收对象，再应用对应门禁，不以工具成功或旧产品失败代替任务判断。

这不豁免 SDK52 依赖闭包、生成、JS/原生构建或设备回归；它们的现状与缺陷已进入后续工作输入。M0-02/03 仍未接受，来源与公开面清单未完整，M0 不允许关闭。

## 固定候选与实际证据

- 适配 HEAD：`22cb245f383a194b52f94127f95bce534258b8cc` 加当前未提交调查工具；本轮没有修改产品代码或重打候选。
- 原实际构建、TGZ 安装和执行均使用 expo-harmony-cli 1.6.0，候选 SHA256：`d43940a9335f2052e52f929a396aa1e294e75e6ec53a2401ae6c2ebb2c230e15`。
- Node v22.20.0、npm10.9.3、pnpm10.19.0、Darwin/arm64。原创建执行器链 create-expo-app5.0.0 → create-expo5.1.5 已归档，未将固定 SDK54 create3.5.11 来源与实际旧 CLI 执行器混淆。
- 结构化完整核验：[sdk54-m0-baseline-audit.json](sdk54-m0-baseline-audit.json)。工具 `scripts/sdk54/m0-baseline-audit.mjs` 由4项契约约束，再核验旧两个目录的全部 evidence-index 内容 hash、原结果验证器、候选关联、独立 Release、设备预检及失败复现。仓库检查发现原引用中有一条本机绝对路径，先以失败契约复现，再将可跟踪摘要统一为仓库相对路径并拒绝仓库外路径；原证据内容和 hash 未改。

| 必达记录 | 实际结果 | 调查验收 |
| --- | --- | --- |
| SDK54 blank-typescript/default × npm/pnpm | 四次真实 create 均180秒超时；识别 PASS，doctor 因无 managed-state FAIL，prebuild/设备 NOT_RUN，原因和部分项目快照保留 | PASS：四场景无缺失，无伪造创建完成 |
| SDK52 default × npm/pnpm 原流程 | 两次真实 create、识别和 scan PASS；当轮未安装 expo，prebuild FAIL；原生/设备 NOT_RUN | PASS：原命令、发行身份、日志及项目输入完整 |
| SDK52 安装及生成补验 | npm peer冲突 FAIL；pnpm正常安装/身份/首次46文件生成 PASS；重复生成被旧覆盖保护拒绝；后续前置原因明确 | PASS：各59源文件、锁文件、46原生文件 hash 与断言齐备 |
| SDK52 独立 Release JS | 基于首次原生 hash 未变的 pnpm 项目执行原脚本，缺 query-string FAIL/exit1，无bundle | PASS：补验独立保存，未覆盖原 NOT_RUN |
| SDK52 两个产品期望复现 | gesture-handler peer不兼容及 Router query-string解析缺失仍 FAIL/exit1，本轮重新执行仍红 | PASS：最小测试与真实失败对应，未宣称修复 |
| 原生/设备前置 | hdc version、list targets真实退出0，目标为[Empty]；没有可运行设备/签名构建候选，运行 NOT_RUN | PASS：预检与未执行原因完整；设备通过为 false |
| 证据集合与拒绝伪造 | 原六场景30步骤：10 PASS/10 FAIL/10 NOT_RUN；安装补验14步骤：3 PASS/2 FAIL/9 NOT_RUN；独立JS另1 FAIL | PASS：无缺场景/步骤，产品成功标记不能篡改 |

M0-05 的 SDK52 共享调用归属和 M0-06 的共享能力测试矩阵、误报复现分别引用其既有接受记录，未要求重写或清理旧代码才算现状基线。

## 复核与保存

从仓库根执行：

```bash
node scripts/sdk54/m0-baseline-audit.mjs --check docs/releases/sdk54-m0-baseline-audit.json
node --test scripts/sdk54/__tests__/m0-baseline-audit.test.mjs
```

本轮目录 `outputs/sdk54/ai-e2e/20261022-m0-workspace-surface/` 保存 baseline-audit.log、baseline-contract-red/green.tap.log、fresh-reproductions.json、两个 still-red 日志及篡改负例。逐轮产品结论仍见[第九轮](2026-10-22-sdk54-m0-current-baseline-acceptance.md)、[第十轮](2026-10-22-sdk54-m0-sdk52-install-acceptance.md)。完整回归及 hash 收口见[本轮总报告](2026-10-22-sdk54-m0-workspace-surface-acceptance.md)。

原始证据和设计/执行卡仍仅本机可复核，依赖前轮 TGZ 与临时安装目录；未提交、未发布。M0-04 接受只增加一个完整调查单元，不改变产品 FAIL/NOT_RUN，不构成 M0 或后续阶段关闭。
