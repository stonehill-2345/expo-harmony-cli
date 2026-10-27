# SDK54 M0 第三轮：插件入口与源码关系验收

日期：2026-10-22；run ID：`20261022-m0-plugin-index`。

结论：本轮插件入口发现、源码关系与变异校验子步骤已实现并实际验收；**M0 仍进行中，M0-A01/A02 未整体关闭**。来源索引不代表 Harmony 插件执行、选项完整展开或设备能力通过。未提交、未发布。

## 1. 定义与固定来源

- [总计划](../superpowers/plans/2026-10-21-sdk54-architecture-completion.md)、[本轮执行契约](../superpowers/plans/2026-10-22-sdk54-m0-plugin-index.md)。
- [预定义 IDX-01 至 IDX-09](sdk54-m0-plugin-index-cases.json)，SHA256 `5a8fd9543b0f523f6f9a89269e49d554e8cd2c4ce7e18b8876b19adbb3d1892b`；与执行前 `definitions-before.log` 一致，未删减或放宽必达定义。
- Expo revision `5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`；tree `5457e824b21d968e55c8f533cdf1751860160a92`。
- 第一轮包清单 SHA256 `fc95e76892e2c8c1a11664955de9e38825ba7c87d2d4ceb21ba4a0330056c6cc`；第二轮六插件选项清单 SHA256 `cd19275099e113c104c4ff96c5dcf6c3835e484a2c06822054a5f70ff1eee7db`。本轮均实际重校验通过，没有重写历史结果。
- [本轮结构化索引](sdk54-plugin-source-index.json) SHA256 `5a28a6a4a43c7523b2c056488a9ff2dfa7bab520bc6a151beb7b814337a6eb65`，两次离线生成逐字节相同。
- 适配 HEAD `22cb245f383a194b52f94127f95bce534258b8cc` 加未提交修改；源码、定义、环境和输入 hash 见 `input-snapshot.json`，不能仅用 HEAD 重建本轮代码。

## 2. 每一步实现与实际结论

原始证据：`outputs/sdk54/ai-e2e/20261022-m0-plugin-index/`。以下 PASS 仅针对本轮来源索引。

| 步骤/总任务 | 实现 | 实际验收与结论 |
| --- | --- | --- |
| P1 / M0-02 入口发现 | `plugin-source-index.mjs` 从固定 tree 与 workspace manifests 扫描每个包根 app.plugin.js/cjs/mjs/ts、显式 plugin subpath exports、plugin 目录，以及两个配置包 src；保存所有 workspace 的扫描结论 | IDX-01/02/05；141 个包逐一记录，41 个 app.plugin.js，夹具不冒充包入口；PASS |
| P1 / M0-02 源码追踪 | `plugin-source-facts.mjs` 使用 TypeScript AST 读取 import/export/require/require.resolve/import-type、ConfigPlugin 变量声明、withPlugins 组合、字符串数组和 provider 属性；静态相对引用扩展到固定源码闭包 | 308 个输入文件均含 Git blob/SHA256；缺来源、非法语法、symlink、歧义源文件或 blob 不匹配直接失败；PASS |
| P2 / M0-02 内置插件与 provider | 保留默认 iOS/Android 和版本化列表原顺序、tuple、inline 函数、SDK52/unversioned 分类、mod provider 成员及 getFilePath/read/write 源码；bare/dynamic 明确未解析 | IDX-03/04/07；真实序列 21/25/10 项、31 个字符串列表项、13 个 Android 与 9 个 iOS provider；PASS，不代表执行顺序或平台效果已经验证 |
| P3 / M0-03 完整性与回归 | 从固定来源重建并逐 ID/完整内容核对；不信任自报 hash 或完成标记；提供 `sdk54:source:plugin-index` 脚本入口 | IDX-06/08/09；正常 CLI 0，六类变异各 1；工具 274/274，类型检查和前两轮清单重校验通过；PASS |
| P4 / 验收落实 | 保存定义、RED、修正、真实命令/退出码、输入快照、证据索引和本报告；更新总计划与执行卡 | 9 个必达子用例均有证据；统一 V runner 尚未交付，本报告不冒充阶段自动关闭结论 |

入口扫描以固定 workspace 根和声明为边界，尚未解析任意 npm main/exports 的运行时插件识别，亦未遍历任意第三方 npm 包。相对引用支持固定文件/扩展名/index 及 build-to-source 投影；不支持的解析形式明确失败。

## 3. 真实来源事实

