# M0 通配公开入口完整性验收

M0 仍未关闭，完成 **66%（4/6）**。M0-01/04/05/06保持接受，M0-02/03未接受。本批4个执行步骤不增加阶段接受单元。未提交、推送或发布。

## 实现与实际验收

| 步骤 | 实现 | 实际结论 |
| --- | --- | --- |
| EP-01 | 默认关闭的patternCoverage及fixed-v1家族覆盖证据；候选保留固定tree/blob/mode、配置emit来源、wildcard、实际选中exports键、遮蔽或拒绝原因；子入口双向绑定家族 | PASS_WITH_BOUNDARIES：38个枚举测试及24个独立Node对照通过；契约、URL跨条件解析、重复星号数字后缀、编码字面星号、包目录及占位符拼接边界均先红后绿；不升级家族或发行状态 |
| EP-02 | loader两次枚举均贯穿policy；公开CLI增加--entry-patterns fixed-v1并拒绝未知值 | PASS：loader红绿通过；默认全量输出与上批索引SHA256一致。来源重建check结果见cli-check.json/log；上游明确semanticRebuilt=false |
| EP-03 | 固定Expo commit/tree与上批semantic-final哈希；重建公开账本，逐家族及子入口比对旧图 | PASS_WITH_BOUNDARIES：10家族、274候选、274具体子入口双向关系齐备；原7表候选ID零丢失；284条入口仅新增覆盖或反向关联字段，所有原入口target均不变 |
| EP-04 | 最终工具回归、公开重复、来源check、删除子入口真实CLI负例、覆盖变异与独立审查 | PASS：最终工具631/631通过，17变异全部拒绝，重复字节一致，来源重建check通过；真实CLI删除child后exit=1并指出缺失PUBLIC-ENTRY；独立审查及目录/仓库/阶段门禁通过。完整封存校验结果见evidence-verification.json |
| M0退出 | 按原M0-02/03及A01/A02复核 | BLOCKED：本批加强通配来源覆盖，不代表公开发行范围、所有类型和来源边界已接受；维持66% |

## 全量家族证据

| 包与exports规则 | 条件 | 固定候选数 | 具体子入口数 | 请求域与边界 |
| --- | --- | ---: | ---: | --- |
| @expo/config-plugins ./build/*.js | 无 | 88 | 88 | 固定来源有限投影；原家族BLOCKED保留 |
| @expo/config-plugins ./build/* | 无 | 88 | 88 | 固定来源有限投影；原家族BLOCKED保留 |
| expo-server ./adapter/* | import、require各一组 | 各11 | 各11 | 固定来源有限投影；原家族BLOCKED保留 |
| expo-server ./build/* | import、require各一组 | 各27 | 各27 | 固定来源有限投影；原家族BLOCKED保留 |
| expo-server ./vendor/* | import、require各一组 | 各11 | 各11 | 固定来源有限投影；原家族BLOCKED保留 |
| expo-server ./runtime/* | import、require各一组 | 各0 | 各0 | 常量目标对应无限请求域，SOURCE_WITH_BOUNDARY保留 |

274个具体入口原已存在，本批新增它们与家族的完整性证据，没有新增274项API。真实固定来源的274候选均INCLUDED；遮蔽、非法请求、symlink、emit冲突及DISABLED分支通过隔离夹具和真实Node反例覆盖，不能称真实仓库存在这些拒绝项。

独立复核使用TypeScript.getOutputFileNames生成emit输出，与固定Git tree合并后用定长字符串反解，未复用生产正则反解函数。逐候选、条件及child来源吻合，开放问题为0。具体记录见ledger-review.json和core-review.json。

## 稳定身份与来源

146包、3959模块、629入口、3959候选处置、13942导出、9312推断、202插件ID全部保留；除入口新增证据外，以上表记录内容亦不变。上游159194类型、155211声明、71631引用来自上批语义产物，本批没有重跑上游类型分析。

固定commit：`5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`；tree：`5457e824b21d968e55c8f533cdf1751860160a92`。复用semantic-final.json.gz SHA256：`a9c1bd5892bfb4d5a5e671b0bf6f2092ce3ab4484bb6cafe4bc467c91a0206c3`。本批公开索引SHA256：`c4b385c8aead205ee02d6f6dc8724b770ad32179fda694559f213d8ec43b8183`。索引及同名.parts必须一起保留。

## 边缘情况与修改点

- 条件并集：请求从某一分支发现后，所有条件分支分别解析。URL校验移至共同strict解析入口，覆盖exact、constant及未自行产生候选的分支，防止字面%20、?、#文件误判为Node目标。
- 编码字面星号：先区分真实占位符，再按URL解码；重复目标星号使用同一capture，named backreference避免后接数字合并成八进制转义。均保留独立红测。
- 包目录与内部标记：文件URL的base由pathToFileURL编码，目录中的字面%20、#、?不会被当成URL语法。marker避让原始和完整规范路径，首字符只出现一次，从而没有非空前后缀重叠；原文/编码marker、目录、静态文本与capture拼接边界均有真实Node对照。
- 空capture、编码分隔符、非法路径段、尾斜杠和包外目标保留拒绝理由；精确键、null键和最长pattern遮蔽不生成错误子入口。symlink与emit冲突保留来源及BLOCKED原因。
- runtime常量家族不能穷举无限请求。固定来源投影不接受实际build、安装、发布、平台选择或设备运行；build/runtime为NOT_VERIFIED，device为NOT_RUN。
- 默认模式保留旧行为；修正仅随显式fixed-v1启用。默认兼容结论不表示旧模式获得了新增规则校验。

## 尚未关闭的工作

14个BLOCKED记录中8个是家族哨兵，6个具体缺目标为expo-dev-launcher、expo-env-info、expo-module-template、expo-structured-headers、expo-workflow-testing、unimodules-app-loader。518个SOURCE_WITH_BOUNDARY仍保留。家族已有实例这一事实不能代替范围裁决。

13个种子历史身份、公开发行范围、26个可达compiler-error-type节点、22590个可达声明细节预算节点，以及来源缺口和typeRoots原194条公开使用的隔离加载仍未完成。本批重用上游，因此不宣称这些缺口减少。原公开引用中缺精确档47条、缺声明身份6条、无声明入口295条等逐项来源继续沿用上批证据。

最初把家族BLOCKED误读为没有展开，现已纠正；后续先核家族与实例层级。URL缺陷说明并集分支必须在共同解析入口重新校验，后续同类修改保留跨分支反例，避免只验候选生成处。内部标记必须证明完整转换路径及拼接边界不会碰撞；后续不以局部字符串避让代替该证明。

逐步骤机器结论：`outputs/sdk54/ai-e2e/20261027-m0-export-patterns/acceptance-results.json`。来源与工具快照见input-snapshot.json，完整封存复核见evidence-verification.json。旧批证据只读保留。
