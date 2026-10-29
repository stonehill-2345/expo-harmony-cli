# M0 第三轮：插件入口与源码关系索引

日期：2026-10-22；状态：本轮来源索引子步骤已实现并验收，M0 未关闭。关联总计划 M0-02/03。
验收报告：`../../releases/2026-10-22-sdk54-m0-plugin-index-acceptance.md`。

## 契约与实现

固定来源与前两轮相同；输入为完整 Git tree、141 workspace 包清单。扫描每个 workspace 根的 app.plugin.js/cjs/mjs/ts，两个配置包非测试 src，以及其静态相对引用闭包。只读固定 Git 对象；显式 --prefetch 才允许获取缺失对象。

将路径段 plugin/build 映射 plugin/src、包根 build 映射 src，若源码存在则优先索引源码，并独立保留 tree 内构建文件路径；映射只表示源码来源，不能证明 npm 发布产物存在。首次真实生成发现上游同时提交 js/d.ts/src，已先补失败测试再明确该解析规则；同层多个源码候选仍视为歧义。bare imports 保存请求与 AST 位置，不将 npm 外部解析冒充完整依赖图。

使用 TypeScript AST 保存模块引用、导出、ConfigPlugin 声明、withPlugins 的每个数组项与顺序、字符串数组包名列表，以及 withAndroidBaseMods/withIosBaseMods 的 providers 属性。动态表达式保持未解析来源；无执行、无语义推导的函数不伪造运行结论。

暂缓状态只能沿用总计划：expo-updates 关联 DEFER-UPDATES、expo-dev-client 关联 DEFER-DEV-CLIENT；其他包保持未评估。共享依赖不能整体排除。SDK52 目录独立登记为来源，不视为 SDK54 或 SDK52 执行成功。

输出：`docs/releases/sdk54-plugin-source-index.json`；报告：`docs/releases/2026-10-22-sdk54-m0-plugin-index-acceptance.md`。定义预先固定为 `sdk54-m0-plugin-index-cases.json` 的 IDX-01 至 IDX-09。

本轮只有入口/源码事实完整性；不替代全部公开 API、组件属性、插件选项、Harmony provider 实现或设备验收。stageClosable=false，fullPluginOptionsComplete=false。前两轮报告与输出保留。

## 执行与验收

- [x] P1：保存定义 hash，先写 fixture 契约与 RED，完成 workspace/源码入口发现和 AST 来源索引；最终新增 12 项测试通过。
- [x] P2：真实固定来源生成；141 workspace、41 包入口、308 输入，默认/版本化序列 21/25/10 项、双平台22个 provider，保留一处动态引用。
- [x] P3：两次字节一致；正常0，六类变异各1；工具回归274/274，类型检查及前两轮清单复核通过。
- [x] P4：IDX-01 至 IDX-09 逐项通过，报告、失败尝试、输入和证据 hash 落盘，总计划更新；不关闭 M0。

原始证据为 `outputs/sdk54/ai-e2e/20261022-m0-plugin-index/`。详细计划与原始证据按既有 ignore 规则仅本机保存；不提交、不发布。
