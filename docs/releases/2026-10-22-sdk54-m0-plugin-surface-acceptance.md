# SDK54 M0 第二轮：首批插件公开选项验收

日期：2026-10-22；run ID：`20261022-m0-plugin-surface`。

结论：六个首批插件的声明展开、源码事实与双向清单校验已实现并实际验收；**M0 仍进行中，M0-A01/A02 未整体关闭**。本轮没有 Harmony 插件执行、构建或设备验收结论，没有提交或发布。

## 1. 固定输入与输出

- 总计划：[SDK54 Harmony 新架构阶段开发与验收计划](../superpowers/plans/2026-10-21-sdk54-architecture-completion.md)。
- 本轮[设计](../superpowers/specs/2026-10-22-sdk54-m0-plugin-surface-design.md)、[执行卡](../superpowers/plans/2026-10-22-sdk54-m0-plugin-surface.md)。
- 预先定义：[PLG-01 至 PLG-10](sdk54-m0-plugin-surface-cases.json)，SHA256 `a068f61122b2a17122e39c619c79867e076839e0e76048c490d13ee00e62eef0`；与执行前 `definitions-before.log` 相同，未放宽必达定义。
- Expo commit `5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`；tree `5457e824b21d968e55c8f533cdf1751860160a92`。
- 第一轮包清单 SHA256 `fc95e76892e2c8c1a11664955de9e38825ba7c87d2d4ceb21ba4a0330056c6cc`；本轮重新从固定来源校验，退出 0。
- 实现基于 HEAD `22cb245f383a194b52f94127f95bce534258b8cc` 和未提交修改；实现、定义、标准库及环境摘要见 `input-snapshot.json`，不能只用 HEAD 重建本轮代码。
- 编译器直接锁定 TypeScript `5.9.3`；83 个 Git 输入包含六插件目录、`@expo/prebuild-config/src`、`@expo/config-types/src` 和两个包入口 manifest，每个输入都有 blob ID/SHA256。
- [生成清单](sdk54-first-plugin-surface.json) SHA256 `cd19275099e113c104c4ff96c5dcf6c3835e484a2c06822054a5f70ff1eee7db`。两次真实生成逐字节相同。

| 插件 | 固定源码版本 | TypeScript 路径 | Schema 路径 |
| --- | --- | ---: | ---: |
| Asset | 12.0.13 | 2 | 0 |
| Font | 14.0.12 | 14 | 0 |
| Splash | 31.0.13 | 43 | 0 |
| SystemUI | 6.0.9 | 0，另存配置访问事实 | 0 |
| Router | 6.0.24 | 14 | 31 |
| WebBrowser | 15.0.11 | 1 | 0 |

共 105 条路径记录，包含数组元素 `[]`、开放字典 `*` 及 TS/schema 各自记录，**不是 105 个独立用户选项，也不是适配成功数量**。每插件仍为 `implementation:未评估`、`runtimeAcceptance:NOT_RUN`；`stageClosable:false`、`fullSdkPublicSurfaceComplete:false`。

## 2. 逐步骤实现与验收结论

原始证据目录：`outputs/sdk54/ai-e2e/20261022-m0-plugin-surface/`。以下 PASS 均限定为本轮来源枚举子步骤。

| 步骤/总任务 | 具体实现 | 实际验收 | 结论 |
| --- | --- | --- | --- |
| P1 / M0-02 固定来源与展开 | `plugin-surface.mjs` 复用 Git 对象读取；`plugin-surface-types.mjs` 使用虚拟 CompilerHost、type checker，按锁定 manifest 解析跨包入口，展开别名、intersection、indexed access、Record、数组、字面量 | PLG-01/04/05/07；83 输入；Splash drawable/dark/density/tablet 和 Font 嵌套 style 均有来源 | PASS；只覆盖六个插件声明，未完成全部公开面 |
| P2 / M0-02 Router 两种声明 | 分别保存 ConfigPlugin 类型和完整原始 schema；展开本地 JSON Pointer 引用、required、enum、开放字典；输出双向缺项、类型与 required 差异 | PLG-02/03/08；真实差异可由保存的双方声明重新生成，共 26 条差异 | PASS；差异已记录，尚未裁定 Harmony 采用哪种契约 |
| P3 / M0-03 完整性与回归 | 从固定来源重新生成，不信任自报 hash；逐 ID 与完整内容比较，检查来源/类型/重复/关闭标记 | PLG-06/09/10；正常 CLI 0；五种变异各 1；262 工具测试通过 | PASS；仅本轮清单校验，不关闭全量 M0-A01/A02 |

## 3. 必达用例逐项实际结果

