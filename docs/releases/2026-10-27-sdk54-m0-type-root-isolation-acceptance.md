# M0 消费者 typeRoots 隔离验收

M0 仍未关闭，完成 **66%（4/6）**。本批为旧公开使用补上配置隔离的真实语义绑定；M0-02/03原退出条件保持，未提交、推送或发布。

## 实现与逐步验收

| 步骤 | 实现 | 实际结论 |
| --- | --- | --- |
| TR-01 | 新增 buildTypeRootIsolation；按有效配置及来源hash创建独立Program/checker；完整授权声明文件进入上下文；原USE精确AST位置取真实alias目标；类型ID使用上下文命名空间 | PASS_WITH_BOUNDARIES：36/36专项与core回归通过；两个配置上下文、17组解析、212条使用绑定到授权声明；诊断与类型边界另记，不等于完整类型接受 |
| TR-02 | loader/CLI显式 --type-root-isolation consumer-v1；默认关闭；未知及重复参数拒绝；metadata参加来源重建校验 | PASS：先红后绿，默认真实CLI与前批索引字节一致；显式模式check及删除context负例的结论见本批CLI证据 |
| TR-03 | 固定源生成，历史ID逐条核验；17张原表及每片hash对照；上下文输入逐hash验证；类型引用闭合 | PASS_WITH_BOUNDARIES：历史194条全部保留并绑定，当前212条全部绑定；17表分片严格一致，所有原target与共享类型状态不变 |
| TR-04 | 独立审查、全工具、默认/重复/来源check、真实CLI负例及封存复验 | PASS_WITH_BOUNDARIES：工具669/669、0跳过；独立审查无开放问题；默认与前批、重复与本批索引字节一致；来源check通过，删除一个context后真实CLI exit=1且明确metadata differs。封存逐hash结论见evidence-verification.json；旧仓库门禁FAIL仍保留 |
| M0退出 | 原M0-02/03完整范围复核 | BLOCKED：来源、共享及上下文类型边界未关闭，维持66% |

## 实际绑定与边界

历史194条来自原 entry-template/remaining-work.json，先与 source-closure/declaration-entry-diagnosis.json 记录的hash核对，再按原USE ID及source逐条匹配；不以当前新ID替代历史缺口。

| 配置 | 自动选择类型包入口 | Program输入 | 上下文类型 | 使用 | 诊断 |
| --- | --- | --- | --- | --- | --- |
| packages/@expo/config-plugins/tsconfig.json | 8 | 185 | 311 | 209 | 79 |
| packages/@expo/osascript/tsconfig.json | 2 | 65 | 22 | 3 | 5 |

config-plugins的xcode和xcode/lib/pbxFile保留完整声明文件，包括同文件顶层接口及不同module；osascript使用独立exec-async声明。两个上下文的类型ID互不冲突，与共享TYPE ID亦隔离，类型引用全部指向各自图内节点。

`BINDING_VERIFIED`只表示真实符号目标位于原证据授权module范围。212条仍保留类型边界或缺来源诊断；原共享图的26个compiler-error-type、22590个声明细节预算节点没有被本批重算或关闭。隔离图也保留编译器错误、泛型、细节预算及any/unknown等边界，具体节点和诊断位置保存在consumerTypeContexts。不能把声明加载成功或符号绑定成功写成所有属性完整。

## 边缘情况与修改点

- 同名模块属于不同消费者时，各自配置、类型根、Program及类型ID隔离，防止跨包ambient污染。
- types未配置时按TypeScript规则选择完整入口集合；types白名单与types:[]分别测试。关闭自动装载后，显式三斜线引用仍按授权typeRoots解析。
- 合法package.json types入口支持.d.ts、.d.mts和.d.cts；完整文件及安全引用进入Program，不裁剪declare module文本。
- 配置继承覆盖消费者到workspace包再到固定配置归档链；虚拟node_modules和作用域目录可遍历，host无项目文件系统回退。
- skipLibCheck不能隐藏缺失的三斜线types/path/lib加载来源；结构性缺失诊断与逐USE边界显式保留，实际checker配置证据不变。
- 加载诊断使用同根、同固定host、独立AST的companion Program，仅取原生文件处理及配置诊断，不创建第二checker。固定TypeScript 5.9.3；内部getProgramDiagnostics不可用时明确失败，后续升级编译器必须重跑兼容检查。
- USE按原ID及精确start/end定位，覆盖内部alias、成员、namespace、import type、shorthand及export；无来源、坏hash、伪配置、重复ID和越界声明均拒绝。
- 类型预算超限直接失败，不输出伪完整产物；引用闭合核验拒绝跨上下文类型。真实CLI删除一个context必须非零拒绝。

独立审查发现上述扩展名、传递引用与缺引用诊断问题后，均先补重现测试再修复。防再发：声明选择同时跑三种扩展名；host修改同时跑workspace与归档继承；三斜线types/path/lib及缺失来源合批验证，分别核输入、属性与诊断，不能仅检查BINDING_VERIFIED。

## 来源与失败记录

固定Expo commit：`5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`；tree：`5457e824b21d968e55c8f533cdf1751860160a92`。

复用semantic-final.json.gz SHA256：`a9c1bd5892bfb4d5a5e671b0bf6f2092ce3ab4484bb6cafe4bc467c91a0206c3`，semanticRebuilt=false；本批只新增隔离上下文图，不改变上游共享语义图。原16673输入内容及17表分片保持。

最终公开索引SHA256：`84f4b616ede7f230360d511b4ffdbdada0af085c9df22c2fdf5c9f4adaa3db93`；重复生成字节一致，索引与同名.parts必须共同保留。

真实CLI首次生成因虚拟host不能遍历继承包目录而失败，原日志保留为cli-generate-first-failure；修复后生成通过。审查前成功产物保留为public-pre-review.json及同名.parts，最终产物为public-surface.json及同名.parts。

仓库门禁既有FAIL：旧封存sdk54-m0-export-patterns-summary.json包含本机绝对路径，SHA256仍为`a7020eebdbd9939f10e4adae9a73adb1e4f22d231780eb5b6e7fa1ae58a54b69`，与旧evidence-index一致。新摘要用仓库相对路径，写出后重跑仓库门禁并断言仅旧文件失败，不能记为全仓门禁通过。

剩余工作：13项历史安装身份；公开来源及显式main缺口；共享类型错误/预算；隔离上下文缺来源诊断及类型细节。新增6条2688均为固定外部声明的node类型引用：config-plugins中xml2js一条、minipass四条，osascript中spawn-async一条；未从宿主node_modules补入未授权来源。build/runtime为NOT_VERIFIED，device为NOT_RUN。

完整证据目录：`outputs/sdk54/ai-e2e/20261027-m0-type-root-isolation/`。红绿、独立探针、旧194逐ID结果、实际CLI命令、所有输入和产物分片hash、逐步骤验收及剩余队列均随本批封存。
