# SDK54 prebuild 性能优化：A 批实施与部分验收

日期：2026-10-29。结论：**A 批文件处理优化已落地，安全与 blank 功能回归通过；整体性能目标未达，不标记全计划完成。**

## 实现与保护边界

- `generationState.ts` 先收集路径与 stat，按需读取状态及参与三方合并的 JSON；未知 JSON 不解析，大文件不整体聚合到 Buffer。
- 二进制流式计算摘要；结果保留文件描述或生成内容。使用 `COPYFILE_FICLONE` 尝试独立复制，系统不支持时按 Node 的非 FORCE 语义回退复制，不使用硬链接。
- 跳过已相同的 staging 内容；保留现有文件模式和未变内容的时间戳，避免无效写入。`nativeProject.ts` 不再无条件重写未变的 EntryAbility。
- `generationTransaction.ts` 每批最多 8 路读取，仍按原顺序拼接摘要；全部读取 settle 后才处理失败。每个提交/备份/恢复校验仍独立读取完整树，保持 state schemaVersion 1、hashVersion 2 和旧日志恢复。
- 未排除 `.hvigor`、`.cxx`、`build`、OHPM 树，未改变 clean 备份与人工修改保护。

新增可复用工具为 `scripts/sdk54/benchmark-prebuild.mjs`，仅操作自身创建、位于仓库外的消费目录；拒绝路径别名、配置/快照软链、与输出目录重叠和有事务锁的恢复。`prebuild-diagnostics.cjs` 仅是 benchmark preload，不进入发布 CLI。

## 候选与测量口径

起点为分支 `feat/V1.7.0` 的 commit `733e395bde509254e92c8344df4525743ba56f18` 加本轮之前的未提交修复。起始 patch、文件 SHA256 和原生成器源码已冻结；此前修改的其他文件保持原指纹。

最终候选：`candidate/autolinking-v2.tgz`，发行身份 `@expo-oh/expo-modules-autolinking@3.0.28`，SHA256 `13ef3f5fe08dea04622efb8725f9b9b16ff6c25417f1b420c5f4341154b64441`。v1 包仅保留作过程证据，不是最终候选。其余依赖沿用此前已验证候选。

npm、pnpm 均实际安装该 tgz，并对 271 个包内文件核对字节。npm 会把 5 个模板 `.gitignore` 改名为 `.npmignore`，已逐项记录映射并核对内容；pnpm 保留原名。实际加载路径与包身份记录在 `candidate-identity.json`。

基准不与 Hvigor/Metro 编译同时运行；打包、安装、快照恢复均不纳入 CLI prebuild 时间。使用 Node 23.5.0 / macOS arm64。没有清理系统缓存。小场景按版本分块执行，并非计划要求的完整交错矩阵；所以本轮仍不算全部性能验收。

### 首次生成与无构建产物：每版预热一次，正式五次

| 场景 | 旧版中位数 / 最大值 | A 批中位数 / 最大值 | 判定 |
| --- | --- | --- | --- |
| 首次生成 | 1.112 / 1.247 s | 0.790 / 0.872 s | 未见规定之外的回退 |
| 无构建产物重复生成 | 1.137 / 1.208 s | 1.119 / 1.340 s | 未见规定之外的回退 |

所有正式样本及单次日志保存在 `baseline-small-matrix/` 与 `candidate-small-matrix/`。无构建产物重复生成保持目标目录 inode 不变。独立 SHA256、mode、目录/软链清单比对证明新旧生成树完全一致，见 `output-equivalence.json`。

### 真实 Debug 编译后：诊断样本，不能当作五次中位数

| 指标 | 旧版 | A 批 |
| --- | --- | --- |
| 预热运行 | 203.31 s | 133.53 s |
| 随后一次运行 | 184.42 s | 129.85 s |
| 两次观测的 RSS 峰值范围 | 1,690–2,220 MiB | 404–483 MiB |
| Node external 峰值 | 约 3,428 MiB | 约 301 MiB |

随后一次观测耗时下降约 29.6%，**不满足 ≤30 秒且改善 ≥80% 的门槛**。这里没有把两次结果包装成正式中位数或 P95。

快照约 3.19 GiB、72,707 个文件；其中 OHPM 树 70,978 个文件、约 699 MiB，三处候选构建缓存合计 1,613 个文件、约 2.37 GiB。小文件数量与独立完整校验是剩余成本，不能只凭目录名跳过。

