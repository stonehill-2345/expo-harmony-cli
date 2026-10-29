# M0 跨 workspace 导出符号图设计

任务 M0-02/03，对应 M0-A01/A02 的公开面完整性子任务；本轮不接受整个任务或关闭阶段。

固定 Expo commit 5b42e3d21e0ac5e086752361ca8a5cb4de53bec1、tree 5457e824b21d968e55c8f533cdf1751860160a92；重建141 workspace和5模板，复用上一轮固定源选择规则，读取并校验Git对象。本轮新增独立工具，历史workspace语法清单、报告和已接受工具不修改。

以 TypeScript5.9.3 虚拟 Program 解析源码关系。Host 只暴露固定文件，noLib，不读取宿主 node_modules、默认库或消费安装。解析相对引用与workspace包根/深入口；exports封装、types条件、wildcard具体性、build到src/bin来源投影、源扩展优先级、alias和平台候选分别记录。分析策略是源码types投影，不是Node/Metro/Harmony运行解析保证；保留未选择条件和依赖版本未验收边界。

交付所有生产模块的compiler导出符号及原声明位置、类型/值空间、重导出边、同源别名、namespace、循环、CommonJS静态转发以及无法解析/冲突诊断。不能将checker返回名字当作全量属性语义完成；不展开外部库与推断类型。source symbols、解析失败与诊断均为独立条目。

上一轮10处workspace-star、7处external-star、1处缺入口逐一映射到本轮真实边/解析结果；只有存在源目标、导出已展开且无传递star边界或冲突时标为已展开。空导出须有明确源证据，不能以空数组当作成功。双向验证从固定Git源重建，删模块/符号/源声明/边/旧缺口审阅、重复或伪全量均拒绝。

新增契约先测试再实现；发现实际bug先保存失败测试再修复。用例/设计在执行前固定hash，实际重复输出、CLI变异、历史索引、工具/CLI/类型/仓库/进度检查分别保存证据。不安装产品依赖、不改产品代码、不提交/发布。原始证据在 outputs/sdk54/ai-e2e/20261022-m0-export-graph/；原始证据及docs/superpowers仍仅本机。
