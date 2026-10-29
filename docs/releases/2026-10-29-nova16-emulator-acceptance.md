# nova 16 Pro 模拟器验收记录

结论：**整体验收 FAIL；空白模板运行通过，完整 default 模板运行失败。** 本轮使用当前工作区重新构建的候选，实际构建、安装并操作模拟器，没有沿用历史设备 PASS。

## 候选与环境

- 源码基点：`733e395`，分支 `feat/V1.7.0`，包含 2026-10-29 风险修复的未提交修改。验收前后核对 25 个修改/新增文件的 SHA256，内容一致。
- 重新构建创建器、两份模板及 15 个运行时候选，通过仅监听本机的测试 registry 安装；未发布候选。
- nova 16 Pro，HDC `127.0.0.1:5555`，系统 `OpenHarmony-6.0.2.130`，屏幕 1320×2856。
- 本机 Node 23.5.0、npm 11.0.0；原生工具来自已安装的 DevEco Studio。兼容 HAR 打包指定本机 Python 3.12，首次使用 Python 3.9 的失败日志保留。
- 三个独立消费项目位于仓库同级的 `sdk54-nova16-acceptance-20261029/`，分别为 `blank-typescript-npm`、`default-npm`、`blank-release`。

## 实测结果

| 检查 | 结果 | 实际证据与边界 |
| --- | --- | --- |
| 最新包安装身份 | PASS | 两个 blank 项目各 12 个适配包、3,337 个文件；default 15 个适配包、4,512 个文件，与本轮 tgz 逐字节核对；无源码工作区链接 |
| 初次自动创建并安装 | FAIL | blank、default 均触及 600 秒安装上限；原始创建报告保持 FAIL |
| 安装恢复 | PASS | 官方 RNOH 大包分段下载后校验官方 SHA512/SHA1，预热 npm 缓存并实际补跑安装；未复制旧 node_modules。另一个全新 blank-release 项目显式创建后安装，975 包，12 秒完成 |
| blank Debug | PASS | 原生构建 2 分 7 秒，CLI run exit 0；对应前台窗口显示原始 `Open up App.tsx to start working on your app!` |
| blank 热更新 | PASS | 临时将 App.tsx 文字改成 `SDK54 NOVA16 HOT RELOAD OK`，设备直接更新；原文件已按原始字节恢复 |
| blank 冷启动 | PASS | force-stop 后重新启动，原始首屏正常 |
| default 生成、打包、编译 | PASS | 原样插件通过 prebuild；普通 Metro 返回 Harmony JS HTTP 200；原生构建 3 分 33 秒，CLI run exit 0 |
| default 页面运行 | **FAIL** | 首次启动及冷启动均出现 `Native Harmony view is not registered: ExpoImage/default`，无法验收正常首页、路由切换、图片及后续交互 |
| 重生成权限与稳定性 | PASS，有性能风险 | 连续两次 prebuild 均 exit 0；自定义文件的 600/755、受管文件的 600 权限、内容及 Index.ets 均保留；探针文件已删除，受管文件权限恢复 |
| 独立 Splash 组件 | PASS，仅专项 | View/Controller 与本轮源码 SHA256 相同；浅色/深色背景、200vp 图像、隐藏及再次显示均在模拟器验证。通过系统设置实际切换主题，结束后恢复原浅色设置 |
| blank Release 脱离 Metro | PASS，仅模拟器未签名包 | 全新 blank-release，`run:harmony --configuration Release --no-build-cache` exit 0，构建 2 分 17 秒；停止 Metro、移除转发后首屏、冷启动、前后台切换均正常 |

Release 验证时 8081、8097、8098 均无监听，HDC 转发列表为空；JS 已嵌入 HAP。这里的“离线”指脱离 Metro，不代表关闭了设备全部网络，也不代表完成真机签名验收。

blank 的原始入口/资源、default 的 app/components/assets、三个项目的直接依赖与入口均对账不变。未通过删除 default 页面、替换 expo-image 或补装未声明依赖来关闭错误。

