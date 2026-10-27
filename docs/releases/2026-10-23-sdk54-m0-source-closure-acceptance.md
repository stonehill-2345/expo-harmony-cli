# M0 声明来源与种子身份验收

M0 仍未关闭，完成 **66%（4/6）**。M0-01/04/05/06保持接受，M0-02/03未接受。执行卡SC-01至05是本批交付，不增加阶段分子。未提交、推送或发布。

## 实现与实际结论

| 步骤 | 实现 | 实际结论 |
| --- | --- | --- |
| SC-01 | 显式按消费方有效tsconfig选择typeRoots，记录配置输入、精确声明范围及SHA256；原解析状态保留 | 来源证据已关联；原xcode193次及pbxFile1次公开使用有据可查，但共享语义程序尚未隔离加载，仍为unresolved-declaration-entry |
| SC-02 | 13候选registry元数据、4精确锁归档、17份离线稳定凭据 | 13历史身份仍待裁决，不能把范围下界当历史锁身份；4归档字节完整性通过，3结构通过，datetimepicker重复路径拒绝；原始4归档首次获取来源/时点未知，明确保留UNKNOWN_INITIAL_ACQUISITION |
| SC-03 | CLI显式node-self模式重建已核Node声明上下文，记录lexical-reference-source-probe | 原37条Node自引用均转为node-global-context，由7条独立解析观察支持；不冒充上游编译器观察、不接受项目或运行 |
| SC-04 | 显式additional-selectors纳入4固定锁归档，重建完整上游语义与公开账本 | PASS（保留边界）：146包、3959模块、629入口、13942导出、9312推断、202插件候选ID均零丢失；151107类型、146919声明、70682实际引用。重复字节一致、16类变异拒绝、真实CLI删观察exit=1；上游及公开来源重建检查均通过 |
| SC-05 | 独立审查、完整工具回归及来源/分片封存 | 605/605工具用例通过；独立审查PASS_WITH_BOUNDARIES、无未解决缺陷；catalog/repository/stage/diff通过；封存复核状态见evidence-verification.json |
| SC-06 | 原阶段退出条件复核 | BLOCKED：完整公开面、发行范围、类型及依赖来源尚未全部接受，仍66% |

4份新增声明归档为navigation/core、uri-js、cli-spinners、canvaskit-wasm；27次旧词法使用从missing-exact-archive转为source（其中原入口闭包19次）。exec-async真实字节与原锁SHA1一致，但原锁缺SHA512，仍拒绝接入；不把本次观测哈希写成上游锁身份。

本批真实重跑上游语义分析。额外来源改变类型分配与推断，旧候选身份全部保留，字段变化逐条写入changed-exports/inferences/plugins/modules.json；不把重建后数值型type ID的对应关系当成语义相同。此前账本完整保留，可回查历史来源和字段。

## 仍未关闭的工作

- 入口仍为14 BLOCKED、518 SOURCE_WITH_BOUNDARY；来源映射不等于公开/发行范围接受。
- 入口闭包可达91565类型；编译器错误由36增至37，实例细节预算22480。新增声明进一步暴露传递依赖缺口，missing-exact-archive公开使用由55增至257；这些是实际引用/节点数，不是独立缺失API数。
- typeRoots的194次原公开使用仍缺按消费方隔离的语义加载；未声明的@types、React发布者开发用selector缺锁和项目别名边界继续保留。
- 13种子历史身份及范围裁决、datetimepicker重复路径、4归档最初获取链未知，以及能力级批次/平台适用范围仍待接受。4项发布者明确弃用声明逐字保留，不据此擅自改名或替换。

## 边缘情况与修改点

- 外部模块类型根自身的declare module属于augmentation，不能当全局ambient；但同包三斜线引用仍需遍历。此遗漏已先红测，再修复并独立复核。
- typeRoots继承、相对路径、types空数组、未授权消费方、通配模块及越界均保留限制，不增加全局根。
- Node来源探测只补真实词法使用中未观察的键；既有观察原样保留。伪造observer、提升source及删观察均应被重建门禁拒绝。
- 额外归档仅显式精确fixed-lock selector；默认空数组兼容，拒绝重复/空值/未知身份。字节完整性通过与结构拒绝分开。
- 元数据和归档凭据保留获取事实；当前验证时间不冒充首次下载时间。离线重放17凭据字节不变。
- 修正上一批摘要机器绝对路径为仓库相对路径，恢复仓库门禁；原摘要已另存本批prior-entry-template-summary.original.json，未改旧封存索引和原哈希事实。

证据目录：`outputs/sdk54/ai-e2e/20261023-m0-source-closure/`。公开账本索引与同名.parts目录必须一起保留；上游语义使用semantic-closure.json.gz及其.parts。outputs及执行卡仍沿用本机忽略规则。
