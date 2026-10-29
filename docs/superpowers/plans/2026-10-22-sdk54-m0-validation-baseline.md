# M0 第四轮执行卡

日期：2026-10-22；状态：本轮子任务验收完成；M0仍未关闭，33%（2/6）。
任务：M0-06；设计见 `../specs/2026-10-22-sdk54-m0-validation-baseline-design.md`。
预定义：`../../releases/sdk54-m0-validation-baseline-cases.json`；阶段进度分母在 `sdk54-stage-progress-definition.json` 冻结。

- [x] P1：11组源码复现与CLI集成符合预定义；真实期望测试4通过/8失败，产品缺陷仍FAIL；BASE-01/02/03通过。
- [x] P2：15包、628测试输入、47个Harmony目录输入；最终9组PASS/5组环境FAIL/2项NOT_RUN完整记录；BASE-04/05通过只表示矩阵与现状已建立。
- [x] P3：Core历史/当前边界、仓库命令与引用对齐；portable链接回归通过；BASE-06通过。
- [x] P4：固定进度定义和证据校验；工具278/278、CLI类型/前三轮清单复核通过；BASE-07/08通过；M0-06计1。

单个子进程超时120秒，Jest集合可180秒；期望失败与真正测试失败分别汇报；不修复本轮调查发现的产品缺陷，不提交、不发布。

实际执行runner统一180秒超时（Node/Jest均受此上限约束），本轮未发生超时。报告：`../../releases/2026-10-22-sdk54-m0-validation-baseline-acceptance.md`。原始证据：`outputs/sdk54/ai-e2e/20261022-m0-validation-baseline/`，仅本机。
