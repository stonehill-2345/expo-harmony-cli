# SDK54 Harmony M0A 创建与最小运行验收

M0A 已关闭，完成 100%（5/5）。M0A-01 至 05 均已接受，原五单元及退出条件不变。M0 保持关闭 100%。不提交、不推送、不发布候选包；M0A 关闭不代表 SDK54 整体架构或 default 原生模块全部完成。

## 已接受实现

| 单元 | 实现与实际验收 | 结论 |
| --- | --- | --- |
| M0A-01 | 固定 Expo `5b42e3d21e0ac5e086752361ca8a5cb4de53bec1` 的真实 `packages/create-expo`；候选 `@expo-oh/create-expo@3.5.12`。真实 ncc 重建、两次确定性打包、帮助/版本及仓库外候选提取通过；沿用原 template/yes/no-install 与包管理器 UA 接口。安装及配置失败先红后绿，实际返回非零且不报告成功。 | PASS |
| M0A-02 | 固定来源两完整模板；候选 default `54.0.64`、blank-typescript `54.0.48`。直接声明发行依赖，固定原 manifest 与完整源文件 hash 校验。独审核对 51 个原文件、49 个非 manifest 文件字节；真实候选仓库外 default/blank × npm/pnpm 四项无安装创建通过，应用/资源、依赖、入口及脚本守恒，无原生/state/patch 注入。 | PASS |
| M0A-03 | CLI/Metro 按真实安装身份识别，24 项身份检查通过；两 blank 各自真实 prebuild、两轮普通 start/无 state 重启均 Harmony HTTP200、单项目两轮同 hash；模拟器真实构建、安装、启动、原始首屏通过。独审精确绑定各项目 bundleName 的 focused/visible 窗口、同窗口原始文本、真实 JPEG、日志和归档字节。 | PASS |
| M0A-04 | 独立 CLI 创建入口仅保留 SDK52，SDK54 在文件副作用前拒绝并移交新创建器。按调用图实际删除 create、create-release、template-contract、default-image-substitution 四个旧源码和专属测试。真实 clean/build/pack 清除旧 JS、声明及 map，独立 tgz 命令拒绝两种 SDK54 模板且不创建目录；SDK52 创建主体与共享资产字节守恒。README/guide 同步候选入口及验收边界。 | PASS |
| M0A-05 | 同18候选归档的仓库外四组合完整安装、126项直接依赖及开发依赖身份、15474个适配包文件与归档逐字节对照通过，无源码链接或创建后补依赖。default 原样页面/资源及两种包管理器的两轮 JS bundle 通过；原生模块未完成义务逐项关联 M7/M8。最终独审10/10、475输入稳定。 | PASS |

创建器 tgz SHA256：`17d802680eeeaca71cca80014d1c8455a8a7357c74096f2db716db5fa0ed519e`。模板及 15 个运行候选逐包版本与指纹见本批 `creator/creator.json`、`templates/templates.json`、`runtime/release.json`。候选在 staging 才解除 private；源工作区保持 private。

## 安装与最小运行

以下为同一组 18 个候选归档的跨轮次成功证据汇总，四个项目均在仓库外创建并完整安装。不是某次四矩阵全绿，也不是空缓存冷下载通过；旧 FAIL 报告原样保留。`installation-acceptance-aggregate.json` 由脚本重新检查候选组合、命令退出码、身份及日志 hash 后得到 PASS，最终独审独立重验四项目完整身份及候选文件，通过后接受 M0A-05。

| 项目 | 创建与完整安装来源 | 安装身份 | blank prebuild / 运行 |
| --- | --- | --- | --- |
| blank-typescript / npm | cache-recovery，exit0，975 包 | PASS | prebuild exit0；两轮 bundle；模拟器首屏 PASS |
| blank-typescript / pnpm | cache-recovery，exit0 | PASS | prebuild exit0；独审另绑定首轮 qaC1bZ 项目的完整安装及真实设备运行 |
| default / npm | default-npm-recovery，exit0，1291 包、约21秒 | 41 生产依赖，适配包 lock integrity 逐项匹配 | 两轮原样 Router bundle HTTP200、同 hash；未执行设备原生模块验收 |
| default / pnpm | network-retry，exit0 | PASS | 额外原样完整安装项目两轮 Router bundle PASS；未执行设备原生模块验收 |

