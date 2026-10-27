# SDK54 M0 第十三轮：外部来源与 Metro 发布类型验收

日期：2026-10-22；run ID：`20261022-m0-external-sources`。任务 M0-02/03，关联 M0-A01/A02。

**M0 仍未关闭，完成66%（4/6）。** 本轮逐项登记42个旧外部种子的固定来源、职责和预分批，并补充 MetroConfig 的发布类型来源；没有完成全部外部源码/API或全量公开面，M0-02/03仍未接受。

## 输入与实现

- 固定 Expo commit `5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`、tree `5457e824b21d968e55c8f533cdf1751860160a92`。适配 HEAD `22cb245f383a194b52f94127f95bce534258b8cc` 加未提交文件，最终文件hash见 input-snapshot.json。
- 新增 external-sources.mjs 和 metro-type-source.mjs，分别8项、7项契约。根 devDependency 固定 `@yarnpkg/lockfile:1.1.0`，仅增加对应根锁 importer；不改变产品运行依赖。TypeScript5.9.3；复用CLI依赖解析得到的实际semver版本7.8.5已写入来源记录，这不代表本轮验证了CLI已安装依赖与声明版本身份一致。
- Node v22.20.0、npm10.9.3、pnpm10.19.0、Darwin/arm64。没有新的产品发行物、原生构建或设备运行；历史产品失败与NOT_RUN保留。
- 设计和用例在实现前固定hash：同日 docs/superpowers/specs/*external-sources-design.md、执行卡和 sdk54-m0-external-sources-cases.json，见 definitions-before.json。旧42项种子清单SHA256固定为 `166016aa5d489ca2a4d6fafad4090756a2ddf9dde6082a08c4cde80569ed5f3f`，不能联动删前置清单缩小覆盖。

## 每步实现与验收结论

| 步骤/用例 | 实际结果与证据（相对本轮outputs目录） | 结论 |
| --- | --- | --- |
| X1 / EXT-01 | 固定149个Git输入，含原始lock/bundle和根及workspace/template manifests；逐blob核验，parser依赖声明、frozen离线安装成功；source-inputs.json、raw-source-verification.json、parser-frozen-install.log | PASS：来源与工具依赖身份 |
| X2 / EXT-02 | 解析3001个Yarn selector；多selector/scoped/重复/冲突与精确selector范围失配均有fixture；contract-red、identity-members-red及最终green日志保留 | PASS：解析/分类契约 |
| X2 / EXT-03 | 42项全部有固定bundle、声明、锁候选、职责和批次记录，关联33条lock；未知/缺失不改为废弃；sdk54-external-source-review.json | PASS：逐项来源审阅，外部源码/API未完成 |
| X3 / EXT-04 | 下载固定@expo/metro54.2.0归档70466字节，SHA512及resolved SHA1双重匹配；fixture拒绝穿越/链接/重复/超限，不执行脚本；metro-download.log与类型来源JSON | PASS：发布归档身份与读取边界 |
| X3 / EXT-05 | 从上游ConfigT as MetroConfig追到发布声明，220输入、228可达声明、1662语法成员、1111类型引用；未展开utility/外部引用显式保留 | PASS：显式声明来源，完整类型语义未完成 |
| X4 / EXT-06 | 两工具从固定源重复生成字节相同；正常--check重建通过；repeat-verification.json、regression-checks.json | PASS |
| X4 / EXT-07 | 8类来源、8类类型清单篡改及1个实际坏字节tgz，17次真实CLI全部退出1；negative-results.json、negative-*.log | PASS |
| X5 / EXT-08 | 工具377/377、CLI53文件500/500、类型exit0；15组历史/本轮源重建与基线检查、当前归属/仓库/阶段/差异检查及最终证据hash复核 | PASS：工具与证据验收，不是平台能力验收 |

本轮8个必达用例均完成，原始失败尝试保留。其PASS不能替代M0-02/03的完整交付，也不能按测试/声明数量增加阶段接受数。

## 42项来源的具体结论

| 固定身份分类 | 项数 | 含义 |
| --- | --- | --- |
| EXACT_LOCK | 23 | 固定bundle selector在lock精确匹配且版本满足范围 |
| COMPATIBLE_LOCK_CANDIDATES | 5 | 只有兼容候选，没有相同selector；未任挑最高版本充作精确身份 |
| LOCK_RANGE_MISMATCH | 1 | react-server-dom-webpack：原始bundle要求~19.1.4，固定lock仅~19.0.4→19.0.4，不兼容 |
| NO_LOCK | 11 | 固定lock未找到记录，不能据此判废弃、重命名或平台不适用 |
| NO_UPSTREAM_IDENTITY | 2 | Harmony RNOH目标与旧create-expo-app wrapper没有同名固定上游bundle/lock身份 |

上游React19.1.0、RN0.81.5与旧种子/Harmony目标19.1.1、0.82.1分开；RNOH0.82.30是目标值。create-expo3.5.11的独立来源仍在旧provenance，本轮不将wrapper与其等同。Amplitude、AppAuth、GoogleAuth、SentryExpo等旧条目在固定bundle中仍存在，缺lock不构成退出依据。普通认证职责仍在本轮评估范围，未套用Go/EAS/Dev Client暂缓。

每项scope记录包职责、预分批和来源边界；该记录不证明外部包已下载、全量API已枚举或Harmony已实现。externalSourcesComplete、fullPublicSurfaceComplete、stageClosable均为false。

## MetroConfig的准确来源与限制

上游 packages/@expo/metro-config/src/ExpoMetroConfig.ts 第14行导入 `ConfigT as MetroConfig`，第438行导出该别名。固定依赖 `@expo/metro@~54.2.0` 的lock精确解析为54.2.0；归档声明入口 metro-config/index.d.ts 通过namespace export=进入index.flow.d.ts，再追到types.d.ts的ConfigT。不能误用外部另一个同名MetroConfig=InputConfigT。

归档SHA1 `6ecf4a77ae7553b73daca4206854728de76c854d`；SHA256 `61b8f515595f69c33274f56cbb1aa2bf7e4672b70a53fc693198de66389cd0dd`；完整SHA512及下载URL保存在JSON和原始日志中。仅使用已核验tgz，虚拟Program不加载宿主包、默认库或第三方声明。

1111条类型引用中，584条archive-source、236条utility-not-expanded、123条type-parameter、168条external-or-unresolved。228/1662是可达显式声明和语法成员记录，包含参数、嵌套及类成员，不是ConfigT的1662个直接属性或平台支持数；readonlySyntax只表示源码显式修饰，未展开Readonly等语义。fullTypeSurfaceComplete仍false。上一轮导出图保持原样，本轮补充来源不将其Metro star自动改为完全关闭。

## 边缘情况、修复及失败记录

- identity-members-red先复现同ID不同包名漏检、精确selector背后不兼容版本误判；修复为独立ID集合和EXACT_LOCK_RANGE_MISMATCH。实际源中此新分类为0，fixture已覆盖。
- 同一复现补齐可达class的方法/属性/constructor参数和named tuple成员；私有成员排除。readonly-red先复现显式readonly遗漏，再增加readonlySyntax；最终15项新契约全部通过。
- Yarn重复multi-selector及冲突直接报错；来源校验从固定对象重建，删除seed、声明、lock或改scope/hash/完整标记不能靠重算JSON自身hash通过。
- 归档读取只在内存进行，拒绝不安全路径、链接、重复和大小超限；坏字节真实tgz在解析前被SRI拒绝。成员/引用删改、错误别名或伪造解析结果也被源重建拒绝。
- Git HTTP/1.1抓取仍TLS失败，source-fetch.log保留；随后从固定commit raw地址取lock/bundle，逐blob SHA1匹配后写回仅本机Git缓存，source-cache-read.log确认再读取成功。未变更全局Git配置。
- 首次根依赖离线add因npm-packlist元数据不足失败，parser-dependency.log保留；随后明确固定依赖和已有锁importer，离线frozen安装成功，不手工伪造node_modules链接。

## 回归、复核与剩余工作

| 检查 | 实际结果 | 证据 |
| --- | --- | --- |
| pnpm test:sdk54-tools | 377/377，exit0 | tools.log、tools-result.json |
| pnpm test | 53文件500/500，exit0 | cli.log、cli-result.json |
| pnpm type-check | exit0 | types.log、types-result.json |
| 13组历史清单/基线及2组本轮正例 | 15组exit0 | regression-checks.json |
| 当前归属 | 464文件、1901引用、48命令、8处动态；249共享保留/107待退出/29移交/79工具保留 | ownership-current.json |
| 归属、仓库、阶段hash、git diff --check | 4组exit0 | closure-checks.json |
| 重复生成、17负例及最终输入/证据hash | 全部符合预期 | repeat-verification.json、negative-results.json、evidence-verification.json |

从仓库根复核：

```bash
node scripts/sdk54/external-sources.mjs --source /tmp/sdk54-expo-source --check docs/releases/sdk54-external-source-review.json
node scripts/sdk54/metro-type-source.mjs --source /tmp/sdk54-expo-source --archive outputs/sdk54/ai-e2e/20261022-m0-external-sources/downloads/expo-metro-54.2.0.tgz --check docs/releases/sdk54-metro-type-source.json
node outputs/sdk54/ai-e2e/20261022-m0-external-sources/verify-evidence.mjs
```

M0仅M0-01/04/05/06接受；M0-02/03仍缺完整公开面属性/推断/继承、动态与CommonJS、其余外部发布源码和类型，以及平台/条件分支的完整枚举与双向校验。下一步继续补齐上述来源和语义，不能以来源分类完毕替代完整清单验收。其他阶段均未关闭。

本轮未覆盖历史报告、清单、接受记录或产品失败。精确源码/文档hash由input-snapshot.json固定；报告由report.sha256固定；原始下载、失败/成功日志、复现、负例和快照由evidence-index.json逐文件固定。docs/superpowers及outputs被忽略，设计、执行卡与原始证据仍**仅本机可复核**，需要保留固定Git缓存和前轮被引用目录；未宣称团队可离线复跑。未提交、未发布。
