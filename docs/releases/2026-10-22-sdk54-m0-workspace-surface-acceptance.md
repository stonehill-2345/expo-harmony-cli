# SDK54 M0 第十一轮：全 workspace 语法清单与基线集合验收

日期：2026-10-22；run ID：`20261022-m0-workspace-surface`。

**M0 仍未关闭，完成66%（4/6）。M0-04 调查交付本轮接受；M0-02/03 仍未接受。** 本轮实现全 workspace 语法扫描和源重建校验，但不能把语法记录数量当作全量公开 API 或支持数量。

## 1. 输入、实现与边界

- 固定 Expo commit `5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`、tree `5457e824b21d968e55c8f533cdf1751860160a92`。从真实 Git tree 和 manifests 重建 workspace，未信任可编辑摘要决定根集合。
- 141 个 workspace、5 个模板共146根，最长根归属覆盖16,939个文件；4,088份实际读取输入含3,934个生产代码模块和154份 manifest（含嵌套 manifest）。原生、资源、测试、生成文件仍有单独角色/blob，不宣称已解析其全部接口。
- 所有读取对象重新核对 Git blob SHA1 和内容 SHA256；首次沙箱网络解析失败保留 source-fetch.log，获准联网重试成功，固定 HTTP/1.1 仅进程有效，没有更改全局 Git 配置。
- 新工具：`scripts/sdk54/workspace-surface.mjs`、`scripts/sdk54/m0-baseline-audit.mjs`，对应12项与4项测试。Node v22.20.0、npm10.9.3、pnpm10.19.0、Darwin/arm64，TypeScript5.9.3。适配 HEAD `22cb245f383a194b52f94127f95bce534258b8cc` 加未提交调查代码，精确输入见 input-snapshot.json。
- 不加载宿主 node_modules 展开 API，不修改产品代码/依赖、不清理旧代码、不提交、不发布。源码投影只表达来源关系，不证明发行物 build 新鲜或 Harmony 行为。
- 预定义用例：[sdk54-m0-workspace-surface-cases.json](sdk54-m0-workspace-surface-cases.json)。设计与执行卡为同日 `docs/superpowers/{specs,plans}/*workspace-surface*`，执行前定义 hash 保留。

## 2. 交付及逐步结论

| 步骤/用例 | 实际交付、操作和断言 | 状态 |
| --- | --- | --- |
| W1 / WS-01 | 固定完整根/树，读取选中全部对象并核对来源；不使用首批8包白名单 | PASS |
| W2 / WS-02 | 根入口、src、plugin、版本和平台文件均扫描；所有文件都有角色、所属根、源码 blob | PASS（文件/语法范围） |
| W2 / WS-03 | 导出/声明/嵌套成员 fixture 契约通过，真实生成11,928条导出、20,066声明、61,032语法成员；仍存在推断/继承、Flow等未展开边界 | NOT_RUN（全量公开面语义验收未完成） |
| W2 / WS-04 | 331入口，13,774模块引用；条件/wildcard、源码投影、workspace/外部/动态和平台候选分开记录 | PASS（记录与边界契约，不代表均已解析） |
| W2 / WS-05 | 9,646条保守缺口逐条 ID/来源/预分批；完整标记为 false，未悄悄跳过失败 | PASS（缺口记录） |
| W3 / WS-06 | 固定对象重复生成 gzip 字节/hash完全相同；正常 --check 从固定对象重建通过 | PASS |
| W3 / WS-07 | 12类清单变异、2类基线变异均真实CLI退出1；可跟踪路径修正后另重跑2基线负例退出1 | PASS |
| W4 / WS-08 | 原六场景、候选/执行器/项目/日志及状态集合全部核验，原10 PASS/10 FAIL/10 NOT_RUN保留 | PASS（调查对象） |
| W4 / WS-09 | SDK52安装补验3 PASS/2 FAIL/9 NOT_RUN、独立JS FAIL和设备空列表核实；两个最小产品期望测试重新执行仍退出1 | PASS（调查对象；产品仍失败） |
| W5 / WS-10 | 工具349/349、CLI53文件500/500、类型及历史索引/基线/当前归属/仓库/进度检查通过，证据hash复核 | PASS |

十用例为9 PASS、1 NOT_RUN；不宣称全量清单验收通过。工具测试统计与产品失败测试分开，两个仍红的产品期望测试不计入349个绿色测试。

## 3. 结构化清单与完整性门禁

[可跟踪摘要](sdk54-workspace-surface-summary.json)记录各根统计、角色、缺口分布、334条非推断缺口及完整 gzip 索引位置/hash。完整索引约8.76MB压缩内容保存于本轮 outputs，解压后包含输入、文件、模块、入口、导出、声明、成员、引用和全部缺口。每条记录有 ID、来源位置、所属包、依赖引用、预分批及范围关联。包职责预分配不能代替最终逐能力的范围审阅，暂缓关联没有变成整包豁免。

从实际固定源重建，与待验数据逐 ID 双向比较；重复/缺失/额外/内容或来源变化、伪完整标记均拒绝。负例包括删包/文件/模块/导出/声明/成员/引用/入口/输入、重复成员、悬空依赖、伪全量，以及伪产品全过/删基线观察。删除模板 Colors 的 light 属性成员会明确输出源码路径及第5行；删输入 manifest会指出精确源路径。最终负例位于 negatives-final/，路径修正后的基线重验另存 negative-portable-audit-results.json；早期尝试均保留。

