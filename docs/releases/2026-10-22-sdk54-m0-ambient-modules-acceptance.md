# SDK54 M0 第十四轮：声明模块导出来源验收

日期：2026-10-22；run ID：`20261022-m0-ambient-modules`。任务M0-02/03，关联M0-A01/A02。

**M0 仍未关闭，完成66%（4/6）。** 本轮对固定源码中的字符串declare module单独建图。原7处external-star中，5处已有同包声明来源，2处仍缺来源；声明关系展开不代表运行包身份、完整属性语义或Harmony能力已接受。M0-02/03仍未接受，历史图和接受记录不变。

## 固定输入与实现

- Expo commit `5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`、tree `5457e824b21d968e55c8f533cdf1751860160a92`；146根/4088固定输入逐blob读取，来源和内容hash写入完整图。适配HEAD `22cb245f383a194b52f94127f95bce534258b8cc` 加未提交文件，精确状态见input-snapshot.json。
- 新增 scripts/sdk54/ambient-modules.mjs 和12项契约测试；TypeScript5.9.3按包建立声明分析Program，无默认库/宿主node_modules。跨包同名不自动合并；模块增强、通配、无body和嵌套有独立分类与边界。本分析并非各包真实tsconfig编译。
- Node v22.20.0、npm10.9.3、pnpm10.19.0、Darwin/arm64；本轮无依赖变更、产品发行物、构建或设备运行。
- 设计/执行卡位于同日docs/superpowers/{specs,plans}/*ambient-modules*；预定义用例 sdk54-m0-ambient-modules-cases.json。执行前hash见definitions-before.json；原导出摘要固定hash，原语法摘要还须匹配其已固定的前置hash，不能联动改request缩覆盖。

## 每步实现和验收

| 步骤/用例 | 实际结果 | 结论与证据（相对本轮outputs目录） |
| --- | --- | --- |
| A1 / AMB-01 | 固定4088输入/146根；原7处external-star逐位置和gap ID映射，保留来源blob/hash | PASS；完整图inputs、reviews及definitions-before.json |
| A2 / AMB-02 | 21个包中99个声明模块：74 ambient、9 augmentation、9 wildcard、7 untyped；按包隔离，fixture另覆盖nested及同包合并 | PASS：声明分析分类；contracts-final.tap.log |
| A2 / AMB-03 | 20条重导出边、408原始符号（411声明位置）、901条按模块导出；alias/type-only/default/overload、循环和冲突负例通过，边界有限集合传播 | PASS：声明拓扑；完整图及12项fixture |
| A3 / AMB-04 | 原7处逐项审阅，5处EXPANDED_AMBIENT_DECLARATION、2处UNRESOLVED_DECLARATION；不改旧图状态或运行包结论 | PASS：来源纠偏与边界；摘要reviews |
| A3 / AMB-05 | 最终源码生成、重复生成gzip字节/hash一致，正常--check从固定来源重建通过 | PASS；repeat-verification.json、ambient-check.log |
| A4 / AMB-06 | 漏模块/导出/边/符号/输入/审阅/包、重复导出、伪审阅完成/全量、错符号位置、删边界/模块声明，13次真实CLI全退出1并定位差异 | PASS；negative-results.json、negative-*.log |
| A5 / AMB-07 | 工具389/389、CLI53文件500/500、类型exit0；16组历史/本轮重建、4组归属/仓库/阶段/差异检查、输入及证据hash通过 | PASS：工具验收；regression/closure-checks与evidence-verification |

本轮7个必达用例完成；源码拓扑测试PASS不代替M0-02/03的全量公开面退出条件，不按导出数量增加进度。

## 原7处缺口的具体结论

| 消费位置 | 声明目标 | 命名导出记录 | 结论 |
| --- | --- | --- | --- |
| @expo/cli/ts-declarations/react-server-dom-webpack/index.d.ts:55 | 同包server.edge声明 | 4：Options、decodeReply、registerServerReference、renderToReadableStream | 声明导出展开；Options为ambient隐式导出，不手工删去 |
| expo-asset/src/AssetSourceResolver.native.ts:3 | 同包react-native-assets.d.ts内AssetSourceResolver声明 | 1：ResolvedAssetSource | 声明导出展开，default类不经过star |
| expo-asset/src/resolveAssetSource.native.ts:3 | 同文件内resolveAssetSource声明 | 1：setCustomSourceTransformer | 声明导出展开，default函数不经过star |
| expo-asset/src/ts-declarations/react-native-assets.d.ts:47 | @react-native/assets/registry | 0 | 仍缺来源；不将assets与assets-registry猜作同名包 |
| expo-router/src/testing-library/index.tsx:29 | @testing-library/react-native | 0 | 仍缺来源；不跨包合并同名声明或凭宿主安装补齐 |
| expo-sqlite/web/wa-sqlite/types/index.d.ts:1239 | 同文件sqlite-constants.js声明 | 236 | 声明导出展开 |
| expo-sqlite/web/wa-sqlite/types/index.d.ts:1271 | 同一常量声明 | 236 | 另一消费边；不是新增236个去重能力 |

完整图保存在ambient-modules.json.gz，[结构化摘要](sdk54-ambient-modules-summary.json)关联其hash。5处展开合计478条按消费边计的导出记录，不能作为478个去重公共API。声明里的外部类型、属性/推断、运行实现和实际项目解析仍未验收。

99个模块中74个为可分析的ambient声明，58个在本策略下没有声明导出边界，16个仍有边界；另25个augmentation/wildcard/untyped不判完整。实际没有同包同名合并对象，合并与重载由fixture覆盖。Program输出的唯一被选中结构诊断是jest-expo声明2309（export=与其他导出混用）；保留分析诊断，不直接认定产品编译结果。

## 边缘复现与修复

- contract-red先保存工具缺失失败，初版10项通过。来源适配的input-contract-red随后复现缺少输入适配契约；补readAmbientReviewInputs，以原gap.details字符串读取request，并核对实际冻结hash，避免误按对象字段解析。input-contract-green通过。
- diagnostics-red先复现同ambient内重复const、不兼容interface合并未被现有导出诊断集合拦住，以及前置语法摘要未受已冻结引用hash约束。补充重复/重载/合并相关结构诊断，增加前置hash核验；最终12项通过，原失败日志保留。
- star的default不传播，named alias回指原符号，type-only边与specifier语法独立保存；符号的类型/值空间不等于每条type-only路径可作为值消费。
- augmentation来源不会被当作全局ambient根自动合并；wildcard、无body、嵌套、export=、相对重导出、外部或其他包上下文都留边界。声明Program只证明选定源码上下文的拓扑，不证明真实tsconfig包含这些声明。
- 循环star通过有限边界集合传播终止；歧义、缺named来源与冲突有测试。导出声明位置仅表示来源，未展开嵌套成员、继承、utility或推断返回值，publicSurfaceComplete和stageClosable保持false。

## 回归与复核

| 检查 | 实际结果 | 证据 |
| --- | --- | --- |
| 新声明模块契约 | 12/12 | contracts-final.tap.log |
| pnpm test:sdk54-tools | 389/389，exit0 | tools.log、tools-result.json |
| pnpm test | 53文件500/500，exit0 | cli.log、cli-result.json |
| pnpm type-check | exit0 | types.log、types-result.json |
| 历史15组及本轮源重建 | 16组exit0；原产品FAIL/NOT_RUN保持 | regression-checks.json |
| 当前归属 | 466文件、1915引用、48命令、8动态；249共享保留/107待退出/29移交/81工具保留 | ownership-current.json |
| 归属/仓库/阶段hash/git diff --check | 4组exit0 | closure-checks.json |
| 重复输出、13类篡改及证据hash | 符合预期 | repeat-verification、negative-results、evidence-verification |

从仓库根复核：

```bash
node scripts/sdk54/ambient-modules.mjs --source /tmp/sdk54-expo-source --check outputs/sdk54/ai-e2e/20261022-m0-ambient-modules/ambient-modules.json.gz
node outputs/sdk54/ai-e2e/20261022-m0-ambient-modules/verify-evidence.mjs
```

M0仍仅M0-01/04/05/06接受，66%（4/6）。M0-02/03仍缺完整公开面属性/推断/继承、动态/CommonJS、剩余外部来源与平台/条件分支的全量枚举和双向校验。本轮只纠正声明来源分类，未解决其运行外部包身份或阶段全部缺口。

最终源码/文档状态见input-snapshot.json，报告由report.sha256固定，原始复现/正负例/完整图/回归日志由evidence-index.json固定。docs/superpowers与outputs被忽略，设计、执行卡、完整图及原始证据**仅本机可复核**，需保留固定Git缓存和前轮引用目录。未提交、未发布；未覆盖历史清单或报告。
