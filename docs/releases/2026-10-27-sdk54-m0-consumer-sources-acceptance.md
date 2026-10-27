# M0 消费者声明来源闭合验收

M0 仍未关闭，完成 **66%（4/6）**；M0-02/03尚未接受。本批实现显式consumer-v2并补真实来源绑定，不提交、推送或发布。M0接受按原完整清单和双向校验条件计算，诊断数量不作为阶段分母。

## 逐步骤实现与验收

| 步骤 | 实现 | 实际结论 |
| --- | --- | --- |
| CS-01 | 隔离builder/core接入既有归档resolver；固定Map优先、工作区原生相对解析其次、归档来源选择最后；显式type directive按from所属包选择固定锁归档；来源请求按kind/from/request记录 | PASS_WITH_BOUNDARIES：47正式测试、8独立探针通过；入口、实际Program外部闭包均核snapshot/hash，跨归档/workspace path拒绝；缺锁、投影和未安装身份保留 |
| CS-02 | loader/CLI新增显式consumer-v2；保留已核声明/配置归档，核固定yarn.lock；workspaceFiles按固定Git来源传入，归档分别重建 | PASS：26 loader测试通过；默认及consumer-v1不创建额外来源上下文；真实v1产物与前批字节相同，默认与scope-decisions产物相同；坏归档/缺锁/改metadata均拒绝 |
| CS-03 | 固定semantic与源输入重建v2；逐条核Program输入、来源记录、上下文类型引用、212当前和194历史USE；逐片比较17张原表 | PASS_WITH_BOUNDARIES：16673原输入和17表完全保持，所有原target不变；212/194全部BINDING_VERIFIED；上下文333类型保持，诊断84至22，新增98已核输入 |
| CS-04 | 全工具、独立审查、重复/来源check/真实CLI删来源负例、原退出条件审查及封存 | PASS_WITH_BOUNDARIES：683/683工具、81/81审查测试通过，openFindings为空；重复生成字节一致，固定来源check通过；删除一条实际source记录后真实CLI exit=1并报metadata differs。逐hash封存复验由evidence-verification.json单独给出；旧仓库门禁FAIL保留 |
| M0退出 | 原M0-02/03、A01/A02及规范类别复核 | BLOCKED：能力范围/批次/依赖统一映射与独立覆盖验收尚缺；不以本批工具测试提升M0或Harmony支持状态 |

## 真实变化

| 消费者配置 | Program输入 | 类型 | 诊断 | 来源请求 |
| --- | --- | --- | --- | --- |
| packages/@expo/config-plugins/tsconfig.json | 185 → 283 | 311 → 311 | 79 → 17 | 794 |
| packages/@expo/osascript/tsconfig.json | 65 → 65 | 22 → 22 | 5 → 5 | 7 |

xml2js的显式node指令按其manifest与固定锁选择已核Node22.14.0；再由Node声明加载undici-types固定依赖。仅授权指令产生原生全局/ambient效果，不无条件预载Node根，不将node-global-context当作模块source。

config-plugins实际移除70条旧诊断、新增8条undici-types的缺node指令诊断，净减少62；现余4条2307、1条2614、12条2688。osascript仍为2条2307、2条2584、1条2688。全部新增/移除诊断和逐来源结果在before-after.json；不能用最初估计的可消除数量代替实测。

minipass、spawn-async及undici-types没有各自可接受的Node selector时仍保留来源失败；同一Program中已有其他包加载Node，不等于这些owner的身份获得授权。getenv/semver不借其他workspace的开发依赖补身份。212条使用仍带边界，333类型保持不表示全部类型细节完整。

## 边缘情况与修改点

- 缺锁/歧义/仅publisher开发依赖：保留原解析失败及原生2688；同名类型包已有语言效果不掩盖消费身份失败。
- types:[]只关闭自动装载，显式type directive仍可加载授权来源；两个消费Program隔离。
- 固定Map与原生工作区相对解析保留已核workspace权限；归档callback回传任意source必须snapshot授权且hash相同，伪装workspace目标亦拒绝。
- 三斜线path可能绕过resolver；现在两个Program均检查实际外部输入及同归档边界，缺snapshot、坏hash、跨归档和工作区越界拒绝；同包缺文件保留原生诊断。
- 配置归档首次真实生成触发重复materialize碰撞：先加完整锁身份的最小红测，再按origin划分workspace与归档重建输入；原cli-generate-config-failure.log与loader-config-red.log保留。
- callback与companion Program请求去重，原resolver结果、选择路径和输入hash同时保存；删一条实际来源记录参加真实metadata重建校验。

反思与防回归：只验入口不足，现同时验实际传递闭包；简化锁身份会使配置归档被忽略，正例必须用完整parseFixedYarnLock身份并实际装载归档。独立审查已关闭4类问题，最终6文件hash随review-final.json锁定。

## M0真实剩余工作

独立m0-exit-audit.json固定11原文hash、12条原条件，提取131条原范围待审、8共享用途和2暂缓原ID，保存12条映射验收断言。原总计划与旧封存未改，原状态不等于新的范围裁决。

1. 建立公开能力及具体成员的scope/batch/milestone/dependency统一关系，按原ID关联131/8项新结论；内部分析节点保留来源上下文，无需逐节点独立适配。
2. 核事件、回调、错误、权限、平台、原生、生命周期、资源及安装移除等原规范类别；8共享项逐用途拆分，普通Debug/Metro、本地构建及认证不得整包暂缓。
3. 对真正影响公开枚举的来源、错误、预算边界补能力及源码影响路径；有限泛型图可接受，遮住真实成员仍需补证。
4. 独立源码期望集与双向覆盖，删公开成员、深层选项、原ID、改暂缓与悬空依赖负例；按M0-02/03和A01/A02逐条件独立接受。

全部TS诊断归零、递归泛型无限实例化、13项历史安装现场恢复、5隐式index探测存在根API、后续build/runtime/device全过，都不是原M0清单接受的自动门禁；这不豁免真实公开能力缺证。显式main缺失保留源缺陷及后续修复，不伪造SOURCE。

## 固定来源与证据

Expo commit：`5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`；tree：`5457e824b21d968e55c8f533cdf1751860160a92`。

semantic SHA256：`a9c1bd5892bfb4d5a5e671b0bf6f2092ce3ab4484bb6cafe4bc467c91a0206c3`，semanticRebuilt=false；只重建本批消费者来源和隔离上下文，不宣称重建共享语义图。

公开索引SHA256：`76e245276c7fbbfd4b7607c033f5406475b35243196d947a1b9f47ba286b7d17`。完整证据目录：`outputs/sdk54/ai-e2e/20261027-m0-consumer-sources/`；索引及同名.parts共同保留。

仓库门禁旧FAIL为封存sdk54-m0-export-patterns-summary.json含绝对机器路径，旧SHA256 `a7020eebdbd9939f10e4adae9a73adb1e4f22d231780eb5b6e7fa1ae58a54b69`不变。新摘要必须相对路径并写出后重查，只允许该旧文件失败。build/runtime为NOT_VERIFIED，device为NOT_RUN。
