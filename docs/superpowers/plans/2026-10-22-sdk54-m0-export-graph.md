# M0 跨 workspace 导出符号图执行卡

输入/边界见同日export-graph-design.md；任务M0-02/03；用例EG-01~08。

| 步骤 | 实现和验收 | 原始证据 |
| --- | --- | --- |
| E1 | 固定设计/用例、来源/旧摘要hash；fixture先红 | definitions-before、contract-red |
| E2 | 解析器、虚拟Program、符号/边/诊断与双向校验；覆盖条件/wildcard/封装/别名/循环/冲突 | 工具与fixture green |
| E3 | 全源生成、10+7+1旧缺口逐项审阅；重复gzip字节一致；实际CLI篡改退出1且可定位 | 索引、repeat、negative |
| E4 | 工具/CLI/类型、旧专项清单、接受hash/归属/仓库检查；报告与hash收口 | regression、报告、evidence-index |

- [x] E1 固定设计/用例/旧摘要hash，契约先红。
- [x] E2 解析器/虚拟Program/符号与诊断实现；13项契约通过，CommonJS投影、非法路径、动态/计算属性、type-only和消费者诊断边缘均先红后修。
- [x] E3 4088输入、3934模块、13684边、10010符号、13786导出；18项审阅为8展开/2部分/7外部未解/1入口未解；三份gzip字节一致，12类CLI负例全部退出1。
- [x] E4 工具362/362、CLI500/500、类型、13组重建回归和最终仓库/归属/阶段检查通过，报告及证据hash复核。

实际报告：docs/releases/2026-10-22-sdk54-m0-export-graph-acceptance.md。操作完成不构成M0-02/03接受；M0仍66%（4/6），全量类型/属性、动态/外部来源和42项外部种子审阅未完成。原始证据仍仅本机。

从仓库根运行 node --test scripts/sdk54/__tests__/workspace-export-graph.test.mjs；node scripts/sdk54/workspace-export-graph.mjs --source /tmp/sdk54-expo-source --output <json.gz>，--check <索引>重建比对；可选--summary <摘要>。Git读取每次上限120秒。M0当前66%（4/6），本轮子任务完成不自动加分。