下载调查确认 RNOH `0.82.30` 官方原包为 192,657,605 字节；旧 blank npm 的 822 项归档下载只有该包未完成。16 段范围下载重组后与官方 SHA512/SHA1 一致，SHA256 为 `865807ef057215315044d99e7625816c9ae758c5aec8e86eb2d14c72081c1614`，仅通过 npm cache add 预热该原包。后续 default npm 的重复元数据回源与下载超时保留，定向补测使用 npm 自带 cacache 校验已有元数据，1021 项可用、1059 次读取、无元数据回源；全新项目仍执行真实完整 npm 安装，没有复制 node_modules、改依赖或跳安装。

两个 blank 均在本机已有 Pura 90 模拟器 `127.0.0.1:5555` 实测。npm/pnpm 各自 run:harmony exit0，精确前台窗口分别为 `dev.expo.blanktypescriptnpm`、`dev.expo.blanktypescriptpnpm`，focused/visible 均 true，窗口内显示原始 `Open up App.tsx to start working on your app!`。两张 JPEG 已目视复核。两项目各 12 个适配包共 3281 文件与候选 tgz 比对，npm 的 6 个 `.gitignore` 到 `.npmignore` 是已核对的 pacote 标准重命名且字节相同。

default npm 两轮 bundle 各 10,522,057 字节，SHA256 `cf6054daecac08cebbb01e35afe380c32264053413e30be2246108e30c761e36`；应用文件不变、无人工 Harmony 开关、最终无 managed-state，两进程组均已清理。原本没有 state 的项目如实记录不存在，未伪称删过非空状态。此处不扩展为 default 图片/触感/动画原生行为或签名 Release 验收。

## 旧入口清理与历史证据

当前调用图为 551 文件、2455 引用、50 命令、8 个已审动态依赖。实际删除和打包清理由本批清理审查记录；调查器报告 `cleanupExecuted:false` 仅表示调查器自身不执行删除。

M0 接受过的 ownership 工具、policy 和测试按原字节归档到本批 `m0-ownership-baseline/`，与 HEAD 及原接受 SHA256 一致；ledger 仅迁移三个物理证据路径，M0 历史报告及接受 hash 未变。当前调查器/policy 随实际删除更新，已完成移交的旧锚点不再保留。SDK52 证明范围是源码/资产守恒与命令回归，未宣称本批重新完成 SDK52 外网安装或设备运行。

M0A-04 独审全部 40 个输入在进度文档更新前原字节归档到 `m0a04-accepted-inputs/`，索引 SHA 与旧独审逐项一致。后续文档进度演进不刷新旧审查和旧 ledger 的接受 hash。模拟器已实际停止，最终 hdc targets/fport 均 `[Empty]`，启动会话 exit0；失败清理尝试单独保留。

## default 后续依赖

原样保留 expo-image 3.0.11、expo-haptics 15.0.8、expo-symbols 1.0.8 及全部页面/资源，不能通过删页面或 RN Image 替换关闭 default。

| 来源 ID | 后续批次 | 必须补验 |
| --- | --- | --- |
| PKG:expo-image | M7.4 | 原始 default 图片、组件属性/事件、资源生命周期及设备显示 |
| PKG:expo-haptics | M7.3 | 设备触感、不可用及权限/系统行为 |
| PKG:expo-symbols | M7.4 / M7.6 | 原始组件的平台行为与适用性依据，不能因缺实现直接改不适用 |
| Router / Screens / Reanimated / Worklets / Gesture Handler / Safe Area | M7.1 / M7.4 | 原样路由、动画、手势、原生视图与首屏组合验收 |

## 缺陷与边缘情况

