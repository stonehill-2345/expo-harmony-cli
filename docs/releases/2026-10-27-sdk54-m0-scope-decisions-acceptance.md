# M0 种子范围与入口义务裁决验收

M0 仍未关闭，完成 **66%（4/6）**。M0-02/03未接受；本批完成13项范围裁决及6项入口义务分类，不增加阶段接受单元。未提交、推送或发布。

## 实现与实际验收

| 步骤 | 实现 | 实际结论 |
| --- | --- | --- |
| SD-01 | 新增固定输入裁决模块；13种子按范围、生命周期、来源、历史身份、运行分维度记录；6入口逐包绑定固定manifest政策 | PASS_WITH_BOUNDARIES：21/21测试实际运行、0跳过；14项输入/状态变异拒绝。13范围完成，历史身份关闭0、待确认13；5隐式探测及1显式main缺口均保留原BLOCKED |
| SD-02 | loader与CLI显式--scope-decisions fixed-v1，补入Git文件及本地证据；未知规则拒绝，裁决作为metadata参与重建校验 | PASS：22/22加载与CLI测试通过；默认产物与上批索引字节一致；显式来源check通过，上游semanticRebuilt=false |
| SD-03 | 固定来源重建公开图，独立比对原有表及新增输入 | PASS_WITH_BOUNDARIES：全部16个非inputs表的索引与分片哈希一致，原16666输入内容不变，仅新增7条绑定裁决的固定Git输入；所有原ID及target保持 |
| SD-04 | 全工具、独立审查、重复、真实CLI负例、来源与封存校验 | PASS_WITH_BOUNDARIES：工具654/654，0跳过；独立10项篡改拒绝，审查无开放问题；重复字节一致、来源check通过，删除一条裁决后真实CLI exit=1。仓库门禁保留下述既有FAIL，不能记全过 |
| M0退出 | 按原M0-02/03与A01/A02复核 | BLOCKED：完整公开范围、类型及来源边界未接受，维持66% |

## 13项范围结论

| 种子 | 固定范围 | 本批裁决 |
| --- | --- | --- |
| @react-native-community/viewpager | 5.0.11 | 保留固定bundle历史范围；发布者明确迁移react-native-pager-view，不能写成重命名 |
| @react-native-oh/react-native-harmony | 目标catalog 0.82.30 | Harmony目标独立保留，上游bundle无此身份；候选peer RN0.82.1不证明历史安装或支持 |
| @sentry/react-native | ~7.2.0 | 保留外部范围；捕获版本未明确弃用，不猜生命周期 |
| expo-analytics-amplitude | ~11.3.0 | 保留固定历史范围，不因当前workspace缺失判废弃 |
| expo-app-auth | ~11.1.0 | 保留固定范围；发布者明确迁移expo-auth-session，不能写成改名 |
| expo-app-loader-provider | ~8.0.0 | 保留加载范围；发布者未明确弃用 |
| expo-google-app-auth | ~8.3.0 | 保留固定范围；发布者明确迁移expo-auth-session |
| expo-mcp | ~0.2.1 | 保留独立外部范围；repository有记录、发布提交缺失 |
| react-native-bootsplash | ^6.3.10 | 保留外部范围，不以与Splash能力重叠为由删除 |
| react-native-get-random-values | ~1.11.0 | 保留外部随机数能力范围 |
| react-server-dom-webpack | ~19.1.4 | 保留固定bundle及不兼容边界；锁19.0.4不满足，候选有安全弃用、消费者及React peer冲突，不自动升级基线 |
| sentry-expo | ~7.0.0 | 保留固定历史范围；捕获版本未明确弃用，不能推断迁移 |
| unimodules-image-loader-interface | ~6.1.0 | 保留历史来源，不猜改名或删除 |

这些结论完成的是差异范围裁决，不是13项来源全部闭合。候选registry metadata及receipt逐对核验，不将范围下界候选当成历史安装身份。13候选归档、源码提交到发行物等价及运行验收仍未接受；原pendingSeedIdentityDecisions仍13，新增pendingScopeDecisions为0。

## 6项入口义务

