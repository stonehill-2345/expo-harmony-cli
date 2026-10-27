# SDK54 M0 第十轮：SDK52依赖安装与原生生成补验

日期：2026-10-22；run ID：`20261022-m0-sdk52-install`。

**M0仍未关闭，完成50%（3/6）；M0-04未接受。** 本轮pnpm正常安装、关键身份与首次原生生成通过；npm安装有peer冲突，Release JS打包缺依赖，原生构建/设备运行未完成。未把工具通过算作产品通过。

## 1. 固定输入及实现

- 复用第九轮真实生成的两个SDK52 default项目，先用current-baseline的证据校验器检查原结果及候选，再复制到新工作目录；每个项目59份源文件逐项hash，两份原项目和第九轮结果未改。
- 同一expo-harmony-cli1.6.0 TGZ安装物；候选SHA256：`d43940a9335f2052e52f929a396aa1e294e75e6ec53a2401ae6c2ebb2c230e15`。适配HEAD：`22cb245f383a194b52f94127f95bce534258b8cc`加未提交修改。没有重打或发布产品包。
- 环境：Node v22.20.0、npm10.9.3、pnpm10.19.0、Darwin/arm64；安装沿用当前镜像源，单步上限600秒，使用本轮隔离缓存/store。pnpm源项目自带node-linker=hoisted，原样保留。
- 实现为`scripts/sdk54/sdk52-install-replay.mjs`，复用既有进程组、流式日志和前轮验证工具；7项契约位于`__tests__/sdk52-install-replay.test.mjs`。
- [预定义用例](sdk54-m0-sdk52-install-cases.json)、[结构化结果](sdk54-m0-sdk52-install-results.json)。设计/执行卡：`docs/superpowers/{specs,plans}/2026-10-22-sdk54-m0-sdk52-install*.md`。
- 原始证据目录：`outputs/sdk54/ai-e2e/20261022-m0-sdk52-install/`，下文日志均相对此目录。原始执行版runner另存execution-runner.mjs；后续仅补强工具校验与独立Release检查，未修改产品代码。

## 2. 每步实现及用例结论

| 步骤/用例 | 实现与实际验收 | 结论及证据 |
| --- | --- | --- |
| P1 / S52-01 | 冻结定义/设计，测试先红；验证前轮候选及项目快照，再复制2×59源文件至新目录；拒绝覆盖、非SDK52与源符号链接 | PASS；definitions-before.json、contract-red.tap.log、attempt-a/sources/、results.json.source |
| P2/P3 / S52-02 | npm install --no-audit --no-fund退出1，明确peer冲突；pnpm install --reporter=append-only退出0，正常执行patch-package及postinstall | FAIL（两包管理器安装未全过）；attempt-a/sdk52-*-install.log；无force/legacy-peer-deps/ignore-scripts绕过 |
| P3 / S52-03 | pnpm安装身份5项通过，首次prebuild通过并核验46原生文件；第二次按旧CLI覆盖保护退出1，未强制覆盖；npm侧无安装前置 | NOT_RUN（完整重复生成比较未完成）；首次生成单项PASS，保护性拒绝不认作生成器回归缺陷 |
| P3/P4 / S52-04 | 修正runner过严前置后，基于首次原生hash未变的工程独立执行原bundle:harmony:release脚本；Metro因query-string无法解析退出1，无bundle | FAIL；release-followup/results.json及sdk52-pnpm-release-followup.log |
| P2/P4 / S52-05 | HDC版本与targets只读探测退出0，targets为[Empty]；原生/设备NOT_RUN；11类真实CLI篡改均退出1 | PASS（证据与门禁）；不代表设备运行通过；negative-results.json、hdc-*.log |
| P4/P5 / S52-06 | 工具333/333、CLI500/500、类型和历史清单/基线/当前归属/仓库/进度检查通过；报告及hash复核 | PASS（工具与证据）；regression-checks.json、closure-checks.json、evidence-verification.json |

