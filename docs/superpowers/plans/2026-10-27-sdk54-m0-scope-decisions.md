# M0 范围裁决执行卡

设计：../specs/2026-10-27-sdk54-m0-scope-decisions-design.md。沿用feat/V1.7.0未提交现场。

| 步骤 | 实现 | 验收 | 状态 |
| --- | --- | --- | --- |
| SD-01 | 新模块固定输入校验、13项种子独立状态及6项入口义务；worker只拥有新模块和对应测试 | 21/21，0跳过；14输入/状态变异拒绝；13范围完成与13未知身份分开、5探测/1声明缺口保留 | 已验收，有边界 |
| SD-02 | source loader/CLI显式fixed-v1；主线程只拥有loader及该测试 | 22/22；默认字节兼容；显式图新增scopeDecisions与input证据；未知policy拒绝 | 已验收 |
| SD-03 | 固定源及metadata只读重建公开图，复用上游 | 全16个非inputs表分片一致，原16666输入内容不变，新增7条固定输入绑定裁决；所有原target不变 | 已验收，有边界 |
| SD-04 | 独立审查、工具回归、重复/check/删裁决真实CLI负例、变异与封存 | 654/654；独立10变异拒绝；重复/check通过、真实CLI删裁决exit1；旧封存摘要绝对路径导致repo门禁FAIL保留 | 已验收，有边界；完整封存见本批evidence-verification.json |

Ruling: 采用已验证固定bundle/目标catalog与发布者metadata做范围裁决，不选择未知历史安装版本；原A02要求是每项差异有结论，范围完成不意味着来源完整。误判代价是范围重审，完整来源和运行边界始终保留。

接口：新模块负责loadScopeDecisionInputs({sourceDir})与buildScopeDecisions({source,treeEntries,files,entryLedger,inputs})；loader负责将inputs所需Git文件并入原sourceEvidence并把裁决加到图metadata。worker和主线程共享此接口，不互改拥有文件。

复盘约束：前批把14 BLOCKED中的8家族与具体入口混淆；本批进一步区分manifest显式义务与约定探测，保持原记录，不能以角色猜测消除真实main矛盾。类型来源、范围及安装身份分别验收，不复用含混的pending计数。

结果报告：../../releases/2026-10-27-sdk54-m0-scope-decisions-acceptance.md。M0仍未关闭66%(4/6)。审计首版误将inputs要求零新增，改为原行不变与新增来源白名单；阶段检查漏参数的失败日志保留，更正后通过。仓库门禁须在新摘要写出后再执行，避免先查后生成导致未检查最终文档。
