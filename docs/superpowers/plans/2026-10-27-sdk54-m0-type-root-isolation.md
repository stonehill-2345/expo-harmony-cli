# M0 typeRoots 隔离实施计划

> 执行技能：superpowers:subagent-driven-development；先红后绿，按本执行卡连续落实。

目标：在consumer配置授权的新Program中，为旧公开USE提供真实语义绑定及上下文类型图。

设计：../specs/2026-10-27-sdk54-m0-type-root-isolation-design.md。

约束：沿用feat/V1.7.0工作现场；固定来源；旧封存只读；不提交；默认字节兼容；M0仍66%，共享错误和预算不擅自关闭。

| 步骤 | 文件与职责 | 操作、断言与证据 | 状态 |
| --- | --- | --- | --- |
| TR-01 | worker独占m0-consolidated.mjs及其测试、新m0-type-root-isolation.mjs及其测试 | 先写并运行红测；实现consumerProjection与buildTypeRootIsolation。双消费者同名模块不同typeRoots、types opt-out、别名目标/精确范围/命名空间、坏hash/缺来源/诊断/预算分别断言；默认semantic输出不新增字段 | 已验收，有边界；36/36回归、独立审查通过 |
| TR-02 | 主线程拥有m0-public-surface-source.mjs及其测试 | CLI显式--type-root-isolation consumer-v1贯穿，未知/重复值拒绝；仅开启时调用builder；check删除metadata拒绝。node --test对应测试先红后绿 | 已验收；默认字节一致，真实来源check通过，删context非零拒绝 |
| TR-03 | 主线程本批outputs/sdk54/ai-e2e/20261027-m0-type-root-isolation/ | 固定前批semantic哈希a9c1bd5892bfb4d5a5e671b0bf6f2092ce3ab4484bb6cafe4bc467c91a0206c3，保留entry-patterns及scope-decisions规则；真实CLI生成；逐历史194原USE与当前全部候选核绑定；17表索引/分片、所有原target不变，输入来源全核 | 最终真实生成及重复字节一致；194/212绑定、17表分片保持 |
| TR-04 | 独立reviewer只读，主线程回归/报告/封存 | 工具全测；真实默认/重复/check/删context CLI；来源hash及命名空间引用变异拒绝；报告逐步骤结论、遗留项、阶段进度；旧repo摘要失败边界原样保留并记录 | 功能验收通过，有边界；669/669，审查无开放项，封存结果以evidence-verification.json为准 |

接口生产/消费：TR-01提供buildTypeRootIsolation({surface,files,projectContext})同步返回审计metadata；TR-02在buildPublicSurfaceFromSource构建完成、sourceEvidence及scopeDecisions已附加后调用。共享core新consumerProjection选项只供新模块使用，不改变默认调用。TR-03保存完整上下文元数据及原USE对照，TR-04复验同一产物，不生成反向放宽的用例。

Ruling: 采用附加隔离graph并链接原USE，避免用新的checker结果覆盖未重算共享图。代价是共享图旧错误仍保留，但该边界可独立完成，不伪装为全公开类型闭包已完成。

- [x] TR-01红绿及默认兼容。
- [x] TR-02红绿及CLI贯穿。
- [x] TR-03固定源及历史ID实际验收。
- [x] TR-04审查、工具、真实CLI及封存（最终逐hash结论见evidence-verification.json）。

结果报告：../../releases/2026-10-27-sdk54-m0-type-root-isolation-acceptance.md。历史194及当前212使用均绑定，17表分片保持；333隔离类型、84条诊断和逐USE边界保留。三斜线types/path/lib缺来源按原生加载诊断合批覆盖；固定编译器内部API不可用则失败。旧仓库摘要FAIL只读保留，本批摘要写出后重查。M0仍未关闭66%(4/6)，不以绑定数或新增测试数增加阶段接受单元。