六用例为3 PASS、2 FAIL、1 NOT_RUN，无漏项或重复；不得宣称本轮6/6通过。P1至P5执行和证据收集完成，不表示产品失败已修复。

## 3. 真实命令与结果

| 项目/步骤 | 实际命令或断言 | 实际结果 |
| --- | --- | --- |
| npm安装 | npm install --no-audit --no-fund | FAIL，退出1；原包gesture-handler2.30.0不满足Harmony包2.23.2-rc.1要求的peer2.23.1 |
| npm身份/生成/打包 | 安装未通过，不使用半成品继续 | NOT_RUN |
| pnpm安装 | pnpm install --reporter=append-only | PASS，退出0，217301ms；解析1258包、添加1382包；patch-package及原postinstall均执行 |
| pnpm身份 | 实际包manifest及隔离路径检查 | PASS：expo52.0.49、React18.3.1、RN0.77.1、RNOH与RNOH CLI0.77.71；5项均位于本项目 |
| pnpm首次生成 | 已安装CLI的prebuild --platform harmony | PASS；46文件，摘要5a688ec170912b4f0f4def8d357fb497ed002af77889fe23e8354bd2c45cda18；关键AppScope/entry/module/build-profile存在 |
| pnpm重复生成 | 同一prebuild命令，无force/clean | 退出1，提示harmony已存在并要求显式force；这是旧CLI原有保护，不是本轮修改引入 |
| pnpm独立JS打包 | pnpm run bundle:harmony:release；EXPO_OFFLINE=1 | FAIL，退出1，无产物；Metro0.81.5无法解析Expo Router4.0.22所引用的query-string |
| 工具/设备 | hdc version、hdc list targets | 命令退出0，targets为[Empty]；没有可运行设备，未执行清理转发/安装/启动 |

原始attempt-a的14步骤为3 PASS、2 FAIL、9 NOT_RUN；其中Release因初版工具前置过严记NOT_RUN，该历史记录保留。独立release-followup另有1次真实FAIL，不把它覆盖进旧记录冒充原执行顺序。两个原生/设备步骤均未执行；JS打包也尚未通过，更不能据此证明HAP构建或设备功能。

pnpm安装成功只证明其当次安装与脚本完成，不表示npm报告的peer冲突已解决，也不是API/ABI或运行兼容性证明。46份原生文件在JS补验前hash未变，补验后再次逐文件校验并复制到native-first/sdk52-pnpm/；没有接受旧HAP或旧bundle。

## 4. 产品失败的最小复现

1. **SDK52 peer组合冲突**：从真实npm失败缓存离线读取Harmony gesture-handler2.23.2-rc.1的registry元数据，校验其包名/版本与已安装CLI的SDK52 compat-table一致。使用真实semver判断2.30.0是否满足peer2.23.1，期望兼容的断言退出1。peer-metadata.json、peer-metadata-command.json、sdk52-peer-desired.test.mjs与peer-contract-red.tap.log完整保留；没有伪造peer字段或使用绕过安装参数。
2. **Router运行依赖缺失**：先由实际Metro打包得到无法解析query-string的失败，再对当次pnpm已安装的Expo Router4.0.22执行require.resolve最小断言，仍退出1。sdk52-router-dependency-desired.test.mjs、router-contract-red.tap.log、router-installed/保留实际manifest/引用源码与日志；测试只复现缺失解析，完整Metro失败另存。

这两个产品期望测试仍为FAIL，未纳入绿色工具契约数。M0本轮保留现状基线，未通过改compat版本、补消费端依赖、改node_modules或修改模板来消除失败；后续修复须独立验证依赖闭包及真实运行，不能仅使测试变绿。

## 5. 工具边缘情况及修改点

