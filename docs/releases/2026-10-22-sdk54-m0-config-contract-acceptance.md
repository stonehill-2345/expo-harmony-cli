# SDK54 M0 第七轮：配置类型与文档schema契约验收

日期：2026-10-22；run ID：`20261022-m0-config-contract`。

**M0 仍未关闭，完成50%（3/6）。** 本轮完成M0-02/03配置契约调查子集，CFG-01至06通过；不增加完整任务接受数。其他阶段完整单元仍为0%，均未关闭。

## 1. 输入与实现

- 固定Expo commit：`5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`；tree：`5457e824b21d968e55c8f533cdf1751860160a92`。适配HEAD：`22cb245f383a194b52f94127f95bce534258b8cc`加未提交修改，具体文件hash见input-snapshot.json。
- 固定7输入：config-types的ExpoConfig.ts、package.json、generate.js，v54.0.0与unversioned文档schema，CLI getExpoSchema.ts及Doctor getSchemaAsync.ts。config-types版本54.0.10；逐文件Git blob完整性与SHA256验证。
- [冻结用例](sdk54-m0-config-contract-cases.json)、[结果清单](sdk54-config-contract.json)；实现为`scripts/sdk54/config-contract.mjs`、`config-contract-model.mjs`，11项契约测试位于`__tests__/config-contract.test.mjs`。
- 设计/执行卡：`docs/superpowers/specs/2026-10-22-sdk54-m0-config-contract-design.md`、`docs/superpowers/plans/2026-10-22-sdk54-m0-config-contract.md`。definitions-before.json保留实施前用例、设计、执行卡和初始测试hash；后续增加的边缘测试另见最终输入快照。
- Node v22.20.0、pnpm 10.19.0、TypeScript 5.9.3；未新增依赖。本轮无发行物/模板候选，不执行原生构建或设备操作。
- 原始证据目录：`outputs/sdk54/ai-e2e/20261022-m0-config-contract/`，下文日志均相对此目录。

## 2. 步骤与验收结论

| 步骤/用例 | 具体实现与实际结果 | 结论及证据 |
| --- | --- | --- |
| P1 / CFG-01 | 固定7输入，逐文件blob/字节数/SHA256；选择器拒绝缺文件、符号链接、gitlink；缺固定Git来源时CLI退出1且不写文件；先冻结用例再实现 | PASS；definitions-before.json、contract-red.tap.log、contract-final.log、missing-fixed-source.log、input-snapshot.json |
| P2 / CFG-02 | TypeScript AST解析7接口、401语法类型节点，投影ExpoConfig的285字段路径；35根属性，联合/数组/元组/引用/开放索引有结构ID、文本和行列；未知语法、循环、重复属性和缺引用拒绝 | PASS；generate-final.log、contract-final.log；未加载宿主类型库或执行来源代码 |
| P2 / CFG-03 | 每份schema保存332节点、268字段路径和35根属性；原始映射、约束、meta、tsType、not、布尔schema及元组完整保留；合成根显式synthetic，根必填UNKNOWN | PASS；结果清单、contract-final.log；fallback未推断为运行默认值 |
| P2 / CFG-04 | 类型对SDK54共54项差异，54条独立来源审阅结论与M1后续动作；SDK54对unversioned字段差异0且原始字节相同；3个消费端的来源锚点与行号保存 | PASS；differenceReviews及comparisons；不认定在线schema等同文档映射，不认定Harmony已实现 |
| P3 / CFG-05 | 两次生成字节一致；删类型字段/删schema字段、改类型/必填/meta、删来源、错hash、删差异/审阅、重复节点、伪完成共11类真实CLI变异均退出1，错误含JSON路径 | PASS；verification-results.json、generate-repeat.log、negative-*.log；正常重建检查退出0 |
| P4/P5 / CFG-06 | 工具305/305、CLI500/500与类型检查通过；4份既有来源清单、缺陷基线、当前归属、目录/仓库/进度和diff检查通过；输入与原始证据hash归档并复核 | PASS；tools-final.log、cli-final.log、types-final.log、regression-checks.json、closure-checks.json、evidence-verification.json |

本轮必达集合6项：PASS 6、FAIL/BLOCKED/NOT_RUN/缺失/重复均0。此集合只覆盖本轮调查工具；第四轮产品失败与原生/设备NOT_RUN保持原状。

## 3. 54项差异的具体结论

| 数量 | 差异 | 已落实结论与后续归属 |
| --- | --- | --- |
| 35 | 根属性required | ExpoConfig中name/slug必填，其余可选；文档文件只有字段映射，未提供根required。本轮标记UNKNOWN；M1须固定实际消费schema补验 |
| 11 | 类型有开放索引，文档未显式列additionalProperties | 涉及Splash及dark、buildCacheProvider.options、locales嵌套对象、web.config/firebase等。缺显式声明不表示拒绝任意键；M1通过实际消费schema和插件配置往返核验 |
| 6 | 类型独有命名字段路径 | pathAdvancedPattern/pathSuffix在Android intentFilters.data对象与数组两分支共4路径，另有androidNavigationBar.enforceContrast、experiments.autolinkingModuleResolution。只证明文档未枚举；M1逐字段补输入/输出快照 |
| 1 | android.versionCode：number对integer | TypeScript不能用number表达整数约束；M1补整数/非整数及边界实际校验 |
| 1 | android.edgeToEdgeEnabled：true字面量对boolean | 类型与文档可接受值表达不同；M1核验true/false，不推断运行默认值或Harmony行为 |