| 包 | 固定义务结论 | 保留边界 |
| --- | --- | --- |
| expo-dev-launcher | 原生/配置插件包，未声明JS根入口；默认index探测 | 不能把探测视为已声明根能力；不接受原生平台运行 |
| expo-env-info | bin及NCC构建契约与根import分别记录 | 已有bin来源不消除隐式index缺目标 |
| expo-module-template | 模板根包与$package.json生成包契约分别记录 | 不用生成包main替换模板根契约 |
| expo-workflow-testing | apps目录工作流配置，无声明JS根入口 | private及应用定位不自动豁免范围 |
| unimodules-app-loader | 原生模块配置，无声明JS根入口 | 不推断JS或原生运行已支持 |
| expo-structured-headers | 显式main:index.js在固定tree中缺失 | 原生模块定位不消除声明矛盾，保持明确main缺口 |

缺目标证明绑定完整固定tree的19546条path/mode/type/oid集合及其哈希，并逐项列出候选路径。只按已审逐包固定manifest裁决，不按任意private/bin/native字段自动豁免；不以选择性缓存files Map缺项证明不存在。

## 来源与稳定性

固定commit：`5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`；tree：`5457e824b21d968e55c8f533cdf1751860160a92`。

复用上游semantic-final.json.gz SHA256：`a9c1bd5892bfb4d5a5e671b0bf6f2092ce3ab4484bb6cafe4bc467c91a0206c3`，本批未重跑类型分析。新公开索引SHA256：`3b4574272dda35d68d856c3900294f772b988efd2ad27c4eb974014f8d9c26ce`，索引及同名.parts需共同保留。

17项Git输入校验完整tree身份及原始blob字节，30项本地输入固定SHA256并复验metadata/receipt。原146包、3959模块、629入口、3959候选处置、13942导出、9312推断、202插件记录均不变；类型、声明、成员、引用及发行投影表亦不变。新增输入不是新增API或支持数量。

## 边缘情况与修改点

- 协同篡改：既校验原始文档固定哈希，也比较解析后的facts/metadata/evidence；不能通过一起重算自报hash、伪造dist身份或历史关闭数绕过。
- 缺目标：完整tree路径和对象集校验会拒绝截断、同长度重复路径、插入目标及更换oid；manifest字节另验Git blob。
- 状态混淆：迁移指导不等于重命名，隐式probe不等于声明缺口，候选身份不等于历史身份，范围完成不等于平台验收。
- RSDW：锁、消费者声明及发布者peer分别保留；安全弃用不能授权自动升级固定React/RN基线。
- 可移植性：19项固定本机集成测试仅在缺本机缓存/封存时明确跳过，API及非法source测试始终运行；本次654项全部实跑、无跳过。
- 审计脚本首版误要求inputs表也零新增，已保留失败证据并修正为原输入逐项不变、新输入必须绑定裁决证据；所有非inputs表仍严格哈希一致。后续先按证据表与语义表职责确定比较规则。

## 实际失败与剩余工作

仓库门禁实际FAIL：上批已封存的`docs/releases/sdk54-m0-export-patterns-summary.json`含`/Users/`绝对路径。该文件SHA256仍为`a7020eebdbd9939f10e4adae9a73adb1e4f22d231780eb5b6e7fa1ae58a54b69`，与旧evidence-index完全相同；本批按旧封存只读保留。新摘要改用相对路径，最终门禁再次运行并核实仅此既有失败，不能声称全仓门禁通过。

阶段检查第一次漏传目标参数，实际exit=1；更正为`node scripts/sdk54/stage-progress.mjs --check docs/releases/sdk54-stage-progress.json`后通过。原失败与正确执行日志分别保留，不覆盖历史失败。

14个BLOCKED记录仍含8个家族哨兵及6具体入口，518个SOURCE_WITH_BOUNDARY保持。可达26个compiler-error-type、22590个声明细节预算节点、未隔离typeRoots原194条公开使用及引用来源缺口均未在本批解决；typeRoots隔离仍是下一项语义加载工作，不以本批裁决替代。build/runtime为NOT_VERIFIED，device为NOT_RUN。

逐步结论、真实命令、变异、审查、输入及分片封存位于`outputs/sdk54/ai-e2e/20261027-m0-scope-decisions/`；完整复验结论见`evidence-verification.json`。
