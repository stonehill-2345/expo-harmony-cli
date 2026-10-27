# M0 入口与模板合批验收

M0 仍未关闭，完成 **66%（4/6）**。M0-02/03 未接受。本批已实现并验收模板范围、入口映射和差异调查；不新增原阶段接受单元。未提交、推送或发布。

## 实现与实际结论

| 步骤 | 实现 | 实际验收结论 |
| --- | --- | --- |
| ET-01 | 语义分析与引用扫描复用同一模板投影；CLI显式启用project-v1；保存raw/projected hash和UTF-16位置 | PASS：原20条RANGE_UNMATCHED全部SCANNED；全144401声明均可扫描且原文/切片hash不变。13文件应用投影，3个仅含普通`<%`文本的文件原文保留；新增24引用，非来源解析状态仍保留 |
| ET-02 | types/typings目录解析；严格静态NCC单入口；Taskr/SWC AST配方；真实固定目标优先并保留备选投影 | PASS（来源映射）：原19条阻塞逐ID保留，5条补齐映射；14条仍BLOCKED，其中8模式族、6普通入口。构建、发行、运行均未接受 |
| ET-03 | 固定146份manifest核验；130种子+53新增逐条来源/用途调查 | PASS（调查）：88同名、53新增、42树外各自分类，141workspace与5模板均保留；13项身份/版本问题、4包自身归档缺口及共享用途/能力范围仍待核；原M0-A02未整体接受 |
| ET-04 | 原候选及字段逐ID对照、固定来源重复生成、实际漏项CLI、证据负例 | PASS：13942导出、9312推断、202插件及148975类型零丢失；旧70250引用完整内容保留；新70274引用。完整重复SHA256相同；16类变异拒绝，真实删除入口CLI exit=1并指明manifest位置 |
| ET-05 | 独立审查、必要回归、输入/归档/分片/工具hash封存复核 | PASS：588/588工具用例；catalog/repository/stage/diff检查通过。两项独立审查问题已红绿修复并复核；详细封存结论见evidence-verification.json |
| ET-06 | 按原阶段退出条件核对关闭资格 | BLOCKED：M0-01/04/05/06保持接受，M0-02/03缺完整公开面及来源/范围结论，仍66% |

本批重复的是公开账本的固定来源重建；上游148975类型的语义图沿用此前已重建并封存的固定输入，本批未再执行上游全量类型分析。全部4656语义分片重新校验hash。解析成功不代表模板实例、npm发行、Harmony构建或设备运行通过。

## 五条入口修复

| 包/入口 | 固定证据与修复 |
| --- | --- |
| @expo/cli main、bin expo-internal | manifest→taskfile build/release→SWC stripExtension，关联bin/cli.ts；四份来源blob/hash保留，来源链接标为CONDITIONAL_SOURCE_PROJECTION |
| @expo/metro-runtime types | `build`查到真实`build/index.d.ts`；运行入口不兜底声明文件，未补造缺失语义模块 |
| expo-env-info bin | 固定`ncc build ./src/index.ts -o build/`只关联单一bundle入口，不制造src逐文件输出 |
| uri-scheme main | 同一受限NCC配方关联src/index.ts；cli.js自身执行行为保留 |

6个普通阻塞分别为expo-dev-launcher、expo-env-info默认根、expo-module-template、expo-structured-headers、expo-workflow-testing、unimodules-app-loader。原生/插件/模板/工作流用途已记录；默认根候选继续保留，不能根据private或缺目录宣称废弃。

## 边缘情况与修改点

- 模板未知token不替换；只有完全匹配AST范围才扫描。原name/request与投影name/request分别记录，缺解析观察继续NOT_OBSERVED。
- types目录先检查固定文件；不同后缀的备选emit映射显式保留requestedPath与未验收边界。此优先级缺陷有独立红绿与复核。
- NCC只接受限定静态参数，拒绝shell组合、动态变量、越界路径、未知选项及前导`-`的路径。前导选项形路径缺陷有独立红绿与复核。
- Taskr只接受可证明的调用链、单一插件及扩展名删除规则；未知插件修改、数组多插件、输出碰撞、隐藏文件和symlink均不映射。
- 循环、泛型及实例预算边界继续保留。可达89790类型仍有36个编译器错误、22432个实例细节预算节点；这些是图节点数量，不是漏API独立条数。

## 剩余交付

1. 14个入口候选及518个SOURCE_WITH_BOUNDARY的公开、生成/发行范围；后者包含真实固定build文件而未必有直接语义模块，不能一律当成缺JS功能。
2. 入口闭包中的408条非来源解析引用，以及947条node-global-context；实例/泛型/映射类型按声明族合并处理，不按节点逐个扩张。
3. 13个种子身份/版本问题、4个精确锁包自身归档缺口、暂缓包共享用途与能力级批次/适用范围；全部逐项列于remaining-work.json与seed-range-facts.json。

主证据目录：`outputs/sdk54/ai-e2e/20261023-m0-entry-template/`。`public-surface.json`是索引，须与同名.parts目录一起保留并经readPublicSurface读取。完整重复SHA256：`c338aa8f70857fe37bb4d981571efeb7b6f2159536e2aaddfe572bb7e3f24706`。

关键证据：before-after.json、scope-investigation.json、seed-range-facts.json、taskr-fixed-source.json、template-ranges-20.json、mutation-results.json、cli-negative.log、review-initial.json、tools-final.log、input-snapshot.json、evidence-index.json、evidence-verification.json。outputs及执行卡目录沿用既有忽略规则，仅本机保存。
