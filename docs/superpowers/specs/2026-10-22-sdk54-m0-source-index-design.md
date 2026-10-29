# M0 第一轮：固定来源与包级完整性设计

日期：2026-10-22。关联：`2026-10-21-sdk54-architecture-completion-design.md`。

## 本轮边界

实施 M0-01 的 Expo workspace 来源固定，以及 M0-02/03 的包级清单和双向校验。
这是 M0 的第一步，不能关闭 M0-A01/A02 的全部 API/属性/插件选项验收。
M0-04/05/06、真实创建与设备验收在本轮未执行，保持 NOT_RUN。

## 输入与决策

- Expo：`expo/expo@5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`，与现有 catalog 一致。
- 使用 Git commit/tree/blob 读取来源，不依赖 checkout 工作区、不扫描当前 14 包冒充完整 workspace。
- 根 `package.json` 的 workspaces 决定包集合；templates 下的清单另列，不被 workspace 配置遗漏。
- 只支持明确实现的 workspace glob 语法；遇到无法解析的语法报错，不能静默少枚举。
- Gitlink、符号链接、所有普通文件均计入来源树摘要；清单内容仅从普通 Git blob 读取。
- 工具默认离线；显式 `--prefetch` 才按固定 blob ID 获取缺失 package manifests。
- 当前 npm 的 `create-expo-app@5.0.0` 是转发包，真实执行依赖为 `create-expo >=5.0.1`。
  保存其实际包完整性与源码信息，但不把 wrapper 单独视为已固定的创建工具。
  5.0.1 的源码属于另一 commit，不能直接认定兼容。
- 实际 Git 核验后，选择固定 SDK54 workspace 中的 `create-expo@3.5.11` 为适配源码基线；
  default `54.0.63` / blank-typescript `54.0.47` 模板同源。registry gitHead 独立记录，未声明构建等价。

## 输出契约

`scripts/sdk54/source-inventory.mjs` 输出版本化 JSON：固定 revision、tree ID、全树路径/对象摘要、根 manifest 摘要、workspace patterns、包/模板稳定 ID、版本、入口、脚本、依赖、manifest blob/SHA256、包内文件数及摘要。
不包含绝对路径、时间戳、机器环境，重复枚举字节一致。

校验模式重新从固定 Git 来源枚举，逐 ID 比较：缺失、额外、重复、内容改变、来源不符全部失败。
校验不信任清单自报的条目数或 hash；删记录后重算自报 hash 仍不能通过。
来源包不存在、JSON 解析失败、无法读取 blob 或重名 workspace 都要失败。

`completeness.publicSurface=false` 显式表示尚未完成公开 API/组件属性/插件嵌套选项枚举。
包级通过不得解释为阶段关闭。后续扩展 publicSurface 时另加语义解析器与契约测试。

`source-seed-diff.mjs` 从现有 bundledNativeModules、catalog 与六个配置/创建核心种子重建 130 项集合，
逐条记录是否存在于固定 workspace，并列出仅来源存在的新增项。所有差异保留待评估状态，
不在 workspace 不等于废弃/不适用，也不直接扩大第三方适配承诺。

## 边缘情况

- scoped 路径、private workspace、模板不在 workspaces：保留真实来源与类别。
- 同包多个 manifest：ID 冲突即报错，不以包名去重吞掉来源。
- fixture 的 package.json：只有命中 workspace 或 templates 的根清单才成为包条目。
- dirty checkout：读取固定对象，因此工作区修改不影响枚举；清单并非适配源码快照。
- 不完整浅克隆：允许树齐全而 blob 缺失；离线明确失败，显式预取后再运行。
- 错误 revision/篡改清单/未知 glob：非零退出，打印定位。

## 验收映射

包级子用例归属 M0-A01、M0-A02；其余范围保持未关闭。
证据记录到 `outputs/sdk54/ai-e2e/20261022-m0-source-index/`，报告保存在 `docs/releases/`。
详细设计和计划受现有 ignore 规则影响，仅本机保存；可跟踪的报告写明限制，不更改 ignore、不暂存、不提交。