| 记录 | 实际数量/事实 | 边界 |
| --- | --- | --- |
| workspace 扫描记录 | 141；其中 41 个包根 app.plugin.js | 无入口记录不等于无其他公共 API；41 不等于适配完成数量 |
| 源码输入 | 308；config-plugins 88、prebuild-config 52、其他插件及相对引用 168 | 每个文件有 blob/SHA256；配置 JSON/JSONC 也计入文件数 |
| AST 导出记录 | 995 | 包含 re-export、类型、CommonJS、内部文件导出；不是去重后的 SDK 公共 API 总数 |
| ConfigPlugin 变量声明 | 202 | 只登记显式类型引用的变量声明及类型参数原文；不代表所有插件选项已展开 |
| withPlugins 调用 | 10 | 语法事实，非完整语义调用图；非字面量数组保留表达式与 staticArray=false |
| 引用 | relative 469、bare 443、dynamic 1 | relative 无悬空目标；bare 未执行 npm 解析；dynamic 保持 UNRESOLVED |
| 默认/版本化源码列表 | withIosExpoPlugins 21、withAndroidExpoPlugins 25、withVersionedExpoSDKPlugins 10 | 保留源码声明顺序；dangerous mods 的实际逆序等运行规则未在本轮执行 |
| 包名字符串列表 | versionedExpoSDKPackages 10、legacyExpoPlugins 18、expoManagedVersionedPlugins 3 | 独立保存原始顺序；不能将历史包名列表当作实际已安装模块或有效平台能力 |
| mod provider | Android 13，iOS 9 | 成员区分 method/property，包含 isIntrospective 等属性；没有 Harmony provider 实现结论 |

实际检查了默认数组每一项、全部三个包名数组、两平台 provider 的全部名称与 getFilePath/read/write。版本化序列保留 `withSystemUI` 在 `withSplashScreen` 之前；Android 的 IntentFilters/Scheme、SDK52 77/78、inline EdgeToEdge 以及最后的 PackageRefactor 均保留原位置。

SDK52 两个兼容文件独立登记为 `prebuild-sdk52`。77 的版本判断在导出插件回调中，78 在 `isTargetSdkVersionAsync` helper 中；均按真实 Git 内容和 hash 复核，**SDK52 实际运行回归仍 NOT_RUN**。

唯一动态引用是 `packages/@expo/config-plugins/src/utils/plugin-resolver.ts:202` 的 `require(filePath)`。工具保存表达式、位置和未解析状态，不为它构造虚假目标；443 条 bare 引用同样保留 NOT_RESOLVED。模块间 import/export 只记录语法与来源，不做完整符号、数据流或运行时分析。

范围沿用总计划：包级 expo-updates 关联 DEFER-UPDATES，expo-dev-client 关联 DEFER-DEV-CLIENT；共享配置包与其余包继续“未评估”，没有按依赖关系自动整包排除。所有 implementation 仍为“未评估”，runtimeAcceptance 为 NOT_RUN；三个完成字段保持 false。

## 4. 九个必达用例结果

| ID | 实际断言/证据 | 状态 |
| --- | --- | --- |
| IDX-01 | 所有 workspace 有扫描记录；精确根 wrapper、空入口、排除夹具、manifest plugin export 与包根 build 投影；`green-4.tap.log` | PASS |
| IDX-02 | 静态/动态 import、require、require.resolve、import-equals/type、export 位置；build/src/产物分离；循环相对引用终止；同上 | PASS |
| IDX-03 | withPlugins 原顺序、tuple、inline、spread、非数组表达式及字符串列表；同上 | PASS |
| IDX-04 | sdk52/unversioned 分类、ConfigPlugin 类型参数、provider 成员及 method/property 区分；同上 | PASS |
| IDX-05 | 缺来源、symlink、语法、源码歧义、blob 不匹配均拒绝；tsconfig JSONC 合法、普通 JSON 非法尾逗号和损坏 config 拒绝；同上 | PASS |
| IDX-06 | 删除包/模块/组合项、重复 ID、改来源、伪改完成字段均拒绝；错误 CLI 参数退出 1；同上 | PASS |
| IDX-07 | 独立以 tree 和 workspace 根核对 41 入口、两个配置包全部选定 src；完整三组默认/版本化数组、包名列表、provider、动态引用与 SDK52 来源；`real-source-results.json` | PASS |
| IDX-08 | 两次真实生成字节相同；正常 0；删入口/模块/组合项、重复模块 ID、改来源 SHA256、伪改关闭字段六类负例各 1；`source-repeat.log`、`check-*.log` | PASS |
| IDX-09 | 274 工具测试、类型检查、前两轮清单重校验、catalog/仓库边界；输入和证据 hash | PASS |

