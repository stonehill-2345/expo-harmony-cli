# M0 能力范围与批次映射设计

沿用用户全量实施与减少轮数授权，承接consumer-sources的原退出条件审查；本批不修改旧封存、原接受单位或阶段分母，不提交。M0当前66%(4/6)，原M0-02/03未接受。

## 方案

在现有17表旁建立独立关系账本，不改原公共面表与ID。包级预分批只提供初值；按公开入口/导出形成能力组，逐具体成员保存membership，scope和milestone由组继承。内部/保守候选保留上下文分类和来源，不能把13942候选全叫公开API，也不能把未复核候选直接判内部。归档通用类型按消费用途关联能力，无需逐类型适配或发包。

选择独立关系表而不是修改原17表：保持历史字节对照；按功能组归并而不是每个类型新建适配任务，避免共享通用类型重复承诺。保留原始未评估/未完成实现状态，不以范围登记升级Harmony支持。

## 输入与接口

固定consumer-v2公开面索引76e245276c7fbbfd4b7607c033f5406475b35243196d947a1b9f47ba286b7d17及全部分片；固定seed-range-facts 0d0a160711152a0fd6bcc8db817805c48e28924e014b99cd10967ec90d2aede5；已有plugin type-contracts专项；8共享用途的新只读来源审查。上游semantic只复用。

纯生成器buildCapabilityMap({surface,seedFacts,pluginContracts=null,sharedReview=null})；validateCapabilityMap(actual,expected)双向逐ID/内容检查；write/readCapabilityMap采用确定性gzip分片，summary单独记录。CLI由主线程实现m0-capability-map-source.mjs，调用上述API；支持--surface、--seeds、可选--plugin-contracts/--shared-review，以及互斥--output/--check；不自动改阶段状态。

固定输出表：capabilities、memberships、dependencies、seedDecisions、analysisImpacts、sharedUseReviews。metadata保存来源、输入hash、policy、counts和remaining/acceptance边界。IDs按原stable record IDs构造，不按数组顺序。

能力至少有id/kind/ownerPackageId/rootRecordIds/sourceRefs/dependencyIds/milestoneIds/scope/scopeEvidence/applicability/applicabilityEvidence/implementationStatus/analysisBoundaries/followupTaskIds。scope为{state:REQUIRED|DEFERRED|REQUIRES_REVIEW,scopeId:null或既定DEFER-*}；applicability和implementation独立，不从M7.6推断不适用。未知实现保持NOT_ASSESSED。

成员关系：每个packages/entries/exports/types/members/plugins/candidateDispositions记录有唯一(table,recordId)membership，保存原recordSha256、ownerPackageIds、capabilityIds、classification；具体公开成员经exports/entry type roots、typeEdges与plugin options传播，有限有向图保留循环。公开成员不能只在组计数中出现。未解析插件候选/保守导出用PUBLIC_REVIEW_PENDING，不能伪称CONTEXT_ONLY。

依赖从manifest各section逐条保存，kind区分runtime/optional/peer/build-test，不丢spec/targetId；本workspace target必须存在；外部targetId=null记录UNRESOLVED_EXTERNAL_IDENTITY，不伪造历史安装。能力dependencyIds关联owner声明边，内部类型边仍引用原表并保持闭合。

183差异和5模板全部按原ID关联新seedDecisions，不丢原state/category/source/hash；131原范围项的REQUIRED结论须引用既定全量范围政策及具体固定来源，8共享项独立关联新review记录，13已有scopeDecisions复用但不升级历史身份。

## 共享用途与暂缓

仅允许DEFER-GO/EAS-BUILD/EAS-SERVICES/UPDATES/DEV-CLIENT。expo-updates和expo-dev-client的明确能力按既定条款；8共享包必须逐入口/实际用途审查。sharedReview记录sourceEvidence与entryDecisions，不推断无源码用途。无法证明的用途保持REQUIRES_REVIEW，普通Debug/Metro、本地构建/资源/认证保持REQUIRED。既定whole-package能力暂缓不等于来源清单排除。

## 边界与验收

analysisImpacts把原类型错误/预算/未知来源与受影响capability及原recordId关联，不能把所有边界当缺能力，也不能仅登记就宣称成员完整。源码期望集合、非TS类别原生/生命周期/资源/安装行为和边界是否遮成员，本批未证明的继续列剩余。plugin专项具体选项及Splash/Router事实通过输入hash/原ID关联，缺未知schema明确保留。

红绿覆盖：两入口共享类型、嵌套属性/参数/循环、多个owner和外部通用类型、保守候选、暂缓与普通认证、183差异和5模板、缺来源/重复ID/悬空依赖；删除深层member、改scope/milestone/source、删seed和dependency均定位拒绝。真实固定图生成/重复/check/CLI变异拒绝；原17表字节保持；独立审查和固定输入/分片hash封存。

本批的map可校验不等于M0完整清单接受；remaining必须列规范非TS类别、独立源码覆盖、实际公开边界完整性和未决共享用途。禁止用生成器固定false或诊断计数直接裁决M0。
