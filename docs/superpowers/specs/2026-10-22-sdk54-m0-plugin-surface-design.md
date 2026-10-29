# M0 第二轮：首批插件公开选项来源设计

日期：2026-10-22。前置：第一轮固定 Git tree 与包级清单已经验收。

## 范围与输入

本轮实施 M0-02/03 的六个首批插件公开选项子集合：Asset、Font、Splash、SystemUI、Router、WebBrowser。
锁定 Expo commit `5b42e3d21e0ac5e086752361ca8a5cb4de53bec1` 和首轮包清单 hash
`fc95e76892e2c8c1a11664955de9e38825ba7c87d2d4ceb21ba4a0330056c6cc`。
Splash 必须读取固定 `@expo/prebuild-config` 的 AndroidSplashConfig/IOSSplashConfig，并解析对 config-types 的引用；不能复用本地抽样表替代。
Router 必须同时读取 ConfigPlugin 类型参数与 options.json，分别保存两种公开面，不将其中一方当作最终规范覆盖另一方。

## 决策与接口

- 新增 `scripts/sdk54/plugin-surface.mjs`，依赖直接声明、固定版本的 TypeScript 5.9.3 编译器 API。
- 复用第一轮 Git tree/blob/hash/显式预取实现，仅导出读取函数；不修改第一轮输出契约或重写历史清单。
- 源码来自 Git blob，编译器使用虚拟文件系统；只允许读取固定源码和编译器标准库，不读取消费工程或隐式联网。
- 解析各声明的 ConfigPlugin 类型参数，用 type checker 展开别名、跨包 imports、交叉类型、数组、字面量联合、索引访问和 Record；保持来源位置。
- 缺失类型、any/unknown、循环或未支持的形状必须明确失败；不得截断嵌套内容后成功。
- JSON Schema 使用 JSON parser，解析本地 JSON Pointer refs、object/array/oneOf 等结构；外部引用和循环不静默跳过。
- 输出 stable plugin/option ID、源码行号或 JSON pointer、输入 blob/SHA256、嵌套类型树与逐路径选项；TS/schema 差异保留。
- 记录源码中配置读取、默认表达式和展开操作的 AST 位置，作为人工复核默认/优先级的证据，不自动宣称运行效果。
- 校验器从固定来源重新生成并逐 ID 比较。删 nested option、改字面量/来源、重复 ID、伪改完成标记都必须失败。
- SystemUI 没有显式 props，单独登记它读取的 Expo config；不能据零 props 宣称无插件功能。

## 输出与关闭限制

`docs/releases/sdk54-first-plugin-surface.json` 保存六插件选项及差异；
报告为 `docs/releases/2026-10-22-sdk54-m0-plugin-surface-acceptance.md`；
原始证据为 `outputs/sdk54/ai-e2e/20261022-m0-plugin-surface/`。

六个插件来源枚举不代表全部默认/版本化插件、SDK 全部 API/组件属性已经枚举，也不代表 M1/M4 运行时或设备验收。
`stageClosable=false`；M0 仍进行中。源码默认值与优先级复核、TS/schema 已知差异以实际报告明确边界。
不提交、不发布，不覆盖第一轮报告。详细设计/计划和原始日志受现有 ignore 影响，仅本机保存，报告明确告知。