| 用例 | 实际断言与证据 | 结论 |
| --- | --- | --- |
| PLG-01 | 跨包 alias/intersection/数组/字面量及 indexed access/NonNullable，固定 manifest 的非 index 入口；`green-4.tap.log` 及完整回归 | PASS |
| PLG-02 | refs、escaped pointer、嵌套数组、required、enum、additionalProperties；数组元素定位至 items/ref 定义 | PASS |
| PLG-03 | 双向缺项、类型/required 差异，不改写双方原声明 | PASS |
| PLG-04 | 缺失/any/unknown/循环类型、缺失/外部/循环 refs 明确失败；补测不支持 schema 结构、混合组合及歧义属性路径均拒绝 | PASS |
| PLG-05 | AST 保存访问、fallback/或表达式与 spread 位置；SystemUI 零显式 props 仍保留四条真实配置 fallback；`real-source-results.json` | PASS |
| PLG-06 | 删除 nested option、改 type/source、重复 ID、伪改完成标记，库级校验全部拒绝 | PASS |
| PLG-07 | 真实 Splash 的 drawable icon/darkIcon、五档 density 及 dark、iOS tablet/dark tablet；Font family/definitions/path/weight/style，style 包含 normal/italic | PASS |
| PLG-08 | 重建全部 Router 差异；核对 origin/asyncRoutes 与四平台、两种 partial 名称、redirects/rewrites、headers；methods 七种枚举与 source/destination required | PASS |
| PLG-09 | 第二次真实输出与落盘清单逐字节一致；正常退出 0；删除 `android.drawable.darkIcon`、改 Font style 类型、改 Splash 来源、重复 Asset ID、伪改完成字段均退出 1；七份命令日志 | PASS |
| PLG-10 | 工具 262/262、CLI 类型检查、第一轮来源清单重校验、catalog 与仓库边界均退出 0；固定 hash 和输入快照 | PASS |

本轮定义集合：应有 10，PASS 10，FAIL 0，BLOCKED 0，NOT_RUN 0，缺失 0，重复 0。`PLG-05-real` 是 PLG-05 的补充证据，不新增必达用例。统一 V runner 尚未交付，本表依据真实测试和命令结果汇总，不是阶段自动关闭报告。

## 4. 真实源码行为复核与边界

| 插件 | 来源事实 | 本轮结论与边界 |
| --- | --- | --- |
| Asset | `withAssets.ts:21/22` 使用 `props.assets ?? []` | 选项缺省列表可定位；不代表 Harmony 资源复制已实现 |
| Font | `withFonts.ts:34/40` 拼接通用 fonts 与平台 fonts；`withFontsAndroid.ts:94` 使用 `definition.style || 'normal'` | 保留拼接顺序和默认表达式；未执行字体构建或运行加载 |
| Splash | `withSplashScreen.ts:27` 的 resizeMode 默认 contain；39-56 行平台 props 覆盖通用 props、dark 独立合并；Android getter 的 imageWidth 默认 100，legacy 分支为 200 | 保留跨包声明与分支来源；iOS getter 的背景/resizeMode 等默认值可复核；未把 Android/iOS 默认值当作 Harmony 设计结论 |
| SystemUI | Android/iOS 的 root background 优先平台字段再取通用字段；userInterfaceStyle 读取平台/通用字段，iOS 最后取 light | 零 props 不等于无功能；四条完整表达式及行号已自动断言；未验证 Harmony 系统栏与主题效果 |
| Router | `index.ts:46` 的 `_props || {}`；schema 校验后写入 `extra.router` | 记录声明差异和配置写入，不宣称下游功能已经消费所有字段 |
| WebBrowser | `withWebBrowser.ts:12` 在 props 不存在或 experimentalLauncherActivity 非真时跳过对应 Android 改动 | 保留条件访问事实；未执行浏览器能力或 Harmony 原生注册 |

AST 的 `read` 是属性访问语法分类，不能代替完整读写/数据流分析；`fallback` 同时覆盖 `??` 与 `||`，其中普通布尔判断不能自动解释为默认值。默认值和覆盖关系以源码人工复核为准。

Router 已知差异：TS-only `partialTypedGroups`；schema-only `partialRouteTypes`、`platformRoutes`、redirects/rewrites 全部子路径、`asyncRoutes.*`。origin、asyncRoutes/ios/android/web/default 存在类型差异，headers 存在 required 差异。redirects/rewrites item 未声明 `additionalProperties:false`，故保留开放 `*` 路径。schema 的 uniqueItems/default/description 等仍保存在 rawSchema 中，本工具不是通用 JSON Schema 验证器。

