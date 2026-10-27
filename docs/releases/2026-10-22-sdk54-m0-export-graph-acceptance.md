# SDK54 M0 第十二轮：跨 workspace 导出符号图验收

日期：2026-10-22；run ID：`20261022-m0-export-graph`。任务 M0-02/03，关联 M0-A01/A02。

**M0 仍未关闭，完成66%（4/6）。** 本轮交付源码导出拓扑：10处跨workspace star中8处已展开，2处仍部分展开；7处外部star和1处缺入口保留未解决。M0-02/03仍未接受，不把符号数量当作公开API或已支持数量。

## 1. 固定输入和实现

- Expo commit `5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`，tree `5457e824b21d968e55c8f533cdf1751860160a92`。从Git树与manifest重建141 workspace、5模板，读取4,088固定输入；Git reader逐对象验证blob SHA1，索引保存blob/内容SHA256。
- 新增 `scripts/sdk54/workspace-export-graph.mjs` 和13项契约测试；TypeScript5.9.3虚拟Program仅暴露固定输入，不读取宿主默认库或node_modules，JSX按preserve解析。Node v22.20.0、npm10.9.3、pnpm10.19.0、Darwin/arm64。
- 适配HEAD `22cb245f383a194b52f94127f95bce534258b8cc` 加未提交工具，精确文件hash见input-snapshot.json。本轮没有新的产品发行物，没有修改产品运行代码、依赖或原先清单、报告和接受记录。
- 设计/执行卡：同日 `docs/superpowers/{specs,plans}/*export-graph*`；[预定义用例](sdk54-m0-export-graph-cases.json)和上一轮语法摘要在执行前固定hash。

## 2. 每步实现和用例结论

| 步骤/用例 | 实际实现与验收 | 结果 |
| --- | --- | --- |
| E1 / EG-01 | 固定树重建146根和4088输入，只用固定文件构造Program；fixture确认符号原声明均来自输入，未加载外部依赖 | PASS（源身份与隔离契约） |
| E2 / EG-02 | 包根/深入口、types投影、条件备选、wildcard具体性、exports封装与禁用、源扩展优先级及build/src/bin路径验证；alias、非法目标、越界、平台候选保留边界 | PASS（源码分析策略） |
| E2 / EG-03 | 全源3934模块、13684边、10010原始符号、13786按模块导出记录；循环、同源别名、显式覆盖、default不经star、namespace及类型/值来源追溯契约通过 | PASS（拓扑，不是推断属性语义） |
| E2 / EG-04 | 纯CommonJS静态转发保留来源链；复杂/计算属性导出、缺named符号及冲突有失败契约；实际13条import/export分析诊断分开记录 | PASS（边界与诊断契约） |
| E3 / EG-05 | 上轮10+7+1缺口逐项映射：8已展开、2部分、7外部未解、1入口未解；任何边界不改为支持或阶段完成 | PASS（18项审阅齐备，未全部解决） |
| E3 / EG-06 | 主索引、重复生成、增加计算属性守卫后确认生成，三份gzip字节/hash完全一致；正常--check从固定源重建通过 | PASS |
| E3 / EG-07 | 删模块/边/符号/导出/输入/审阅/原声明、重复导出、伪全量、伪审阅完成、错来源hash及悬空符号共12类真实CLI负例全部退出1，日志指出差异 | PASS |
| E4 / EG-08 | 工具362/362、CLI53文件500/500、类型检查通过；13组旧清单/基线和新图重建检查、归属/仓库/进度及证据hash通过 | PASS（工具验收，非产品新增能力） |

8个用例均为本轮源码拓扑/调查工具对象的PASS；它们不代替M0-02/03的全量交付和原阶段退出条件。源文件重复记录、模块导出数和symbol数均不能累加进M0完成率。

## 3. 十处跨包star的准确结果

