# SDK54 M0 剩余项合并交付验收

日期：2026-10-22；run ID：`20261022-m0-consolidated`。任务M0-02/03，关联M0-A01/A02。

**M0 仍未关闭，完成66%（4/6）。** 按用户要求合并推进：一次交付全源码导出类型求值、已有推断候选映射、ConfigPlugin选项映射、总阻塞集合和单入口验收，不再为每个小解析器另开轮次。原完整清单退出条件、阶段分母与已接受记录保持不变；本报告不将分析成功写成全量清单已完成。

## 合并实现及实际规模

新增 scripts/sdk54/m0-consolidated.mjs、accept-m0-consolidated.mjs 和16项契约。前者从固定源批量生成类型图和闭合阻塞，后者统一执行源重建、重复、正负例和历史/工具/CLI/类型回归。没有产品代码、依赖、发行或设备行为变更。

固定Expo commit `5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`、tree `5457e824b21d968e55c8f533cdf1751860160a92`，146个workspace/template根、4088输入。适配HEAD `22cb245f383a194b52f94127f95bce534258b8cc` 加未提交工具，精确文件状态由input-snapshot.json固定。Node v22.20.0、npm10.9.3、pnpm10.19.0、Darwin/arm64。

TypeScript5.9.3自带的100份语言标准库独立登记版本和内容hash，作为分析工具声明，不能冒充Expo来源或产品安装身份。模块解析仅访问固定源码映射和编译器标准库，不读取宿主第三方依赖。40个全局ambient声明文件不自动混入全workspace上下文；其独立来源分析仍由上一批按包索引承担。

| 统一交付对象 | 实际数量与结论 |
| --- | --- |
| 源码模块导出候选 | 3894模块、13786条按模块导出；含内部模块，不是13786项受支持公共API |
| 类型图 | 39162节点、40986条属性记录、13037个调用签名、465个构造签名 |
| 类型关系 | 属性/继承所得成员、可选/显式readonly语法、参数/返回、泛型约束/默认、联合/交叉、数组/元组、索引签名与循环引用 |
| 原9312个inferred候选 | 9294个已查询；其中2941个类型图未发现可达边界，6353个有直接或传递边界；另18个为隔离上下文。全部候选均有逐项结果，没有静默漏项 |
| 原已登记ConfigPlugin候选 | 202处全部映射：175个props类型图未发现可达边界、27个有边界；不是全部插件默认值/schema/消费行为已验收 |
| 来源和总阻塞 | 9份专项输入逐hash关联；生成M0-02/03任务状态与可定位阻塞集合 |

完整图保存在semantic-surface.json.gz，约4.8MB；[结构化摘要](sdk54-m0-consolidated-summary.json)关联其hash和准确统计。所有类型数量都是隔离分析对象，不能加到阶段完成率。

## 每步实现与用例验收

| 步骤/用例 | 实际实现与验收结论 | 证据（相对本批outputs目录） |
| --- | --- | --- |
| C1 / CON-01 | 固定源码逐blob读取；100份编译器库单独hash；无宿主依赖解析，ambient隔离及模板等长投影契约通过 | definitions-before.json、图inputs/compilerLibraries/excludedAmbientFiles；PASS |
| C2 / CON-02 | 类型图结构覆盖嵌套对象、继承成员、函数返回、重载、泛型、元组/数组、联合交叉、索引与循环；private/protected排除，未知及分析预算明确失败/留界 | contracts-final.tap.log、完整图；PASS（分析契约） |
| C2 / CON-03 | 原9312候选全部逐位置关联；补18个隔离上下文状态；嵌套错误通过反向依赖传播到父类型/候选，不仅检查根节点 | 图inferences、plugins；PASS（求值覆盖，非完整解析） |
| C3 / CON-04 | 包、插件、配置、命令、语法、导出、ambient、外部、Metro共9份输入固定hash；M0-02/03保持INCOMPLETE，原任务未接受 | 图supplements/closure；PASS（准确阻塞） |
| C4 / CON-05 | 源重复gzip字节/hash一致；真实CLI一次重建，原产物验证成功，16类变异逐项验证失败；悬空类型引用有明确错误位置 | repeat-verification、validation-process、negative-results；PASS |
| C5 / CON-06 | 单入口完成上述检查、16组历史清单/基线、工具405/405、CLI53文件500/500与类型；另做当前归属/仓库/阶段/差异及最终证据hash | acceptance-result、regression/closure-checks、evidence-verification；PASS（工具验收） |

6个本批用例均完成；它们不替代M0-02/03全部退出条件。类型图无可达边界的候选仍可能受文件上下文、依赖版本、条件或发行投影影响，不能将2941或175直接标为公共能力完成。

## 统一阻塞与下一步批处理

类型图有764个直接边界节点：481个compiler-error-type、2个unconstrained-any、1个unconstrained-unknown、106个mapped-modifiers-not-verified、174个generic-operation-not-expanded。错误类型、任意类型、未知类型与未展开操作分别登记；显式any不等同产品缺陷，mapped属性虽然列出，也没有假装已验证所有修饰语义。

