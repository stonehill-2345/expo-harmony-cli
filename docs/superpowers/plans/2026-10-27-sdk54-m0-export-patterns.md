# M0 通配入口执行卡

设计：../specs/2026-10-27-sdk54-m0-export-patterns-design.md。沿用feat/V1.7.0未提交现场，旧封存不覆盖。

| 任务 | 修改范围/输入输出 | 预设验收 | 状态 |
| --- | --- | --- | --- |
| EP-01 | m0-public-entries与测试；patternCoverage=false默认兼容，true输出家族候选/遮蔽/拒绝/子关系 | 先红后绿；精确/null/最长规则、跨条件、重复星号、空capture/编码/越界、symlink与emit冲突；真实Node对照 | 完成；38枚举测试+24独立Node对照通过，各轮红绿记录已保存，最终源码与评审hash已冻结 |
| EP-02 | m0-public-surface-source与测试；--entry-patterns fixed-v1映射入口枚举参数 | 默认无变化，拒绝未知policy，测试CLI重建与来源check贯穿 | 完成；loader红绿通过，默认全量与上批索引字节一致；实际CLI来源重建check通过，上游未重跑 |
| EP-03 | 新证据目录生成脚本；复用a9c1bd5892bfb4d5a5e671b0bf6f2092ce3ab4484bb6cafe4bc467c91a0206c3上游，核原revision/tree/归档/库 | 原7候选表ID零丢失；每家族/child双向关联、拒绝项、无限/禁用域逐项审计；不虚报上游重建 | 完成；10家族/274子入口双向审计通过，原7表ID零丢失、全部旧入口target不变；上游明确复用 |
| EP-04 | 真实公开重复/check/删子入口负例、变异、独立审查、全工具及封存 | 重复字节一致，负例exit=1；漏child/来源/wildcard/遮蔽/边界变异拒绝；具体结论与原M0退出逐项写报告 | 完成；最终631/631工具绿、17变异拒绝，重复字节一致，来源check通过，删child真实CLI exit=1；独立全图复核及目录/仓库/阶段门禁通过；封存结果见evidence-verification.json |

并行边界：EP-01 worker仅拥有entries及该测试，主线程拥有source loader/CLI及该测试、证据和报告。只读reviewer不改生产文件。worker须兼容他人修改，不回滚、不提交。

预检：本轮不新增归档下载，不改变原公共范围、不改家族状态；旧BLOCKED14与M0的66%保持，除非新的实际退出验收另有证据。空capture/非法路径若证实为缺陷，原失败测试及Node对照先保存，再修复显式模式。

复盘：最初将家族BLOCKED误读为没有具体展开，已通过现有具体入口计数纠正；以后先检查家族/实例层级和统计口径再决定实现，不以状态计数代替覆盖证据。

缺陷复盘：条件并集会为未自行发现候选的分支生成child，单独候选级URL校验不足；共同strict解析入口统一按Node URL路径解析，永久保留跨分支、exact、constant反例。目标重复星号采用named backreference；编码字面星号先与占位符分离再URL解码，分别保存红绿证据。

最终边缘约束：路径base须用pathToFileURL，不直接拼接file URL；内部marker除避让完整raw/canonical输入外，须无非空前后缀重叠，防止插入后跨静态/capture边界碰撞。最终38+24用例包含新marker原文/编码目录、目标及拼接反例。
