# SDK54 M3 模块作者契约验收记录

状态：**M3 已接受并关闭，原单元 5/5（100%）**。阶段进度与证据哈希见 `sdk54-stage-acceptance.json` 和 `sdk54-stage-progress.json`。

## 本轮独立审查补充

- Core 初始化失败遗留视图配置的问题已先在模拟器复现并修复，回滚保留原有配置；真实 Hermes 测试 20 项及异步测试 8 项通过，远端退出码均为 0，见 `core-device-review-green.log`。
- 非有限值在旧 HAP 上的设备红测见 `nonfinite-device-red-review.tsx` 和 `nonfinite-device-red-review.log`；修复后两套设备探针均拒绝 NaN 和正负无穷。首次新 HAP 构建暴露编译器不支持捕获结构化绑定，失败日志保留于 `native-final-npm/hvigor.log`，修复后重新消费并构建。
- 最终候选 `runtime-independent-review/release.json` SHA-256 `8ccbf3a6b6f923e9695e353e80039a5f4ce8df2ff640587b6a20a268f377f852`；最终 fixture SHA-256 `f9da25a5d393acaa1e391afd4ff28bd39b397aec633626f14ecc1e67b2f24cd7`。双包管理器各 9 项消费检查、M1 回归和新候选未知导航版本负例通过。
- npm HAP SHA-256 `8268a97af75acc4e3af0e11d717c5d2d041872736ef4782a94ab4351d17e9e8e`，bundle SHA-256 `6b70ca566d1953cd9dcafb2365cc04ff59c70dd919a238046d5de795e2709e8d`，设备 PID 30151；pnpm HAP SHA-256 `495263cd495b1737ecfe7b2fe81cb91c4118f79f7d403bfceb6d52daade2d4d3`，bundle SHA-256 `956719f0a0f49eb542dd8f718c184fb48f36bed92e04932140837f62a038766b`，设备 PID 31366。
- 两套 HAP 的安装、清理、启动、单 PID 日志和固定 bundle 的两次 HTTP 响应均留证；各自消费工程的 Metro 重建产物与设备使用的 bundle 字节一致。两个 runtime 各 11 项断言通过，包含 SharedRef、退订、视图销毁与异步取消；旧 runtime 保留资源在 reload 后恰好析构一次，新资源身份不同且释放一次。
- `review3-evidence-verification.json` SHA-256 `ff5ba0720e2907461617258226e4dd5ae5d7035bd7690a44a1e3f1e8c8a7188d`，由 `node scripts/sdk54/verify-m3-review-evidence.mjs` 生成；独立只读复核确认原单元、A01 至 A05 和退出产物。工作区类型检查、471 项测试、5 项打包测试通过；固定解析器环境下 SDK54 工具回归 972 通过、0 失败、20 跳过。
- 设备安装后的 HAP 全包文件受权限保护，不能直接读取其哈希；身份由主机 HAP 哈希、安装路径和成功记录、包名、进程及 HAP 内原生标识共同支持。设备与主机时钟在运行后测得相差约一秒，运行时精确偏差未记录；不将该测量当作运行时无跳变的证明。未签名 Debug 模拟器结果不证明真实设备签名或 Release 行为。

## 历史交付与边界