3059个源码模块有一种或多种上下文边界，包含隔离Program诊断、未解依赖、条件分支、版本未核验、模板或CommonJS投影。此数不是3059个产品缺陷，也不能当作同等工时任务数。

为后续批处理生成remaining-source-batches.json：4598条未解消费边归并265组；226组在各消费声明中有精确lock selector候选，39组需要核对锁差异、alias、ambient或生成入口。组内保留不同消费范围、全部候选和固定lock证据，不任挑最高版本，不提供盲目安装建议。Node内置模块归到@types/node声明身份，不误认运行包。该调查队列独立核对148份固定manifest/lock输入，关联本批图hash。

后续集中处理三个工作包，不再逐包出小轮次：

1. 来源与上下文：按上述消费身份批量核验外部归档/类型；39组身份差异和18个ambient上下文集中处理，保留原42项外部种子的目标/上游区别。
2. 类型与插件契约：集中处理传递未知、174个泛型操作与106个mapped修饰边界；202处候选已有props映射，但全部插件的默认值/schema差异、消费配置和分批结论仍须补齐。
3. 入口与动态语义：集中审阅CommonJS、动态导出、平台/条件分支、缺入口及尚未闭合的外部star。现有专项图不因聚合改为完成。

以上是原M0范围内仍未满足的调查/枚举条件；没有把它们转移到M7来制造关闭。原M0-01/04/05/06继续接受，其余阶段未关闭。

## 边缘失败与修复

- contract-red保存初始工具缺失失败。首次真实全源求值generate-first触发未绑定编译器节点异常：被隔离ambient中的原class候选不属于Program，不能直接getTypeAtLocation。先增加上下文契约，再将其明确记为EXCLUDED_CONTEXT，而非伪造any或丢弃；原失败日志保留。
- context-batch-red还记录新增批量校验入口尚不存在的契约失败；实现后覆盖同一重建期望下正负混合与重复验证路径，最终通过。
- plugin-transitive-red先复现根对象本身无边界、嵌套错误却未传播，以及插件候选未映射；修复为类型反向关系传播和202候选的逐位置props求值。最终候选统计已使用传递边界，不沿用早期仅根节点的7583个EVALUATED统计。
- reference-red先复现悬空类型关系只得到普通差异、缺少直接定位；补充所有根/属性/签名/泛型等关系的引用校验，输出Dangling type reference及所属记录位置。
- 递归用编译器类型身份收敛；超过类型预算会明确失败且不产生完整产物。private/protected、readonly语法与mapped语义、default/type-only、标准库引用与产品外部来源分开保存，不能以文本展示代替结构关系。

## 单入口与真实结果

```bash
node scripts/sdk54/accept-m0-consolidated.mjs --source /tmp/sdk54-expo-source --output outputs/sdk54/ai-e2e/20261022-m0-consolidated
```

该入口先重建/重复（无主产物时先生成），再由m0-consolidated.mjs的--check-set一次重建校验17份快照：1份正常、16份故意变异。CLI进程按设计退出1，原产物valid=true，16份变异valid=false并各有错误；不是伪造16个独立进程退出码。省去逐负例重复分析全workspace的耗时。入口随后执行16组历史回归及完整工具/CLI/类型检查，最终返回PASS_ANALYSIS_ACCEPTANCE，stageClosable=false。

16类变异包括漏属性、调用签名、返回类型、参数、类型、导出、来源输入、推断候选、插件候选、模块；伪插件完成、悬空引用、重复类型、伪阶段闭合、删除传递边界及改编译器库hash。

| 验证 | 实际结果 | 证据 |
| --- | --- | --- |
| 新契约 | 16/16 | contracts-final.tap.log |
| pnpm test:sdk54-tools | 405/405，exit0 | tools.log、tools-result.json |
| pnpm test | 53文件500/500，exit0 | cli.log、cli-result.json |
| pnpm type-check | exit0 | types.log、types-result.json |
| 历史专项/基线复核 | 16组exit0，原产品FAIL/NOT_RUN不改绿 | regression-checks.json |
| 当前归属 | 469文件、1935引用、48命令、8动态；249共享保留/107待退出/29移交/84工具保留 | ownership-current.json |
| 归属/仓库/阶段hash/git diff --check | 4组exit0 | closure-checks.json |
| 输入、报告、产物及原始证据hash | 最终复核PASS | input-snapshot、report.sha256、evidence-index、evidence-verification |

完整回归仅在本批最终代码后运行一次；没有为同批小工具反复重跑，也没有把历史产品失败改绿。验收入口的PASS仅代表分析产物与契约正确，M0仍66%（4/6）。

设计/用例执行前hash见definitions-before.json；执行卡与总计划同步本批结果。docs/superpowers、outputs仍被忽略，设计、执行卡、完整图、变异和原始日志**仅本机可复核**；需保留固定Git缓存和前轮引用目录。未提交、未发布。
