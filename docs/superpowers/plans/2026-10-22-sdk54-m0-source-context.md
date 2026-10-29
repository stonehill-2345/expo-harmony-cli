# M0 核心来源上下文合批执行卡

用例CTX-01~05，设计见同日source-context-design.md。

- [x] S1 7个精确锁身份和定义hash已固定，扩展前工具全文保留；CTX-01因4份归档缺失BLOCKED，不勾成来源全通过。
- [x] S2 10项fixture通过，安全归档/受限resolver/typesVersions/exports及默认兼容已验证。
- [x] S3 3份归档双hash通过，281外部输入接入，1165条声明解析；全9312/202候选比较完成，缺失4份明确保留。
- [x] S4 重复gzip一致，1正常/10变异一次重建核验；真实坏字节归档SRI拒绝。
- [x] S5 工具415/CLI500/类型、17历史及4关闭检查通过，报告/最终hash复核；M0仍66%(4/6)，本批4PASS/1BLOCKED。