应有 9，PASS 9，FAIL 0，BLOCKED 0，NOT_RUN 0，缺失 0，重复 0。该集合仅覆盖本轮索引，不改变 M0 总验收状态。

## 5. 命令与失败修正

```bash
node --test scripts/sdk54/__tests__/plugin-source-index.test.mjs
node scripts/sdk54/plugin-source-index.mjs --source /tmp/sdk54-expo-source \
  --output docs/releases/sdk54-plugin-source-index.json
node outputs/sdk54/ai-e2e/20261022-m0-plugin-index/verify-real-source.mjs
pnpm test:sdk54-tools
pnpm type-check
node scripts/sdk54/source-inventory.mjs --source /tmp/sdk54-expo-source \
  --check docs/releases/sdk54-source-package-inventory.json
node scripts/sdk54/plugin-surface.mjs --source /tmp/sdk54-expo-source \
  --check docs/releases/sdk54-first-plugin-surface.json
node scripts/sdk54/validate-catalog.mjs
node scripts/sdk54/check-repository.mjs
git diff --check
```

最终新增单测 12/12；完整工具回归 274 tests、274 pass、0 fail/skip/cancel/todo，约 29 秒；CLI 类型检查和其余检查均退出 0。类型检查仅覆盖既有 CLI tsc 范围。环境 Node v22.20.0、pnpm 10.19.0、TypeScript 5.9.3、macOS。未检查签名或设备，不记设备 PASS/BLOCKED。

| 尝试/边缘情况 | 实际失败与修改点 |
| --- | --- |
| 契约先行 | 工具未实现时 RED，`red.tap.log` 保留；首版 `green-1.tap.log` 7/7 |
| 固定 blob 预取 | 首次沙箱 DNS 失败，`prefetch-initial.log` 保留；官方来源网络重试成功，`prefetch-initial-network.log`；默认工具仍离线 |
| 已提交 js/d.ts/src 并存 | 首次真实生成误报源码歧义，`source-generate-1.log`；先补 `artifact-red.tap.log`，再优先映射源码并独立保存已有构建文件路径，d.ts 不与 js 混为同层运行候选；同层多个 TS 源码仍明确拒绝 |
| require.resolve | 上述补测先记录漏项失败，后纳入静态与动态引用记录；保留 statement 以复核 import/require 原语句 |
| TypeScript 配置为 JSONC | `source-generate-2.log` 被尾逗号阻断；`jsonc-red.tap.log` 先复现，再用 TS 配置解析器读取 tsconfig/jsconfig；普通 JSON 继续严格解析 |
| provider 属性与方法 | 首版字段 methods 混入 isIntrospective 等普通属性；`provider-red.tap.log` 先记录新契约失败，再改为 members 并区分 kind，最终 `green-4.tap.log` 12/12 |
| 真实 SDK52 断言假设错误 | `real-source-run.log` 错误假设 77/78 版本判断都在公开导出函数中；读取实际源码后分别核对导出回调/helper，未修改必达定义；`real-source-run-2.log` 全部通过 |

后续约束：源码解析规则先覆盖真实提交形态；配置文件使用所属工具链解析器；事实字段按语法准确命名；逐文件检查版本保护的位置，不从目录名或相似函数推导行为。此前失败和修正记录全部保留。

## 6. 未完成范围与证据

- M0-02/03：除第二轮六插件外的选项展开、全部 SDK API/组件属性、完整外部身份/依赖、53 个仅来源包与42个种子缺项的用途/范围裁定仍未完成；本轮没有以 995 条语法导出取代全部公共 API 清单。
- M0-04/05/06：两模板 × npm/pnpm 与 SDK52 真实基线、旧代码调用图与归属、semver/alias/传递依赖复现、Core 文档和分包测试矩阵仍待实施。
- M0A-M8/V：适配 create、Harmony 插件执行、构建/安装/设备闭环未在本轮执行。
- 下一步以本轮固定来源继续公开选项/API 展开和差异范围评估；M0 未关闭前不跳过阶段前置条件。

报告、定义和清单位于可跟踪的 `docs/releases/`，当前未提交。详细执行契约与原始证据位于被忽略的 `docs/superpowers/`、`outputs/`，**仅本机可复核**，没有共享归档结论。

`input-snapshot.json` 保存实现/输入/环境 hash，`evidence-index.json` 保存证据文件 hash，`report.sha256` 单独保存本报告 hash，避免自引用。源码可按第一轮报告复取固定 commit，再使用显式 `--prefetch` 获取尚缺对象；正常生成与校验均已离线执行。