- 模板删入口/脚本、加未知依赖、缺路由、改 npmignore 丢资源：先实红，再用固定原 manifest 与全量源文件校验拒绝。
- 自洽但伪造的发行 metadata：先实红，再绑定已知发行、Expo 原始/发布版本、installSpec 与 RNOH 版本；源码及真实 tgz helper 均拒绝。
- 验收目录等于仓库根、缺目录经软链接落入仓库：写入前 realpath 校验，3 项专项通过；相似文本前缀的外部目录允许。
- 上游响应体中断：先实红 ERR_HTTP_HEADERS_SENT，改为读完响应体再发送响应头，已发送时销毁响应；loopback 回归通过。
- 被删除但仍在 Git 索引的文件：先实红 ENOENT，再让 ownership 扫描跳过实际缺失项；软链接仍拒绝，缺失 import 仍记 MISSING_RELATIVE。
- 旧 dist 残留：打包测试先捕获八个旧 JS/声明文件，再用现有 prepack clean/build 清除，未通过排除源文件清单掩盖残留。
- 测试加载器仅允许明确依赖；新 CLI/Metro runtime 文件补入真实包门槛及夹具，既有缺产物负例保留。
- 取证校验器未处理上游 `_vscode` 到 `.vscode` 命名：先红后修，新增 validation 报告重新核验原成功安装的 41 个生产依赖、36 条文件记录（34 个唯一文件；两个 VSCode 文件各重复一条）及 app.json 仅名称/slug/scheme 的标准替换，原失败 report 不覆盖。独审按唯一文件统计，后续汇总继续去重，不能用记录条数扩充覆盖量。
- HDC/模拟器命令可 exit0 但输出失败：先红后增加输出判定；错误单条转发删除尝试记 FAIL，停止模拟器后再次读取真实空设备/端口清单才记清理 PASS。后续取证统一核对标准文件转换、明确成功输出及最终状态。
- 首次设备截屏使用不支持的 PNG 后缀：保留 FAIL，改 JPEG 并校验真实 FFD8 文件头，再独立重跑设备取证；不能把截屏失败直接改成成功。

## 证据

证据根目录：outputs/sdk54/ai-e2e/20261027-m0a-creation/。

- create-acceptance.md、create-source.json、create-candidate-consumer.json：固定来源、真实构建与独立创建。
- review-creation-audit.json / .md：独立源码/模板/候选检查，15/15 通过及四项无安装消费；含输入与日志 SHA256。
- platform-validation.json、platform-implementation.md：24 项身份识别与 CLI 集成红绿证据。
- creation-consumer-report.json、retry/、network-retry/、cache-recovery/：保留全部历史完整矩阵及各次超时，汇总 FAIL 不改；成功条目按相同候选归档复用，不能将某项目成功扩展为整轮通过。
- blank-pnpm-start-network.log、blank-pnpm-bundle.headers、blank-pnpm-bundle.response、blank-pnpm-no-state.json：普通 Metro 启动与无状态 bundle。
- runtime-blank-pnpm/runtime-report.json：两轮普通 Metro bundle 同 SHA256 dc667a10b24c01c902155543005b6223a035a1f564c744aa5f86db2ca8d49543；原项目本来没有 managed-state，第二轮移除操作后仍无该文件，未伪称删除过非空状态。应用文件未变，三个进程组均已清理。run 日志包含真实 BUILD SUCCESSFUL 及 No Harmony device is connected，总 FAIL；缺 signingConfig 警告保留。
- runtime-default-pnpm-parallel/runtime-create-report.json、runtime-report.json：额外默认创建完整安装与原样 Router 两轮 bundle，SHA256 e0e07ce3c9b9ce4efe150fac6d20ebaa4778c518df1e71e96c9bc87b1ef37a13；原 managed-state 不存在，应用未改，进程组均清理。countsTowardOriginalFourMatrix=false，未执行设备运行。
- review-legacy-removal-audit.json / .md：四旧模块实际删除、M0 原字节归档、SDK52 守恒、真实 CLI tgz 与文档审查；仅用于接受 M0A-04。
- download-recovery/：官方 RNOH 原包、范围重组、两种官方 hash、实际单连接超时及原始 npm debug 日志。
- default-npm-recovery/report.json、create.log、validation.json：真实完整 npm 安装、元数据缓存读取 hash、取证校验的初始失败及修正后复核；原 report.passed=false 保留，create.exitCode=0 与 validation.passed=true 分开表达。
- device-blank-npm/、device-blank-pnpm-jpeg/：两 blank 的两轮 bundle、真实 run、UI 树、原始首屏 JPEG 与逐命令日志 hash；device-blank-pnpm/ 保留最初截屏失败。
- review-install-recovery-audit.json / .mjs / .md：M0A-03 独审9/9、171个输入稳定；包含错项目/非焦点/隐藏文本/文本位于其他窗口的负例。
- review-install-recovery-final.json / .mjs / .md：M0A-05 最终独审10/10、475输入稳定；126项安装身份、15474候选文件、1059次缓存读取对应1017唯一sourceKey逐项重验。与03旧审查分别冻结，父线程再次验证两批全部输入hash一致。
- runtime-default-npm-recovery/：新 npm default 原样应用两轮 Router bundle 与进程清理；installation-acceptance-aggregate.json 汇总四组合成功条目，明确跨轮次、同候选及缓存边界。
- device-cleanup-final.json：异步停止后空设备/空端口清单；device-cleanup.json 与 device-cleanup-retry.json 原始失败诊断保留，前者旧判定器的假通过已由红绿测试揭示，最终状态以 final 为准。
- workspace-red.log、workspace-loader-green.log、registry-body-red.log、registry-body-green.log：正式红绿记录。

