# SDK54 Harmony M2 实施与验收计划

> 使用superpowers:subagent-driven-development执行已授权总计划；任务间独审，不提交。

Spec: docs/superpowers/specs/2026-10-27-sdk54-m2-generation-design.md

## 所有权与顺序

- [x] M2-01/03/06：native worker拥有nativeProject.ts、新generationState.ts、Autolinking json5直接依赖和对应专项；实现完整JSON5解析、状态/三方合并、稳定路径/排序、按有效模块图清理。先真实红测，再实现；不修改transaction.ts和CLI。
- [x] M2-02/04：主线程拥有新generationTransaction.ts及事务子进程测试、CLI prebuild编排；事务API见Spec，native worker调用。clean通过事务备份、删除旧CLI先rm和提交后debug改写；debug更新在stage内完成。
- [x] M2-05：compat worker拥有新releasedCompatibility.ts及scripts/sdk54发行兼容工具/专项。先证明输入输出hash，消费只验证并复制。不得修改nativeProject.ts；给native worker明确API并协调接入。
- [x] 集成验收：主线程运行M1回归、M2专项、工作区检查、冻结候选、仓库外npm/pnpm真实生成/故障/完整性与hvigor。reviewer独审实现及验收，不复写M0/M0A/M1冻结证据。
- [x] 正式关闭：2026-10-28 最终独审六单元及 A01～06 全 PASS，登记 sdk54-stage-acceptance.json，运行 stage-progress 输出与 check；详见 docs/releases/2026-10-27-sdk54-m2-generation-acceptance.md。

## 接口交集与预检

| 交集 | 接口/约束 | 检查 |
| --- | --- | --- |
| transaction→native | runHarmonyGenerationTransactionAsync(options)生成stage，返回最终根/可选backup | native内部写操作只对stage；映射返回文件路径 |
| native→CLI | sync options新增clean、finalize?(stageRoot)；返回backupPath | CLI不rm现有工程，debug在stage运行 |
| compat→native | releasedCompatibility.ts提供RNOH与带transform HAR只读验证复制API | native删除执行Python路径，不碰依赖源码 |
| native→state | 状态记录相对路径及期望JSON，merge发生validate之前 | 无state迁移保守保留/备份 |
| tests→全部 | 先红后绿，真实fs/子进程覆盖故障恢复 | 不以mock调用次数冒充完整树恢复 |

Ruling: 用户已授权按总计划继续M2，设计细化不重复例行审批；沿用用户刚提交M1的非main现场，不新建会丢失既有本机候选/依赖的checkout。保存证据和计划，不执行技能建议中的自动commit。
