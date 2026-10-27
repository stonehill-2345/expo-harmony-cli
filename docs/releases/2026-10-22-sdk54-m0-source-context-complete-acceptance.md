# SDK54 M0 精确锁来源合批验收

日期：2026-10-22；run ID：`20261022-m0-source-context-complete`；任务M0-02/03。

**M0 仍未关闭，完成66%（4/6）。** 审批服务已可实际通过，4份受阻归档全部取得。本批继续合并精确锁来源获取、解析、递归类型及统一验收；六用例4 PASS、2 BLOCKED，不将归档数或测试数计为阶段进度。

## 每步实现与结论

| 步骤 | 实际结果 | 验收 |
| --- | --- | --- |
| S1 / CTX2-01 | RN0.81.5、Node类型22.14.0、csstype3.0.11、列表0.81.5补齐；加原React声明/Metro/undici共7份核心归档，双hash及manifest身份通过 | PASS，7/7 |
| S2 / CTX2-02 | 原265组来源队列hash固定、逐selector匹配原锁、同身份别名合并；233份原始tgz均通过SHA512/SHA1 | PASS，仅可核验归档获取 |
| S3 / CTX2-03 | 232份结构通过；日期选择器8.4.4因重复package/src/index.js拒绝。39组缺精确锁、7个仅SHA1身份保留 | BLOCKED，来源及结构不完整 |
| S4 / CTX2-04 | 4088固定输入/146根重建；原9312推断、202插件候选齐全；13806导出候选含20条新来源，既有导出零丢失 | PASS，仅有明确边界的有限分析 |
| S5 / CTX2-05 | gzip逐字节重复、1正例/15变异、坏归档、17历史、425工具、500 CLI及类型检查通过 | PASS，原始命令/退出码齐备 |
| S6 / CTX2-06 | M0-02/03仍未接受；原任务分母、接受记录及退出条件保持 | BLOCKED，M0仍66%（4/6） |

逐项见[结构化用例](sdk54-m0-source-context-complete-cases.json)，候选物hash见[结构化摘要](sdk54-m0-source-context-complete-summary.json)。原始证据位于 `outputs/sdk54/ai-e2e/20261022-m0-source-context-complete/`，下文文件名均相对此目录。

## 来源与范围

固定Expo commit `5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`、tree `5457e824b21d968e55c8f533cdf1751860160a92`，缓存 `/tmp/sdk54-expo-source`。适配HEAD `22cb245f383a194b52f94127f95bce534258b8cc`加未提交工具。Node22.20.0、TS5.9.3及100份编译器标准库单独记录，不冒充Expo输入。

扩展既有m0-source-context.mjs的`--scope exact-sources`及`--plan`，默认core只接7份。原封存队列SHA256为8049ee3da9461ced82fba66893d7cffd79c2256b54dbd45e251ec093fbf150a7，代码固定校验。其236个name/version身份中7个仅SHA1留阻塞，其余229个加4个核心声明/传递身份组成233计划。233份原字节全部核验，232份结构可用，共8293份manifest/声明输入。来源复用、本机缓存、实际下载和初次失败分别保存在两份acquisition-results及日志中。

只读取manifest和声明，不安装或执行包脚本。Node请求须匹配已核Node根相对reference可达的确切ambient模块；裸fs/path不再误报npm身份，node:invented不会假标来源。自引用保留本归档身份；类型引用带消费路径，跨版本不取首个归档。项目tsconfig、平台、运行和发行解析仍NOT_VERIFIED。

## 两种分析策略

| 指标 | 7份核心图，无声明实例细节上限 | 232份整批图，显式有限分析 |
| --- | --- | --- |
| 类型 / 属性 | 63931 / 103191 | 86005 / 96024 |
| 调用 / 构造 | 24883 / 663 | 27088 / 682 |
| 按模块导出候选 | 13786 | 13806 |
| 推断：无可达类型边界 / 有边界 / 隔离 | 3334 / 5960 / 18 | 2587 / 6707 / 18 |
| 插件：无可达类型边界 / 有边界 | 175 / 27 | 140 / 62 |
| 声明解析source记录 | 2221 | 7392 |
| compiler-error类型 | 313 | 275 |

策略不同，状态变化不能当完整性净增或平台支持数量。新增20条为Router两个testing-library入口各10条真实声明来源；原13786导出零丢失。导出仍按源码模块枚举，不代表公共包入口最终支持数。

原样整批展开及首轮泛型表示均触发25万节点上限，没有输出部分图，失败日志保留。最终泛型应用保留定义及有序实参并纳入反向边界传播；每声明族最多展开16实例，其余保留来源、代表实例和明确细节边界。5396处实例细节边界、2201处泛型应用边界，全部8225个直接边界类型均未接受；generic/mapped/any/error及插件消费契约仍未关闭。完整图解压196575616字节，check-set共享一次源重建并逐份读取快照。

整批还有1308条missing-exact-archive、350条missing-declared-identity、296条unresolved-declaration-entry，含归档内部引用，不能与旧workspace消费边直接相减。1231条Node全局声明上下文不等于项目配置已验证。remaining-work.json保留逐项来源及后续工作，不合并改绿。

## 边缘复现与修改

- context-red先复现裸Node、自引用和多版本类型引用选择问题，再修复；19项来源契约及17项合并图契约最终通过。
- EJS合法版本根先被fixture复现误拒绝；仅增加与精确包名/版本相符的根，穿越、链接、混根、重复仍拒绝。结构失败为REJECTED_ARCHIVE及阶段阻塞，SRI坏字节仍直接退出，不吞错。
- Skia初次超过128MB缓冲下载限制，失败保留；后续流式双hash、512MB下载上限，169752095字节通过。归档原64MB单文件/512MB展开限制未放宽。
- 递归泛型、声明实例细节上限及快照延迟读取各有红绿fixture；预算边界不是完整类型。泛型定义/代表实例引用悬空也拒绝。
- 日期选择器重复路径未自动选首项或末项，未用宿主展开目录替换原始归档；此来源及完整性用例仍BLOCKED。

## 复核命令

```bash
node scripts/sdk54/m0-source-context.mjs --source /tmp/sdk54-expo-source --archives outputs/sdk54/ai-e2e/20261022-m0-source-context-complete/downloads --scope exact-sources --check outputs/sdk54/ai-e2e/20261022-m0-source-context-complete/semantic-exact.json.gz
node --max-old-space-size=6144 outputs/sdk54/ai-e2e/20261022-m0-source-context-complete/run-validation.mjs
node outputs/sdk54/ai-e2e/20261022-m0-source-context-complete/verify-evidence.mjs
```

工具425/425、CLI53文件500/500、类型exit0，17历史检查exit0，原产品FAIL及设备NOT_RUN保留。正常快照valid=true、15变异valid=false，check-set是一个进程整体exit1；另坏归档CLI exit1，不虚报成15个独立进程。仓库/当前归属/阶段/git diff及最终源重建检查见closure-checks.json；输入、报告、产物、日志hash见input-snapshot/evidence-index/evidence-verification。

M0仅M0-01/04/05/06接受，完成66%，其他阶段未关闭。未提交、未发布、未做设备验收。outputs及docs/superpowers被忽略，完整归档、图、红绿日志及证据索引仅本机复核，须保留固定Git缓存及前批引用目录。
