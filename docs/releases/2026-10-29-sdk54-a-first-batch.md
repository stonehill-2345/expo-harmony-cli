# SDK54 人员 A 首批执行与验收记录

日期：2026-10-29。责任人：A。对应[双人规划](../superpowers/plans/2026-10-29-sdk54-ab-parallel-delivery.md)。

本轮完成 A 工作区建立、部分范围/候选核对，以及 Core Platform 声明的一项确定性修复。**A-01 尚未完成，M4 仍为 0/7；本报告不是设备或发行验收。** 总规划和阶段台账由 B 汇总更新。

## 1. 基点、边界与执行步骤

- 分支：`feat/sdk54-a-modules`；基点：`19a0375cff7e0ef3bc62d54fd5ed57b913bb2000`。
- A 工作区：`/Users/zhansh/project/expo-harmony-cli-a`；原工作区未修改。
- 环境：Node 23.5.0、pnpm 10.19.0、TypeScript 5.9.3。
- 使用 `pnpm install --frozen-lockfile --ignore-scripts --offline` 建立独立依赖；未修改根清单或锁文件。
- 本轮文件归属：Core 的 `build/Platform.d.ts`、对应 map、新增 `harmony/tests/platform-declaration.test.mjs`，以及本文和 A→B 交接单。公共工具、发行目录、总台账归 B。
- 本轮未占用模拟器、运行原生构建或正式性能基准。下一次设备任务需先与 B 固定使用时段。

执行顺序与验证：

1. 核对范围与候选 → 输出部分来源清单、九包文件哈希及完整性检查。
2. 复现确定的声明缺陷 → 源码声明与旧候选均产生真实 TypeScript 失败。
3. 由源码重新生成声明并隔离打包 → 工作区和新包类型测试通过，记录身份及剩余验收。

## 2. 实际结果

证据目录均相对 A 工作区：`outputs/sdk54/ai-e2e/20261029-a01/a/`。该目录被 Git 忽略，是本机执行工件，交接时必须另行保存；文档链接不代表工件已入库。

| 任务/检查 | 实际结果 | 证据及边界 |
| --- | --- | --- |
| G0 的 A 工作区与基点 | 完成 | 独立分支/依赖已建立；双方范围、设备排期及缺失证据处理仍未共同完成，G0 不标 PASS |
| A-01 可用范围来源 | PARTIAL | `m4-known-sources.json` 共 611 条记录，`ready=false`、`complete=false`；记录数不是已支持 API 数 |
| A-01 完整范围重放 | BLOCKED | `scope-full-blocked.log`：缺少历史 `public-dispositions.json`，未生成完整清单 |
| A-01 九包文件与旧候选核对 | 已执行，范围有限 | `nine-package-byte-audit.json`；9/9 tgz 的 SHA-512 与旧 `release.json` 一致；不是公开 API/成员/插件语义闭环 |
| Core 声明修复前 | 预期失败已复现 | `platform-red.log`：2 项失败，分别为 Harmony 类型不接受与源码生成结果不一致 |
| 旧 Core 3.0.31 包 | 预期失败已复现 | `candidate-baseline-red.log`：真实公开类型入口报 TS2353，1 项失败 |
| Core 声明修复后 | PASS（2/2） | `platform-green.log`：合法 Harmony 分支可编译、非法平台仍拒绝；声明与源码实际编译输出一致 |
| 新本地类型候选 | PASS（2/2） | `candidate-green.log`；从新 tgz 解包的公开类型入口可编译；另 1 项仍检查工作区源码/声明一致性 |
| A-02 现有视图 JS 包装器回归 | PASS（2/2） | `core-view-host.log`：挂载/卸载顺序及卸载抛错后清理 tag；使用测试替身，不是 Fabric/ArkUI 验收 |
| A-02 原生生命周期 / A-03～A-04 / A-05 整体 | NOT_RUN | 不能用本次声明与宿主测试替代设备行为、最终 npm/pnpm 实装或完整 M4 收口 |

### 九包核对口径

逐一核对九包所有 Git 跟踪文件与旧候选 tgz 内常规文件的 SHA-256，同时保存两侧独有文件列表。新增的未跟踪测试/文档不属于此历史源码比较集合。

| 模块 | 相同文件 | 不同文件 | 仅跟踪源码侧 | 仅候选侧 |
| --- | ---: | ---: | ---: | ---: |
| Core | 1014 | 3 | 101 | 15 |
| Font | 125 | 1 | 13 | 1 |
| Asset | 157 | 1 | 13 | 1 |
| SplashScreen | 52 | 1 | 25 | 1 |
| SystemUI | 62 | 1 | 8 | 1 |
| StatusBar | 22 | 1 | 7 | 1 |
| Linking | 111 | 1 | 11 | 1 |
| Router | 815 | 1 | 291 | 1 |
| WebBrowser | 65 | 1 | 7 | 1 |

