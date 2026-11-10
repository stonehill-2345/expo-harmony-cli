# SDK54 A/B 并行交付：G0-B 基线与 B-02.1 验收

日期：2026-10-30。负责人：B。复核人：A（待复核）。

结论：**B 的源码、工具环境和 workspace 候选身份已冻结；G0 整体仍为 BLOCKED，B-02 全任务仍为 NOT_RUN。** 当前缺少 A 的交叉复核、完整外部候选、可连接设备和正式性能采样所需的受控资源。已完成的 B-02.1 仅证明落盘报告门禁的首批反例，不代表统一 runner、V-01 或 V-02 已关闭。

## 来源与工作区

- 分支：`feat/V1.7.0`；基点：`19a0375cff7e0ef3bc62d54fd5ed57b913bb2000`。
- 开工前 `git status --short --branch` 干净，且与 `origin/feat/V1.7.0` 无 ahead/behind。
- B 使用 `/Users/chensq/Desktop/2345/expo-harmony-cli`；A 不得复用该目录写文件，须使用独立 checkout/worktree。
- 本轮未创建分支/worktree，未执行 git add、commit、push、publish、tag 或 registry 写入。
- A/B 总规划 SHA-256：`50099d1165da4b2b43a4dcbd257062ee7b64763eeffcc875d9afb9c4bb427025`。
- 性能设计 SHA-256：`e5dd0f189e11adee8859b20920f533d24968da1e2b681d75578505091c172b5a`。
- 阶段台账 SHA-256：`ca40bb9683060850176a5517937616e5be004ac5d9adaa44d04973ec4daffdef`。
- 历史证据可用性清单 SHA-256：`7671a7262fea57ab9564805f455d1ac5cef5daecf3b41f1dbda1db088be88407`。

## 环境与资源

| 项目 | 实际结果 | 状态 |
| --- | --- | --- |
| Node / pnpm / npm | `v22.20.0` / `10.19.0` / `10.9.3` | PASS |
| 宿主 | macOS 26.3，arm64 | PASS |
| Ninja | `/opt/homebrew/bin/ninja`，`1.13.1` | PASS |
| HDC | `/Users/chensq/Library/OpenHarmony/Sdk/20/toolchains/hdc`；重启 server 后 target `127.0.0.1:5557` 为 `Connected` | PASS：设备驱动 smoke 已执行；完整候选验收仍未运行 |
| 可用磁盘 | 仓库和 `/tmp` 同卷，约 15 GiB 可用、使用率 97% | BLOCKED：正式 Debug/Release 五次矩阵前须重新评估并留足快照、staging 和构建峰值空间 |
| 并发进程盘点 | 沙箱内 `pgrep` 因系统服务不可用未取得可靠进程清单 | BLOCKED：正式 benchmark 前须在可读取进程状态的受控窗口重查 |
| 历史原始证据 | 仓库内不存在 `outputs/sdk54/`；既有清单仍为 80 个工件中 20 个可验证、60 个缺失 | BLOCKED：不得补造旧日志 |

依赖安装初次暴露当前 `node_modules` 仍是旧链接状态，缺少 autolinking 新增的直接依赖 `json5`。按冻结锁恢复依赖时，workspace `prepare` 清理/改写的三个已跟踪 `build/` 目录已恢复；最终 Git 源码状态未因此产生修改。

## 候选身份

执行：

```bash
node scripts/sdk54/pack-packages.mjs \
  --round G0-B \
  --output outputs/sdk54/ai-e2e/20261030-ab-b-g0/candidate
```

- 结果：14 个 workspace 包，`failures: []`。
- 候选 manifest：`outputs/sdk54/ai-e2e/20261030-ab-b-g0/candidate/manifest.json`。
- manifest SHA-256：`283118c2386bc51e1e50fb2a203d015eefa00d80a1893a263ccf22ba6c2c5ed2`。
- 目录逻辑大小：约 4.8 MiB。
- 该集合不含 `stage-e2e-packages.mjs` 要求的 11 个外部包，不是完整集成或设备候选，不能用于 M5/V/性能 PASS。

## B-02.1～B-02.6：报告、进程、schema、预检、编排与设备驱动

新增范围：

- `scripts/sdk54/ai-e2e/report.mjs`
- `scripts/sdk54/ai-e2e/process.mjs`
- `scripts/sdk54/ai-e2e/schema.mjs`
- `scripts/sdk54/ai-e2e/preflight.mjs`
- `scripts/sdk54/ai-e2e/run.mjs`
- `scripts/sdk54/ai-e2e/device.mjs`
- `scripts/sdk54/ai-e2e/cases/registry.json`
- `scripts/sdk54/ai-e2e/schemas/*.schema.json`
- `scripts/sdk54/__tests__/ai-e2e-report.test.mjs`
- `scripts/sdk54/__tests__/ai-e2e-process.test.mjs`
- `scripts/sdk54/__tests__/ai-e2e-schema.test.mjs`
- `scripts/sdk54/__tests__/ai-e2e-preflight.test.mjs`
- `scripts/sdk54/__tests__/ai-e2e-run.test.mjs`
- `scripts/sdk54/__tests__/ai-e2e-device.test.mjs`

门禁从仓库内版本化 registry 推导 V-01 必达集合，读取 run manifest、case set、candidate manifest、results 和证据文件后重新计算 `canClose`。它不信任调用方手填的汇总结论。

进程原语只接受 argv 数组并显式关闭 shell；stdout/stderr 分文件保存并计算 SHA-256。超时或 Abort 只终止本次子进程组，分别记录 `timedOut` / `interrupted`，保留已产生的部分日志。

