# SDK54 M0 插件可调用类型与泛型关系验收

日期：2026-10-23；run ID：`20261023-m0-plugin-type-contracts`；任务：M0-02/03。

**M0 仍未关闭，完成66%（4/6）。** 本批补齐插件候选的有限语义图，保存此前整项拒绝的回调、循环及泛型关系。202个声明候选全部映射，933个类型、1676条属性、118个调用签名；173个候选没有可达图内类型边界，29个仍有边界。该统计不等于公开插件数、完整类型检查或Harmony支持数，也不替代此前严格树展开器的结果。

## 每步实现与验收

| 步骤 | 实现及实际结果 | 结论 |
| --- | --- | --- |
| TPC-01 | 固定源码重建202个候选与4392输入；复用既有语义图，仅以插件为类型根，447个源码/manifest输入进入新图；100份TS工具库单独标识 | PASS，未使用宿主业务包或外部同名实现 |
| TPC-02 | 回调参数、返回值、重载及附属属性保留；循环使用typeId回指，候选缺失0；累计118个调用签名 | PASS，结构关系已落盘，未执行回调或原生mod |
| TPC-03 | 显式模式记录条件类型的check/extends/两分支及源码、indexed access的对象/索引、keyof目标、声明约束/基础约束与默认值；真实源码含2个条件类型和1个keyof，indexed access由独立fixture验收 | PASS，未实例化操作仍明确标界 |
| TPC-04 | 修复别名参数覆盖元组元素关系：分别保存StaticPlugin的泛型参数和两个实际槽位，保留第一个槽位中的ConfigPlugin调用链；去掉新插件模式人为32实例截断 | PASS，两个独立红绿复现；40种具体泛型实例末项仍完整，安全总预算耗尽则拒绝产物 |
| TPC-05 | 202候选各绑定原ID、来源、选项根、可达类型及边界；原严格树阻塞29个均有图可审阅，新图仍有29个候选带边界 | PASS，仅关系覆盖；完整类型退出条件仍BLOCKED |
| TPC-06 | 专项红绿及全工具456/456，原Router/Splash/消费函数64/64；默认旧插件契约、六插件清单、原86024类型全量图均重建一致 | PASS，兼容日志与新执行结果保存 |
| TPC-07 | 真实CLI重建正例一致，16类删调用/删元组/删分支/伪造状态/悬空引用/改来源等变异全部拒绝；阶段、目录及仓库检查通过 | PASS，check-set整体exit1符合含负例预期 |
| TPC-08 | 完整workspace语义、声明来源/安装上下文、未实例化泛型、any/unknown及下游消费/设备 | BLOCKED，原范围不缩小，逐项见remaining-work.json |
| TPC-09 | 核对原M0任务分母及关闭条件 | BLOCKED，M0-02/03未接受，保持66%（4/6） |

结构化用例和结果：`sdk54-m0-plugin-type-contracts-cases.json`、`sdk54-m0-plugin-type-contracts-summary.json`。原始证据目录：`outputs/sdk54/ai-e2e/20261023-m0-plugin-type-contracts/`。最终采用`type-contracts-final.json`，其他中间产物保留供审计。

## 类型边界与计数

新图中7个直接边界类型经引用传播影响29个候选：2个条件类型及1个keyof尚未实例化、1个unknown、1个显式/推断any、1个外部XcodeProject错误类型、1个映射类型修饰符边界。源码模块的隔离诊断另存于graph.modules及逐候选sourceDiagnostics；MAPPED只表示该选项根没有可达的图内类型边界，不表示模块编译或项目通过。

严格树展开器仍为173成功/29阻塞、1091条路径；它与新图的候选集合划分并非完全一致。createBaseMod的泛型现在有关系可审阅；Permissions的其他声明关系在新图中暴露边界，不能只按相同总数声称阻塞已逐一消失。原生实现、prebuild及设备仍为NOT_RUN。

新增参数`--type-contracts`为显式模式；默认命令继续重建旧格式。旧全量图中的别名参数优先策略作为历史兼容行为保留，**不宣称已修正整个workspace图**；后续须将新结构模式应用到完整workspace、处理既有来源/实例化边界，再重新验收。共享图处理器的原模式已实际重建核对，未改写历史产物。

## 边缘情况与修改点

- 回调同时含重载与属性时，两者均保存；循环按同一typeId回指，不因递归删除字段。插件之外的导出不额外成为新图根，但源码模块诊断仍记录。
- 条件类型两分支的缺失来源分别保留为compiler-error-type，分支边界沿图传播；不能只保存display字符串后认定完整。声明分支未经过泛型替换，branchPolicy明确说明。
- `K extends keyof T`分别保存原声明约束及编译器基础约束，避免后者变成string/number/symbol后丢失对T的依赖；悬空目标必须拒绝。
- 元组实际元素与别名参数分开存储并都参与可达性和悬空校验。红例实际观察到StaticPlugin元组由两个槽位错误变为一个；修复后两个槽位和插件回调类型均可定位。
- 新插件图不使用声明族32实例截断；40个不同实例的第40项和循环fixture均通过。沿用既有总类型预算，超限中止，禁止输出假完整产物；旧全量图的既有预算保持兼容。
- 173/29仅描述有限图类型边界，不忽略sourceDiagnostics或既有来源缺口。旧“无显式泛型参数”89个候选与实际默认void类型区分保存，不推断没有功能。
- 原归档、49条来源阻塞、3份配置上下文、模板实例化、Router入口与完整下游链保持既有未完成结论。本批未重复运行CLI产品和设备，工具测试不计产品验收。

## 复核

```bash
node scripts/sdk54/m0-plugin-contracts.mjs --source /tmp/sdk54-expo-source --type-contracts --check outputs/sdk54/ai-e2e/20261023-m0-plugin-type-contracts/type-contracts-final.json
node --test scripts/sdk54/__tests__/m0-consolidated.test.mjs scripts/sdk54/__tests__/m0-plugin-contracts.test.mjs
node outputs/sdk54/ai-e2e/20261023-m0-plugin-type-contracts/verify-evidence.mjs
```

固定commit `5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`、tree `5457e824b21d968e55c8f533cdf1751860160a92`。新旧重建、红绿、变异、源码/工具/编译库hash与历史索引封存。outputs被忽略，仅本机保存。本批未提交、未发布。
