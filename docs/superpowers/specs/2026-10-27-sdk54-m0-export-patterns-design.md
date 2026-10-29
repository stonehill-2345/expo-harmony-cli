# M0 通配公开入口来源完整性

承接20261023-m0-transitive-sources。M0未关闭66%(4/6)，继续既有M0-02/03授权，不提交或发布，不改变阶段分母。

现状：8个unexpanded-export-pattern是保留的家族记录，并非没有具体展开；分别已有config-plugins两组88及expo-server六组11/27具体分支。另2个runtime常量目标是无限请求家族。不能把家族BLOCKED改成SOURCE来关闭M0。

方案：为既有枚举器增加默认关闭的patternCoverage及公开CLI --entry-patterns fixed-v1。显式模式保留原家族ID、全部真实候选及条件顺序；记录每个家族的固定tree/emit候选、目标反解wildcard、请求、精确/最长pattern遮蔽、非法请求或unsafe目标、生成childEntryIds。子入口反向绑定familyEntryId及wildcard，常量目标保留无限请求域，null规则保留禁用域。家族范围仍非完整发行物接受，状态和运行边界不升级。

匹配须以Node真实package exports规则为独立对照：通配请求不得空匹配；.、..、node_modules（含大小写及编码）、编码分隔符和包外目标不能被反解为合法公开请求。重复目标星号使用同一capture；同一request跨条件并集枚举，每分支单独保留实际解析结果。未映射、冲突、symlink、未验证构建不消失、不猜测。

只修改m0-public-entries及测试、m0-public-surface-source及测试；证据新增outputs/sdk54/ai-e2e/20261027-m0-export-patterns，旧产物只读。已有semantic-final.json.gz重用并校验哈希，不宣称本轮重跑上游类型分析。公开账本以固定来源真实重建、重复、check与删除子入口CLI负例验收。

退出：红绿契约、Node实际解析反例、默认字节兼容、全量候选ID比对、家族双向关系审查、来源/覆盖变异拒绝、工具回归、目录/仓库/阶段门禁及封存结论全部落盘；未满足M0原退出条件则仍66%。
