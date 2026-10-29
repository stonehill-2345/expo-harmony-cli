# M0 能力范围映射实施计划

> 使用superpowers:subagent-driven-development连续实现；原用户持续实施授权有效，不提交。

目标：把已有固定公开面、183差异与具体成员关联到能力范围、批次及依赖，提供双向漏项验收。
设计：../specs/2026-10-27-sdk54-m0-capability-map-design.md。
全局约束：保持原17表、全部原ID及固定commit/tree/semantic hash；不改旧封存、不增加暂缓政策，不把登记算支持或自动关闭M0。

- [x] CM-01（worker独占m0-capability-map.mjs及对应测试）：六表builder/validator/read/write已实现，11项正式测试及22项独立图探针通过；549312原记录、1462依赖、188差异/模板与13既有裁决守恒。候选保持待审，范围、适用性、实现分离。结论PASS_WITH_BOUNDARIES。
- [x] CM-02（主线程m0-capability-map-source.mjs及对应测试）：固定来源loader/CLI已实现，11项正式测试通过；真实生成/重复字节/check通过；删除9层深公开成员、改范围、删seed、悬空依赖均exit1且定位。来源递归校验与软硬链接覆盖保护完成红绿。结论PASS。
- [x] CM-03（来源审查worker独占本批shared-use-review.json/.md）：49固定blob逐字节核验；8共享包12入口按用途登记，8必评/3暂缓/1待审，9未决用途保留。结论PASS_WITH_BOUNDARIES，仅接受本批用途审查记录，不接受全量共享用途完整性或支持。
- [x] CM-04（独立reviewer与主线程）：独立图22及来源2探针通过，全工具705/705；真实CLI四类变异通过，原17表11125分片不改，530434类型/成员公开分类独立复核；报告/剩余项/封存工具齐备，最终证据状态以本批evidence-verification.json为准。结论PASS_WITH_BOUNDARIES，不关闭M0。

API：buildCapabilityMap({surface,seedFacts,pluginContracts=null,sharedReview=null})；validateCapabilityMap(actual,expected)->{valid,failures}；writeCapabilityMap(file,result,{recordsPerShard=128}={})；readCapabilityMap(file)；summarizeCapabilityMap(result)。输出固定capabilities/memberships/dependencies/seedDecisions/analysisImpacts/sharedUseReviews六表。source loader把input证据放metadata.inputEvidence，在builder完成后赋值，validator须比较非表metadata。

共享review接口：{schemaVersion:1,source:{revision,tree},packages:[{id,packageId,name,sourceRefs,entryDecisions:[{entryId,scope:{state,scopeId},reason,sourceRefs}],unresolvedUses:[],conclusion}],inputs:[{path,sha256}]}。可附加解释字段。generator需校验entryDecision属于指定package、scope ID白名单、sourceRefs非空、重复和冲突拒绝。

跨所有权：CM-01消费CM-03接口，两者不共享源文件；主线程CM-02消费CM-01接口，不改builder；review只写本批证据。新生产文件与原主图完全分离，避免旧封存tool hash变化。

逐步验收：docs/releases/2026-10-27-sdk54-m0-capability-map-acceptance.md；证据目录outputs/sdk54/ai-e2e/20261027-m0-capability-map。M0仍66%(4/6)，M0-02/03原单位未接受。本批关系映射、守恒与可达性验收不能替代独立全类别源码覆盖和公开边界完整性证明。
