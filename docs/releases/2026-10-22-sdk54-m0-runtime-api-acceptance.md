# SDK54 M0 第六轮：首批运行时API声明索引验收

日期：2026-10-22；run ID：`20261022-m0-runtime-api`。

**M0 仍未关闭，完成50%（3/6）。** 本轮完成M0-02/03的首批8包运行时声明索引子集，API-01至07通过；不增加完整任务接受数。M0-01/05/06既有接受记录保持原样。

## 1. 输入与实现

- 固定Expo commit：`5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`；tree：`5457e824b21d968e55c8f533cdf1751860160a92`。
- 适配HEAD：`22cb245f383a194b52f94127f95bce534258b8cc`加未提交修改；环境为Node v22.20.0、pnpm 10.19.0、TypeScript 5.9.3。未新增依赖。
- [冻结用例](sdk54-m0-runtime-api-cases.json)、[结果清单](sdk54-first-runtime-api.json)；实现为`scripts/sdk54/runtime-api.mjs`、`runtime-api-model.mjs`，测试为`__tests__/runtime-api.test.mjs`。
- 设计/执行卡：`docs/superpowers/specs/2026-10-22-sdk54-m0-runtime-api-design.md`、`docs/superpowers/plans/2026-10-22-sdk54-m0-runtime-api.md`。
- 读取8包manifest与非测试src，共80输入，其中72个源码模块；Git对象读取验证blob完整性，再保存SHA256。首次缺固定源码对象，联网取回111个src/manifest对象（含测试缓存）；实际索引排除测试，仅80输入。最终生成/检查均离线。
- 原始证据目录：`outputs/sdk54/ai-e2e/20261022-m0-runtime-api/`，下文日志均相对此目录。

## 2. 步骤与验收

| 步骤/用例 | 实现及实际结果 | 结论/证据 |
| --- | --- | --- |
| P1 / API-01 | 固定8包、80输入，逐文件blob/SHA256；源码选择排除测试/其他包/构建产物，符号链接和gitlink拒绝；缺固定commit时CLI退出1且不写输出 | PASS；contract-final-2.tap.log、missing-fixed-source.log、input-snapshot.json；Git读取器的缺对象检查沿用既有来源工具 |
| P2 / API-02 | JSON解析main/types等与exports条件分支，保存JSON pointer及源路径；build仅投影src，平台相邻变体单列，范围外插件/工具/package.json入口保留 | PASS；38条入口记录；source-summary.json |
| P2 / API-03 | TS虚拟Program解析命名/默认/别名/star/namespace导出及相对循环，逐条关联源码声明；相对缺符号、导出冲突和重复ID拒绝 | PASS；367条按入口区分的导出记录；10项边缘/契约加1项源码选择测试，共11/11 |
| P2 / API-04 | 签名、文档标签、类/接口/枚举成员、嵌套类型字面量、参数/回调逐项有ID和位置；方法体不作成员，private/protected/#成员排除 | PASS；315声明、489语法成员；按导出与语法类型引用可达129声明、242成员 |
| P2 / API-05 | manifest四类依赖声明、包级批次与未评估范围保存；类型引用关联当前声明或明确保留外部/未解析状态，default as类型不丢失 | PASS；311类型引用，其中167关联当前声明、144外部/未解析；不是语义类型完整性或兼容性通过 |
| P3 / API-06 | 两次生成逐字节一致；漏包/API/成员/入口、重复ID、悬空声明、缺来源、错hash、伪完整九类CLI变异均退出1 | PASS；generate-final-2.log、generate-repeat-2.log、negative-*-2.log、verification-results.json；漏项提示含稳定ID和来源路径 |
| P3/P4 / API-07 | 工具/CLI/类型、既有三清单/缺陷基线、当前归属、仓库检查与进度核验通过；报告及证据hash保存 | PASS；回归见第4节；M0接受数保持3/6 |

## 3. 实际来源结果

| 包/固定版本 | 入口记录 | 按入口导出记录 | 包内去重导出名（含类型） |
| --- | --- | --- | --- |
| expo-asset 12.0.13 | 4 | 17 | 5 |
| expo-constants 18.0.14 | 5 | 50 | 10 |
| expo-font 14.0.12 | 5 | 56 | 17 |
| expo-linking 8.0.12 | 4 | 92 | 23 |
| expo-splash-screen 31.0.13 | 4 | 18 | 5 |
| expo-status-bar 3.0.9 | 12 | 84 | 9 |
| expo-system-ui 6.0.9 | 2 | 4 | 2 |
| expo-web-browser 15.0.11 | 2 | 46 | 23 |
| 合计 | 38 | 367 | 94 |

367包含main/types/条件/平台入口的重复名称，94是按包与名称去重，均不是Harmony支持数。315声明、489成员还包含内部源码声明，不能全算公开API；`syntacticPublicEntryIds`明确标记仅通过导出及语法类型引用可达的子集。

具体差异已落到不同入口：Asset的react-server入口仅导出Asset/useAssets，普通入口还有AssetDescriptor/AssetMetadata等；Font服务端入口不导出普通根入口的图像渲染API，但另有build/server子路径；Splash native文件未重导出普通入口的SplashScreenOptions；StatusBar普通根入口导出3个类型，Android/Web相邻文件只导出运行时名称。这些是固定来源的声明差异，不判断最终Metro/类型解析选择，也不自行标废弃或不适用。

