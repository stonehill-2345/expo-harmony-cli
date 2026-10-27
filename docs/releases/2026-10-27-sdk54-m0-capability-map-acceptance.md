# SDK54 M0 能力范围与批次映射验收

本批实现六表关系账本，关联固定公开面、范围、预分批、依赖、183差异和共享用途。**M0仍未关闭，完成66%（4/6）**；本批不接受M0-02/03完整清单，不增加Harmony支持率。

## 逐步实现与结论

| 步骤 | 具体实现 | 执行证据 | 结论 |
| --- | --- | --- | --- |
| CM-01 | 纯builder、validator、确定性gzip分片read/write；scope/applicability/implementation分离；跨包共享循环与来源影响传播 | 正式11/11；独立图22/22；review-real-audit.json逐ID/hash守恒 | PASS_WITH_BOUNDARIES |
| CM-02 | 固定索引/seed/plugin hash与commit/tree核验；共享receipt和递归sourceRefs；固定blob实际读取；输出/check互斥和输入别名保护 | 正式11/11；真实generate/repeat/check exit0；四种合法变异exit1 | PASS |
| CM-03 | 8共享包按实际入口和消费者审查；实际读取49份固定Git blob，逐文件核hash | 12入口：8 REQUIRED、3 DEFERRED、1 REQUIRES_REVIEW；9未决用途保留 | PASS_WITH_BOUNDARIES |
| CM-04 | 独立关系/来源/原ID审查；真实公开可达性比较；全工具及原分片核验；摘要、剩余清单、封存脚本 | 全工具705/705；独立图22/22、来源2/2；最终审查无未解决实现问题 | PASS_WITH_BOUNDARIES |

全部结果、命令及退出码在`outputs/sdk54/ai-e2e/20261027-m0-capability-map/`。最终封存是否成功须查看`evidence-verification.json`，报告本身不代替复验。

## 真实账本

| 表 | 记录数 |
| --- | ---: |
| capabilities | 154 |
| memberships | 549312 |
| dependencies | 1462 |
| seedDecisions | 188 |
| analysisImpacts | 140220 |
| sharedUseReviews | 8 |

- 七类原记录逐原ID与完整record hash匹配；原17表、11125分片和16673输入保持。原183差异+5模板、131必评范围项、8共享关联、2明确暂缓、42外部差异、13既有scope裁决保持原身份。
- 能力组范围为141 REQUIRED、5 DEFERRED、8 REQUIRES_REVIEW；154组都保留既有预分批，状态仍为`PREASSIGNMENT_RETAINED_NOT_ACCEPTED`。M7.6不能推导为不适用。
- 202插件专项逐ID关联，933类型保留在专项命名空间；原coverage、Splash相关记录和35 Router消费者及完整Router专项均可追溯到固定输入。全图1676属性不等同于公开插件选项数或Harmony支持数。
- 候选插件始终保持`PUBLIC_REVIEW_PENDING`；`EVALUATED`仅是分析状态。成员公开性由真实entry/export根闭包决定，13942候选导出不能全部当公开API。
- 独立公开根遍历得到2541根、91821可达类型，对530434类型/成员逐项比较公开分类。该证据只核已有源码图，不证明源码全量清单无漏项。

## 真实负例与边缘修复

| 边缘情况 | 实现修改或验收行为 |
| --- | --- |
| 删除深层公开成员 | 从公开根距离9层的`MEMBER:TYPE:0001499/properties/0`删去membership；同步count并合法重封分片；CLI exit1，定位`apps/expo-go/src/types/HistoryItem.ts:93` |
| 把必评改为暂缓 | 合法改scope后CLI exit1并定位具体能力组与manifest |
| 删除原183差异项 | 删除`SEED:@expo/cli`对应决策并同步count；CLI exit1定位原ID |
| 引入悬空依赖 | 能力组加入不存在依赖ID，CLI exit1并报告Dangling dependency |
| 输入member/edge被一起删除 | builder核type.memberIds/edgeIds闭合，不能仅靠输出expected比较漏过 |
| 外部声明缺来源 | 影响传播到所有消费能力，不能只归源码owner |
| 共享来源伪造 | receipt强制明确hash；同路径冲突拒绝；递归核observedUses等嵌套sourceRefs |
| 输出软/硬链接指回输入 | realpath核路径/parts祖先，dev+ino核硬链接；拒绝覆盖，输入字节不变 |
| 动态import触发OWN门禁 | 全回归发现2项失败，保留红日志，改为字面量import；705项复验通过，独立审查补入OWN5项 |

红测、修复和绿测均保留。独立可达性审计初版把无owner候选计为pending期望产生假阳性，已修正其结论范围并保留原失败日志；生产分类未因该假阳性改变。

## 剩余接受条件

1. 从固定源码独立枚举规范全部类别：事件/回调/错误/权限/平台/原生接口/生命周期/资源及安装移除等行为，并与已有账本双向核对。
2. 完成9个共享未决用途、具体能力范围和预分批最终裁决，不能以包级暂缓排除普通认证、Debug、Metro、本地构建和资源能力。
3. 逐来源、诊断、预算与泛型边界证明是否遮住真实公开成员；映射边界不等同于边界已关闭。
4. 按原接受单位独立验收M0-02/03及A01/A02，满足后才更新原分母和阶段进度。

不自动要求全部TS诊断归零、泛型无限展开、恢复13项历史安装现场或后续真机全部通过才允许M0退出；沿用上一批原退出条件审计。

仓库文本门禁保留唯一旧失败：已封存`docs/releases/sdk54-m0-export-patterns-summary.json`含本地绝对路径。新摘要使用相对路径；不改旧封存。编译、运行和设备验收分别仍为NOT_VERIFIED、NOT_VERIFIED、NOT_RUN。

## 复核入口

```sh
node outputs/sdk54/ai-e2e/20261027-m0-capability-map/finalize.mjs verify
node outputs/sdk54/ai-e2e/20261027-m0-capability-map/run-cli.mjs check
node --test scripts/sdk54/__tests__/*.test.mjs
```

封存清单记录本批工具、全部输入与分片hash、49新增审阅来源及复用semantic来源；不重建semantic、不回写旧公开图、不提交代码。
