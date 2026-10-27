# SDK54 Harmony M0 最终来源与清单验收

最终结论：**M0 已关闭，完成 100%（6/6）**。M0-02、M0-03 的范围、批次、完整性与总公开关系已独立接受；最终证据封存及阶段接受记录共同证明关闭。本报告只接受固定来源与清单调查，Harmony 运行支持仍需后续阶段验收。

## 固定来源

- Expo commit：`5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`。
- Tree：`5457e824b21d968e55c8f533cdf1751860160a92`。
- 原 source census、public surface、capability map 及分片只读保留。
- 本批证据：`outputs/sdk54/ai-e2e/20261027-m0-final-closure/`。
- 原阶段分母保持 6；保留 M0-01/04/05/06 完整接受记录，补入原计划 M0-02/03，六项全部接受。

## 实现与验收

| 子项 | 具体实现 | 当前验收结论 |
| --- | --- | --- |
| 共享用途 | `shared-closure.json`：9 用途、17 条件、134 refs；按普通认证、Debug、Metro、本地构建、Release 资源与原五暂缓范围逐用途拆分 | 独立通过；15 类负例拒绝；`review-shared-audit.json` |
| JS/TS 来源 | 8,598 文件、836,830 事实；Babel 与 TypeScript compiler AST，模板保留等宽投影和原表达式 | 独立通过；全量真实 check、重复稳定；删除索引签名、accessor、真实 Debug 图片引用均拒绝 |
| 有限类型补集 | 59 来源、5,915 声明、1,331 绑定；374 家族、26 错误用途及 6 文件有限规则 | 独立通过；`review-semantic-finite-audit.json`；保留预算与诊断原值 |
| 派生来源 | 49,410 消费/构造来源；319 内部孤点单列，不伪称自身声明 | 独立通过；新公开根下 319 均无向断连、无 capability，`review-public-closure-graph-audit.json` |
| 缺来源导出 | 18/18 精确绑定；包含 Xcode 转出、普通/本地模板的平台变体及外部转发 | 独立通过；未声明 local、初始化循环、缺平台导出、嵌套缺源均拒绝 |
| 插件 | 202/202 候选；1,091 选项路径、2,540 声明、12,543 规则、858 owner 算法 | 独立通过；真实 CLI 正例与 9 类负例通过；保留 factory/owner 参数、完整路径、默认优先级、写入/移除与冲突规则 |
| 公开处置 | 629 entries、3,959 modules/candidates、13,942 exports；12,050 Git receipts、146 packlists、190 configs、2 consumer configs | 独立通过；11 测试与 9 类 CLI 负例通过；固定源缺陷与运行选择边界保留 |
| 支持配置 | 3,190 文件、924,599 facts；JSON/JSONC、maps、pbxproj、XML/plist、Podfile | 独立逐事实通过；29 个 pbxproj 的 1,039 个资源对象无遗漏；3 文件边界逐消费者裁决 |
| 原生来源 | 主产物 4,060 文件、747,597 facts；补充 603 文件、272,021 facts；完整选择子、宏族、条件、结构化配置、真实消费者及 Clang AST | 独立通过；联合 4,060/4,060、0 未裁决公开来源；原 4,435 诊断和 15 补充边界保留；54 正式回归通过 |
| 构建来源 | 101 文件、26,517 facts、48 消费者、407 Git receipts；成熟 CMake/Bash/Groovy AST、Java properties/Proguard 结构规则及二进制身份 | 独立通过；11 测试、5 归属专项、真实双重建/check、9 类 CLI 负例全部通过；62 源无精确消费者证明的边界保留 |
| 范围/批次 | 154 原能力 ID、1,462 依赖、188 原种子/模板、16,552 语义关系；218 用途为 207 必评、11 原政策暂缓 | 最终版独立通过；真实正例、重复稳定、8 类篡改拒绝；原生联合逐来源 pointer/hash/结论全部关联 |
| 总公开关系 | 549,312 原 membership ID/hash 守恒；124,124 公开可达类型，202 插件接最终公开分类 | 独立通过，来源阻断 0；真实重复稳定、正例与 5 类重封 CLI 负例全部通过；`public-closure-verification.json`、`review-final-acceptance.json` |
| 分类导航 | 2,628 原类别格、146 owner、16,552 语义来源引用、2,807,564 facts、202 插件关系 | 最终版独立通过；1,600 concrete 格、92 诊断格如实保留；7 负例及真实 check 通过 |
| 根整合工具 | 真实执行收据与完整源码指纹复用守卫、原生逐文件联合、全部 active 分片封存 | 独立通过；13 收据及 4 封存回归先红后绿；30,569 个有效路径真实核验 |
| 专项 | Splash 43 嵌套路径、Router 14 类型/31 schema 路径/26 差异/35 消费者；183 差异 + 5 模板、13 原裁决 | 独立通过；64 既有契约用例通过；删除深层字段/schema/差异/consumer 均拒绝 |

