# M0 外部来源执行卡

输入和边界见同日external-sources-design.md；任务M0-02/03；用例EXT-01~08。

| 步骤 | 操作与断言 | 证据 |
| --- | --- | --- |
| X1 | 固定Git锁/bundle、旧42项及Metro精确lock身份；冻结定义，补parser依赖 | source-inputs、definitions-before、dependency日志 |
| X2 | fixture先红；Yarn重复selector/冲突拒绝，逐种子做声明、精确lock/兼容候选与范围归属 | contract-red/green、来源清单 |
| X3 | 下载锁定Metro tgz并校SRI/SHA1，安全读取发布声明，追ConfigT来源及未解类型 | 下载/完整性/类型来源记录 |
| X4 | 重复输出稳定；真实CLI删除/篡改来源/版本/类型/完整标记必须退出1 | repeat、negative |
| X5 | 工具/CLI/类型、历史索引/基线/阶段、仓库/归属、报告hash复核 | regression、报告、evidence-index |

- [x] X1 输入与定义冻结：149固定Git输入；raw逐blob恢复缓存；parser1.1.0离线frozen安装通过，失败尝试保留。
- [x] X2 来源契约与实现：42项逐项审阅，23精确/5候选/1范围错/11缺锁/2无上游身份；8项fixture通过。
- [x] X3 Metro发行物和声明来源：54.2.0归档双hash核验；ConfigT来源、228声明/1662成员/1111引用；7项fixture通过，外部/utility未展开保留。
- [x] X4 实际生成/重复/篡改负例：两清单字节重复，17类真实CLI负例全部退出1。
- [x] X5 回归与证据收口：工具377/CLI500/类型、15组正例与历史回归、4组关闭检查通过；最终hash由verify-evidence复核，报告见第十三轮验收文档。

从仓库根执行node --test scripts/sdk54/__tests__/external-sources.test.mjs；node scripts/sdk54/external-sources.mjs --source /tmp/sdk54-expo-source --output <json>，--check重建；Metro工具接收--archive <固定tgz>。网络下载每次最长90秒、最多1次重试；不将失败当成功。范围和类型仍未知时保留，不增加完整接受单元。
