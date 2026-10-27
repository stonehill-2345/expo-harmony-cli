# SDK54 M0 插件选项与 Router/Splash 消费契约验收

日期：2026-10-23；run ID：`20261023-m0-plugin-contracts`；对应任务：M0-02/03。

**M0 仍未关闭，完成66%（4/6）。** 本批一次重建202个 ConfigPlugin 声明候选，完成全部可展开选项以及 Router/Splash 固定源码回放。候选包含内部工厂和SDK52版本，不能称为202个公共插件；泛型、函数参数及未解析类型仍有29个候选阻塞，完整公开面退出条件保持。

## 每步实现与结论

| 步骤 | 实现及实际结果 | 验收结论 |
| --- | --- | --- |
| PCT-01 | 从固定Git树重建插件索引与来源输入；202个候选全覆盖，4392输入均有blob及SHA256，禁止读取宿主同名包 | PASS，来源和候选覆盖 |
| PCT-02 | 共用一个TS程序按来源位置展开选项；173个候选成功，其中84个显式选项、89个无显式泛型参数；共1091条选项路径。29个阻塞候选逐项保留 | PASS，批处理及边界保留；完整选项仍BLOCKED |
| PCT-03 | Splash 43条路径逐项对照旧清单无丢失；包含Android密度/drawable/dark与iOS平板/dark字段；9组合并参数、14组原getter回放 | PASS，固定源码配置行为；未运行原生mod和设备 |
| PCT-04 | Router重建14条TS路径、31条schema路径、26项差异；27组原插件/校验器回放和2组InfoPlist回调探针；差异逐项绑定来源、结论、用例与后续批次 | PASS，已观察的上游契约；完整下游链仍未验证 |
| PCT-05 | TS AST索引35处extra.router访问及别名/动态边界；精确截取并执行原getAsyncRoutesFromExpoConfig，12组插件转存到消费函数的回放通过 | PASS，仅该函数切片；不代表CLI全模块或Harmony打包通过 |
| PCT-06 | 批处理、workspace解析器注入、闭合执行入口及消费切片测试；工具450/450通过。误用旧解析器的复现先红再绿 | PASS，日志与退出码保存 |
| PCT-07 | 真实CLI重建正例一致，16类篡改全部拒绝；旧六插件清单、冻结阶段、目录清单及仓库检查通过 | PASS，check-set正例通过、负例拒绝，整体exit1符合预期 |
| PCT-08 | 全量公开面、29个插件类型边界、下游别名/调用链、历史来源身份及入口等剩余工作 | BLOCKED，逐项见remaining-work.json，未修改既有阻塞结论 |
| PCT-09 | 按原M0六个单元核对阶段关闭 | BLOCKED，M0-02/03尚未接受，保持66% |

结构化交付：`sdk54-m0-plugin-contracts-cases.json`、`sdk54-m0-plugin-contracts-summary.json`。原始证据目录：`outputs/sdk54/ai-e2e/20261023-m0-plugin-contracts/`。

## 具体契约

- Splash：未传/null走legacy，空对象走插件配置；仅一平台配置时，另一平台走legacy；平台字段覆盖通用字段，dark浅合并。通用native在iOS回退contain，显式ios.resizeMode仍优先。Android插件默认宽100、legacy宽200；iOS无配置仍返回白背景/contain/legacy/宽200。Android暗色使用亮色resizeMode；零宽保留。以上均由原源码执行确认。
- Router：headers在TS中必填，但schema根没有required；空对象实际通过。origin布尔值、partialRouteTypes、platformRoutes通过schema并转存，partialTypedGroups被schema拒绝。redirects/rewrites的必填字段、HTTP方法及重复项负例均记录；schema中的default不会自动写入配置。旧extra.router未知字段保留，但props中的未知根字段拒绝。
- asyncRoutes：TS允许任意字符串，schema只允许development/production或boolean；平台对象开放额外键。原消费函数取`asyncRoutes[platform] ?? asyncRoutes.default`，再比较mode或true。该函数在production/android也可返回true，这是局部函数观察，不能据此推断完整原生异步路由能力。harmony键可被schema接纳并参与取值，同样不等于Harmony平台支持。
- InfoPlist：探针执行原注册回调两次，确认activity去重和非数组输入替换。withInfoPlist注册器、createRunOncePlugin包装器以及Android/iOS原生mod均为具名探针，未当作真实prebuild验收。

## 边缘情况与修改点

- 同文件同名嵌套声明按固定字符位置选择；重复ID拒绝。任一候选的类型展开失败不会隐藏其他候选。无显式泛型参数不宣称“没有选项”。
- 固定workspace解析器直接注入，遵循exports边界；修复前的错误可将未导出的dep/private误展开，红日志保存。相同错误通过“未导出拒绝、显式导出成功”的成对测试防回归。
- 缺失、any/unknown、递归、条件泛型和函数参数不降级为空对象后标绿。29个阻塞是选项展开器的能力边界，不能与旧全图的62个可达类型边界相减比较。
- 35处AST记录仅证明语法访问，包含写入、别名和动态访问；consumerIds只关联根字段，不证明redirects[].methods等子路径已完整流通。未找到直接访问不能解释为无功能。
- 执行器只加载固定白名单文件和具名探针，不读取宿主包、不执行包脚本。asyncRoutes仅执行准确顶层函数切片，保存整文件hash、切片hash及起止位置；全模块运行保持NOT_RUN。
- 首次批处理结果保存在contracts-intermediate.json，解析器修复后以contracts-final.json为准。Splash实际43条路径，与旧清单完全一致；续接摘要曾写44，已按重建和逐项集合核对纠正，后续直接由产物计数。
- 本批不重复执行CLI产品/设备流程，不能把450项工具测试写成产品通过。原49条来源阻塞、3份配置上下文、待实例化模板及全量类型边界仍沿用上一批证据，未重算为通过。

## 复核

```bash
node scripts/sdk54/m0-plugin-contracts.mjs --source /tmp/sdk54-expo-source --check outputs/sdk54/ai-e2e/20261023-m0-plugin-contracts/contracts-final.json
node --test scripts/sdk54/__tests__/m0-plugin-contracts.test.mjs scripts/sdk54/__tests__/plugin-surface.test.mjs
node outputs/sdk54/ai-e2e/20261023-m0-plugin-contracts/verify-evidence.mjs
```

固定commit：`5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`；tree：`5457e824b21d968e55c8f533cdf1751860160a92`。完整输入hash、工具/测试快照、真实CLI执行退出码、16类变异及历史证据索引均封存核验。outputs被忽略，仅本机保存。本批未提交、未发布。