## 5. 实际执行与失败修正

在仓库根执行：

```bash
node --test scripts/sdk54/__tests__/plugin-surface.test.mjs
node scripts/sdk54/plugin-surface.mjs --source /tmp/sdk54-expo-source \
  --output docs/releases/sdk54-first-plugin-surface.json
node outputs/sdk54/ai-e2e/20261022-m0-plugin-surface/verify-real-source.mjs
pnpm test:sdk54-tools
pnpm type-check
node scripts/sdk54/source-inventory.mjs --source /tmp/sdk54-expo-source \
  --check docs/releases/sdk54-source-package-inventory.json
node scripts/sdk54/validate-catalog.mjs
node scripts/sdk54/check-repository.mjs
git diff --check
```

| 检查 | 最终实际结果 | 证据 |
| --- | --- | --- |
| 新增插件工具测试 | 13/13，无失败/跳过 | `green-4.tap.log` |
| SDK54 工具全部回归 | 262 tests、262 pass、0 fail/skip/cancel/todo，约 28 秒，退出 0 | `regression-tools.log` |
| CLI 类型检查 | 退出 0，仅现有 CLI tsc 范围 | `type-check.log` |
| 首轮清单复核 | valid true，failures 空，退出 0 | `source-index-recheck.log` |
| catalog/仓库边界 | failures 空，退出 0；catalog 的 14 包不代表全量支持 | `catalog-check.log`、`repository-check.log` |
| 真实来源与变异 | 重复相同、正常 0、五类负例各 1 | `real-source-results.json`、`source-repeat.log`、`check-*.log` |

环境：macOS、Node `v22.20.0`、pnpm `10.19.0`、TypeScript `5.9.3`。本轮未检查设备或签名，没有设备 PASS/BLOCKED。

失败及修正均保留，不覆盖失败日志：

1. 契约先行时工具尚不存在，`red.tap.log` 记录失败。
2. 首次真实生成遇跨包类型 any：config-types 实际 types 指向 `build/ExpoConfig.d.ts`，不是假定的 index；先补 `root-import-red.tap.log`，再按固定 package manifest 解析至对应 src，后续生成成功。
3. false/true 字面量被扩大、schema array item 指向父属性：先保存 `edge-red.tap.log` 两个失败，再保留 literal 与 items/ref 层级来源；`green-3.tap.log` 11/11。
4. schema 混合 composition 或 patternProperties 等结构可能静默少报，属性名含 `.[]*` 或空字符串会使路径歧义：`structure-red.tap.log` 先记录两个失败，再明确拒绝未支持结构/混合组合/歧义路径；`green-4.tap.log` 13/13。新增支持必须先定义路径或组合语义，不能截断后成功。
5. 全 workspace 离线安装因旧 `@tsd/typescript@5.0.4` 缺元数据失败；将 TypeScript 精确加入根 lock importer 后，`pnpm --filter expo-harmony-workspace install --frozen-lockfile --offline --ignore-scripts` 成功。`install.log`/`install-filtered.log` 保留，没有把首次失败改记成功。

后续约束：跨包解析以锁定 manifest 为准；每层类型/来源都测边界；新的结构形状先测明确失败，再扩展，避免默认放过造成虚假完整性。

## 6. 未完成范围与证据保存

- M0-02：全部 SDK API/组件属性、其余默认/版本化插件、53 个仅来源包和42个种子缺项的逐项来源/用途/范围结论未完成。
- M0-03：全部公开面、依赖归属与完整性校验未完成；本轮只完成六插件选项子集合。
- M0-04/05/06：两模板 × npm/pnpm 现状与 SDK52 真实回放、旧调用图/归属、semver/alias/传递依赖最小复现、Core 文档和分包测试矩阵未完成。
- M0A-M8/V：真实适配创建、Harmony 插件实现、构建/安装/设备闭环未在本轮执行；不得用上述工具回归替代。
- 下一步继续全量公开面和其余插件来源枚举、差异范围评估，按 M0 总契约逐项收敛。

报告、预定义和清单位于可跟踪的 `docs/releases/`，当前未提交。`docs/superpowers/` 与 `outputs/` 受已有 ignore 规则影响，设计、执行卡、验收脚本及原始证据**仅本机可复核**，没有团队共享归档结论。

`input-snapshot.json` 保存实现和输入内容 hash；`evidence-index.json` 保存原始证据 hash；`report.sha256` 单独记录报告 hash，避免索引自引用。固定源码可按第一轮报告复取，再显式使用 `--prefetch` 获取缺失 blobs；默认运行只读取本地 Git 对象。
