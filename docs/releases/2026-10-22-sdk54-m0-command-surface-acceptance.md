# SDK54 M0 第八轮：CLI命令与参数声明索引验收

日期：2026-10-22；run ID：`20261022-m0-command-surface`。

**M0 仍未关闭，完成50%（3/6）。** CMD-01至06通过，本轮仅完成M0-02/03的CLI声明面子集，不增加完整任务接受数；其他阶段完整单元仍0%，均未关闭。

## 1. 输入与交付

- 固定Expo commit：`5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`；tree：`5457e824b21d968e55c8f533cdf1751860160a92`。适配HEAD：`22cb245f383a194b52f94127f95bce534258b8cc`加未提交修改，见input-snapshot.json。
- 上游34输入、本地适配35输入，双方CLI manifest版本均54.0.27；来源分别标识。范围为CLI manifest、bin/*.ts、非测试src/**/index.ts和resolveOptions.ts，以及args/resolveArgs/variadic三个辅助函数文件。不是整个CLI所有实现文件。
- 上游逐文件Git blob与SHA256校验；本地逐文件SHA256。首次取回对象遇DNS受限，网络权限放开后成功；HTTP/1.1仅进程配置，未改全局Git配置。prefetch.log保留失败，prefetch-retry.log及prefetch-variadic.log保留成功；最终生成/检查均离线且禁止隐式Git取回。
- 实现：`scripts/sdk54/command-surface.mjs`、`command-surface-model.mjs`；测试：`__tests__/command-surface.test.mjs`。复用既有固定来源读取器、规范JSON序列化与递归重建校验，不修改既有工具。
- [用例定义](sdk54-m0-command-surface-cases.json)、[结果清单](sdk54-cli-command-surface.json)；设计/执行卡位于`docs/superpowers/{specs,plans}/2026-10-22-sdk54-m0-command-surface*.md`。
- Node v22.20.0、pnpm 10.19.0、TypeScript 5.9.3；无新依赖、发行物或设备候选。本轮没有执行上游/适配CLI命令，CLI单元回归与命令行为验收分别记录。
- 原始证据：`outputs/sdk54/ai-e2e/20261022-m0-command-surface/`；下文日志均相对此目录。

## 2. 每步实现与验收

| 步骤/用例 | 实际落实 | 结论及证据 |
| --- | --- | --- |
| P1 / CMD-01 | 冻结用例/设计/初始测试hash；34固定输入与35适配输入独立保存；选择器拒绝选中符号链接，排除测试/其他包；缺固定来源退出1且不写输出 | PASS；definitions-before.json、contract-red.tap.log、input-snapshot.json、missing-fixed-source.log |
| P2 / CMD-02 | 上游18入口/17去重handler，本地19入口/18 handler；默认start，35条迁移提示、2条废弃命令；add/install分别记录并关联同一handler；目标路径和导出存在性检查 | PASS；source-summary.json、contract-final.log；未知分发形态、缺目标/导出/默认入口和语法错误拒绝 |
| P2 / CMD-03 | 上游27解析调用/223参数声明，本地28/234；内联与词法const、Boolean/String/Number及数组、别名、额外StringOrBoolean/CustomBoolean、variadic允许及非布尔列表分层保存 | PASS；contract-final.log、结果清单；每条有稳定ID、行列、原始文本；辅助函数转发不计公开参数，未知spec/展开属性拒绝 |
| P2 / CMD-04 | 上游/适配各1个悬空别名，异常保留；14项声明差异逐条审阅并分配M0A/M1/M5补验动作；run switch平台分支与parser.permissive差异纳入比较 | PASS；differenceReviews、anomalyReviews、dispatch-edge-green.tap.log；无命令运行支持结论 |
| P3 / CMD-05 | 两次生成字节一致；删命令/参数/输入，改类型/别名/分发/permissive/hash，删差异/审阅，重复ID、伪完整共12类真实CLI负例全部退出1并指明JSON路径 | PASS；verification-results.json、negative-*.log；正常固定重建退出0 |
| P4/P5 / CMD-06 | 工具316/316、CLI500/500与类型通过；5份历史来源清单、缺陷基线、当前归属、目录/仓库/进度及diff检查通过；报告及证据hash归档复核 | PASS；tools/cli/types-final.log、regression-checks.json、closure-checks.json、evidence-verification.json |

本轮必达6项：PASS 6；FAIL/BLOCKED/NOT_RUN/缺失/重复均0。此集合只覆盖本轮索引工具；历史产品失败、环境失败及原生/设备未执行继续保留，不能据此关闭阶段。

## 3. 来源与适配差异

上游入口：run、run:ios、run:android、start、prebuild、config、export、export:web、export:embed、serve、install、add、customize、lint、login、logout、register、whoami。运行态、帮助可见性和迁移提示的实际行为未执行验收。

| 差异数量 | 声明事实 | 已落实审阅及后续归属 |
| --- | --- | --- |
| 1命令 | 本地新增run:harmony→expoRunHarmony | M0A移交入口；M5验证项目根、失败退出与Debug/Release构建运行 |
| 1参数 | prebuild新增--bundle-name:String | M1核验应用身份与配置快照；M5核验CLI转发和非法输入 |
| 10参数 | run:harmony声明--help、--configuration、--device、--port、--no-install、--no-bundler、--no-build-cache、--bundle-name及-h/-p别名 | 每项独立审阅；M5补有效/无效输入、参数组合及对应命令/设备结果 |
| 1解析器 | run:harmony新增assertWithOptionsArgs，permissive:false | M5对比run harmony与run:harmony、未知参数、--help和目录参数 |
| 1分支 | run的平台switch从android/ios/default增加harmony | M5验证平台选择和失败传播；M0A移交保留其他平台回归 |

