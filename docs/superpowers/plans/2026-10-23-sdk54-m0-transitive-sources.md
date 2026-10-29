# M0 传递声明来源执行卡

设计：../specs/2026-10-23-sdk54-m0-transitive-sources-design.md。分支feat/V1.7.0，沿用现有未提交现场。

1. [x] TS-01：固定锁解析观察补档计划/收据/实际取得；首轮69归档字节通过、68结构通过、69 selector、69份收据离线字节不变，5新增测试通过。
2. [x] TS-02：显式locked-v1已落地；独立P1反例先红后绿修复为遍历前rootSections过滤，默认兼容，独立72/72通过。真实全图23个传递来源观察保留未安装边界。
3. [x] TS-03：5轮调查、4轮新增93可用归档，第5轮仅原重复结构拒绝，达到当前补档策略固定点；159194类型，原包/模块/入口/导出/推断/插件候选ID零丢失。208条旧公开router USE转source；2条旧公开USE仅历史保留，对应解析source，未冒充新图引用。
4. [x] TS-04：617/617工具回归、21类变异拒绝、重复字节一致、上游及公开来源检查通过、真实CLI删除传递来源exit=1、独立复核无开放问题；原M0退出仍BLOCKED。封存复核结果另见evidence-verification.json。

初始M0未关闭66%(4/6)；上一批公开missing-exact=257、missing-declared=46、unresolved-declaration-entry=257；14入口BLOCKED、13种子身份待裁决。

接口边界：TS-01只新增独立规划/取得模块；TS-02独占source-context及测试；主线程拥有loader/账本和证据脚本。二者通过固定selector及verified archive证据交汇，不能通过共享全局类型根消除缺口。

裁定：不存在的内嵌manifest不造身份；若传递锁链缺失或多身份歧义，保留缺口。仅来源可证明时显式投影，不接受npm安装、平台或运行。

证据：outputs/sdk54/ai-e2e/20261023-m0-transitive-sources/。旧source-closure证据只读保留。

## 本批裁定与执行记录

- 来源调查允许根据真实missing-exact观察、owner直接dev spec与固定锁获取归档；不据此接受安装身份或运行。无锁@types/react继续拒绝，不推断兼容替代。
- 新archive-overlay逐文件SHA256拒绝冲突，305归档、73显式selectors；旧封存未改。
- 首次语义重建156638类型，未超250000上限；审查P1未修前结果另存semantic-pre-review.json.gz，不作为最终验收。
- 独立审查确证：短dev路径可遮蔽长runtime路径；候选合法性必须在遍历/去重前限制，默认调用行为保持兼容。
- 原封存09d46b...a4和ee26...b0与既有摘要一致；260为全部missing-declared，48为archive来源筛选，不能跨口径推断文件变更。
- 最终公开缺档引用257→47、未声明46→6、无声明入口257→295；编译器错误37→26、声明实例预算22480→22590。改进与新暴露边界分别记账，不合并刷绿。
- 旧router全部USE281中20条原为其他解析状态；本批旧missing-exact为261条，其中259保留转source、2旧公开TypeParameter USE仅历史保留。原公开missing-exact为210条，其中208保留转source。
