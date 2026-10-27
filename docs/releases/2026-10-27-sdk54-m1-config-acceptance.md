# SDK54 Harmony M1 配置与插件验收

状态：**M1 已关闭，完成 100%（5/5 原单元）**。M0、M0A 的接受记录与证据 hash 未变；本阶段未提交、未推送、未公开发布。

## 实现与单元结论

| 原单元 | 具体实现 | 验收结论 |
| --- | --- | --- |
| M1-01 | `prebuildHarmonyAsync` 单次 getConfig；`resolveHarmonyConfig` 产生公开/规范快照；原生工程、媒体、Constants 接收同次输入，媒体不读 app.json，Constants 不启动第二配置生成进程 | PASS。JSON/JS/TS 三入口、环境变量、身份/资源/Constants 同源；真实 HAR prepare/sync 通过 |
| M1-02 | `expo/harmony-config` 的 JS、公开类型与 schema；支持身份、版本、媒体、协议、权限、方向、主题、系统扩展与显式优先级 | PASS。正负类型及 schema/运行期样例、SDK 边界、仓库外 pnpm 严格类型检查通过；主题使用真实系统 API |
| M1-03 | 真实 `@expo/config-plugins@54.0.5` 注册/withMod/provider/compiler；完整模板 JSON 在内存编译，仅运行 Harmony 平台 | PASS。上游原型与自定义 mod 通过；无具体运行期接口阻塞，无新增 config-plugins/config/prebuild-config fork |
| M1-04 | 求值→注册校验→模块发现→内存计划→源资源校验→clean/同步；移除 skipPlugins，真实 Autolinking public exports 暴露 preflight | PASS。配置/媒体/插件失败均在 clean 前阻断，重复真实文件定位、合法原生方向扩展及公开出口均通过 |
| M1-05 | 独立第三方插件包、tgz 消费执行器及作者文档；npm/pnpm 仓库外安装与失败场景验证 | PASS。两个包管理器各 21 项检查、4,463 个候选文件及 10 个负例通过；同一最终候选真实 hvigor/HAP 通过 |

实现主路径：`packages/@expo/cli/src/harmony/config.ts`、`packages/@expo/cli/src/prebuild/harmony/configPlugins.ts`、`packages/expo-modules-autolinking/src/platforms/harmony/nativeProject.ts`。作者契约见 [Harmony 配置与插件](../harmony-config-plugins.md)。

## 已冻结证据

证据根目录：`outputs/sdk54/ai-e2e/20261027-m1-config/`。

- 源码独审：`review.md`，SHA256 `e46ee2422f48bc89a503b424eb30e66f86c2a11a6e8f1214b0cc47f0205ea0a8`；R1-R8 全部关闭，真实 HAR 三专项 **28/28、0 skip**。
- 契约：`contract-acceptance.md`，包括 SDK schema 原字节、类型正负样例、pnpm 严格布局 red/green；不使用 skipLibCheck 掩盖公开依赖问题。
- 打包：`runtime-next/release.json`，SHA256 `ca8c11ec148418f43c6723835cdfd016a1c0d042a240709ea85be89753d06a6d`。Expo/CLI/Autolinking 三包重建，其他十二包复用已校验 M0A 候选；全部十五包重新验证。
- 消费：`consumer-acceptance.json`，SHA256 `1225e1379d657ba7ea15a32a4d5354baf168a95336ac51a5ab48ab56afd5f3c1`；选择 `consumers-accepted` 中成功的 pnpm 结果及 `consumers-accepted-npm-verified` 的 npm 绿轮。两者 release、十五候选及第三方 tgz 身份一致；执行器、日志与正向公开快照均保留。
- 消费独审：`review-consumption.md`，独立核对原计划验收、候选文件、日志、原生输入及 HAP；不改已冻结的 `review.md`。
- 原生构建：`native-build-report.json`、`hvigor-ohpm-install.log`、`hvigor-assemble.log`；实际命令退出码均为 0，`BUILD SUCCESSFUL in 2 min 1 s 201 ms`。保留 HAP 为 `native-build/entry-default-unsigned.hap`，44,036,128 bytes，SHA256 `8e61626ad52337a5e60c873453e2b68c6f8a7c2f5d6e78e96d6fe3d2ba863684`。构建副本全部 103 个输入无漂移，HAP 内身份/vendor/配置及 Constants 字节通过独审。
- 生成与编排：`pipeline-config-sources-green.log`、`pipeline-exports-green.log`、`snapshot-theme-final-green.log`；对应红测保留在同目录。
- 进度：`sdk54-stage-acceptance.json` 登记五单元及 M1 closure；`stage-progress --output/--check` 验证证据 hash 和 100% 关闭状态。

