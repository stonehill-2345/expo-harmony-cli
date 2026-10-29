# M0 第六轮：首批运行时API声明索引

范围：固定Expo commit的expo-asset/constants/font/linking/splash-screen/status-bar/system-ui/web-browser八包，M0-02/03子集。整体M0维持3/6、50%，本轮不关闭完整任务。

从Git对象读取manifest和非测试src输入，验证blob并固定SHA256。JSON结构化读取main/types/source/module及exports条件路径；运行时src入口与范围外插件/工具入口分列。build路径仅投影源码，不宣称构建产物新鲜。入口相邻平台变体单列，记录源码差异，不模拟Metro平台选择。

TypeScript虚拟源码Program仅解析当前输入和相对模块，不借宿主node_modules补齐来源。用checker的模块导出/别名解析得到名称和声明；直接保存export语法路线，外部star及无法展开的外部符号保持未解析。编译器导出冲突和缺相对引用拒绝。语义类型检查、推断返回/对象类型完整展开、外部继承成员和运行时行为不在本轮验收内。

每个声明保存稳定ID、位置、源码签名和文档标签；语法声明成员、参数、枚举、嵌套类型字面量、回调分别建成员记录，private/protected/#成员排除。类型引用通过checker关联当前声明或明确保留泛型/外部/未解析；default as类型和本地声明依赖不能丢失。类方法体和函数体不作公开成员。成员索引不是调用效果、事件/错误/权限完整性验收。

全部非测试src模块各有导出表，但module export不等于package public API；package API只取声明的入口与相邻平台变体。manifest依赖沿用固定包索引的ID，首批批次注明M4/M7对应工作，范围和Harmony实现仍未评估。

实现独立runtime-api.mjs及runtime-api-model.mjs，不修改既有工具和第五轮已接受处置表。新增工具会改变当前归属输入，另生成本轮ownership-current.json复核，历史处置表/hash保持原样。新增契约先红后绿；变异校验重建当前固定来源，并对缺项报告ID和源码。

验收API-01至07；报告保存原始命令、实际计数、边缘修复与局限，更新总计划但不新增M0接受单元。后续全量包、配置schema/命令/原生接口/平台行为与差异处置仍需继续交付。
