# SDK54 B-01：Ninja 失效输入诊断准备与现成构建树取证

日期：2026-10-30，最终复验 2026-11-10。负责人：B。状态：**B-01 全矩阵自验 PASS；等待 A 交叉复核。**

## 目的与边界

本轮先建立可重放的 Ninja 只读诊断，记录 dry-run 的失效原因和目标输入的内容/时间身份，避免仅凭 mtime 猜测历史约 62.30 秒 Ninja 成本。

本轮使用 `/Users/chensq/Desktop/2345/expo-harmony-sdk54-example` 的既有 Debug/Release 构建树。该工程约 3.0 GiB，是 Core 集成 example，不是性能计划规定的 blank npm/pnpm 消费工程，也不绑定当前 G0 的 14 包 workspace 候选。因此本轮结果仅证明诊断工具可用及该构建树当前状态，不计入 B-01 性能门槛样本。

## 实现

新增：

- `scripts/sdk54/diagnose-ninja.mjs`
- `scripts/sdk54/__tests__/diagnose-ninja.test.mjs`

诊断器执行：

1. `ninja -C <build> -n -d explain <target>`，不执行编译命令。
2. `ninja -C <build> -t inputs <target>`，保存目标输入集合。
3. 对显式 `allowedRoots` 内的现存普通文件记录 SHA-256、size、mode、inode、device、mtimeNs 与 ctimeNs。
4. 根目录外文件、缺失路径和软链不读取内容；option-like target、软链 build directory 和 `ninja: error:` 均失败关闭。

专项测试 3/3 通过，覆盖固定 argv、dry-run 不改 `build.ninja`、允许根内容 hash、外部路径不读取、目标/软链拒绝，以及 Ninja 退出码 0 但输出 fatal diagnostic 的负例。

最终 SDK54 工具回归：1096 tests，1076 pass、20 skip、0 fail。全套高负载下曾暴露 AI E2E 超时测试的 50 ms 启动竞态；测试预算调整为 500 ms 后，仍验证超时终止与部分日志保留，完整套件复跑通过。

## 工具身份

构建树 `CMakeCache.txt` 固定：

- Ninja：`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/native/build-tools/cmake/bin/ninja`
- Ninja 版本：`1.12.0`
- CMake：`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/native/build-tools/cmake/bin/cmake`

对照发现 `/opt/homebrew/bin/ninja@1.13.1` 会报告 `.ninja_log` 版本过旧，不能用于解释该构建树的增量状态。正式报告只采用构建树固定的 DevEco Ninja 1.12.0。

## Debug / Release 实际结果

两棵树均以 `all` 为默认顶层目标，dry-run 结果一致：

| 项目 | Debug | Release |
| --- | ---: | ---: |
| explain 总数 | 3 | 3 |
| `PHONY_ALWAYS_DIRTY` | 1 | 1 |
| `GLOB_VERIFY_DIRTY` | 2 | 2 |
| `OUTPUT_OLDER_THAN_INPUT` | 0 | 0 |
| `COMMAND_CHANGED` | 0 | 0 |
| `DEPFILE_MISSING` | 0 | 0 |
| 输入记录 | 1147 | 1147 |
| 现存输入 | 528 | 528 |
| 已计算 SHA-256 | 528 | 528 |
| 未生成/中间路径 | 619 | 619 |

Ninja 只计划：

```text
[0/2] Re-checking globbed directories...
[1/2] Re-running CMake...
```

三个 explain 均来自 `VerifyGlobs.cmake_force` 的 phony 常脏节点和 `cmake.verify_globs`。当前没有证据表明该 example 的源文件时间戳、编译命令变化或 depfile 缺失会直接触发 C++ 重编译。dry-run 结束后 Debug/Release 均无残留 `.ninja_lock`。

## 证据

- Debug：`outputs/sdk54/ninja-diagnostics/20261030/debug-all-deveco-live.json`
  - SHA-256：`e9685733c5cb9ec88106d4f726a0aa8073d198c10fe12ea6f1d0af261f00161e`
- Release：`outputs/sdk54/ninja-diagnostics/20261030/release-all-deveco-live.json`
  - SHA-256：`c80c73b56fba039e9c2c56fcd8abef341327f3035bc8699141d49330bcb0358c`

诊断开始时磁盘约 21 GiB 可用，最终约 18 GiB 可用。诊断 JSON 各约 640 KiB，未复制项目或创建新构建缓存；空间变化主要来自同期工具测试和系统活动，未据此推断物理峰值。

