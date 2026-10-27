# SDK54 M0 固定继承配置与剩余引用合批验收

日期：2026-10-23；run ID：`20261023-m0-config-inheritance`；任务：M0-02/03。

**M0 仍未关闭，完成66%（4/6）。** 本批补齐两份原锁配置归档，修复目录别名入口遗漏，核清14条模块模板参数引用。全图项目配置解析边界从2433处降到89处。原公开入口、完整类型和插件契约退出条件保持，不能以来源调查或工具测试数量增加阶段接受单元。

## 每步实现与验收

| 步骤 | 实现及实际结果 | 结论 |
| --- | --- | --- |
| INH-01 | 从原yarn.lock读取`@tsconfig/node18@18.2.2`、`@tsconfig/node20@20.1.2`；原tgz分别通过SHA512/SHA1、包名版本及全部路径结构核验 | PASS，仅固定配置来源 |
| INH-02 | 显式`--config-archives`接入JSON；按声明配置依赖的最近manifest与精确selector选择；配置输入保留manifest、JSON、锁身份及归档hash | PASS，队列配置阻塞25→1，全图2433→89；3份直接继承配置仍有边界 |
| INH-03 | 用TS5.9.3目录包解析补齐`benchmarking`的`package.json → src/index.ts`；14条模块模板引用绑定原始参数、固定文件名和blob | PASS，本地来源132→133，相对目标阻塞20→6；模板仍待实例化 |
| INH-04 | 49条阻塞及14条模板引用逐项生成稳定ID、消费位置、manifest、锁候选、来源结论与后续验收；Router的6条Modal引用逐条记录固定树缺失目标及同目录候选 | PASS，仅定位缺口；入口缺失仍BLOCKED |
| INH-05 | 两组红绿复现、工具442/442、来源12类与语义10类变异拒绝、两种旧图兼容、阶段与仓库校验 | PASS，命令/日志/退出码见证据目录 |
| INH-06 | 全量公开入口、外部身份/归档、完整类型、插件嵌套选项与Router类型/schema消费契约 | BLOCKED，未全部闭合 |
| INH-07 | 按原任务分母关闭M0 | BLOCKED，M0-02/03未接受；保持66% |

结构化用例与结果见`sdk54-m0-config-inheritance-cases.json`及`sdk54-m0-config-inheritance-summary.json`。原始证据目录：`outputs/sdk54/ai-e2e/20261023-m0-config-inheritance/`；下文文件名相对此目录。

## 来源和全图结果

固定Expo commit `5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`，tree `5457e824b21d968e55c8f533cdf1751860160a92`。39组冻结来源队列、275条消费引用均保留；4391份Git输入、4390个语义输入、3959个源码模块、146个包/模板根保持。

| 队列分类 | 上批 | 本批 | 范围 |
| --- | ---: | ---: | --- |
| 本地源码来源 | 132 | 133 | 新增benchmarking目录入口；未验收运行 |
| 精确依赖链主分类 | 47 | 64 | 配置解析恢复后重新分类；可达身份不等于实际安装/提升结果 |
| 项目配置阻塞 | 25 | 1 | 剩余autolinking直接继承配置无本包精确声明 |
| 消费身份阻塞 | 27 | 34 | 原配置阻塞中7条重新暴露身份问题；不能算已解决 |
| 相对目标阻塞 | 20 | 6 | 14条已核为待实例化的模块模板引用 |
| 本地别名阻塞 | 1 | 0 | TS目录包入口来源已核 |
| 平台 / workspace入口阻塞 | 2 / 6 | 2 / 6 | native/web候选及Router Modal缺口保留 |
| 资源 / 故意错误样例 / slug参数 | 13 / 1 / 1 | 13 / 1 / 1 | 来源范围保持 |
| 待实例化模块模板引用 | 0 | 14 | 参数对应固定文件；不是14项Harmony支持 |

全图仍为13942条按模块导出候选、86024个类型、92810条属性、27141个调用、681个构造；原导出零丢失。9312条推断候选和202条插件候选保留，推断2579无可达类型边界、6715有边界、18隔离，插件140无可达类型边界、62有边界。类型数量未变，配置边界减少不能当作公开API或Harmony支持增加。

3份仍缺直接配置声明/安装上下文的配置是`packages/create-expo-module/tsconfig.json`及其e2e配置、`packages/expo-modules-autolinking/tsconfig.json`。本批仅按直接精确声明选择外部配置；未把workspace可达的传递配置自动当作已提升安装结果。`create-expo-nightly`直接声明的Node20配置已单独核验并接入。

Router的6条`expo-router/build/modal/Modal`消费引用均缺对应固定树入口；同目录仅有`web/ModalStack`等不同名称模块，未改写为替代实现。剩余6条相对目标涉及两个应用`./App`、Metro runtime的async-require声明转发、Expo的types声明和AppEntry、Detox模板入口；全部留在`reference-decisions.json`及`remaining-work.json`，未假称生成或运行通过。

## 边缘情况与修改点

- 缺失、错误锁身份或未声明的配置不借用宿主安装；只允许经过完整性和结构验证的归档JSON进入独立配置虚拟文件系统。
- 归档读取复用原链接、路径穿越、重复项、单文件及总大小约束；默认声明模式不额外读取配置JSON。新JSON读取复现先失败，再修复。
- 配置保留JSONC、extends和定义目录；明确记录消费manifest及归档身份，多版本不取最高版本，仍不等于项目类型检查或运行验收。
- 目录别名优先遵循TypeScript的包入口，再按其规则回退index；记录目录manifest及hash。已有相对build→src、CommonJS转发与Speech输出根测试保持。
- 模板引用须同时匹配原始参数字符串和固定树参数文件；无原始参数或无匹配文件时仍阻塞。实例化、模板平台选择及Detox生成工程未执行。
- 12类来源变异与10类语义变异包括配置锁身份/归档hash、声明manifest、目录入口、模板目标、Router入口和伪造关闭；两个check-set均为正例通过、全部变异拒绝、整体exit1，并非22次独立CLI执行。

## 复核

```bash
node scripts/sdk54/m0-project-context.mjs --source /tmp/sdk54-expo-source --config-archives outputs/sdk54/ai-e2e/20261023-m0-config-inheritance/downloads --check outputs/sdk54/ai-e2e/20261023-m0-config-inheritance/source-audit-final.json
node scripts/sdk54/m0-source-context.mjs --source /tmp/sdk54-expo-source --archives outputs/sdk54/ai-e2e/20261022-m0-source-context-complete/downloads --scope project-sources --config-archives outputs/sdk54/ai-e2e/20261023-m0-config-inheritance/downloads --check outputs/sdk54/ai-e2e/20261023-m0-config-inheritance/semantic-final.json.gz
node outputs/sdk54/ai-e2e/20261023-m0-config-inheritance/verify-evidence.mjs
```

四项新增复现先保存红日志再保存绿日志；工具442/442通过。CLI产品及设备流程本批未改动、未重跑，沿用历史结果时必须注明历史轮次。两份中间产物`source-audit.json`、`semantic-project.json.gz`保留，只供比较；最终采用`source-audit-final.json`、`semantic-final.json.gz`。

本批未提交、未发布、未改写固定上游。完整原始证据与归档位于被忽略的outputs中，仅本机保存；本批输入和证据hash由独立封存校验核对。后续继续处理34条消费身份、3份配置上下文、平台/应用/Router入口，以及完整公开面、类型和插件契约。M0仍未关闭，66%（4/6）。
