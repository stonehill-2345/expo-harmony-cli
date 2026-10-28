# SDK54 Harmony M2 工程生成验收

状态：**M2 已关闭，完成 100%（6/6 原单元）**。2026-10-28 完成最终候选消费、原生构建、宿主 run 完整性与独立复核；M0、M0A、M1 的冻结接受记录保持。未提交、未推送、未公开发布。

## 实现与原单元

| 单元 | 已实现 | 验收状态 |
| --- | --- | --- |
| M2-01 | JSON5 parser；schema1 归属状态记录相对路径、SHA256、owner 和上次期望 JSON；对象字段与数组资源键三方合并，用户内容冲突明确诊断 | PASS；A01/A04，双 PM 消费与独审 |
| M2-02 | 同盘 staging、原子取锁、journal/fsync、旧树备份与目录交换；异常回滚和死进程恢复；提交前后检测旧工程编辑；CLI 调试地址在 stage 完成 | PASS；A02/A03，内部失败、双进程、四处异常及四处退出恢复 |
| M2-03 | 稳定 JSON/文件排序、相对 CMake 路径、内容 hash 和 no-op 不替换；配置/媒体/插件变更由期望集增删 | PASS；A01，完整树/state/inode 幂等与媒体、Constants 更新/删除/回退 |
| M2-04 | 普通生成保留用户文件、非受管字段；clean 明确提示并保存完整备份；无状态工程首次迁移保守保留和备份 | PASS；A04，备份与恢复树独立字节比较 |
| M2-05 | RNOH/Screens/Worklets 转换前移发行 staging；Core 携带预制兼容 HAR、来源和工具 hash；消费只验证/复制，无 Python 回退 | PASS；A06，十五包校验、真实安装/prebuild/build/run 依赖完整性 |
| M2-06 | 按当前有效模块图重新计算生成集合；失去最后引用的受管内容清理，传递引用、共享权限、用户资源保留 | PASS；A05，真实 query 传递引用保留及最后引用删除 |

作者规范与恢复示例见 [Harmony 工程生成、归属与恢复](../harmony-generation.md)。主实现位于 Autolinking 的 `generationTransaction.ts`、`generationState.ts`、`nativeProject.ts`、`releasedCompatibility.ts`，CLI `prebuildHarmonyAsync` 委托 clean 与 finalization。

## 候选身份

证据根：`outputs/sdk54/ai-e2e/20261027-m2-generation/`。

最终接受候选 `runtime-accepted/release.json` SHA256：`fafd39501044906ebdcc6ad602060bda5452209f93dbb87e235ce49b7b0b1a10`。生成实现源自 `runtime-final`，其 CLI 因 HDC 错误诊断修复再次重建；其余十四包逐字节相同。所有十五包重新运行发行验证。旧 `runtime`、`runtime-final` 及旧 run 失败记录保留，不计最终接受；源码对应关系见 `review-source-accepted.md`。

三项兼容输出 SHA256：

- RNOH：`0e0cf3dbb5b2e510f49c819ff5db2f43ad5a5918d38e840cc2714055c9f6fd83`。
- Screens：`78287fa54f91de5e345b88c678d47cc1b3f03f1f7af156ad899a24a4903c061b`。
- Worklets：`29c396e1f71d9e4a5347e9aa7aba7040724027ce558bde5ca677ee003887fce4`。

## 已完成回归