## 结论与下一步

1. 诊断工具已具备，且真实工具身份差异会显著影响结论；后续禁止用 Homebrew Ninja 替代构建树固定 Ninja。
2. 当前 Core example 只显示 glob/CMake 检查，不复现历史 62.30 秒 Ninja 成本，不能据此宣布问题消失。
3. 下一步需要在正式 blank 性能工程中，于 prebuild 前后分别运行同一诊断，比较 build.ninja、输入 hash、mtimeNs、命令和 depfile；随后才执行一次真实增量构建测量。
4. 完整五次交错矩阵仍需固定旧/新候选和更充足磁盘峰值预算，不以本轮 dry-run 代替。

## 2026-11-02 blank 正式候选复现与根因

使用本仓库生成并完整校验的 `sdk54-expo-oh-harmony.1` release 组合创建 pnpm blank 工程。候选身份包括 `@expo-oh/expo-modules-autolinking@3.0.28`、`@expo-oh/expo-modules-core@3.0.31`、`@expo-oh/expo-cli@54.0.28`，release manifest SHA-256 为 `8835df3e1e8ca0b263150c20b043ea4c1beff2450efa78d51a32e954fa5306ca`。

实际复现：

- 首次 prebuild：1.22 s；无构建产物重复 prebuild：4.55 s。
- 首次 Debug 原生构建成功，Hvigor 134.67 s，其中 Ninja 112.03 s；设备在长构建后变为 Offline，安装步骤未执行，但 HAP 已生成。
- 编译后无变化 prebuild：87.33 s；transaction 86.91 s、merge 33.32 s。
- 该 prebuild 处理 72,676 次 copy、72,707 次 utimes、452,438 次 lstat；Node external 峰值约 301 MiB。
- 随后 Hvigor：83.37 s，其中 CMake 16.53 s、Ninja 62.00 s。

prebuild 前后 `build.ninja`、`.ninja_log`、`.ninja_deps` 和 `.expo-harmony-state.json` 内容 hash 均未变化；521 个现存 Ninja 输入的内容也均未变化，但 521/521 inode、ctime 和 mtime 发生变化。直接 Ninja `-d explain` 捕获 113 个 `stored deps info out of date`，当前 mtime 比 `.ninja_deps` 保存值晚 6,664～498,988 ns，并执行 140 个编译/链接步骤。

根因：`generationState.ts` 对未变文件执行 `copyFile` 后使用 `fs.promises.utimes(target, Date, Date)` 恢复时间。Node Date 只有毫秒精度；即使传数字秒，当前 macOS 接口也只能恢复到微秒，无法保留 Ninja deps 需要的纳秒值。mtime 精度截断导致 `.ninja_deps` 判定全部相关输出过期。

初版尝试使用 macOS `/bin/cp -c -p -R` 克隆整个 current tree，真实 3 GiB Core example merge 耗时 118.10 s，虽保留 517/517 Ninja 输入的 mtimeNs、内容与独立 inode，但性能不可接受，已放弃。

最终修复仅预克隆既定构建缓存根 `.hvigor`、`entry/.cxx`、`entry/build`，其余文件继续使用原 merge。缓存仍参加完整 hash、并发冲突、事务恢复和 clean 语义，不是忽略目录或移出保护边界。系统 `cp -c` 在 clonefile 不可用时按文档回退 copyfile，`-p` 保留精确时间、权限、ACL 和扩展属性。

新增回归覆盖：精确 mtime、独立 inode、仅允许三个缓存根进入系统 clone、未受管软链、clone 失败清理、current/stage 不变，以及历史托管缓存文件仍可删除。generation/state/transaction/prebuild 专项 49/49 通过。

合成规模 smoke 使用 10,000 个非缓存文件和 1,000 个缓存文件，merge 2.52 s；100/100 缓存样本 mtimeNs 完全一致且 inode 独立。证据：`outputs/sdk54/b01-autolinking-fix-20261102/selective-clone-scale.json`，SHA-256 `cbb4226507968fe0e4b7fa6c870c8b1adb94f55488d299a88fa4512fd9cc7e0b`。

受控 release 打包成功生成最终 `@expo-oh/expo-modules-autolinking@3.0.28`，tgz 路径 `outputs/sdk54/b01-autolinking-fix-20261102/expo-oh-expo-modules-autolinking-3.0.28.tgz`，SHA-256 `cc33f8945bfd26a4bebf41be9c02ce584fc5c456d8b9708deda3ddfca702cfbb`。