285/268是按结构路径合并联合分支后的调查记录，含数组元素、元组位置及开放字典路径，不是配置键数量或支持数量。不同分支的基础类型、字面量、requiredStates及来源集合同时保留；not/正则/数值等约束仍保存在schema节点与raw中，没有做语义等价或运行校验。

两份文档schema在本固定commit共用blob `3c43429c10465386aef678f0114492372c0278fd`，SHA256 `01cd9038f82556b0650d431675ba3608ecd790b7cbfd0cc36658b0532af270d3`；不代表其他版本或未来内容一致。

generate.js读取在线响应data.data.schema，本地--path分支要求.schema；CLI读取json.schema并derefSchema，另有EXPO_UNIVERSE_DIR的server schema分支；Doctor读取resultJson.data?.schema。本轮没有请求在线schema接口，不能把文档文件冒充这些消费者实际收到的数据。首次取回固定Git对象遇TLS失败，HTTP/1.1进程级重试后成功，未改全局Git配置；该取回发生在实施前调查中，没有原始落盘日志，本轮最终生成和检查均离线。

## 4. 回归与复核

| 命令 | 实际结果 | 证据 |
| --- | --- | --- |
| node --test scripts/sdk54/__tests__/config-contract.test.mjs | 11/11通过，退出0 | contract-final.log |
| pnpm test:sdk54-tools | 305/305通过，退出0 | tools-final.log、tools-result.json |
| pnpm test | 53文件、500/500通过，退出0 | cli-final.log、cli-result.json |
| pnpm type-check | CLI tsc退出0；不是上游全部接口的语义类型检查 | types-final.log、types-result.json |
| config-contract.mjs --source /tmp/sdk54-expo-source --check docs/releases/sdk54-config-contract.json | 固定对象重建一致，退出0 | config-check.log、verification-results.json |
| source-inventory/plugin-surface/plugin-source-index/runtime-api --source /tmp/sdk54-expo-source --check 对应既有清单 | 四份既有清单均退出0 | *-check.log、regression-checks.json |
| verify-validation-baseline.mjs | 证据一致，退出0；productFixed:false，9 PASS/5 FAIL/2 NOT_RUN原状保留 | baseline-check.log |
| legacy-ownership.mjs --output/--check 本轮ownership-current.json | 447文件、1794引用、48命令；生成/检查退出0 | ownership-generate.log、ownership-check.log |
| validate-catalog/check-repository/stage-progress --check、git diff --check | 均退出0 | regression-checks.json、closure-checks.json |

当前归属结果另存本轮目录；第五轮已接受的历史归属清单和接受hash未改写。本轮新增3个工具/测试文件由既有工具归属规则覆盖，没有删除或迁移产品代码。

可复核：

```bash
node scripts/sdk54/config-contract.mjs --source /tmp/sdk54-expo-source --output /tmp/sdk54-config-contract.json
node scripts/sdk54/config-contract.mjs --source /tmp/sdk54-expo-source --check docs/releases/sdk54-config-contract.json
node --test scripts/sdk54/__tests__/config-contract.test.mjs
node outputs/sdk54/ai-e2e/20261022-m0-config-contract/verify-evidence.mjs
```

固定对象缺失时须显式使用--prefetch取回，不能换revision或当前适配源码。证据验证命令需从仓库根目录执行。

## 5. 边缘情况与修改点

1. contract-red.tap.log保存实现前缺模块失败，初版9项通过后补齐来源选择及多类型边缘测试；最终11项通过。
2. multitype-red.tap.log复现type:[object,null]带properties时嵌套字段会被联合投影漏掉。修复为明确拒绝尚未支持的多类型结构组合，multitype-green.tap.log通过；固定7输入没有这种结构，不裁剪来源以绕过错误。后续新增schema组合必须先做“属性有无”负例，不能仅检查解析成功。
3. 插件元组位置、字符串键中的斜杠/波浪号、开放索引、联合分支必填MIXED、缺引用与循环均有测试；名称按JSON pointer分段编码，避免显示名碰撞。schema additionalProperties未声明不会被写成false，根缺required不会被写成可选。
4. JSON使用标准斜杠转义保留源码URI，往返内容一致；仓库检查规则保持不变。tsType与结构、meta.fallback与运行默认值分别保存。

## 6. 未关闭范围与证据保存

本轮fullConfigCompatibilityComplete:false、stageClosable:false。M0-02/03其余workspace公开API、插件选项、命令面及全量范围差异仍未完成；M0-04真实四项目现状与SDK52回归未完成。在线消费schema、动态配置执行、Harmony快照、插件变更及设备观察均须后续实际验收。本轮没有新增完整接受单元，M0-01/05/06保持已接受，M0完成50%（3/6）；M0A/M1/M2/M3/M4/M5/V/M6/M7/M8完整单元均0%，均未关闭。

input-snapshot.json保存实现、结果、用例、文档、环境、适配未提交文件hash与7输入元数据；source-inputs/保存这7份固定内容；evidence-index.json记录原始证据hash，report.sha256固定报告，verify-evidence.mjs可复核输入、原始证据、报告及源文件blob/SHA256。evidence-verification.json保存实际复核结果；索引与复核结果排除自引用。

docs/superpowers/与outputs/被现有规则忽略，设计、执行卡及原始证据仅本机可复核；可跟踪的工具/清单/报告也尚未提交。本轮未提交、未发布registry，未改变SDK52或产品运行时代码。
