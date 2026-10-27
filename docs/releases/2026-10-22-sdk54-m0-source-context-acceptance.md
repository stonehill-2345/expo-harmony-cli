# SDK54 M0 核心来源上下文合批验收

日期：2026-10-22；run ID：`20261022-m0-source-context`；任务M0-02/03，关联M0-A01/A02。

**M0 仍未关闭，完成66%（4/6）。** 本批将高影响外部声明的归档核验、解析、全源求值、差异比较与回归合并实施。已计划7份固定归档，3份实际核验并接入，4份仍缺；来源用例CTX-01为BLOCKED，不能将本批或M0写为全部通过。没有变更原退出条件、阶段分母或既有接受记录。

## 实现与输入

- 新增 scripts/sdk54/m0-source-context.mjs 和10项契约。m0-consolidated.mjs新增可选externalContext参数，默认行为字节等价；扩展前完整代码及hash保存在本批m0-consolidated-before.mjs.txt和definitions-before.json，旧报告/摘要/图不覆盖。
- Expo commit `5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`，tree `5457e824b21d968e55c8f533cdf1751860160a92`；146根/4088固定源码输入、独立固定锁/manifest输入及100份TypeScript5.9.3标准库。适配HEAD `22cb245f383a194b52f94127f95bce534258b8cc`加未提交工具，精确状态见input-snapshot.json。
- Node v22.20.0、npm10.9.3、pnpm10.19.0、Darwin/arm64。本批无产品依赖安装、包脚本执行、发行或设备运行，属于M0来源/类型分析工具验收。
- 外部虚拟文件保留原manifest及真实包名。React运行包19.1.0与@types/react19.1.10明确分开；react→声明包为类型投影，不是运行身份替换。按消费selector选择已核归档，缺失或歧义不任挑最高版本；shared React声明上下文带独立边界。
- TypeScript NodeNext/CJS用于声明入口投影，验证实际typesVersions/exports封装，不声称每包tsconfig、平台或实际安装树解析已通过。宿主node_modules只提供既有分析工具，不作为外部声明输入。

## 7份固定归档的实际结论

| 固定来源 | 状态 | 实际依据 |
| --- | --- | --- |
| @types/react19.1.10 | VERIFIED | 已获审批的固定下载完成；147063字节，归档根react，SHA512及resolved SHA1均匹配原锁 |
| @expo/metro54.2.0 | VERIFIED | 复用前批原始tgz；70466字节，package根，双hash重新核验 |
| undici-types6.21.0 | VERIFIED | 本机npm内容缓存找到原字节；21020字节，双hash匹配后复制，local-cache-recovery.json保留来源 |
| react-native0.81.5 | BLOCKED | 自动审批服务用量限制导致下载未执行，未找到匹配SRI的本机原始归档 |
| @types/node22.14.0 | BLOCKED | 前一下载审批失败后，后续下载未执行；本机没有匹配原始归档 |
| csstype3.0.11 | BLOCKED | 同上；不以其他版本或已展开的宿主文件冒充锁定tgz |
| @react-native/virtualized-lists0.81.5 | BLOCKED | 同上；本机同版本安装目录不能代替原始归档完整性证明 |

服务返回明确说明：因usage limit无法完成automatic approval review，动作没有执行，这不是“不安全”判定；返回重试时间为11:07 PM（仅转录原返回，不推断时区）。详情转录在download-blockers.json，审批未执行的命令没有进程日志；不伪造下载失败stdout。普通沙箱curl的DNS失败和已批准React下载日志分别保留。未绕过审批改走其他远程通道。

归档仅内存读取：允许实际package/react/node根，拒绝混合根、穿越、链接、重复、单文件超过64MB及总展开超过512MB。只读取manifest和声明，不执行脚本或写入原生工程。

## 每步实现及用例状态

| 步骤/用例 | 实际结果 | 状态/证据（相对本批outputs目录） |
| --- | --- | --- |
| S1 / CTX-01 | 7个selector/version/SRI/SHA1执行前固定；实际3份双hash和manifest身份通过，4份缺失仍阻断 | BLOCKED；archive-identities、download-blockers、local-cache-recovery、图availability |
| S2 / CTX-02 | 安全归档、保持真实manifest、受限虚拟resolver实现；3份可用归档共281份声明/manifest输入；Node缺包不会假标已有全局上下文 | PASS（已取得来源的读取与隔离契约）；10项fixture |
| S2 / CTX-03 | 按消费声明与固定锁选择类型来源，跨版本不任挑；React投影、typesVersions、exports拒绝、相对父路径及类型引用回退有契约 | PASS（解析契约与可用来源，不接受缺失归档）；contracts-final.tap.log |
| S3 / CTX-04 | 重新求值13786导出、全部9312推断和202插件候选；逐ID前后对照，改善/新增/隔离边界均保留，阶段保持false | PASS（可用上下文分析）；semantic-context.json.gz及comparison |
| S4-S5 / CTX-05 | 重复gzip完全一致；正常快照通过、10类变异拒绝，实际坏字节归档被SRI拒绝；工具415/415、CLI500/500及类型、17历史检查、4关闭检查、最终hash通过 | PASS（分析产物验证）；validation/negative/results及evidence-verification |

本批用例4 PASS、1 BLOCKED；PASS限定于上表的已取得来源和工具行为，不能替代7归档完整来源或M0完整公开面。