上述原始 blank 性能日志存放于 `/private/tmp`，系统重启后已被清理，现不能作为最终可复核工件。最终验收必须重建同环境旧/新候选并保存到持久 evidence 目录；本节不把已丢失日志补造成新证据，也不标记 B-01 完成。当前磁盘仅约 3.1 GiB 可用，真实 blank 修复版重跑保持 BLOCKED，不能用合成 smoke 代替。

## 2026-11-05 最终性能与设备复验

磁盘扩容后重建 pnpm blank 消费工程，并保留完整 72,708 文件、约 3.4 GiB 的编译后 Harmony 树。11 月 2 日 paired baseline 为：编译后 prebuild 64.82 s，随后 Hvigor 65.07 s，其中 CMake 13.512 s、Ninja 47.106 s。

进一步诊断确认 70,978 个文件集中在 `oh_modules/.ohpm`，而受管 generation state 只有 93 个文件。旧事务每次对 current/candidate/backup 重复内容 hash，合计 363,654 次 stream read；即使 Ninja mtime 已修复，仍无法满足 prebuild 门槛。

最终实现保持 changed/clean/migration 路径的完整事务语义，并增加三层受控优化：

- `oh_modules` 与 `.hvigor`、`entry/.cxx`、`entry/build` 一样使用 macOS `/bin/cp -c -p -R` 保留。所有文件仍参与 inventory、冲突判断和 candidate hash。
- 单次事务保存 current 文件的 inode、ctimeNs、mtimeNs、size、mode 与内容 digest；后续 current/backup 检查只有身份变化时才重读内容。相同大小且恢复 mtime 的并发编辑仍因 ctime/inode 变化而重新 hash 并失败关闭。
- `.expo-harmony-generation/tree-hash-cache-v1.json` 持久化上述身份与 digest。缓存必须是普通文件且 schema、相对路径、数值和 SHA-256 全部有效；损坏或 symlink 缓存自动回退全量 hash，外部 symlink 目标不读取、不修改。
- 仅当新旧 93 个受管 state 完全相等时启用 fast no-op。该路径逐级检查受管路径祖先，不允许 managed symlink；随后保留现有 Harmony 树，不 clone、替换或清理 70k 个未受管 OHPM 文件。任何配置、模块或受管 state 变化仍进入完整 merge/hash/backup/install/recovery 路径。

专项回归为 52/52，覆盖 OHPM clone、digest 复用、candidate clone 摘要、持久缓存命中、损坏/软链缓存回退、fast no-op 不扫描 OHPM、同尺寸并发修改、权限、恢复和故障回滚。

最终受控候选：

- `outputs/sdk54/b01-autolinking-fix-20261105/expo-oh-expo-modules-autolinking-3.0.28.tgz`
- SHA-256：`9e252d1a9d4bf211a5a510faf19efdaa6503415844f464ffd7a14a82c39a2b65`

最终真实结果：

| 指标 | paired baseline | 最终 | 改善 |
| --- | ---: | ---: | ---: |
| 编译后 no-op prebuild | 64.82 s | 中位数 2.77 s，最大 3.27 s | 95.73% |
| 随后 Hvigor | 65.07 s | 11.57 s | 82.22% |
| CMake | 13.512 s | 7.039 s | 47.91% |
| Ninja | 47.106 s | 0.538 s | 98.86% |
| prebuild + Hvigor | 129.89 s | 14.34 s | 88.96% |

正式性能口径为一次预热加五次样本。Hvigor 改写构建缓存后的首轮 4.96 s 作为预热；正式样本为 3.27、2.46、2.52、2.77、2.98 s，中位数 2.77 s、最大 3.27 s。prebuild 绝对门槛 `<= 30 s` 与相对改善 `>= 80%` 均通过。代表性样本的 merge 为 0.159 s、transaction 为 2.705 s；stream read 57 次 / 154,980,516 bytes，未再复制、chmod 或 utimes 70k 个 OHPM 文件。随后 Ninja 仅 538 ms，无 140 步 C/C++ 重编译回归。

五次正式样本的 RSS 中位数约 744.7 MiB、最大约 766.4 MiB；Node external 为约 303.1～320.6 MiB。内存不随 3.4 GiB Harmony 树线性增长，但持久 hash cache 会增加约 25 MiB 文件和约 72k 项内存索引，已如实保留在诊断证据中。