| 检查 | 结果与证据 |
| --- | --- |
| 工作区类型检查 | PASS，workspace-types.log |
| 工作区测试 | 49 文件、471 PASS，workspace-tests.log |
| 工作区打包测试 | 2 文件、5 PASS，workspace-pack.log |
| SDK54 工具回归 | 935 PASS、0 FAIL、1 SKIP，tools-accepted.log |
| 真实 HAR、配置/事务/状态专项 | 62 PASS、0 SKIP，final-source-verification.log |
| 新执行器边界及归属审计 | 8 PASS，final-executor-ownership.log |
| 14 包双轮打包 | deterministic=true、22 内部依赖边、0 failures，deterministic-pack.log |
| catalog、包审计、现有补丁审计 | PASS，catalog-validate.log、package-audit.log、patch-audit.log |
| repository-check | 仅既有 M0 冻结报告绝对路径失败；repository-check.log，历史证据未改 |
| 本轮 M2 专项复验 | 48/48 PASS，0 SKIP；包含 HDC 零退出码错误、回滚、争锁、中断、归属与执行器边界 |
| 本轮工具回归 | 947 PASS、1 FAIL、1 SKIP；唯一 FAIL 为本地 registry 监听被沙箱 EPERM 拒绝，保留 final/tools-closure.log；同一测试沙箱外复验 1/1 PASS，见 final/registry-closure.log |
| 本轮十五包发行复验 | failures=[] |
| 最终独立证据复核 | 15 包 SRI、74 日志引用、103 原生输入及 mode、两 PM 依赖与恢复树、8 对 Constants 全匹配；final/review-closure.json |

## 边缘修正与限制

均先重现再修复：生成期间用户编辑被覆盖；模板软链在校验前写穿；OHPM 名映射碰撞；用户删除受管文件同时期望变化；字典原型名误判归属；兼容 bundle 根和 harmony 父链接逃出 Core。额外覆盖受管软链拒绝、非受管缓存链接原样保留、备份父软链、损坏兼容产物及工具、未知 HAR、目录逃逸和真实双进程。

JSON5 保留字段语义，不保留注释排版。活 PID 的锁不按超时强占，PID 复用可能保守阻塞。无状态旧工程迁移保守保留重叠值，clean 才按声明式配置重建，并保留备份。

全上游 CLI/Autolinking tsc/Jest 仍受本机既有缺依赖、构建出口、Jest 未安装和 harmony.ts 的类型推导限制，不宣称全上游检查通过。工作区检查和发行构建结果另列。HAP 必须以本阶段实际构建报告为准，未签名 debug 不代表真机或签名 Release。

## 最终验收与退出检查

- `final/consumers/generation-consumer-report.json`：npm/pnpm 各 20/20；M1 安装回归各 21 项，均为真实安装、无复用旧安装。两 PM 依赖 before/after/current 分别 42,981/45,879 项一致。
- A01～A05：完整树幂等、四媒体与 Constants 更新/删除/回退、资源 EISDIR/JSON5 parse/HAR ENOENT 内部失败、四处异常和四处退出恢复、双进程争锁、clean 备份恢复、真实传递图及最终移除均通过。
- `final/native-build-report.json`：ohpm、hvigor、带缓存再次 prebuild 均 exit 0；103 个原输入未漂移，依赖未改。HAP 为 43,871,989 bytes，SHA256 `2288bc53ef35fe8e6facef5d08a5127210beed8ea040cae6be4fa4f0652e662d`；身份与 Constants 独立核验匹配。
- `final/run-integrity-report.json`：实际 run 完成构建后，对 `m2-no-device` 返回 exit 1，明确诊断设备未连接；无超时，依赖不变且原工程恢复，`passed=true`、`deviceRunPassed=false`。这接受 A06 宿主路径完整性，不接受设备安装、启动或首屏。
- 首次沙箱 run 因 ohpm 写宿主缓存 EPERM 失败，保留为 `final/run-integrity-sandbox-report.json` 与 `final/run-harmony-integrity-sandbox.log`；不改写历史失败。
- 独立关闭审查：`final/review-closure.md/json`；只读入口 `final/audit-closure.mjs` 实际退出 0。六原单元及 A01～A06 均 PASS，退出产物齐备。
- 阶段登记：`sdk54-stage-acceptance.json` 六单元与 M2 closure 绑定报告和证据 SHA256，`stage-progress.mjs --check` 核对 6/6、100%、closed=true。完整证据仍依赖本机被忽略的 outputs 与临时消费工程。

下一阶段为 M3 通用 Autolinking 与 Core 作者契约；M5/V、真机、default 全模块及签名 Release 按原计划继续，不由 M2 关闭替代。
