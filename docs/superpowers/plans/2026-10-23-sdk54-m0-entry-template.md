# M0 入口与模板收尾执行卡

设计：../specs/2026-10-23-sdk54-m0-entry-template-design.md。保持现有特性分支及未提交现场；不提交、推送、发布。

1. [x] ET-01：原20模板范围已红绿；全144401声明SCANNED，原hash保留，共享投影及原文位置已接入。
2. [x] ET-02：19入口逐项调查落scope-investigation.json；5条修复映射，14条保留BLOCKED（8族/6普通），构建运行未接受。
3. [x] ET-03：183条差异事实落seed-range-facts.json；141workspace/5模板保留，13身份/版本与4归档缺口、能力范围继续待核，M0-A02未关闭。
4. [x] ET-04：旧ID及原引用内容零丢失；完整重复SHA256相同；16变异拒绝与真实漏入口CLI非零退出。
5. [x] ET-05：588工具全过，独立审查两问题红绿后关闭；catalog/repository/stage/diff通过，14714输入、381归档及全部账本/语义分片封存复核通过。

实际结论：../../releases/2026-10-23-sdk54-m0-entry-template-acceptance.md。M0仍66%(4/6)，M0-02/03未接受；ET执行卡的完成不增加原阶段接受数。

规则裁定：旧19 BLOCKED实为8模式族+11非模式；不是全图10模式族都BLOCKED。所有统计以逐记录id比对，不按汇总相减推断修复量。
