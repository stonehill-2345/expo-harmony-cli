# M0 全 workspace 与基线核验执行卡

输入和范围见同日 workspace-surface-design.md；运行目录 20261022-m0-workspace-surface。

| 步骤 | 任务/用例 | 操作与断言 | 证据 |
| --- | --- | --- | --- |
| W1 | M0-02/WS-01 | 冻结定义，固定 Git tree 与既有 inventory；取得全部选中源码对象，核对 SHA1 | definitions-before、source-fetch |
| W2 | M0-02/WS-02~05 | fixture 测试先红；实现所有根/平台/插件/类型成员枚举、入口解析和明确缺口 | contract-red/green、索引 |
| W3 | M0-03/WS-06~07 | 从固定来源重复生成，字节一致；真实 CLI 删除/改造记录均非零 | repeat、negative-results |
| W4 | M0-04/WS-08~09 | 复核原六场景、SDK52 两补验、独立 JS 失败及设备预检；只接受完整调查 | baseline-audit |
| W5 | M0/WS-10 | 工具/CLI/类型、历史接受 hash、仓库与归属检查；记录范围/进度及证据 hash | 报告、证据索引 |

- [x] W1 固定输入和定义；4088输入、146根/16939文件，固定blob均复核。
- [x] W2 新契约与实现；12项语法/边缘契约和4项基线契约通过；9646条保守缺口保留，M0-02/03不接受。
- [x] W3 重复gzip字节一致；最终14类CLI负例及路径修正后2基线重验均拒绝。
- [x] W4 M0-04按原M0-A03接受调查；旧产品失败/设备NOT_RUN保留；M0为66%（4/6）。
- [x] W5 工具349/349、CLI500/500及类型通过；12组重建检查通过，报告/证据hash完整复核。

实际报告：docs/releases/2026-10-22-sdk54-m0-workspace-surface-acceptance.md。WS-03的全量语义验收仍NOT_RUN，本卡操作完成不等于M0关闭。剩余项和逐来源缺口见报告及结构化索引，原始证据仅本机。

命令：node --test scripts/sdk54/__tests__/workspace-surface.test.mjs；node scripts/sdk54/workspace-surface.mjs --source /tmp/sdk54-expo-source --output <索引>；--check 从固定源重建并以 0/1 表示一致/不一致。每条 Git 读取最长120秒；产品命令引用已完成原始记录，本卡不覆盖旧回放。M0 关闭仍须全部六任务及原退出条件。