- Autolinking 固定 Expo、RNOH 与导航兼容元数据的优先级，保留 npm 实际身份与 OHPM、C++、ETS 身份；原生图冲突和缺失源文件在写入前拒绝。
- 第三方探针及作者文档见 `packages/expo-modules-core/harmony/m3-fixture/` 和 `docs/harmony-module-authoring.md`。探针没有加入中央发行名单。
- 固定候选 `outputs/sdk54/ai-e2e/20261028-m3-author-contract/runtime-alias-fixed/release.json` SHA-256：`3bfb790e225b71f7cb3939bfffc4b18664e4a73817c3987728697dfae491648f`。独立复核见同目录 `review-alias-fixed.md`。
- DevEco arm64 工具链已编译探针 C++ 调用方，见同目录 `native-author-evidence.md`。真实 OHPM/Hvigor 构建及输入完整性检查通过，报告为 `native-resumed/native-build-report.json`；未签名 Debug HAP SHA-256：`193aa35dc426e2ac5ef0c6c7c1000b57feb1f655547de965a697bfe7fc416cdb`。
- `consumers-resumed/author-consumer-report.json` 记录 npm、pnpm 各 9 项真实消费检查通过；覆盖安装、生成幂等、缺源、冲突、传递引用、移除、悬空插件及重装。基础 M1 双包管理器回归同时通过。
- `navigation-negative.json` 记录真实 CLI 遇到未知 screens 版本时报错，原工程树不变且依赖恢复。
- `review-consumers-resumed.md` 独立复核候选、双包管理器消费和负例，确认 M3-01/02/03 可登记，M3-A02/A04 通过。
- 工作区类型检查、471 项测试、5 项打包测试通过；SDK54 工具回归 987 项通过、1 项跳过。包审计与补丁审计通过。
- 模拟器修复后的工作区类型检查和 471 项测试再次通过。SDK54 全量工具重跑的并行版本出现语法缓存竞争；顺序版本最初为 968 通过、2 失败、20 跳过，失败源于临时 CMake 解析器及 `shfmt` 缺失。恢复两者后，相关专项 11/11 通过，全量顺序回归 970 通过、0 失败、20 跳过。固定 Expo 源码缓存的完整与按需下载均因连接中断失败；原失败日志保留。
- 在 pnpm 消费工程以离线 Metro 请求 `index.bundle?platform=harmony&dev=true&minify=false` 成功，生成 734 个模块的 bundle，SHA-256 为 `dd7135d1bbd8d25a8844e09de5a88654e311cc7dac5f71aa52b7353ceaa64c92`。其中包含探针模块和 reload 标记；这仅验证打包，不能代替设备运行。
- Pura 90 模拟器（HarmonyOS 6.1.0，API 23）实际安装并启动了未签名 Debug HAP。首次运行因 C++ `ArkTSTurboModule` 缺少同名 ArkTS 工厂而失败，证据为 `emulator-registration-red.log`；第二次运行暴露全局绑定晚于 JS 首次求值，证据为 `emulator-view-order-device-red.log`。两个问题均已补红绿回归并修复。
- 修复后的 pnpm 消费工程 HAP 在模拟器完成两次 runtime 的全部 9 项同步、异步、事件、资源和视图断言，reload 取消与失效视图回调顺序经 `check-device.cjs` 验证通过；日志 `emulator-m3-order-hilog.log` SHA-256 为 `061067f21b853e21bd7d17e9ccd3f4a85864b5276c5ef01002292787f5e168a1`，对应 HAP SHA-256 为 `2242bc2d8ab3f301023da09472fa61a2513ce090ab3ba1741689aa536545167d`。
- npm 消费工程同样通过两次 runtime 的全部断言及日志检查；日志 `emulator-m3-npm-hilog.log` SHA-256 为 `154cd00f9299a073961646be3cbeb05d8a4aed8872e0ba75f9a1689a7c485756`，对应 HAP SHA-256 为 `6b1dc936a61a3aba8469a1b8b0f1c989474c8a0a91d0fdcd0b9b041c25ad2661`。两套探针包的 JS、C++ 注册和 ETS 注册内容哈希一致；包内 README 因消除过时设备状态而不同。
- `node scripts/sdk54/verify-m3-emulator-evidence.mjs --live` 自检两套消费及原生构建报告的候选绑定、命令日志哈希、HAP 内应用身份及插件标记、探针包完整性和设备日志，并核对已安装包、当前源码、依赖树及原生树；最新结果保存为 `emulator-evidence-hap-check.json`。此自检不能代替最终独立审查，设备日志本身也不携带 HAP 哈希。
- 消费工程 `build-profile.json5` 的 `signingConfigs` 为空；该模拟器接受未签名 Debug HAP，真实设备的签名要求尚未验证。

## 验收进度

| 原单元或验收项 | 状态 |
| --- | --- |
| M3-01 / M3-03 | PASS，已登记。 |
| M3-02 / M3-A02 / M3-A04 | PASS；M3-02 已登记。 |
| M3-04 / M3-05 / M3-A01 / M3-A05 | PASS，最终候选、双消费工程和模拟器生命周期证据通过独立复核。 |
| M3-A03 | PASS，双消费工程移除、传递引用、重装及重装后的设备行为通过。 |

## 失败与边缘情况

- RNOH 宿主的 `harmony.autolinking: null` 表示停用；红绿回归及失败候选保留在本轮证据目录。
- screens 上游包 `@react-native-ohos/react-native-screens@4.9.0` 与发行别名 `@expo-oh/react-native-screens@4.9.1` 分别严格匹配。未知版本报错，不静默跳过。
- RNOH 的 `ArkTSTurboModule` 必须配套同名 ArkTS 工厂，即使方法由 C++ 实现；首次模拟器运行揭示了编译和宿主检查没有覆盖的边界。
- 多 HAR 名称冲突、原生符号遮蔽、缺源、残留插件及路径逃逸均须失败并保留原工程；传递依赖仍存在时不能清除注册。
- 多次退订、视图 tag 重用、异步未完成时 reload 与旧 runtime 回调必须在设备上验证，宿主模拟日志不计为设备通过。
- 仓库检查当前因历史冻结文件 `docs/releases/sdk54-m0-export-patterns-summary.json` 含 `/Users/` 而失败；不修改既有冻结证据。