schema 同时提供运行时字段校验和三份 JSON Schema。report 已接入校验器；畸形 results/case-set/manifest 会进入错误集合，不因错误类型导致未记录的异常退出。`PASS` 必须有身份、时间和证据，`NOT_RUN` 可以保留空时间与空证据。

预检逐字节核对 case-set 与 candidate hash，要求源码状态干净、Node/npm/pnpm 为绝对可执行文件、消费目录位于源码仓库外；必达集合声明设备用例时必须提供明确 target 和平台版本。预检为只读操作，不创建或清理消费目录。

最小 runner 按 registry/case-set 顺序串行执行 manifest 的 argv 数组，逐 case 原子更新 `results.json`，保存命令日志及显式证据 hash，并生成 `closure-report.json`。预检失败时所有可安全读取的必达案例落盘为 `BLOCKED` 且不执行命令；缺命令保持 `NOT_RUN`，命令或证据失败记 `FAIL`。case-set 路径在 preflight 前不会被解析，越界或畸形外部文件只形成失败报告。

设备驱动使用独立 HDC 进程，不导入产品 CLI helper。它要求明确选择已连接 target，按 bundle 查询唯一 PID，按 PID 保存 hilog，通过本次命名的远端文件采集并校验 JPEG 截图，最后只删除该远端临时截图；清理应用时只对指定 target/bundle 执行 `aa force-stop`。截图格式按真实 `snapshot_display` 的 `.jpeg` 要求实现，输出目录在 HDC 边界统一规范化为绝对路径。

测试按 RED→GREEN 验证：

- 缺必达结果不能关闭。
- 调用方删减 case-set 并同步重算 case-set/results hash 仍不能关闭。
- 同一 case/attempt 重复不能关闭。
- 候选 hash 或证据 hash 错误不能关闭。
- 空截图、缺设备、超时 PASS、中断 PASS 不能关闭。
- 独立 Node 子进程可从落盘内容重算有效/无效结论并返回对应退出码。

验证命令：

```bash
node --test scripts/sdk54/__tests__/ai-e2e-report.test.mjs
```

实际：报告、进程、schema、预检、runner 和设备驱动专项合计 29 pass、0 fail。

### 真实模拟器设备驱动 smoke

- target：`127.0.0.1:5557`，TCP Connected。
- 系统：HarmonyOS emulator `6.1.0.115(SP11DEVC00E115R4P11)`，aarch64。
- 已安装测试 bundle：`dev.expo.sdk54blankmanual@1.0.0`，入口 `EntryAbility`。
- 执行：只启动该 bundle，取得 PID `12590`，采集 PID 级 hilog 与截图，随后只停止该 bundle。
- 截图：`outputs/sdk54/ai-e2e/20261030-ab-b-device-live-4/device/blank-manual-live.jpeg`，JPEG 2210×2416，98,730 bytes，SHA-256 `1087d1bb9722934059aa4cc7eab2303866144e8dab1815e3ad28d9566318de58`。
- hilog：59,733 bytes，SHA-256 `8741d184d35125f17d5e71e74d5b26f0b644c8773e12715029850d9b8ff41061`。
- UI 人工复核：blank 首屏显示 `Open up App.tsx to start working on your app!`，不是白屏。
- 清理复核：停止后 `pidof dev.expo.sdk54blankmanual` 为空，mission 列表为空。

该 smoke 验证设备驱动及模拟器行为，不绑定当前 14 包 workspace 候选，也未使用 A 的正式夹具，因此不能关闭 B-02、V-01/V-02 或 M5。

## 回归验证

| 命令 | 实际结果 |
| --- | --- |
| `pnpm type-check` | PASS，exit 0 |
| `pnpm test` | PASS，49 files、471 tests 全部通过 |
| `pnpm test:sdk54-tools` | PASS，1096 tests：1076 pass、20 skip、0 fail |
| `git diff --check` | PASS，exit 0 |

SDK54 工具首次在沙箱内运行时出现 12 项失败：1 项因沙箱禁止监听 `127.0.0.1`，11 项因 `.tmp/sdk54/tooling` 尚未安装 Kotlin/Groovy/语法工具。执行仓库固定的 `pnpm sdk54:tools:setup` 后，11 项专项 42/42 通过；candidate registry 在允许本地回环监听的环境 1/1 通过；最后在同一允许回环环境重跑全套得到上述 0 fail。该过程没有修改受管源码，工具目录约 74 MiB 且受仓库忽略规则管理。

schema 接线后的首次全套另出现 2 个既有测试清理临时 `.git` 目录时的 `ENOTEMPTY`；对应文件单独重跑 12/12、6/6 通过，随后完整套件重跑得到上述 0 fail。未修改这些无关测试以掩盖时序抖动。

## 未完成与下一步

1. A 复核本报告的源码基点、文件边界、设备排期和阻塞项；完成前 G0 不关闭。
2. B-02 工具实现子项已完成；真实 A 夹具接入、设备执行与复核仍未运行，因此 B-02 整体保持 NOT_RUN，待 HDC/设备资源恢复后执行。
3. B-01 先补 Ninja 失效输入的可重放诊断；正式五次交错 benchmark 等待磁盘余量、进程可见性和独占窗口满足。
4. 获取并核验 11 个外部 tgz 后生成完整候选；不得把当前 14 包 workspace 集合升级为集成 PASS。
5. HDC target 与设备驱动已恢复；待完整候选、A 夹具和设备排期确定后执行正式设备用例。
