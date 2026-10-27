# SDK54 M0 第九轮：当前CLI真实现状回放

日期：2026-10-22；run ID：`20261022-m0-current-baseline`。

**M0仍未关闭，完成50%（3/6）。** 六场景已真实回放，产品步骤共10 PASS、10 FAIL、10 NOT_RUN；M0-04未接受。本轮交付现状证据和可复跑工具，不将runner测试或历史结果计作产品通过。

## 输入与隔离

- 当前适配HEAD为`22cb245f383a194b52f94127f95bce534258b8cc`加未提交修改；CLI为expo-harmony-cli 1.6.0。本轮pnpm build后使用npm pack --ignore-scripts打包，未发布registry。
- TGZ SHA256：`d43940a9335f2052e52f929a396aa1e294e75e6ec53a2401ae6c2ebb2c230e15`。隔离harness真实安装121个包，版本命令退出0；安装入口与TGZ内dist/index.js hash一致。candidate.json、installed-provenance.json保存身份与锁文件记录。
- 工作目录为独立临时目录，未使用workspace源码链接。先git init空仓库使create工具跳过自动初始提交，不提交代码；最终另检查提交为空。npm缓存、pnpm store与证据分开保存。
- 环境：Node v22.20.0、npm10.9.3、pnpm10.19.0、Darwin/arm64。网络沿用当前配置的registry.npmmirror.com，没有替换创建命令、模板tag、安装源或产品源码。
- 参考的固定Expo来源仍为`5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`；本轮实际执行的是当前适配CLI及其registry创建链，不宣称它们与固定来源的create-expo3.5.11构建等价。
- 原始证据目录：`outputs/sdk54/ai-e2e/20261022-m0-current-baseline/`；下面路径均相对此目录。

## 实现

`scripts/sdk54/current-baseline.mjs`支持从TGZ隔离安装，顺序执行四个SDK54和两个SDK52场景，逐步原子保存results.json；create、生产识别函数、doctor/scan和有前置条件的prebuild分别记录。原生/设备步骤明确NOT_RUN，未用帮助命令或mock替代运行。

子进程使用参数数组、独占进程组、流式日志；180秒超时先TERM、2秒后KILL，仅清理自身进程组。缺命令、非零、超时和中断分别保存，缺项目/失败create不继续prebuild。非空目录、重复日志拒绝覆盖；重试须使用新目录。

`--check`校验六场景/各五步骤、候选/日志/项目/执行器hash、安装入口与harness锁文件、退出和状态。有效失败基线的--check可退出0；实际回放只要productAllPassed:false就退出2，避免把收集成功当产品成功。stageClosable始终false。

## 实际场景

| 场景 | create | 生产识别 | doctor/scan | Harmony prebuild | 原生/设备 |
| --- | --- | --- | --- | --- | --- |
| SDK54 blank/npm | FAIL：180秒超时 | PASS：sdk54-scoped-packages | FAIL：managed-state缺失 | NOT_RUN：create失败 | NOT_RUN |
| SDK54 blank/pnpm | FAIL：180秒超时 | PASS：sdk54-scoped-packages | FAIL：managed-state缺失 | NOT_RUN：create失败 | NOT_RUN |
| SDK54 default/npm | FAIL：180秒超时 | PASS：sdk54-scoped-packages | FAIL：managed-state缺失 | NOT_RUN：create失败 | NOT_RUN |
| SDK54 default/pnpm | FAIL：180秒超时 | PASS：sdk54-scoped-packages | FAIL：managed-state缺失 | NOT_RUN：create失败 | NOT_RUN |
| SDK52 default/npm | PASS | PASS：sdk52-legacy | PASS：只读scan | FAIL：expo未安装 | NOT_RUN |
| SDK52 default/pnpm | PASS | PASS：sdk52-legacy | PASS：只读scan | FAIL：expo未安装 | NOT_RUN |

SDK54识别通过只说明部分项目的alias声明被当前生产函数识别，不证明依赖安装、managed-state、原生生成或运行完成。超时保留部分项目；依赖下载日志单独归档，不把180秒上限直接认定为原生实现缺陷。

SDK52当前create按原实现使用--no-install，本轮没有另行安装其依赖；两个prebuild均在getConfig阶段报“module expo is not installed”。这不是已证明的SDK52生成器退化，也不能作为完整SDK52运行回归通过。后续需独立补依赖安装、prebuild与明确候选/设备运行。

30个产品步骤之外，git-init、隔离安装、版本命令和无提交检查4个setup步骤全部PASS。实际runner退出2，表示记录完整但产品未全过；当前强化后的--check退出0，表示证据结构和hash有效，不改变产品结论。[结构化结果](sdk54-m0-current-baseline-results.json)保留逐项状态，原始命令/退出/信号/时限/日志见attempt-a/results.json。

## 步骤与用例验收

