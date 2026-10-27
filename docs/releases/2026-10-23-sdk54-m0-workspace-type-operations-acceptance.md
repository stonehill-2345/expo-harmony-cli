# SDK54 M0 全量 workspace 结构类型关系验收

日期：2026-10-23；run ID：`20261023-m0-workspace-type-operations`；任务：M0-02/M0-03。

**M0 仍未关闭，完成66%（4/6）。** 本批把前批仅用于插件的结构关系模式接入完整 workspace 构建入口与来源上下文 CLI；全图由86024增至88375个类型，原13942个导出候选、9312个推断候选、202个插件候选逐ID及来源均保留，状态无变化。类型数量不是公共 API 或 Harmony 支持数量，未据此接受M0-02/03。

## 每步实现与验收

| 步骤 | 实现与实际结果 | 结论 |
| --- | --- | --- |
| WTO-01 | `buildConsolidated`、`buildSourceContext`传递结构模式；CLI增加成对参数`--type-operations legacy\|structural`，默认legacy。新增两项契约先失败，完成后专项全绿；3种非法值真实CLI在读取来源前拒绝 | PASS |
| WTO-02 | project-sources全量重建；4390份图输入、146个包/模板根、3959个模块、88375个类型。197个条件类型均保存check/extends/两分支与源码；180个索引访问、64个keyof均有对象关系 | PASS，声明分支未进行泛型实例替换 |
| WTO-03 | 原导出/推断/插件逐ID与源码对照零丢失、零新增；源码输入、项目上下文、外部上下文与旧图相同。所有类型引用有目标；真实CLI重建正例一致，16类删记录/删关系/悬空目标/隐藏边界/伪造模式或关闭标记全部拒绝 | PASS，混合正负例的check-set预期exit1 |
| WTO-04 | 默认模式从固定来源重建原86024类型完整图一致；工具458/458、catalog、repository、stage-progress及diff检查通过 | PASS，未改写历史产物 |
| WTO-05 | 保存来源、编译库、声明/配置归档、工具与证据hash；保留类型边界、模块边界、18个隔离推断候选和历史来源待办。独立封存复核入口见下方 | PASS，详见evidence-verification.json |
| WTO-06 | 原M0完整公开面、来源/上下文、泛型实例化、动态入口、插件选项及消费关系退出条件 | BLOCKED，M0-02/03未接受 |

用例定义为`sdk54-m0-workspace-type-operations-cases.json`，实际结论见`sdk54-m0-workspace-type-operations-summary.json`及证据目录内`acceptance-results.json`。证据目录：`outputs/sdk54/ai-e2e/20261023-m0-workspace-type-operations/`；规范产物为`semantic-final.json.gz`，模式明确为structural。

## 新关系与剩余边界

结构图保存1057条声明约束、1039条基础约束、564条默认类型关系；有3个带别名参数的元组，别名实参与实际槽位独立保存。源重建及变异分别检验两类关系，避免只修底层但未接入全图的遗漏。

9671个类型仍有直接边界：6365个声明实例细节预算、2392个symbolic generic成员未实例化、441个条件/索引/keyof操作未实例化、263个编译器错误类型、167个映射修饰符、40个其他未展开泛型操作、2个any、1个unknown。增加结构边会发现更多可达类型，不能把类型数增加解释为这些问题已解决。

全图插件状态为140个EVALUATED、62个EVALUATED_WITH_BOUNDARY，与旧全图相同；前批独立插件图的173/29使用不同根及实例预算，两者不得混算。全图继续使用每声明族16实例及250000总预算；symbolic generic、分析截断和上下文诊断均保留。2955个模块仍有隔离分析、来源、模板等边界，不能当成各项目完整编译结果。

原49条来源阻塞、3份直接继承配置上下文、模板实例化、Router的6条Modal入口及完整消费链仍按历史逐项证据追踪，未用新图清空。原生mod、设备、完整CLI产品流程本批NOT_RUN；这些工具检查不替代相应阶段的运行验收。

## 边缘情况与修改点

- 默认模式省略参数即保持旧格式和旧语义；旧图实际源重建通过。结构模式必须显式选择，避免将不同模式产物混用。
- 非法、缺值、重复及未知参数由解析契约覆盖；非法模式在访问来源前报错，不能把拼错的模式静默当legacy。
- 未实例化条件类型保留声明分支及branchPolicy，不把声明分支当作已替换后的实例类型；缺分支、keyof/索引悬空关系均拒绝。
- 元组槽位和别名参数分别校验；声明约束与基础约束分别校验，避免后者简化后丢失原依赖。
- 保留有限分析预算及未解来源边界；超出总预算仍拒绝完整产物。候选全覆盖仅表示这些根均有记录，不等于完整公共面已经接受。

## 复核

```bash
node scripts/sdk54/m0-source-context.mjs --source /tmp/sdk54-expo-source --archives outputs/sdk54/ai-e2e/20261022-m0-source-context-complete/downloads --scope project-sources --config-archives outputs/sdk54/ai-e2e/20261023-m0-config-inheritance/downloads --type-operations structural --check outputs/sdk54/ai-e2e/20261023-m0-workspace-type-operations/semantic-final.json.gz
node outputs/sdk54/ai-e2e/20261023-m0-workspace-type-operations/verify-evidence.mjs
```

固定commit为`5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`，tree为`5457e824b21d968e55c8f533cdf1751860160a92`。证据保留实际命令、退出码、红绿日志及16份变异产物。outputs及详细设计/计划被忽略，仅本机保存。本批未提交、未发布。
