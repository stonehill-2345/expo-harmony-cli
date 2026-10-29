# M0 种子差异与入口义务裁决

沿用M0-02/03及A02既有授权，M0仍未关闭66%(4/6)。本批不提交、不发布，不改既有封存。

13项种子差异须分别记录范围结论、发布者生命周期与迁移事实、来源完整性、历史安装身份和运行状态。范围结论能够依据固定bundle/目标catalog及已封存metadata/receipt完成；无锁身份不伪造。保留SEED:name和全部原始事实，historicalSeedIdentitiesClosed仍0；新增scopeDecisionsComplete及pendingScopeDecisions，不能把二者混用。只允许发布者明确文本支持迁移，迁移不等同重命名；RSDW固定bundle、锁、消费者peer冲突和安全弃用不得自动升级基线。

6具体BLOCKED入口新增义务记录：5项/implicit-index为默认解析探测，1项/main为声明缺目标。逐包已审政策绑定固定manifest blob，并引用原生模块配置、bin/build、模板生成契约、应用目录及完整固定tree路径集合。不能按任意private/bin/native字段自动豁免。原entry.target、ID和运行边界保持。不存在目标由完整固定tree证明，不以已加载files缺项证明。

实现新增m0-scope-decisions模块及测试；公开source loader/CLI显式--scope-decisions fixed-v1贯穿该审计，默认输出逐字节兼容。模块输入必须先校验固定revision/tree、种子事实输入hash、registry metadata与receipt及其固定包名/版本/dist完整性；输出稳定ID、原事实、判定、证据hash和未接受边界。来源读文件由显式固定输入清单给定，不执行任何下载或安装。

新批outputs/sdk54/ai-e2e/20261027-m0-scope-decisions；上游semantic-final.json.gz仅复用并验a9c1bd5892bfb4d5a5e671b0bf6f2092ce3ab4484bb6cafe4bc467c91a0206c3，不重跑类型分析。公开图保留上一批fixed-v1通配证明；七表候选ID零丢失，target及类型/导出等内容不变。逐步骤、变异、真实CLI、重复和封存均落盘。

typeRoots隔离加载是另一独立的语义架构工作，本批只读调查，不以新增范围裁决代替其完成。