[结构化摘要](sdk54-workspace-export-graph-summary.json)包含18项审阅、原gap ID、源位置、实际边、目标模块、目标命名导出ID和传递边界。完整gzip索引保存于本轮outputs，约1.85MB，hash由摘要关联；不是只保存下面的计数。

| 原文件（packages/下） | 实际源目标 | 目标命名导出记录数 | 结果与未完成项 |
| --- | --- | --- | --- |
| expo-dev-client/src/DevClient.ts | expo-dev-menu/src/DevMenu.ts | 5 | EXPANDED_SOURCE |
| expo/config-plugins.d.ts | @expo/config-plugins/src/index.ts | 53 | EXPANDED_SOURCE |
| expo/config/index.d.ts | @expo/config/src/index.ts | 40 | EXPANDED_SOURCE |
| expo/config/paths.d.ts | @expo/config/paths/index.d.ts | 12 | EXPANDED_SOURCE |
| expo/devtools.d.ts | @expo/devtools/src/index.ts | 11 | EXPANDED_SOURCE |
| expo/fingerprint.d.ts | @expo/fingerprint/src/index.ts | 29 | EXPANDED_SOURCE |
| expo/internal/babel-preset.d.ts | babel-preset-expo/src/index.ts | 1 | PARTIAL_SOURCE：该源仍有CommonJS导出语义边界 |
| expo/internal/unstable-autolinking-exports.d.ts | expo-modules-autolinking/exports.d.ts | 45 | EXPANDED_SOURCE |
| expo/internal/unstable-expo-updates-cli-exports.d.ts | @expo/cli/internal/unstable-expo-updates-exports.d.ts | 3 | EXPANDED_SOURCE |
| expo/metro-config.d.ts | @expo/metro-config/src/ExpoMetroConfig.ts | 8 | PARTIAL_SOURCE：MetroConfig来自未纳入的外部类型 |

共207条按边计的目标命名导出记录，包含两处部分展开的记录，不能作为207个去重公共API。标为EXPANDED_SOURCE仅说明选定源码投影的导出拓扑无未解导出边；不说明全部属性、返回类型、发布内容或运行行为已接受。内部入口仍保留原来源语义，不因被扫描而成为受支持公共API。

7处外部star分别关联react-server-dom-webpack、React Native的两个Image入口、@react-native/assets/registry、@testing-library/react-native和wa-sqlite两条源语句，均UNRESOLVED_SOURCE。expo-structured-headers的main=index.js在固定树缺失，仍UNRESOLVED_ENTRY；本轮没有猜造JS入口或把原生包判为平台不适用。42项外部种子的来源/范围审阅尚未完成，本轮未改变其待办状态。

## 4. 边缘缺陷、修改与语义限制

- 初版compiler直接读取CommonJS包装文件，漏掉实际转发源的声明；contract-first保留失败。仅对整文件唯一的module.exports=require(字面量)建立显式源码投影链，记录sourceWrappers及runtimeEquivalence:NOT_VERIFIED；循环拒绝。带额外赋值的包装文件不改写，动态CommonJS继续标部分。这是源码类型关系，不宣称运行时会保留被擦除的TypeScript接口。
- edges-red先复现非法exports目标/穿越路径未拒绝及缺JSX分析选项；修复后非法目标和subpath拒绝，平台仅候选不随意选择。types条件、其他条件和未验证版本组合均在resolution中保留，分析器不是Node/Metro运行resolver，也不代表所有条件分支均已验收。
- commonjs-boundary-red复现动态CommonJS或无module导出的脚本可能被误审为空且完整；修复后显式记录CommonJS变更、传播目标与消费模块边界，含export诊断的消费者不能被判展开完成。计算属性module['exports']的遗漏另有computed-commonjs-red/green，不放过Object.assign/defineProperty语义。
- type-star-red先复现type-only star标记丢失，再补到实际边。spaces记录原始symbol的类型/值flag，typeOnlySyntax独立保留；不保证每条type-only重导出路径都能作为值使用。未展开类继承、推断属性/返回值、全部平台和条件语义。
- 原声明位置和符号ID可追溯到固定输入；校验从源重建，不能靠修改摘要或重算本身hash掩盖漏项。新symbol ID与原语法ID各有命名空间，通过模块路径/声明范围追溯，不替换或覆盖历史记录。