诊断记录了 Promise 文件 API 与 read streams 的逻辑字节及调用时间、merge/transaction 总时长、Node 内存与 resourceUsage；没有覆盖全部同步/子进程 IO，也没有测物理磁盘写入。并行操作的耗时相加会超过 wall time。记录的 allocatedBytes 不能证明 APFS 共享块占用或 staging 峰值，不能宣称克隆实际零复制。

另用独立子进程处理 64 MiB / 512 MiB 未受管二进制并核对完整 SHA256：旧版 external 峰值约 99 / 548 MiB，新版约 34 / 36 MiB。采样覆盖合并及随后的流式验证，不将测试加载器自身开销算作生成器增长。

## 功能、安全与设备验收

- 安全专项 47 项通过：大文件按需处理、原始 JSON、600/755 模式、相同 size/mtime 的并发内容修改、独立 inode、克隆回退模型、ENOSPC/EACCES/EIO 中途复制故障与完整回滚、旧日志恢复、并行摘要顺序及读取失败后的收尾。复制故障与不支持克隆为注入边界验证，非真实跨文件系统测试。
- `pnpm check` 退出 0；SDK54 工具测试 1,061 项中 1,041 通过、20 按既有条件跳过、0 失败。`pnpm sdk54:release:check` 7 项通过；最后的 benchmark 安全专项和 `git diff --check` 通过。
- 单项版本配置由 `1.0.0` 改为 `1.0.1`，从原编译快照恢复后 prebuild 成功，153.85 s；未变 EntryAbility 的测得时间戳一致。随后构建成功，HAP `module.json` 确认实际版本为 `1.0.1`。
- 上述增量构建 wall time 80.94 s，Ninja 约 62.30 s；不能据此宣称缓存充分复用。缺少前后版本配对五次合计数据，**增量构建性能门槛仍未通过验收**。不能仅凭保留时间戳推断不会重新编译。
- nova 16 Pro / `127.0.0.1:5555`：npm Debug 的首屏、热更新、冷启动通过。新 pnpm 工程用独立 bundle `dev.expo.prebuildperfrel` 构建 unsigned Release，关闭本轮 Metro、删除本轮转发后冷启动通过。Release 构建日志约 2 min 23.6 s。
- 四次设备核验均检查目标 bundle 的 focused/visible 窗口、精确 UI 文本、PNG magic 与非空截图；HAP 指纹、内嵌 Release JS 文字、设备窗口与布局共同归档。这里验证的是模拟器 unsigned Release，不是签名真机分发。
- 本轮未重跑 default 模板构建；既有 `ExpoImage/default` 原生视图缺口仍属于 M7.4，没有用 blank 或性能结果关闭它。

## 未关闭事项与 B 批判定

B 批不启用：现有项目缺乏可靠逐文件缓存归属，生成锁不能约束外部 DevEco 写入，rename/inode 也不能替代人工字节修改检测。没有闭合这些设计门之前，缓存分离会弱化原有保护，故保留 A 批结果，详见设计第 7 节。

仍未完成：编译后 Debug/Release、配置、模块增删与 clean 的完整交错五次矩阵；前后版本 prebuild＋增量构建合计中位数；真实跨文件系统复制；staging 磁盘峰值。后续应先定位 62 秒 Ninja 重编译的失效输入，再评估具有明确归属与写入协调的缓存生命周期。目标不降低。

## 证据与现场

证据根目录：[outputs/sdk54/prebuild-performance/20261029](../../outputs/sdk54/prebuild-performance/20261029/)。入口包括 `source-start.json`、`source-end.json`、`candidate-identity.json`、`output-equivalence.json`、各 `benchmark.json`、`memory-*.json`、`config-change.json`、`hap-*.json`、`emulator/verification.json`、`sha256-index.json`。

独立消费目录：

- `/Users/zhansh/project/sdk54-prebuild-perf-20261029/project`：npm、Debug 与原编译快照。
- `/Users/zhansh/project/sdk54-prebuild-pnpm-20261029`：pnpm 与新 Release。

此前验收工程未改动；本轮临时 registry 和 Metro 已停止，HDC 转发列表为空，模拟器保留在 Release 首屏。没有 git add、提交、推送或发布。历史缺失证据没有补造或重新判定。