```bash
node scripts/sdk54/workspace-surface.mjs --source /tmp/sdk54-expo-source --check outputs/sdk54/ai-e2e/20261022-m0-workspace-surface/workspace-surface.json.gz
node scripts/sdk54/m0-baseline-audit.mjs --check docs/releases/sdk54-m0-baseline-audit.json
node --test scripts/sdk54/__tests__/workspace-surface.test.mjs scripts/sdk54/__tests__/m0-baseline-audit.test.mjs
```

从仓库根执行。生成使用 --output <json或json.gz>，可附 --summary <摘要>。校验须保留固定 Git 对象缓存；摘要不是验证器的真值输入。重复生成的准确 hash 见 repeat-verification.json。

## 4. 边缘缺陷及修改点

- CommonJS object、默认 object、计算属性 module['exports']、Object.defineProperty/assign 不能消失：先保存 cjs-resolution-red 与 export-edge-red，再补声明/嵌套成员、属性导出和动态修改缺口。无法静态推断的结果保持未知。
- .ts/.d.ts 同名按源扩展优先级处理；仅平台候选记录 platform-dependent，不能随意选一种。build/bin→bin、build/src→src、types.d投影、bare workspace main均先复现再修复；源码缺失保留entry-missing，而非猜入口。
- 模块模板 EJS 不是非法产品 TypeScript：先用 template-red复现，再以等长明确占位标识符做语法投影，保留原blob、原字符范围、原名称与替换表，15个模块另记uninstantiated-template。171条初始语法诊断降为1条Flow诊断，但未把模板渲染记PASS。模板导出名保持原拼写的遗漏也有单独red/green。
- 缺失input原来只给整体差异，先用input-location-red复现，再加输入集合逐源比较，错误可定位具体文件。
- 仓库检查发现基线摘要一条本机绝对引用；先以portable-audit-red复现，再标准化仓库相对证据路径并拒绝越界。没有放宽仓库扫描规则，原始证据和hash未改变。

## 5. 仍阻止 M0-02/03 接受的工作

当前9,646条是对全部生产代码（包含内部工具/应用辅助代码）的保守扫描缺口，**不是9,646个公开API、缺陷或支持项**。后续须先确定真实公开可达集合，再补齐必要语义：

| 缺口类型 | 数量 | 具体未完成工作 |
| --- | --- | --- |
| inferred-type | 9,312 | 推断返回/变量类型、继承和外部属性的语义图；不能以源签名文本代替展开 |
| dynamic-commonjs / dynamic-export-mutation | 136 / 26 | CommonJS动态值、getter、Object.assign的真实公开符号归属 |
| external-star / workspace-star | 7 / 10 | 展开跨包导出和外部来源类型，解决别名/深入口，不只登记package ID |
| reference-unresolved / platform-dependent | 70 / 41 | 动态请求与平台模块选择逐项分析，保留各平台源码差异 |
| reference-missing / outside-workspace-reference | 22 / 5 | 模板引用与生成路径、工程消费相对入口、树外/非workspace关系复核 |
| entry-missing | 1 | expo-structured-headers的manifest main=index.js与固定树源码关系需要独立核实 |
| uninstantiated-template / unsupported-syntax | 15 / 1 | 真实模板渲染；vendored react-native-view-shot Flow源码需要合适解析器/语义核验 |
| 既有种子表外部来源及范围结论 | 42项，另计 | seed-pending-reviews.json逐项列出；不在workspace不等于废弃，尚不能接受M0-A02 |

六插件嵌套选项、Router类型/schema差异、配置schema和CLI命令专项索引仍引用前轮清单并全部回归；本轮没有覆盖它们的历史结论。全量插件参数的推断/外部继承边界仍需随着上述语义图闭合，M0-A01的删项门禁通过不单独等价于M0-03完整接受。

## 6. M0-04 接受与进度

[M0-04独立接受报告](2026-10-22-sdk54-m0-baseline-audit-acceptance.md)按原M0-A03接受完整的现状调查；结构化核验复查410份去重原证据引用。原创建超时、npm peer冲突、query-string打包失败、重复生成的旧保护行为以及设备NOT_RUN保持原状态；没有把失败改绿。第九/十轮报告和原始结果不覆盖，本轮纠正调查接受与产品通过的混用。

阶段定义和分母未变；接受记录仅增加M0-04，现有M0-01/05/06证据hash不变。进度为66%（4/6），M0-02/03仍待接受，closures为空；其他阶段未关闭。本轮不能满足“完成M0”的最终目标，剩余交付已具体列在上表，不以扩大扫描数量宣布完成。

## 7. 回归及证据保存

- 工具349/349、CLI500/500、CLI类型检查通过；完整结果见tools-verified.log、cli.log、types.log及命令结果记录。CLI/类型在产品未修改期间执行，无重复安装或产品场景重跑。
- 六份既有来源/专项清单、当前CLI结果、SDK52补验、误报/执行基线、catalog、新索引和基线审阅共12组重建检查均退出0。原FAIL/NOT_RUN未被当作产品通过。
- 本轮新归属：458文件、1,859引用、48命令、8处动态依赖；249共享保留/107待退出/29移交/73工具保留。旧归属接受清单及hash不改，未执行清理。
- 最终仓库、归属、阶段hash与git diff --check见closure-checks.json。definitions-before固定执行前定义；input-snapshot保存最终输入；evidence-index固定本轮全部原日志/索引/负例/快照；report.sha256与evidence-verification记录最终复核。

原始证据目录：outputs/sdk54/ai-e2e/20261022-m0-workspace-surface/。docs/superpowers与outputs仍被忽略，完整索引、设计、执行卡和原始证据仅本机可复核。还需保留前轮TGZ、临时安装目录和固定Git缓存；未宣称团队可离线重建。未提交、未发布。
