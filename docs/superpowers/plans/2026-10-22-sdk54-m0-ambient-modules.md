# M0 声明模块执行卡

设计见同日ambient-modules-design.md；AMB-01~07在实现前冻结。

- [x] A1 4088固定输入/146根，定义和旧图hash冻结，原7处逐项映射。
- [x] A2 fixture先红，按包隔离99模块/20边/408符号/901导出，最终12项通过。
- [x] A3 最终gzip重复一致，7处中5处有同包声明来源、2处未解决；正常check通过。
- [x] A4 13类真实CLI负例退出1；重复声明/不兼容合并及前置hash约束先红后修复。
- [x] A5 工具389/CLI500/类型、16组回归及4组关闭检查通过，最终报告和hash由verify-evidence复核。

运行node --test scripts/sdk54/__tests__/ambient-modules.test.mjs；工具接口--source /tmp/sdk54-expo-source --output|--check <json[.gz]>，--output时可传--summary <json>。阶段保持未关闭，完整任务未接受不加进度。