## 原计划验收与退出产物

| 原验收 | 实际操作与结论 |
| --- | --- |
| M1-A01 | PASS。仓库外只用 app.config.ts 与环境变量，无 app.json；正向和每个负例均只求值一次；应用身份、媒体、公开快照与 Constants 同源且字节一致 |
| M1-A02 | PASS。独立第三方 tgz 由 npm/pnpm 真实安装，公开接口修改 app.vendor 和 module.metadata；生产代码无范例包名分支，其他平台 mod 若执行即抛错，实际 Harmony prebuild 均成功 |
| M1-A03 | PASS。每个包管理器分别验证缺插件、无平台、无效导出、重复、别名重复、mod 抛错、空实现、身份漂移、非 JSON 和非法版本；每项均检查目标错误、旧原生全树与 sentinel 不变、配置仅求值一次 |
| M1-A04 | PASS。有效/无效类型及 schema、运行期专项通过；两个包管理器在真实消费依赖布局执行 strict tsc，不使用 skipLibCheck；公开配置和插件接口均可解析 |

退出产物已齐：公开配置与插件契约、十五包真实发行原型、快照与原生生成差异、第三方插件双包管理器消费证据。独立插件范例通过 npm pack 与本地候选 registry 分发验收，未向公共 registry 发布。

## 回归

| 检查 | 实际结果 |
| --- | --- |
| SDK54 工具回归 | 900 PASS、0 FAIL、1 SKIP；真实 HAR 专项已另以 28/28、0 skip 验证 |
| 工作区 type-check | PASS |
| 工作区测试 | 49 文件、471 PASS |
| 工作区打包测试 | 2 文件、5 PASS |
| 14 包双轮打包 | deterministic=true，22 条内部依赖边，0 failures |
| catalog 校验、现有补丁审计 | PASS |
| 配置/编排/原生专项 strict tsc | PASS |
| 最终源码专项复验 | 28/28 PASS、0 SKIP，见 final-source-verification.log |
| 最终 npm/pnpm 消费 | 各 21 项检查、4,463 个候选文件、10 个负例全部 PASS |
| 最终候选原生构建 | ohpm install / hvigor assembleHap 均 exit 0；HAP 身份、第三方字段、Constants 字节 PASS |
| 全上游 CLI tsc/Jest | 本机既有缺依赖/未构建出口及未安装 Jest 限制，不能宣称全上游检查通过 |
| repository-check | 仅既有 `docs/releases/sdk54-m0-export-patterns-summary.json` 中绝对路径失败；历史冻结证据未改 |

## 边缘修正

先补重现测试再修复：clean 前媒体校验；应用名引号/反斜杠/换行转义；公开类型直接依赖；非法 app.colorMode 改系统 setColorMode；版本/协议/权限 SDK 边界；空插件及异步注册来源；真实 preflight 出口；原生方向完整枚举。额外覆盖循环/非 JSON 扩展、重复权限、真实路径别名、资源源/目标/悬空软链逃逸和旧模板幂等接线。

## 消费修正与边界

npm 范例增加完整候选集后需要与 SDK54 React 对齐的 react-dom 19.1.1；已固定，未使用 force 或 legacy-peer-deps。npm 10.9.3 官方提取会把 6 处 .gitignore 改名为 .npmignore，先用独立 tgz 真实安装复现，再以六条精确路径映射逐字节验证；没有跳过隐藏文件或运行文件。对应重现及失败报告均保留。

汇总明确选择各管理器的成功结果，不将历史整体 FAIL 改写为 PASS。安装复用了完整性校验后的缓存与部分已有现场；npm 在安装前移除旧 CLI 并从最终候选真实重装，十五包最终字节全部复核；不宣称空缓存安装。旧 `runtime`、`consumers-network`、`consumers-final` 和 npm 红轮不计最终候选接受。

HAP 为未签名 debug 产物；本阶段未执行真机运行或签名 Release 验收。既有 ArkTS/native 依赖警告留在完整构建日志中。

M2 继续承担完整 JSON5 parser、生成事务/回滚/并发、资源归属与消费端 HAR 修补退出。M1 单插件通过不关闭所有内置插件、default 原生能力、真机/签名 Release 或 M7/M8 义务。
