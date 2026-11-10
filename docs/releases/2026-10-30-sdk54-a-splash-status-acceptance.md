# SDK54 A-04 Splash / StatusBar 生命周期专项

日期：2026-10-30。工作区 `/Users/zhansh/project/expo-harmony-cli-a`，分支
`feat/sdk54-a-modules`。本轮完成 A-04 的 Splash / StatusBar 本地 npm Release
专项；A-04 保持 PARTIAL，M4 保持 0/7。未修改 B 所有的共享 CLI、生成器、
catalog、锁文件或总规划，未暂存、提交、推送或发送外部消息。

证据目录：`outputs/sdk54/ai-e2e/20261030-a04-splash-status/`。官方 Expo 固定
来源仍为 commit `5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`；当前公开 JS API、原生名称和
签名未改。

## 修复的两个生命周期问题

第一项是 `ExpoSplashScreenView` 已卸载后，尚未完成的淡出回调仍可修改旧视图
状态。`aboutToDisappear` 现在递增动画 token，使晚到回调失效。真实方法回归从
3/4 变为 4/4，另覆盖旧淡出不能移除新 runtime 的覆盖层及重新挂载。

第二项由 nova 首轮设备运行发现。RNOH 的 `CONTENT_APPEARED` 在 Release 中比
JS 顶层 `preventAutoHideAsync()` 早约 119 ms：v2 日志中覆盖层先从 visible=true
变成 false，随后 JS 才开始，官方建议的模块级 prevent 无法取得所有权。

Lifecycle 现在同时观察 `CONTENT_APPEARED` 与 `RUN_JS_BUNDLE_STOP`。只有内容已
挂载且当前 JS bundle 顶层执行完成后，才判断是否自动隐藏；因此同步的 user / Router
prevent 可以先取得所有权，未 prevent 的应用仍在 bundle 完成后自动隐藏。每个新
runtime 会清空两项 marker 状态，避免 reload 沿用旧事件。新增确定性回归覆盖
“content 先到、prevent 后到、bundle stop 再到”的实际顺序。

最终 Splash controller、module、view 共 **16/16 PASS**；StatusBar 独立组装检查
**1/1 PASS**。旧实现的设备失败保留在 v2，不以修改安装后产物绕过。

## 候选与设备结果

最终消费者：`/Users/zhansh/project/sdk54-ab-a-consumers/20261030-a04-splash-status-v3-npm`。
真实 npm install、7 包 install verification、1,893 条源码记录核对、Splash ETS
源码/安装包/原生 host 三方逐字节核对均通过。Release 构建成功，hvigor 用时
2 分 45.960 秒。

设备为 nova 16 Pro 模拟器，Harmony API 22，系统
`6.0.0.130(SP7DEVC00E130R4P11)`，截图 1320×2856，全部运行 `dev=false`，无
Metro 8081 和 HDC 转发。

| 场景 | 实际结果 |
| --- | --- |
| 用户 prevent | 内容已经挂载后仍保持原生橙色覆盖层 10 秒；Router maybe-hide 不夺走用户所有权；显式 public hide 后隐藏 |
| fade | options 为 fade=true / duration=2400；截图从橙色 `(223,96,32)` 经混合像素 `(108,77,71)` 到 RN 蓝色 `(32,64,96)`，证明实际 ArkUI 覆盖层淡出而非 JS 代理 |
| Router internal prevent | 原生覆盖层保持 10 秒；`internalMaybeHideAsync` 后立即隐藏，fade=false |
| 自动隐藏 | 未 prevent 时，CONTENT_APPEARED 与 bundle stop 后自动隐藏 |
| public reload | 同一 PID 22465，boot `1793344383629` → `1793344414412`，runtime 1 → 3；新覆盖层重新显示并再次完成显式 hide，无旧 boot failure |
| 前后台 | 同一 boot 观测 background / active；Splash 保持隐藏，StatusBar 状态可读 |
| 冷启动隔离 | internal PID 22822、auto PID 24468，均为新进程、新 boot |

Splash 页面使用真实 ArkUI `ExpoSplashScreenView`，覆盖 RNApp，橙色页面包含原生
文字；隐藏后展示蓝色 RN 页面。`user-held.png`、`user-fade-early.png`、
`user-hidden.png` 及 reload/internal/auto 截图保存了实际像素。最终确定性复核见
`device-accepted-v3.json`。