| 步骤/用例 | 实现与实际验收 | 结论 |
| --- | --- | --- |
| P1 / CUR-01 | 构建并打包本轮CLI，独立npm安装，版本/候选/安装入口一致；保留初次缓存失败和重试 | PASS；build.log、pack*.log、candidate.json、installed-provenance.json |
| P2/P3 / CUR-02 | 四个SDK54场景均真实发起create并保存部分项目；全部达到180秒时限，未完成创建 | FAIL（产品）；attempt-a/sdk54-*-create.log、projects/快照和npm-logs/ |
| P3 / CUR-03 | 两个SDK52的create/识别/scan通过；prebuild缺expo失败，原生/设备未执行 | FAIL（产品）；attempt-a/sdk52-*.log；完整SDK52回归尚未落实 |
| P2/P4 / CUR-04 | fixture覆盖非零/缺命令/超时/中断/顽固后代进程，保存日志且不杀无关进程；非空目录/重复日志拒绝覆盖 | PASS（runner契约）；10项测试及红绿日志；不是设备验收 |
| P4 / CUR-05 | 当前--check通过；删场景/步骤、伪PASS、错候选/日志/项目/安装入口/锁文件hash、重复场景、改create命令和伪关闭共12类真实CLI负例均退出1 | PASS（证据）；negative-results.json与negative-*.log |
| P4/P5 / CUR-06 | 工具326/326、CLI500/500及类型、6份历史来源清单/缺陷基线、当前归属/仓库/进度检查通过，最终hash复核 | PASS（工具与证据）；regression-checks.json、closure-checks.json、evidence-verification.json |

预定义6用例：PASS 4、FAIL 2；没有漏项或重复。表中明确区分产品结果与runner/证据，不能合并宣称6/6通过。P1至P5的执行和证据收集完成，不表示两个产品失败已修复。

## 实际创建身份

本轮已确认SDK54链为create-expo-app5.0.0→create-expo5.1.5，wrapper声明create-expo>=5.0.1。固定wrapper不能固定执行器，此处是本次实际解析结果，不是未来版本承诺。最终executor manifest和lock快照在attempt-a/executors/。

SDK52原实现没有固定wrapper版本；本次实际也解析到create-expo-app5.0.0与create-expo5.1.5，两处npx缓存各保存manifest/lock。SDK52实际模板为expo-template-default52.0.81，完整TGZ/hash/SHA512归档于template-artifacts.json及template-artifacts/。

实际SDK54模板：expo-template-blank-typescript54.0.47，TGZ SHA256为`f057300a12f11c53450df896c9ee34b82536776ab4c279a97b25c62d70ce1296`；expo-template-default54.0.63，SHA256为`a35c70ed211a71ac06652ebc128b338b57c8c5eebce12458de3f1e168d0eaa70`。来自create工具实际模板缓存，归档于template-artifacts/；同版本不构成与固定Git来源产物等价的证据。

## 测试与边缘修复

1. contract-red.tap.log保存实现前失败。当前10项契约通过，涵盖日志/非零/缺命令、超时保留、中断、顽固后代进程与无关进程保护、防覆盖、六场景集合及篡改拒绝。fixture使用明确标识的0.0.0假CLI，仅验证runner，不计入真实场景。
2. path-edge-red/green.tap.log先复现再修复：工作目录经过符号链接时，realpath与文本路径不同，被误判为非隔离安装。创建后统一canonical路径，并再次检查工作/证据目录不能嵌套。
3. identity-edge-red/green.tap.log先复现再修复：结果检查遗漏安装入口及harness锁文件hash。补充安装路径、manifest/入口hash、真实版本输出和锁文件检查，并核验create命令与场景定义一致。原执行版runner归档为execution-runner.mjs，执行命令逻辑未改变，当前工具强化的是证据校验。
4. 初次npm pack因默认缓存不可写失败，pack.log保留；使用本轮隔离pack-cache重试成功，未按npm错误提示修改全局缓存权限。build.log、pack-retry.log及candidate.json保存实际过程。

回归已执行：工具326/326（tools-final-2.log为证据校验强化后重跑），CLI53文件/500测试及类型检查通过；6份来源清单、历史缺陷基线、目录/仓库/进度检查通过。SDK52真实运行和本轮原生/设备均尚未验收，不增加M0完整接受数。

当前归属另生成ownership-current-final.json（452文件、1822引用、48命令），与本轮最终源码重建一致。旧归属接受清单、旧报告hash和阶段接受数未改写。

可复核（仓库根目录）：

```bash
node scripts/sdk54/current-baseline.mjs --check outputs/sdk54/ai-e2e/20261022-m0-current-baseline/attempt-a/results.json
node --test scripts/sdk54/__tests__/current-baseline.test.mjs
node outputs/sdk54/ai-e2e/20261022-m0-current-baseline/verify-evidence.mjs
```

新一轮回放须使用新的空工作/证据目录，命令格式为current-baseline.mjs --cli-tgz <本轮TGZ> --work-dir <新空目录> --output <新空目录> --timeout-ms 180000；它会真实联网安装及创建，不能覆盖本轮日志。

## 未关闭范围及保存

M0-04尚未接受；M0-02/03仍有其他workspace公开API/插件选项和全量范围处置缺口。M0仅M0-01/05/06已接受，仍50%（3/6）；其他阶段完整单元仍0%，均未关闭。

设计/执行卡位于docs/superpowers/{specs,plans}/2026-10-22-sdk54-m0-current-baseline*.md，用例为sdk54-m0-current-baseline-cases.json。input-snapshot.json保存最终输入/未提交状态，evidence-index.json记录原始证据hash，report.sha256固定报告，verify-evidence.mjs及evidence-verification.json记录复核；避免自引用。实际CLI脚本版本另保存于execution-runner.mjs及source记录，补强后的checker用于最终校验。

docs/superpowers/与outputs/被忽略，原始证据仅本机可复核；原工作目录也需保留（见results.json.workDir），当前--check会验证其中安装副本，临时目录清理后需恢复相应输入。npm完整缓存和全部node_modules未长期归档，不宣称团队可离线重建；模板包、候选包、项目/执行器/锁文件快照和npm日志已保存。本轮未提交、未发布，未修改产品运行时代码。