仓库检查仍有既有 docs/releases/sdk54-m0-export-patterns-summary.json 的绝对 /Users/ 路径 FAIL，不以本批成功覆盖。模拟器通过不扩展为真机、签名 Release 或 default 原生模块行为通过；统一 V runner 未交付，不宣称其完成。

## 回归结论

| 检查 | 实际结论 |
| --- | --- |
| pnpm type-check | PASS，exit 0 |
| pnpm test | PASS，49 文件、471/471；清理前 501，减少 30 项为已删除四模块的专属测试 |
| pnpm test:pack | PASS，5/5，含旧创建产物不得进入 tgz 的回归 |
| pnpm test:sdk54-tools | PASS，873/873；曾出现临时 .git 清理 ENOTEMPTY，夹具清理加入有限重试，原失败与最终绿日志分别保留 |
| stage-progress --check | 按最终ledger重新生成并校验；M0保持关闭100%，M0A五项接受并登记独立closure，完成100%；实际命令结果保存于本批stage-progress-final.log |
| recovery-verifier-green | PASS，2/2；修正取证校验器并保留原失败；此轮未修改稳定产品源码，不重复全量产品回归 |
| check-repository | FAIL，仅既有摘要绝对路径；publishable 仍仅独立 CLI，forbiddenFiles 为空 |

## 阶段退出核对

| 原退出产物 | 具体落点与结论 |
| --- | --- |
| 固定创建命令及来源 | create-source.json、creator/creator.json、templates/templates.json；01/02独审接受 |
| 真实包/模板身份及hash | runtime/release.json及18候选归档；四成功项目候选组合一致，05独审接受 |
| 四项目创建与完整安装 | installation-acceptance-aggregate.json；四独立项目实际安装和身份通过，失败历史保留 |
| blank最小设备记录 | device-blank-npm/与device-blank-pnpm-jpeg/；prebuild/start/run及原始首屏、精确窗口绑定，03独审接受 |
| default未完成条目 | 本报告M7表与final审查m7Obligations；页面和依赖未删，默认原生完整运行继续由M7/M8关闭 |
| 旧入口移交及SDK52共享回归 | review-legacy-removal-audit；原接受hash及40输入原字节保留，04接受不变 |

五单元及本阶段退出产物齐备，允许登记M0A关闭。后续进入M1配置快照与Harmony插件；V统一runner、真机、签名Release及default原生模块按各自原阶段继续实施，不在此扩张通过范围。