StatusBar 通过公开组件栈和公开 imperative API 操作，test-only Oracle 只读取实际
主窗口属性：

| 阶段 | 图标 | 颜色 | 可见顶栏 |
| --- | --- | --- | --- |
| 后挂载组件覆盖 | 浅色 | `#FF223344` | 136 px |
| 后组件卸载恢复 | 深色 | `#FF112233` | 136 px |
| 组件隐藏 | 深色 | `#FF112233` | 0 px |
| 组件重新显示 | 深色 | `#FF112233` | 136 px |
| imperative 隐藏 | 浅色（隐藏状态） | `#00000000` | 0 px |
| imperative 显示 | 浅色 | `#FF445566` | 136 px |

六阶段截图下方真实窗口均保持 `(32,64,96)`；Oracle 的 Core / native 路径在夹具
组装检查中保持正式 JS 包 + test-only native reader 的边界。

## 失败记录与边界

- v1 首次编译失败：专用 Oracle 相对路径错误，且宿主缺 Splash 默认视图资源。
  新 v2 夹具补齐资源并从源码重新打包；没有修改 v1 安装目录。
- v2 Release 构建通过，但设备 user prevent 明确失败，形成上述 marker 时序修复。
  v2 失败 HAP（`941a772faf8642fa25bfa991bedc0544ec4a6307441b651ce6caa938ca0a05c4`）
  和 hilog 保留，不能登记为通过候选。
- v3 最终设备流程的最后一步尝试用 Back 销毁 Ability；实际只进入 background，
  PID 仍存在。随后 `aa force-stop` 直接终止进程，也没有产生可核验的 `onDestroy`
  日志。因此 **Ability 销毁设备项为 NOT_OBSERVED**；TurboModule/controller destroy、
  监听移除和晚动画失效只由主机回归证明。
- ArkTS marker 接口没有暴露可用于过滤的 RN instance ID。当前单 Ability / 单 RN
  instance 已验证；多 RN instance 的 marker 隔离仍是风险。
- 淡出证明了配置、生效中的混合帧和最终移除，没有以帧级计时证明 2400 ms 的精确
  时长或曲线。中断淡出、Ability 销毁中的动画回收尚未设备证明。
- RNOH 当前不可切换 StatusBar translucency，network activity indicator 也是 no-op；
  本轮不把它们登记为能力。动画过程、多窗口、旋转、导航栏和安全区组合未覆盖。
- 本专项不包含 Router 路由行为本身，也不包含 Linking / WebBrowser。`ExpoImage/default`
  仍未解阻，默认首页仍不能作为项目总验收入口。

## 工件身份

| 工件 | SHA-256 |
| --- | --- |
| expo-splash-screen tgz | `8955730405d35e527f7051deb816f0d8fda0af42c5528a1c033fc11c18b59636` |
| expo-status-bar tgz | `5da63fa12be1ddc954c4b7dc236da1a1aa3f5bdf7e6cefd2ea0cfb624dfe19ff` |
| expo-modules-core tgz | `56ddd180ca5d2282dcbc5ddbe97ad586a853f588a1d4c85a202180cc01bbb4c5` |
| Release HAP | `09d9d1a46313323f9a016b029c31c8ef9213cfff4f71015a829dab86f937e8d5` |
| HAP 内 JS bundle | `2ed32d06949cf4e3e9f3edff5717122bb3977e4866dede81ecf3f516cf06a503` |

`candidate-v3/` 保存 7 个 tgz、HAR、HAP、锁文件、JS 入口、原生 host 和 bundle；
`candidate-v3.json` 保存全部文件哈希。应用已停止并保留，30 个设备临时采集文件已
清理，模拟器已停止，HDC `[Empty]`。

下一项 A 可独立推进 A-04 的 Linking / Router / WebBrowser 生命周期与异常处理。
Splash / StatusBar 本地专项 PASS 不关闭整个 A-04、M4 或项目验收。

## 证据封存

证据包：`outputs/sdk54/ai-e2e/20261030-a04-splash-status-evidence.tar.gz`。
已从归档逐文件复核 288 个文件及清单，SHA-256 为
`33c5b02b19db7305d1a5fbd0e0672af76771636e8241e47db79b0e2b99ef5324`。
同目录 `.tar.json` / `.tar.sha256` 保存回执。包内报告为封存前快照，本节是封存后
身份追加；此前 A-02、A-03、SystemUI 证据保持原样。
