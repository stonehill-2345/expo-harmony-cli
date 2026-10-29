# M0-06：文档、测试入口与误报基线设计

固定适配源码为当前未提交工作区，Expo来源保持前三轮commit。关联总计划 M0-06、M0-A04 与 M0-A05 的测试覆盖子范围；不处理 M0-05 调用归属。

## 输入与决定

- 已确认历史误报来自 `expo-router/src/doctor/index.ts` 的 `subset(allowedRange, usersRange)`，通过 `@expo/cli/src/install/checkPackages.ts` 附加诊断暴露，不是常规已安装版本的 semver.satisfies 分支。
- 复现直接使用 TS 编译器擦除源码类型，加载实际 semver/debug 和 Router manifest；仅隔离配置读取、日志/进程退出等外部IO。不得复制错误算法当作实际源码执行。
- 单独的期望行为测试应真实退出1、保存断言失败；工具回归只验证缺陷可复现和记录正确。修复归后续M5/M6，当前产品行为继续FAIL。
- 传递依赖分包路径警告与仅直接依赖版本校验分别记录，alias需明确目标身份与解析错误；不把“未检查”写成兼容。
- 工作区测试矩阵由各package.json真实scripts和测试文件、配置生成；每包保留无测试入口情况。适配源码是当前工作区，不能把上游固定tree当本地测试对象。
- 本轮运行可用的工具与选定Harmony Jest/Node用例。原生与设备记录准确前提和NOT_RUN，不用缺设备阻断“测试入口矩阵已建立”的验收；不据此关闭M3/M4。
- Core文档保留历史原生测试说明，更新仓库路径、失效链接、接入能力和当前新架构边界。
- 进度定义存入可跟踪JSON；总计划原任务等权，部分任务计0，百分比向下取整。M0-01已验收可计1，M0-06须本轮完整验收才计1。阶段关闭独立判断。

## 输出与接口

新增 `scripts/sdk54/reproduce-dependency-baseline.mjs`、最小失败用例与工具契约测试；新增测试入口索引与阶段进度工具、结构化定义/结果及验收报告。源码级集成不是tgz消费，不修改Router或Expo运行时代码。

CLI/Autolinking/Core/Metro及当前workspace模块测试入口均登记路径、命令、前提、适配源码hash和实际状态；执行记录独立于发现索引，失败与NOT_RUN不能被索引生成覆盖。

原始证据：`outputs/sdk54/ai-e2e/20261022-m0-validation-baseline/`；可跟踪报告：`docs/releases/2026-10-22-sdk54-m0-validation-baseline-acceptance.md`。文档设计与原始证据仍仅本机。