Program是隔离分析环境，未加载默认库/第三方类型，也不是各包真实tsconfig的构建。实际选出的13条import/export相关诊断包括12处import-boundary和1处export诊断（jest-expo声明）；全部分析诊断的code计数另存完整索引。不能将这些诊断直接当作产品缺陷，也不能据工具成功宣称上游全项目类型编译通过。

## 5. 实际命令与复核

从仓库根执行：

```bash
node --test scripts/sdk54/__tests__/workspace-export-graph.test.mjs
node scripts/sdk54/workspace-export-graph.mjs --source /tmp/sdk54-expo-source --check outputs/sdk54/ai-e2e/20261022-m0-export-graph/export-graph.json.gz
node outputs/sdk54/ai-e2e/20261022-m0-export-graph/verify-evidence.mjs
```

生成用--output <json或json.gz>，可加--summary <摘要>。新Program重建不依赖旧摘要决定源码和包集合；旧摘要只用于映射18个已知缺口，并有输入hash。

| 验证 | 实际结果 | 原始证据（相对本轮目录） |
| --- | --- | --- |
| 新图fixture | 13/13 | computed-commonjs-green.tap.log |
| pnpm test:sdk54-tools | 362/362，exit0 | tools-final.log、tools-result.json |
| pnpm test | 53文件、500/500，exit0 | cli.log、cli-result.json |
| pnpm type-check | CLI类型exit0 | types.log、types-result.json |
| 13组来源/专项索引、误报/执行基线、真实旧CLI/SDK52结果、新图检查 | 全部exit0，原产品FAIL/NOT_RUN仍保留 | regression-checks.json |
| 12类真实CLI负例 | 全部exit1 | negative-results.json、negative-*.log |
| 三份gzip输出 | 字节相同；含最后计算属性守卫后的确认输出 | repeat-verification.json |
| 当前归属 | 460文件、1872引用、48命令、动态8处；249共享保留/107待退出/29移交/75工具保留 | ownership-current.json |
| 仓库、归属、阶段hash、git diff --check | 全部exit0 | closure-checks.json |

不覆盖历史归属接受清单或旧证据；本轮只新增调查工具，未清理产品代码。13组回归中的CLI/SDK52结果核验是历史证据复核，没有把原失败改绿，也没有重跑产品安装或设备。

最终归属校验先正确拒绝了增加计算属性守卫之前的本轮源快照；旧快照保留为ownership-before-final.json，失败日志保留，再按最终源码重建ownership-current.json并检查通过。文件/引用计数未变，源码hash已更新，没有放宽校验或覆盖前轮清单。

## 6. 阶段状态与保存

M0仅M0-01/04/05/06接受，仍66%（4/6），M0-02/03未接受。全量公开面仍缺推断/继承/属性语义、其余动态与CommonJS导出、外部类型/包来源、平台/条件分支以及42项外部种子范围结论；本轮展开8处拓扑边不关闭这些任务，其他阶段均未关闭。

定义/设计/旧摘要hash见definitions-before.json；最终源码、文档、阶段状态与环境见input-snapshot.json；原始日志、符号图、变异、复现和回归hash见evidence-index.json；报告由report.sha256固定，evidence-verification记录最终实际复核。

原始目录outputs/sdk54/ai-e2e/20261022-m0-export-graph/和docs/superpowers仍被忽略，设计、执行卡、完整索引和原始证据仅本机可复核。需保留固定Git对象缓存及被引用的前轮候选/安装目录；未宣称团队可离线重建。未提交、未发布。