设备复验使用模拟器 `127.0.0.1:5555`、HarmonyOS `6.0.0.112`。最终 HAP SHA-256 为 `5e8baac6c493c28e9929ab2bc02df685415bf42576a01a296cb6e9bf7db43fdd`；PID hilog 包含 `JS bundle executed successfully` 和 `Running "main"`，致命模式 0；截图正常显示 blank 模板文案。截图 SHA-256 为 `19ff73c48f72d123475eebd718514d555a0e526c97509d4b65423c88d041bc2e`。

机器可重算汇总：`outputs/sdk54/b01-current-diagnostics-20261105/validation-summary.json`，SHA-256 `fc2414e618caab5418765da1c005f8e28c286bc9da942fd6089edf0ebdbb7c1a`。编译后 no-op 场景 B 自验结论为 PASS；配置变化、模块增删、clean、Release、旧/新交错基线和 staging 物理峰值仍按原性能规范保持未完成，不能据此关闭整个 B-01。阶段关闭等待 A 对源码、候选和证据复核。

## 2026-11-10 稀疏受管事务与最终矩阵

11 月 5 日 fast no-op 关闭了无变化路径，但配置/模块变化仍会扫描并复制 70k OHPM 文件。最终实现新增受管文件稀疏事务：generation state 只规划自身拥有的文件；事务以 before/after SHA-256 和 mode 建立逐文件 journal、备份、原子提交和恢复。未受管 OHPM、`.cxx`、`entry/build`、`.hvigor` 及 Harmony 根 inode 均保持不变。受管并发编辑、提交前后故障和真实子进程退出恢复均失败关闭或完整回滚。

最终候选：

- Autolinking：`outputs/sdk54/b01-autolinking-fix-20261110/expo-oh-expo-modules-autolinking-3.0.28.tgz`
- SHA-256：`e9ea310c2ae3f043cf3c9420df26b43065ae8c6f4b3b3a334e33e031d5212698`
- 配套 CLI：`outputs/sdk54/b03-cli-export-harmony-20261110/expo-oh-expo-cli-54.0.28.tgz`
- SHA-256：`2474adcd5bc8c9a52819d6763a44f733328b284291207f69eba40b58555b5e9e`

| 场景 | 同环境 baseline 中位数 | 最终中位数 / 最大值 | 结论 |
| --- | ---: | ---: | --- |
| Debug 编译后 no-op | 93.40 s | 1.54 / 1.64 s | 改善 98.35%，PASS |
| Release 编译后 no-op | 50.22 s | 1.76 / 2.30 s | 改善 96.50%，PASS |
| 单项合法配置变化 | 164.26 s | 5.92 / 6.56 s | 改善 96.40%，PASS |
| 已支持模块移除 | 168.76 s | 3.91 / 4.85 s | 改善 97.68%，PASS |
| 已支持模块增加 | — | 1.92 / 2.07 s | 生成图、state、CMake 恢复，PASS |
| clean | 43.31 s | 18.50 / 20.17 s | 72,708 文件完整备份，PASS |
| 首次生成 | 2.53 s | 3.12 s | 回退 0.60 s，小于允许 2 s，PASS |
| 无构建产物重复 | 4.34 s | 5.27 s | 回退 0.93 s，小于允许 2 s，PASS |

配置变化后 Hvigor 7.68 s，CMake 14 ms、Ninja 490 ms；最终 Debug no-op 后 Hvigor 2.94 s、Ninja 309 ms；Release no-op 后 Hvigor 3.53 s、Ninja 953 ms。成本未转移到重新编译。

clean 每轮 backup 约 3.418 GB 逻辑数据、3.735 GB allocated，72,708 文件和 17 个软链；证据记录逻辑与物理口径。真实临时 APFS 卷验证了跨设备 fallback：源/目标 device 不同，字节、mode、mtimeNs 完全一致且 inode 独立；镜像已卸载删除。

专项回归 61/61。最终模拟器 `127.0.0.1:5557` 上 Debug 与 Release 均安装启动、页面可见；Release hilog 明确加载 `bundle.harmony.js`，无本次 Metro 监听。最终机器汇总：`outputs/sdk54/b01-final-validation-20261110/validation-summary.json`，SHA-256 `8ef5c887cd284e0406142c42543571cdc75d6e838c9d61f9ce299851ef4ce0bf`。B-01 B 自验 PASS，等待 A 交叉复核。
