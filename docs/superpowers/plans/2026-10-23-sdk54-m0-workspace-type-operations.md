# M0 全量 workspace 结构类型关系执行卡

关联 M0-02/M0-03、M0-A01/M0-A02。工作目录为仓库根；不提交，不发布。

1. WTO-01：先新增 CLI 模式契约测试并保存失败日志；再完成两层构建入口及参数解析接线。涉及 `m0-consolidated.mjs`、`m0-source-context.mjs`及来源上下文测试。
2. WTO-02：固定 Git `/tmp/sdk54-expo-source`、声明归档 `outputs/sdk54/ai-e2e/20261022-m0-source-context-complete/downloads`、配置归档 `outputs/sdk54/ai-e2e/20261023-m0-config-inheritance/downloads`，以 project-sources/structural 输出完整 gzip 图。超时 600 秒；预算耗尽须非零退出，不能输出完整标记。
3. WTO-03：重建源图一次，检查规范产物通过，条件分支/约束/别名参数/元组槽位/来源/边界/候选等变异全部拒绝。对照旧图逐 ID/source 检查候选无丢失，统计结构关系及仍有边界的条目。
4. WTO-04：默认模式 `--check`历史 `20261023-m0-config-inheritance/semantic-final.json.gz`，预期零退出。运行全部 sdk54 工具测试、catalog、repository、stage-progress 检查及 diff 检查。
5. WTO-05：记录每个用例实际结果、命令/退出码、来源与产物 hash，写报告。仍有来源或清单缺口时 M0 保持 66%(4/6)，不得按类型数增加完成比例。

证据目录：`outputs/sdk54/ai-e2e/20261023-m0-workspace-type-operations/`。用例定义：`docs/releases/sdk54-m0-workspace-type-operations-cases.json`。失败尝试和中间产物独立保留。

执行结果：WTO-01至WTO-05已实现并验收，WTO-06仍BLOCKED。全工具458/458，结构图源重建正例及16类变异拒绝通过，默认旧全图重建通过；完整结论见对应验收报告。原M0-02/M0-03未接受，保持66%(4/6)。