## 阻塞与剩余风险

1. **P1：default 必需的 ExpoImage 原生视图缺失。** 实际安装的 expo-image 3.0.11 模块配置只声明 apple/android；Harmony 原生视图注册中没有 `ExpoImage/default`。错误在 `app/(tabs)/explore.tsx:1` 的导入阶段触发。需要完成 expo-image 的 Harmony 原生视图适配，再重跑完整 default；当前不能认为产品整体可交付。
2. **P2：已有构建产物时 prebuild 性能差。** 两次实际耗时约 322.7 秒、123.0 秒。事务会遍历、哈希并保留构建后的整个 Harmony 目录，首次替换期间临时事务目录约 6 GiB。后续应明确构建缓存与受管源文件的边界，同时保留现有权限、冲突检测和恢复语义。本次未改动此实现。
3. **安装受网络影响明显。** 冷安装两次超时；缓存恢复后的成功不等于首次冷下载通过。官方 RNOH 原包为 192,657,605 字节，下载记录与最终指纹已归档。
4. **日志并非零警告/零错误。** blank Release 有可选 TurboModule 查找信息（如 ExpoUpdates、ExpoGo 等）、窗口信息及 StatusBar 限制日志；本轮观察到页面可正常显示。未据此宣称这些模块能力已经实现。

default 路由、图片、动画、手势、触感等组合行为被首页错误阻塞，不能因为构建成功或 JS HTTP 200 记为通过。真机、签名 Release、pnpm 消费矩阵及历史 60 个缺失工件不在本轮完成范围内。

## 证据与复验

本轮原始证据目录：`outputs/sdk54/emulator-20261029-nova16/`。

- `source-state.json`、`source.patch`、`source-stability.json`：源码快照及修复内容未漂移证明。
- `creator/`、`templates/`、`runtime/`：实际消费的 18 个候选归档与元数据。
- `creation/creation-consumer-report.json`：初次创建安装超时的原始 FAIL；后续 install-recovery 日志分别记录恢复成功。
- `*-installed-candidates.json`：三个项目的安装身份与候选文件核对。
- `acceptance-result.json`：整体 FAIL，13 个画面证据的一致性核验 PASS；两者含义不同。
- `blank-regeneration-check.json`、`blank-regeneration-timing.json`：内容/权限核对与实际耗时。
- `blank-release-unsigned.hap`、`blank-debug-unsigned.hap`、`default-debug-unsigned.hap`：实际测试包。
- `release-offline-network-state.json`、`cleanup-final.json`：无 Metro、无转发及会话收尾状态。
- `artifact-index.json`：本轮工件 SHA256 索引。原始工件仍需随候选归档移交，文档不能替代工件。

截图工具虽然接受 `.jpeg` 路径，实际输出是 PNG；已按文件头识别并保留同字节 `.png` 供查看，原文件与命令日志保留。一次 default 冷启动截屏报告 `Failed to get display pixelMap` 并产生空文件；保留失败记录，重新冷启动并成功补采 `default-cold-restart-recaptured.png`，未将空截图计为成功。

可直接查看：[blank 首屏](../../outputs/sdk54/emulator-20261029-nova16/blank-debug-first-screen.png)、[热更新](../../outputs/sdk54/emulator-20261029-nova16/blank-hot-reload.png)、[Release 脱离 Metro](../../outputs/sdk54/emulator-20261029-nova16/blank-release-cold-offline.png)、[default 阻塞画面](../../outputs/sdk54/emulator-20261029-nova16/default-cold-restart-recaptured.png)、[Splash 浅色](../../outputs/sdk54/emulator-20261029-nova16/splash-isolated-light.png)、[Splash 深色](../../outputs/sdk54/emulator-20261029-nova16/splash-isolated-dark.png)。

本轮未暂存、提交或推送。验收结束保留模拟器及已安装测试应用，前台停在可脱离 Metro 运行的 `blank-release` 首屏。