每包共同路径的差异均包含发行转换后的 `package.json`；Core 另外两项是本轮修复后的 `Platform.d.ts` 与 map。两侧独有文件含打包排除项、发行 README 和兼容工件，须按发布清单判断，不能自动归为缺失功能。同字节只证明候选承载当前文件，不能证明源码与生成文件彼此同步。

范围清单 SHA-256：`3c86f66461712f235ad82effbcbddb05bf7efe99f8c35bbad80594a92a8ff1e4`。

九包核对 JSON SHA-256：`c7a176c1287b6d3e4552fbcab5e3e924eeb58bdf9756827a32d5cf9125e9f4a7`。

## 3. Core 声明修复与候选身份

源码已允许 `Platform.select({ harmony: 1, native: 2, default: 0 })`，但跟踪声明和实际旧候选不允许，消费者报 `TS2353`。本轮使用 TypeScript 编译真实 `src/Platform.ts`，启用 `noEmitOnError`，仅更新该声明与 map；未改变运行时逻辑。map 的来源仍为 `../src/Platform.ts`，不携带本机绝对路径。

新测试从包清单读取公开类型入口，使用真实 React Native 0.82.1 声明；同时要求虚构平台键产生错误，避免未解析的 `any` 导致假通过。测试通过 TypeScript `paths` 指向包入口，**没有验证 npm/pnpm 安装解析**；`skipLibCheck` 也意味着它不是整包声明的完整检查。

| 项目 | 身份 |
| --- | --- |
| 上游源码包 | `expo-modules-core@3.0.30` |
| 旧发行候选 | `@expo-oh/expo-modules-core@3.0.31`；SHA-256 `efd37bfe2d90c6179bf113f3bddc24b385214c31b64b1b83ebb3cb008e9c78d4` |
| 新本地类型候选 | `expo-oh-expo-modules-core-3.0.31-a-types-only.tgz`；SHA-256 `06e3b26c750dc4accbc0f89ad82a26d1a3c2b6f206e992d872cf4bee8c8059bb` |

完整 SHA-512、绝对路径和打包结果见 `candidate-identity.json`、`pack.log`。新包复用现有 `stageBuildAndPack` + `transformPackage`；没有执行正式 Core 兼容 HAR 组装，**仅供类型验证，不可用于替换正式发行包或设备验收**。清单版本相同不代表内容相同，必须以 hash 区分，未发布。

Core 的公共打包 descriptor 目前未配置 build，因此本次同步跟踪声明只消除了当前缺陷，尚未解决后续源码修改时的自动新鲜度保证。该工程改进交 B，A 提供回归测试。

### 重放命令

在 A 工作区执行。依赖路径是本机已有消费工程；其他机器须指向真实安装了 React Native 与 Node 类型的消费者，不能用桩声明替代。

```sh
export EXPO_HARMONY_CONSUMER_NODE_MODULES=/Users/zhansh/project/sdk54-prebuild-perf-20261029/project/node_modules
node --test packages/expo-modules-core/harmony/tests/platform-declaration.test.mjs

EXPO_CORE_DECLARATION_PACKAGE="$PWD/outputs/sdk54/ai-e2e/20261029-a01/a/baseline/package" \
  node --test --test-name-pattern='published Core' packages/expo-modules-core/harmony/tests/platform-declaration.test.mjs
# 上条命令预期退出 1，TS2353。

EXPO_CORE_DECLARATION_PACKAGE="$PWD/outputs/sdk54/ai-e2e/20261029-a01/a/candidate/package" \
  node --test packages/expo-modules-core/harmony/tests/platform-declaration.test.mjs

EXPO_HARMONY_TOOLING_ROOT="$PWD" node --test \
  packages/expo-modules-core/harmony/example/tests/view-lifecycle.test.cjs

node scripts/sdk54/m4-scope-inventory.mjs \
  --output outputs/sdk54/ai-e2e/20261029-a01/a/m4-known-sources.json --seed --with-current
```

## 4. 阻塞及后续顺序

完整范围命令的首个缺失输入是 `outputs/sdk54/ai-e2e/20261027-m0-final-closure/public-dispositions.json`。搜索原项目、其他项目目录、本机临时目录及 Codex 目录，未找到旧 scope-reviewed 快照和所需公开关系/插件契约工件。历史报告中的 7,719 条决议不能从文字准确还原，不能将当前 611 条清单伪装成完整范围冻结。

1. B 恢复原始工件，或在新路径重建可追溯证据并提供输入接口；A 继续逐条核对公开项、当前新增项及 M4/M7 关联。既有必达场景和转交条件不因失败改变。
2. A 在范围依赖满足后推进 A-02 原生运行时/设备负例；本轮已整理现有入口和断言，见[交接单](2026-10-29-sdk54-a-to-b-handoff.md)。没有设备占用记录前，不同时运行性能基准或原生设备任务。
3. 再推进 Font/Asset 和其他模块；A-05 收口须绑定 B 组装的完整最终候选，验证真实 npm/pnpm 消费与设备行为。

未执行 `git add`、提交、推送或发布。
