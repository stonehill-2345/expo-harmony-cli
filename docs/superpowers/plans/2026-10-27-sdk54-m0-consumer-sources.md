# M0 消费者声明来源闭合实施计划

> 执行技能：superpowers:subagent-driven-development；按执行卡连续实现与验收，不提交。

目标：显式consumer-v2将已授权固定声明依赖接入隔离checker，保留来源与未安装边界。
设计：../specs/2026-10-27-sdk54-m0-consumer-sources-design.md。
约束：固定Expo commit/tree及上游semantic哈希沿用前批；默认/v1不变；17表不变；不从宿主借来源，不升级依赖、不改旧封存。

| 步骤 | 所有权与接口 | 操作及断言 | 状态 |
| --- | --- | --- | --- |
| CS-01 | worker：m0-type-root-isolation.mjs、m0-consolidated.mjs及两对应测试 | builder新增policy='consumer-v1',sourceContext=null；v2要求resolver接口并只启用fixed-input解析。core consumerProjection接收sourceContext。先红后绿，显式依赖与模块实际绑定、坏来源/缺锁/歧义/opt-out/隔离/闭合，来源结果和边界记录 | 已实现；47正式测试通过，独立8探针通过，来源边界保留 |
| CS-02 | 主线程：m0-public-surface-source.mjs及测试 | 接受consumer-v2，loader保留已核archives并从固定files yarn.lock重建resolver；builder贯穿policy/sourceContext。默认与v1不创建额外context。参数/输入/metadata负例先红后绿 | 已实现；26 loader测试通过，含真实配置归档碰撞红绿修复 |
| CS-03 | 主线程：outputs/sdk54/ai-e2e/20261027-m0-consumer-sources | 固定semantic a9c1bd5892bfb4d5a5e671b0bf6f2092ce3ab4484bb6cafe4bc467c91a0206c3；真实v2生成，对照v1逐诊断、来源、212/194 USE；17表分片完全相同；原输入hash不变；新上下文类型/Program输入核验 | PASS_WITH_BOUNDARIES；17表/16673输入保持，212/194绑定；诊断84至22，新增98上下文输入，类型333保持 |
| CS-04 | 独立审查与主线程封存 | 全工具、默认/v1兼容、v2重复/来源check、真实CLI删来源记录拒绝；逐步骤报告/剩余工作/输入hash与分片封存；原M0退出条件独立复核 | 验收命令通过；683工具与81独立审查测试通过，默认/v1兼容、重复字节、来源check及真实负例exit1通过；逐hash封存结论单独见evidence-verification.json |

接口：buildTypeRootIsolation({surface,files,projectContext,policy='consumer-v1',sourceContext=null})；sourceContext为现有createDeclarationContext返回接口，含resolve/resolveTypeReference/snapshot。v2不改变原数据，返回原schema外追加可审计来源结果。core只在consumerProjection?.sourceContext存在时调用，返回graph.consumerProjection.sourceResolutions，builder附加context.sourceResolutions。所有实际source目标须在已核files，禁止node-global-context直接当source。

必达用例预先定义：CS-01安全依赖加载及边界，CS-02显式CLI和默认兼容，CS-03真实来源/绑定/表不变，CS-04回归/审查/CLI负例/封存，M0-exit依原接受条件单独裁决。结果不得反向改必达集合。

- [x] CS-01红绿及来源审计。
- [x] CS-02红绿及显式v2贯穿。
- [x] CS-03固定源真实验收。
- [x] CS-04审查、CLI和封存；封存复验独立记录于evidence-verification.json。