## 全源结果与前后对照

完整图约6.5MB，[结构化摘要](sdk54-m0-source-context-summary.json)关联其hash。源码根/包/候选集合不缩小：3894源码模块、13786按模块导出候选、9312推断候选和202个原已登记ConfigPlugin候选。

| 指标 | 前批 | 本批 | 含义 |
| --- | --- | --- | --- |
| 类型节点 | 39162 | 45821 | 纳入已核外部声明后的分析图，非公共API/支持数 |
| 属性记录 | 40986 | 76564 | 含继承/嵌套与外部声明成员，不是新增平台能力 |
| 调用/构造签名 | 13037 / 465 | 14948 / 531 | 来源关系结构化，不代表项目编译通过 |
| compiler-error-type节点 | 481 | 375 | 隔离分析错误类型减少，不能直接当产品缺陷数 |
| 直接边界类型 | 764 | 691 | 剩余泛型/any/unknown/mapped/外部错误仍保留 |
| 有上下文边界的源码模块 | 3059 | 3018 | 原版本/条件/投影/诊断规则保留 |

新增1165条有来源的声明解析：944条来自workspace消费，221条为归档内部引用。另1090条missing-declared-identity、2510条missing-exact-archive、1条unresolved-declaration-entry仍在新上下文记录中；包括归档内部依赖，不能与前批workspace边总数直接相减。

推断候选状态：2963 EVALUATED、6331 EVALUATED_WITH_BOUNDARY、18 EXCLUDED_CONTEXT。逐ID变化为33个解除类型边界、11个由EVALUATED暴露为传递边界、其余保持。EVALUATED只表示所捕获类型关系没有发现可达边界，仍受文件上下文和解析策略约束，不代表完整公共能力验收。插件候选175/27状态保持；不将来源增加直接判为插件默认值/schema/消费契约完成。

## 边缘复现与修改

- contract-red保存新工具尚缺的失败；初版fixture通过后，parent-path-red再复现合法归档内../引用被误拒绝。改为规范化后约束在同一归档根内，逃逸路径和exports显式禁用仍拒绝；同时验证TS5.9对应typesVersions实际分支。
- 首次全源对比发现4个SQLite候选从有边界变为隔离。reference-fallback-red先复现外部类型引用钩子吞掉原相对type-reference，再补回仅访问虚拟文件的TypeScript默认回退。修复前图单独保留semantic-context-before-reference-fix.json.gz；最终这4项恢复，隔离候选回到18个。
- node-context-red先复现Node归档不存在仍登记node-global-context；修复为missing-exact-archive。fixture还验证有已核Node根时node:fs声明能实际提供string返回类型；本批真实Node归档依旧缺失，没有把fixture成功冒充实际来源通过。
- 不用manifest版本或本机同版本目录代替归档SRI。实际坏字节types-react tgz由真实CLI在解析前拒绝，bad-archive.log及退出1记录保留。
- 可选上下文默认关闭时，原完整产物--check通过；没有改写原摘要、来源清单或阶段接受hash。新增上下文也未声称外部库已按各自工程配置完整编译，原skipLibCheck分析边界保持。

## 一次统一验收

```bash
node scripts/sdk54/m0-source-context.mjs --source /tmp/sdk54-expo-source --archives outputs/sdk54/ai-e2e/20261022-m0-source-context/downloads --check outputs/sdk54/ai-e2e/20261022-m0-source-context/semantic-context.json.gz
node outputs/sdk54/ai-e2e/20261022-m0-source-context/run-validation.mjs
node outputs/sdk54/ai-e2e/20261022-m0-source-context/verify-evidence.mjs
```

10类快照变异：删归档、伪缺失归档已核、改声明hash、改React投影、删解析记录、删候选对照、伪上下文验收、删属性、删推断候选、伪阶段关闭。--check-set一次重建后验证11份快照，正常valid=true，10份变异valid=false，CLI整体按预期退出1；另1次坏归档CLI退出1，不虚报为11个独立快照进程。

| 检查 | 实际结果 | 证据 |
| --- | --- | --- |
| 新契约 | 10/10 | contracts-final.tap.log |
| pnpm test:sdk54-tools | 415/415，exit0 | tools.log、tools-result.json |
| pnpm test | 53文件500/500，exit0 | cli.log、cli-result.json |
| pnpm type-check | exit0 | types.log、types-result.json |
| 历史16组+默认模式兼容 | 17组exit0，原产品FAIL/NOT_RUN保留 | regression-checks.json |
| 当前归属 | 471文件、1953引用、48命令、8动态；249共享保留/107待退出/29移交/86工具保留 | ownership-current.json |
| 仓库/归属/阶段hash/git diff --check | 4组exit0 | closure-checks.json |
| 输入/报告/产物/原始证据hash | PASS | input-snapshot、report.sha256、evidence-index、evidence-verification |

剩余：补齐4份固定归档，继续同一来源上下文工具；其余外部来源、泛型/mapped修饰、插件完整契约与动态/入口/平台条件尚未关闭。新归档会改变候选物，须在新证据目录重建和补验，不能覆盖本批历史结果。

M0仍仅M0-01/04/05/06接受，66%（4/6），其他阶段未关闭。本批无提交、无发布。docs/superpowers和outputs被忽略，设计、执行卡、归档、完整图、失败/成功日志及证据**仅本机可复核**；需要保留固定Git缓存和前批引用目录。
