# SDK54 B-04：Harmony run、设备与失败矩阵

日期：2026-11-10。负责人：B。状态：**B-04 自验 PASS；default/A 模块候选仍 BLOCKED，GB/M5 不可关闭。**

## 候选与环境

- CLI：`outputs/sdk54/b03-cli-export-harmony-20261110/expo-oh-expo-cli-54.0.28.tgz`，SHA-256 `2474adcd5bc8c9a52819d6763a44f733328b284291207f69eba40b58555b5e9e`。
- Autolinking：`outputs/sdk54/b01-autolinking-fix-20261110/expo-oh-expo-modules-autolinking-3.0.28.tgz`，SHA-256 `e9ea310c2ae3f043cf3c9420df26b43065ae8c6f4b3b3a334e33e031d5212698`。
- Node 22.20.0，pnpm 10.19.0，npm 10.9.3，Hvigor 6.24.4，HDC 3.2.0b。
- 模拟器 `127.0.0.1:5557`，HarmonyOS `6.0.0.112(SP3DEVC00E112R4P11)`，OpenHarmony `6.0.1.112`。

## blank 四矩阵

| 包管理器 | 配置 | HAP SHA-256 | 运行结果 |
| --- | --- | --- | --- |
| pnpm | Debug | `b52537b011228ec18682c6cbd39d91d624e86f4d7c8e62e855ca24e9c29f03d7` | Metro bundle 执行、`Running "main"`、首屏正确 |
| pnpm | Release | `993613db2d1fdd6b46539f175f7eefde0b33ad15b9152ad165fa09d5fc6e46f4` | HAP 内嵌 bundle，脱离本次 Metro 冷启动通过 |
| npm | Debug | `42190823979af5f9583751c5eeada3921b81ace85b057b4745dc497ff4ab8bd7` | Metro bundle 执行、`Running "main"`、首屏正确 |
| npm | Release | `e5ce4c8b8a5eb9b64a40fd43da8cfea3e19e9ed62b6c9feda0f868714184ad41` | `resources/rawfile/bundle.harmony.js` 存在，脱离本次 Metro 冷启动通过 |

四张截图均为 1320×2856 JPEG，并人工核验 blank 原始文案可见。Release hilog 使用 `bundle.harmony.js`；规定致命模式计数为 0。真实无签名配置构建产生预期 `entry-default-unsigned.hap`，在模拟器安装和启动通过；签名真机不由本轮模拟器结果替代，保持 `NOT_RUN`。

## 刷新与路径

- Debug 派生案例把文案改为 `Fast Refresh Verified`，页面无重装更新；恢复原文案后页面再次更新。两次截图 SHA-256 分别为 `29c8194385b94f90bed4ecbf102e2eeabbb0a4bd7c11cbf014f0c22feb817e7a`、`5239436aed1cb8fddb52c89a032ee0076beb75d3ac2cd4993513bb18cd6bf262`。
- npm 工程路径 `/private/tmp/sdk54 b04 npm space 20261110` 包含空格，Release 构建、安装、启动和截图通过；HAP SHA-256 `f2d25af2716f740102b223e81290c0a9e6226e4b10ab85e92e7d67b7a5543ae0`。

## 失败关闭

- 用户已有 Metro 占用 8081 时，CI 模式明确报告需选择其他端口并退出 1；测试前后 PID 均为 `95403`，未终止用户进程。
- 指定未连接 target `127.0.0.1:5999` 时明确失败。
- 真实创建 8093 旧 reverse 后，CLI 只删除并重建相同 target/端口映射，不触碰其他映射。
- CLI primitive 16/16 通过，覆盖无设备、多设备、HDC server 重启/重试/超时，以及安装和启动在 HDC 主机退出码 0、设备输出 `[Fail]` 时失败关闭。
- 清理后 8094 无监听，设备 reverse 列表为 `[Empty]`，用户 8081 PID 仍为 `95403`。

## 结论与边界

机器汇总：`outputs/sdk54/b04-final-20261110/validation.json`，SHA-256 `7c650aa6689202b6fa5ecda89413d01fff32627b53d5c917fd5669dc03f847d1`。十二项 B-04 blank/CLI/回归断言全部为 `true`。

最终回归：受影响 CLI 5 suites/39 tests；Harmony 生成/事务/benchmark/Ninja 专项 67/67；完整 SDK54 工具 1110 tests（1090 pass、20 skip、0 fail）；`git diff --check` 通过。受控 pack 重新生成的 Autolinking 与 CLI tgz 均与最终候选逐字节同 hash，记录于 `outputs/sdk54/b04-final-20261110/controlled-pack-verification.json`。

当前没有 A 的 M4/M7 default 模块候选、交接 manifest 或固定夹具，不能执行并关闭 default 原样图片、Tabs/Modal/返回及 ExpoImage 解阻。该项记录为 `BLOCKED_A_CANDIDATE_UNAVAILABLE`；不以 blank PASS 替代，也不阻止登记 B-04 的 B 侧工具与 blank 矩阵 PASS。