外部star共2处，均在Asset的native辅助模块：react-native/Libraries/Image/AssetSourceResolver与resolveAssetSource，明确保存NOT_EXPANDED。144处外部/未解析类型包含Promise/Record等标准库、React/RN、Expo配置/manifest及跨包类型；虚拟host不读取本机node_modules或默认lib，不会用当前安装环境补成固定来源事实。

## 4. 验证命令与实际结果

| 命令 | 实际结果 | 日志 |
| --- | --- | --- |
| node --test scripts/sdk54/__tests__/runtime-api.test.mjs | 11/11通过，退出0 | contract-final-2.tap.log |
| pnpm test:sdk54-tools | 最终294/294通过，退出0；此前292/292、293/293尝试保留 | tools-final-3.log |
| pnpm test | 53文件、500/500通过，退出0 | cli-final.log、regression-results.json |
| pnpm type-check | CLI类型检查退出0；不是本轮8包完整类型检查 | types-final.log |
| runtime-api.mjs --source /tmp/sdk54-expo-source --check docs/releases/sdk54-first-runtime-api.json | 重建检查退出0；九类变异退出1 | api-check-final.log、verification-results.json |
| source-inventory、plugin-surface、plugin-source-index --source /tmp/sdk54-expo-source --check 对应既有清单 | 三项均退出0 | source-inventory-check.log、plugin-surface-check.log、plugin-index-check.log |
| verify-validation-baseline.mjs | 退出0，既有产品失败继续保留 | baseline-check.log |
| legacy-ownership.mjs --output/--check 本轮ownership-current-final.json | 退出0；新工具加入当前处置图 | ownership-generate-final.log、ownership-check-final.log |
| validate-catalog.mjs、check-repository.mjs、stage-progress.mjs --check、git diff --check | 均退出0 | catalog-check.log、closure-checks.json |

第五轮已接受的ownership清单和报告固定历史输入，不因本轮新增3个工具文件改写；本轮另生成当前归属结果。SDK52/产品运行时代码未修改，未新跑打包、四项目创建、原生构建或设备测试；第四轮环境失败/NOT_RUN及产品版本误报仍未解决。

可复核：

```bash
node scripts/sdk54/runtime-api.mjs --source /tmp/sdk54-expo-source --output /tmp/sdk54-runtime-api.json
node scripts/sdk54/runtime-api.mjs --source /tmp/sdk54-expo-source --check docs/releases/sdk54-first-runtime-api.json
node --test scripts/sdk54/__tests__/runtime-api.test.mjs
```

若固定Git对象缺失，先显式增加`--prefetch`取回，再离线生成；不得换用其他revision或本地适配源码代替。

## 5. 失败、边缘情况与修改点

1. contract-red.tap.log保存实现前失败；首版5项通过后继续补边缘测试，所有失败尝试保留。
2. edge-red.tap.log复现相对模块存在但命名导出缺失被静默保留；增加相对import/export缺符号诊断拒绝，edge-green.tap.log通过。外部star另加显式NOT_EXPANDED，未伪造外部导出成员。
3. id-edge-red.tap.log复现字符串名称nested.Options与命名空间成员同名ID碰撞；改为exportPath分段JSON pointer编码并在生成时检查唯一性，id-edge-green.tap.log通过。
4. projection-red.tap.log复现builder文件名被当build目录替换；改为完整目录段匹配，后续契约通过。
5. repository-check.log记录上游源码注释中的文件URI触发配置文本规则。增加标准JSON斜杠转义，解析后与原始对象完全相同，既有仓库检查无需修改；serialization-red/green.tap.log保存往返契约，repository-check-2.log通过。
6. 重载声明各有稳定序号；private/protected/#成员排除，泛型单列（实际8包当前索引为0处泛型引用，fixture验证此分支）。成员路径和位置保留源码事实，不执行用户/上游模块。

后续沿用两条约束：投影必须按目录段；名称ID必须按结构分段，不能用显示名拼接。新增语法边缘先复现再修复，不能通过删除校验或虚报完整来消除失败。

## 6. 未关闭范围及证据

本轮`fullPublicSurfaceComplete:false`、`stageClosable:false`。尚未展开推断返回/对象类型、外部继承和库类型，未验证完整语义类型、Metro平台选择、事件/错误/权限行为，也未建立本轮原生接口清单。其余workspace包、命令/配置schema、全部插件选项与双向范围处置仍须继续；M0-02/03均计0，M0-04四项目现状与SDK52真实回归亦未完成。

M0仍50%（3/6），M0A/M1/M2/M3/M4/M5/V/M6/M7/M8完整单元均0%，均未关闭。没有增加接受单元，没有实际删除或迁移产品代码，没有提交或registry发布。

definitions-before.json固定实施前定义/设计/执行卡；input-snapshot.json固定本轮实现/输入/文档/环境及80份来源对象元数据；evidence-index.json保存原始证据hash，report.sha256单独固定报告，evidence-verification.json记录复核结果，避免自引用。

docs/superpowers/、outputs/仍被现有规则忽略，设计、执行卡与原始证据目前仅本机可复核；结果清单、用例、工具及报告可跟踪但尚未提交。
