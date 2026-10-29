# M0 独立来源期望集实施计划

> 使用superpowers:subagent-driven-development连续实施。沿用用户授权和feat/V1.7.0当前现场，不提交、不推送、不修改旧封存。

设计：docs/superpowers/specs/2026-10-27-sdk54-m0-source-census-design.md。
目标：固定tree文件期望集和共享补读事实可双向核查；不将路径覆盖、来源登记或文件角色候选等同于完整公开能力清单。

全局约束：固定commit/tree与旧public/capability索引hash；原17/6表、原ID、183/5差异及五暂缓政策不变；9共享未决用途逐原ID登记。测试缺陷先红后绿。新输入/输出路径相对仓库保存。

- [x] SC-01，worker独占scripts/sdk54/m0-source-census.mjs及__tests__/m0-source-census.test.mjs：实现纯builder/validator/serialize，独立workspace+模板发现、全tree守恒、最长owner、多角色分类、未读/已登记输入分离；未知规范语义保留。用小fixture覆盖嵌套根、排除pattern、symlink/gitlink、重复/错误来源与输入、稳定ID及删项/假覆盖负例。正式12/12，独立16/16；见sc01-final-green.log和review-probes.json。
- [x] SC-02，主线程独占scripts/sdk54/m0-source-census-source.mjs及对应测试：核固定来源和上批封存hash，读取packages/inputs/capabilities所需分片并逐hash；固定manifest与已覆盖blob实际读取；CLI生成/重复/check、输出保护；真实删文件/假覆盖/丢owner负例。主线程提供8缺失blob的prefetch，不触碰其他旧证据。正式9/9；19538普通blob全部实读；生成/重复/check exit0，三负例exit1且定位，重复字节一致；见cli-*.json/log。
- [x] SC-03，来源worker独占本批shared-use-followup.json/.md及verify-shared-followup.mjs：逐8缺失blob实读，原9用途建立补充事实/剩余条件；原复合未决范围不得因单文件读取而假关闭，不扩大暂缓。无需依赖SC-01实现。8未读子缺口关闭、15事实、9用途17条件保留；M0来源义务与后续支持分离，15负例拒绝；见sc03-validation.log和review-shared-report-audit.json。
- [x] SC-04工具实现，独立reviewer仅写本批review-*证据：独立根发现/全tree守恒/分类与输入状态语义、SC-02别名和来源防护、SC-03九用途事实审查；主线程执行实际CLI三变异、全工具、catalog/stage/repo及来源封存，写逐步骤结论。工具726/726；独立builder16/source13；全内容独立核验19538项/326762783字节；三负例均通过。最终审查与seal/verify按本计划顺序执行，其终验状态以review-final.json与evidence-verification.json为准，勾选不替代终验。

接口固定见设计；source loader只调用纯builder，并在metadata附加inputEvidence；validator比较所有元数据。单一JSON输出无需增加通用分片抽象。所有权互不覆盖，worker不得回滚他人修改。证据目录outputs/sdk54/ai-e2e/20261027-m0-source-census。

接口补充裁决：buildSourceCensus另接可选supplementalReads=[]（{path,blob,sha256}），表示loader实际核验但未列入旧公开分析输入的补充来源。它影响file.contentStatus/sha256，不能写成原inputRefs或提高旧图覆盖数。该补充落实“实际读取量”原要求，不改变已锁设计/范围。loader与builder对!排除和!(...)正extglob规则一致。

合批来源裁决：SC-02扩大为全部普通tree blob实际读取/hash（普通文件100644/100755，排除仅保留身份的120000/160000）。通过固定OID prefetch补选择性缓存后，loader分100文件批读；非原input/manifest记录仅记supplementalReads。SC-01接口不变，全部内容可核不等于全部公开语义已核。此项以sc02-all-content-red.log及绿测验证，来源不可读时真实失败，不假标read。

执行前用例固定为SC-01～04及M0-exit；真实命令为node scripts/sdk54/m0-source-census-source.mjs --source /tmp/sdk54-expo-source --surface outputs/sdk54/ai-e2e/20261027-m0-consumer-sources/public-surface.json --capability-map outputs/sdk54/ai-e2e/20261027-m0-capability-map/capability-map.json --shared-followup outputs/sdk54/ai-e2e/20261027-m0-source-census/shared-use-followup.json (--output <json>|--check <json>)。生成/重复/check预期exit0，三变异预期exit1。真实执行限180秒，工具回归限300秒；超时保持实际失败不改定义。

验收结论必须分别列文件期望集守恒、内容实际读取量、仅tree身份量、规范语义未知量和M0原接受单元；不得仅用已覆盖文件比例改变66%(4/6)。