- collection-edge-red.tap.log复现：修改场景包管理器及命令后可能仍被接受，或删掉源条目并重算索引hash可漏检。补充ID/包管理器绑定、从源证据目录重建完整文件集，并校验原生索引及断言日志对应数据；green与最终7项契约通过。
- 初版工具把“重复prebuild成功”当作JS打包前置，遇SDK52原有覆盖保护后过严阻断了独立检查。先保存release-gate-red，再补canProbeSdk52Release及独立probe：只要求安装、身份、首次生成通过，并重建原生hash确认未变；green通过，随后真实打包失败已保留。产品的覆盖保护未改。
- 新bundle必须此前不存在、命令成功且非空才可记成功；本轮实际无bundle，未记PASS。身份检查只接受项目内解析的精确关键包；辅助工具不执行会清理已有转发规则的start:harmony。
- 同一底层进程执行器的超时、中断和进程组保护沿用第九轮已测试实现；本轮安装没有触及600秒时限。镜像socket timeout重试与最终pnpm完成均保留在日志中，不把早期重试误记最终失败。

## 6. 回归与复核

| 命令 | 实际结果 | 证据 |
| --- | --- | --- |
| node --test scripts/sdk54/__tests__/sdk52-install-replay.test.mjs | 7/7通过 | release-gate-green.tap.log及tools-final.log |
| pnpm test:sdk54-tools | 333/333，退出0 | tools-final.log、tools-result.json |
| pnpm test | 53文件/500测试通过，退出0 | cli-final.log、cli-result.json |
| pnpm type-check | CLI类型检查退出0 | types-final.log、types-result.json |
| sdk52-install-replay.mjs --check 本轮results.json | 退出0；productAllPassed:false，stageClosable:false | sdk52-replay-check.log |
| 6份历史来源清单、前轮真实结果、原误报/执行基线 | 全部退出0，原失败继续保留 | regression-checks.json |
| 当前归属生成/检查、目录/仓库/进度、git diff --check | 全部退出0；454文件、1835引用、48命令 | ownership-current.json、closure-checks.json |

当前归属另存本轮，不改旧归属接受清单或历史hash。11类真实CLI负例包括删场景/步骤、错候选/log hash、伪安装PASS、修改包管理器/命令、删源条目并重算hash、增加绕过参数、伪原生一致/产品PASS/阶段关闭，均退出1；negative-*.log保留明确诊断。

```bash
node scripts/sdk54/sdk52-install-replay.mjs --check outputs/sdk54/ai-e2e/20261022-m0-sdk52-install/attempt-a/results.json
node --test scripts/sdk54/__tests__/sdk52-install-replay.test.mjs
node outputs/sdk54/ai-e2e/20261022-m0-sdk52-install/verify-evidence.mjs
```

从仓库根执行。新回放使用--reference <第九轮results.json> --work-dir <新空目录> --output <新空目录> --timeout-ms 600000；会真实安装原项目依赖并按前置执行，不能覆盖本轮目录。独立JS检查调用probeSdk52Release，实际调用记录见release-followup-command.json。

## 7. 阶段状态与保存限制

M0-04仍缺npm有效依赖闭包、SDK52完整打包/原生运行和SDK54四场景的完成创建；M0-02/03全量公开面亦未完成。M0仅M0-01/05/06已接受，仍50%（3/6）；其他阶段完整单元仍0%，均未关闭。

definitions-before.json固定定义；input-snapshot.json保存最终实现/文档/源状态，evidence-index.json固定原日志、候选引用、原生/锁文件/源文件与失败测试hash；report.sha256固定报告，evidence-verification.json记录复核，索引排除自引用。

docs/superpowers/及outputs/仍被忽略，设计、执行卡、期望失败测试和原始证据仅本机可复核。需同时保留前轮引用候选/临时安装目录；完整npm/pnpm缓存和node_modules没有长期归档，不宣称团队可离线重建。本轮未提交、未发布，未修改SDK52或SDK54产品运行时代码。
