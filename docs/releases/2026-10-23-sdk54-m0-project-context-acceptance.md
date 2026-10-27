# SDK54 M0 项目来源上下文合批验收

日期：2026-10-23；run ID：`20261023-m0-project-context`；任务：M0-02/03。

**M0 仍未关闭，完成66%（4/6）。** 本批将39组“缺精确锁”拆到275条真实消费引用，集中实现项目别名、遗漏源码、输出根映射和双向验收。五个验收步骤为3 PASS、2 BLOCKED；来源候选、工具测试和内部导出不计为阶段接受单元。

## 每步实现与结论

| 步骤 | 实现与实际结果 | 验收 |
| --- | --- | --- |
| S1 / PRJ-01 | 原冻结队列SHA256核验；39组275条引用全部有消费源码、最近manifest、来源分类、范围和批次；4391个Git输入核验 | PASS，仅来源调查落表 |
| S2 / PRJ-02 | 用TS5.9.3解析JSONC、extends、paths和baseUrl；补入65个实际被引用的源码文件；按编译器输出根追到Speech源码 | PASS，仅有边界的源码/类型投影 |
| S3 / PRJ-03 | 来源重复字节一致、13类来源变异及10类语义变异拒绝；旧默认图和exact-sources图兼容；工具438/438、CLI500/500、类型检查通过 | PASS，实际命令与退出码保存 |
| S4 / PRJ-04 | 全量公开入口、项目/平台上下文、外部归档、完整类型及插件契约仍有未关闭项 | BLOCKED |
| S5 / PRJ-05 | M0-01/04/05/06保持接受；M0-02/03未接受，原退出条件保持 | BLOCKED，M0仍66% |

结构化结果见[用例](sdk54-m0-project-context-cases.json)、[摘要](sdk54-m0-project-context-summary.json)。原始证据：`outputs/sdk54/ai-e2e/20261023-m0-project-context/`；本报告以下文件名相对此目录。

## 来源审阅结果

固定Expo commit `5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`、tree `5457e824b21d968e55c8f533cdf1751860160a92`；缓存 `/tmp/sdk54-expo-source`。本批未改上游源码、版本身份或冻结队列。

| 分类 | 消费引用数 | 结论 |
| --- | --- | --- |
| 本地源码来源 | 132 | 包含模板`@/*`、Expo Go的baseUrl、共享ThemeProvider及Speech输出根投影；未验收运行 |
| 精确依赖链来源 | 47 | 仅沿最近manifest和原锁依赖边；另有18条配置阻塞引用也保留独立精确依赖链，共65条具有此证据 |
| 资源来源 | 13 | 仅确认固定Git树中的路径与blob，不伪造TS模块或资源消费通过 |
| 项目配置阻塞 | 25 | 继承`@tsconfig/node18/tsconfig.json`缺来源；已定位固定锁18.2.2，不用宿主配置替代 |
| 消费身份阻塞 | 27 | 保留root工具候选与消费来源差别，不将可达传递版本自动当作实际提升安装结果 |
| 相对目标 / 本地别名 / 平台阻塞 | 20 / 1 / 2 | 缺失目标、benchmarking别名与平台歧义分别保留 |
| workspace入口阻塞 | 6 | 均为Router的`build/modal/Modal`，不猜替代文件 |
| 故意错误样例 / 模板参数 | 1 / 1 | 绑定样例、应用与上游错误断言；浏览器测试未执行。模板slug待实例化，不当成npm身份 |

39组全部保留，不将测试、web、暂缓或内部来源整组丢弃。来源范围结论不是公共API支持结论。此前把Speech路径差异先判为上游缺口不够严谨；本批补查tsconfig和源码输入后纠正为编译器输出根投影，并增加永久复现用例。后续入口判断先核对声明、配置、输入与输出根，再下缺失结论。

## 合并图与边界

新增`m0-project-context.mjs`来源审阅入口；`m0-source-context.mjs --scope project-sources`接入项目来源，原core、exact-sources及无上下文模式保持旧产物兼容。只解析固定配置，不执行Babel、插件或包脚本。

最终4390个语义输入、3959个源码模块、146个包/模板根，13942条按模块导出候选、86024个类型、92810条属性、27141个调用、681个构造。原13806条导出零丢失，新增136条主要来自共享主题和应用实际加载的测试模块；不能当新增公共API或平台支持数。

原9312个推断候选、202个插件候选全部保留。推断2579无可达类型边界、6715有边界、18隔离；插件140无可达类型边界、62有边界。这里的“无可达类型边界”仍不是项目类型检查或完整契约验收。保留原泛型表示、每声明族16实例细节上限和全部边界，数量变化不能直接当完整性净增。

全图记录2433处项目配置解析边界。独立已核声明仍可作来源投影，每条相关依赖保留`projectConfigErrors`及`project-config-not-verified`边界；不因缺配置抹去声明，也不假称配置通过。原39组冻结队列阻塞、7项仅SHA1身份及日期选择器重复归档路径仍保留，审阅结论另表关联，不改写旧图。

## 边缘情况与修改点

- 先保存paths/baseUrl误解析复现，再接入固定配置；配置继承保留定义目录、JSONC来源hash、精确模式优先级，错误配置不读取宿主文件。
- 相对解析保持既有`build → src`及纯CommonJS转发优先级；误接生成文件的问题有红绿日志。
- Speech使用TS配置输入和编译器公共源码目录推导输出根；显式rootDir不匹配、缺源码、多个目标、exports限制和平台歧义不强行选择。输出根来源及输入hash入图，不声称构建/发行已验证。
- 最近嵌套manifest和精确锁链独立记录，多版本不取最高值；配置失败不能遮蔽已经核验的独立依赖来源。
- 资源、路径穿越、链接、失效继承、故意错误样例和未实例化模板均有专项用例；故意失败只确认测试意图，执行仍NOT_RUN。
- 配置缺失遮蔽外部声明的回归先复现再修复；中间图132个插件缺调用签名的结果保存在`attempt-emit-only/`，最终恢复为140/62，未将中间失败删除或改写。

## 复核与遗留

```bash
node scripts/sdk54/m0-project-context.mjs --source /tmp/sdk54-expo-source --check outputs/sdk54/ai-e2e/20261023-m0-project-context/source-audit.json
node scripts/sdk54/m0-source-context.mjs --source /tmp/sdk54-expo-source --archives outputs/sdk54/ai-e2e/20261022-m0-source-context-complete/downloads --scope project-sources --check outputs/sdk54/ai-e2e/20261023-m0-project-context/semantic-project.json.gz
node outputs/sdk54/ai-e2e/20261023-m0-project-context/verify-evidence.mjs
```

两个check-set进程均为“正例通过、全部变异拒绝、整体exit1”，共23个变异，不虚报23次独立CLI执行。默认/整批旧图兼容均exit0。专项13/13、工具438/438、CLI53文件500/500、类型exit0；归属/仓库/阶段/差异检查与输入/证据hash见closure-checks和evidence-verification。

首次Git预取TLS/空响应及raw通道超时日志保留；最终65个遗漏源码已从固定Git对象补齐并经blob核验，未改为浮动来源。首次修正输出根前的完整尝试另保存在同级`20261023-m0-project-context-before-emit/`。

剩余项逐条见`remaining-work.json`：优先固定继承配置、消费/相对/平台/Router入口，然后合并外部归档、类型及插件完整契约验收。M0仍未关闭66%（4/6）；未提交、未发布、未做设备验收。outputs及docs/superpowers被忽略，完整原始证据与归档引用仅本机保存。