合计14项，均只是静态声明差异。prebuild按platform进入Harmony的条件分支、帮助文本和底层实现变化仍由来源文本保留，本轮差异表没有做任意控制流/实现体语义比较。

悬空别名：上游与本地prebuild均声明`-t -> --type`，同一spec没有--type。本轮记录ALIAS_MISSING_TARGET和来源行列，未把它自动改成--template或删除；M5先用实际CLI复现再评估产品修复。fixture同时验证别名循环CYCLE，来源异常不会被静默当成已解析。

223/234含别名、多轮解析及variadic列表重复；按文件+参数名去重为176/187，均不是独立命令支持数。27/28是解析调用数，不能直接作为参数组的用户概念。上游211条模块关系：53外部、73选中来源、81范围外、4动态未解析；本地224条：57/78/85/4。相对缺目标为0；范围外不等于不存在或已验收。双方各9条辅助/variadic/二次解析边界明确保留，值转换、环境默认值、互斥选项、后续网络/构建及设备行为没有执行。

## 4. 验证与回归

| 实际命令 | 结果 | 日志 |
| --- | --- | --- |
| node --test scripts/sdk54/__tests__/command-surface.test.mjs | 11/11，退出0 | contract-final.log |
| pnpm test:sdk54-tools | 316/316，退出0 | tools-final.log、tools-result.json |
| pnpm test | 53文件、500/500，退出0 | cli-final.log、cli-result.json |
| pnpm type-check | CLI类型检查退出0；不是上游CLI完整类型/运行校验 | types-final.log、types-result.json |
| command-surface.mjs --source /tmp/sdk54-expo-source --adaptation . --check docs/releases/sdk54-cli-command-surface.json | 固定对象及当前适配重建一致，退出0；12类篡改退出1 | surface-check.log、verification-results.json |
| source-inventory/plugin-surface/plugin-source-index/runtime-api/config-contract --source /tmp/sdk54-expo-source --check 既有清单 | 5份均退出0 | regression-checks.json、对应*-check.log |
| verify-validation-baseline.mjs | 证据检查退出0；productFixed:false，9 PASS/5 FAIL/2 NOT_RUN保留 | baseline-check.log |
| legacy-ownership.mjs --output/--check 本轮ownership-current.json | 450文件、1809引用、48命令，均退出0 | ownership-generate.log、ownership-check.log |
| validate-catalog/check-repository/stage-progress --check、git diff --check | 均退出0 | regression-checks.json、closure-checks.json |

第五轮归属清单和旧接受hash未改写；本轮另存当前归属结果。新增3个工具/测试文件归RETAIN_TOOLING；未删除/迁移产品代码。

```bash
node scripts/sdk54/command-surface.mjs --source /tmp/sdk54-expo-source --adaptation . --output /tmp/sdk54-command-surface.json
node scripts/sdk54/command-surface.mjs --source /tmp/sdk54-expo-source --adaptation . --check docs/releases/sdk54-cli-command-surface.json
node --test scripts/sdk54/__tests__/command-surface.test.mjs
node outputs/sdk54/ai-e2e/20261022-m0-command-surface/verify-evidence.mjs
```

从仓库根目录执行。缺固定Git对象须显式--prefetch，不得换revision或用适配源码代替；适配源码变化后须重建并重新审阅差异。

## 5. 边缘情况与修改点

1. contract-red.tap.log保留实现前失败；contract-first.log复现普通spec的mode:null被调用startsWith导致8项失败，改为可选判断后contract-second.log为10/10通过；未删除失败测试。
2. dispatch-edge-red.tap.log补测发现差异表漏掉permissive和平台case变化；增加parser模式比较、按所属函数/序号稳定标识switch并比较case列表，green及最终11项通过。后续新增解析/分发维度须同时有“改值会产生差异”的负例，不能只验证记录存在。
3. const spec按词法块逐层解析，同名局部常量不会跨函数混用；不执行来源。重复参数名、展开spec、未知参数类型、缺分发导出、默认命令悬空均拒绝；辅助函数的schema参数不伪造为已知flag。
4. Boolean spec与StringOrBoolean/CustomBoolean额外层分别保留；variadic允许值不自动解释为Boolean；别名循环/悬空有明确状态。源码URI沿用规范JSON斜杠转义，仓库规则未放宽。

## 6. 进度及证据边界

本轮fullCommandRuntimeComplete:false、stageClosable:false。M0-02/03仍缺其他workspace公开API、其余插件选项和全量范围处置；M0-04四项目现状及SDK52识别/创建/运行真实回归未完成。M0仅M0-01/05/06已接受，仍50%（3/6）；M0A/M1/M2/M3/M4/M5/V/M6/M7/M8完整单元仍0%，均未关闭。没有设备、原生构建、发行消费或SDK52真实运行通过结论。

definitions-before.json固定实施前定义；input-snapshot.json保存环境、适配HEAD/未提交文件hash及双来源输入；source-inputs/、adaptation-inputs/保存实际内容。evidence-index.json保存原始证据hash，report.sha256固定报告；verify-evidence.mjs复核文件hash、34来源blob和命令结果，evidence-verification.json保存实际结果，避免自引用。

docs/superpowers/与outputs/仍被忽略，设计、执行卡及原始证据仅本机可复核；工具、结果和报告可跟踪但未提交。本轮未提交、未发布registry，产品运行时代码未改。