## 边缘情况与修改点

- 插件箭头参数、factory owner 根、owner→candidate 路径及完整参数绑定已补齐；候选自身效果与兄弟插件效果分开。
- 导出追源拒绝未声明 local、循环和缺失的平台分支；模板源码与文件名占位符统一投影，仍保留原位置。
- `exports: null` 拒绝规则、runtime/types 双条件、真实单源 map、embedded mismatch 和 map-only 的区别均有回归；无构建来源证明的旧目录猜测不建立消费边。
- pbxproj 递归按实际 `isa` 枚举资源，修复标准 Begin/End section 下资源遗漏。
- DevLauncher 四级 nullish 优先级、Android null/空串、EAS clientID fallback 按实际源码固定。
- 支持配置的非法 JSON fixture、`json5:true` fixture、gitcrypt 私有 override 保留不同裁决；公开 21 键 fallback 必评，未声称私有配置通过。
- 2,628 个 owner×category 格仅为原 ID 导航关系；零关键词匹配不等于无行为，解析诊断必须关联具体公开影响审查。
- 大表按内容 hash 分片、逐记录校验，避免整体 JSON 字符串达到 V8 上限；旧 ID 字面中的 REQUIRED/DEFERRED 不替代最终 `scope.uses`。
- 10 个原生测试夹具逐个关联 5 个完整转换测试及幂等断言；原生语法诊断保留，不能冒充实际运行代码。ExpoKit 模板的通用替换规则、两个槽位、真实路径清单和全 tree 引用均保留；当前清单不选择 ExpoKit，旧文档宣称的生成入口作为 M7.1 缺陷保留。
- 原生前向类和 `@import` 禁止被 C++ 投影误删；ownership、独立枚举及 `__has_include` 按有限规则保留原文与 ABI/条件信息。缺少 `@end`、条件结束符、损坏方法签名和未知宏均保留阻断，WebView 条件替代签名共用 body 时两套选择子都保留。
- GL 225 个方法与 363 个实际注册逐项绑定，其中 19 个上游明确未实现；stb 44 函数、3 回调及默认 C/实际消费者 C++ 两套完整 Clang AST 已核验，不宣称 ABI 或运行支持。
- 回归收据必须同时满足完整完成态、唯一正确任务/命令、退出码、真实非空全通过 TAP 统计、日志 hash 及执行前后源码指纹。封存器区分数字汇总与文件数组；两项缺陷均已先复现再修复。

## 验证记录

| 检查 | 当前结果 | 证据 |
| --- | --- | --- |
| CLI 测试 | 500/500 通过 | `cli-tests.log` |
| TypeScript | exit 0 | `type-check.log` |
| 打包测试 | 4/4 通过 | `pack-tests.log` |
| Catalog | exit 0 | `catalog-check.log` |
| 阶段进度与证据 hash | 最终 6/6、100%、closed=true；生成后独立执行 check 核验 | `docs/releases/sdk54-stage-acceptance.json`、`docs/releases/sdk54-stage-progress.json` |
| 全 SDK54 工具 | 最终冻结版 853/853 通过，0 fail/skip，执行前后指纹一致 | `tool-validation.json`、`tool-regression-final.log` |
| 最终整合回归 | Catalog、diff check 通过；收据与源码指纹复核通过 | `final-validation.json` |
| Repository check | exit 1：旧封存摘要含绝对路径的唯一既有失败仍保留 | `repository-check-final.log`；未标为全绿，不回写历史快照 |
| 最终独立总审 | 11 项断言、16 项原接受条件全部接受 | `review-final-acceptance.json`、`review-final-acceptance.md` |
| 最终证据封存 | 来源、active 分片、工具、测试、日志与稳定文档统一封存；执行 `--check` 校验 | `final-evidence-seal.json` |

关闭依据：`review-closure-criteria.json` 的 11 断言及原 MAP-01～12、M0-02/03、M0-A01/A02 均通过独立总审；阶段接受文件以实际 SHA256 绑定范围、公开清单、总审和封存证据，进度由 `stage-progress.mjs` 按原六项计算。总审和封存中的 `globalM0Accepted: false` / `stageClosable: false` 表示其自身不代替阶段关闭授权；最终关闭状态由阶段接受文件的 M0 closure 及进度核验给出。

保留边界：原生运行、ABI、设备、在线 schema 与产品构建未验收；19 个 GL 上游未实现方法、ExpoKit 的 REQUIRED/M7.1 生成缺陷、私密配置变体、原诊断及有限解析边界均已保留对应来源和后续义务。Repository check 的旧摘要绝对路径失败仍为失败，不计作仓库全绿。未提交、推送或发布。
