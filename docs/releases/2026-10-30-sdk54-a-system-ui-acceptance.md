# SDK54 A-04 SystemUI 生命周期专项

日期：2026-10-30。工作区 `/Users/zhansh/project/expo-harmony-cli-a`，分支 `feat/sdk54-a-modules`。本轮完成 A-04 的 SystemUI 状态一致性修复和本地 npm Release 专项；A-04 保持 PARTIAL，M4 保持 0/7。原工作区及 B 所有的共享工具/总规划未修改，未暂存、提交或推送。

证据：`outputs/sdk54/ai-e2e/20261030-a04-system-ui/`。固定上游 Expo commit `5b42e3d21e0ac5e086752361ca8a5cb4de53bec1` 的 JS、Android/iOS 实现已保存为 `upstream/`，附 Git blob 与 SHA-256。

## 缺陷与修复

原 setter 先修改主窗口，再等待 Preferences.flush，最后更新 currentColor。这会使保存期间 getter 返回旧值；较早调用的 flush 较晚完成时，还会覆盖较新颜色；保存失败也会使 getter 与已经改变的窗口不一致。

修复仅将 currentColor 更新移到窗口成功应用之后、持久化之前。保存失败仍拒绝 setter，但 getter 保持已经应用的颜色；窗口失败不修改缓存或偏好；模块销毁后晚到的 flush 完成会拒绝，不再次修改窗口。没有新增队列或更改持久化格式。

新增确定性回归覆盖 pending、逆序完成、同步/异步保存失败、窗口失败、销毁期间保存。旧实现模块测试 6 PASS / 3 FAIL；修复后模块 9 项 + 颜色 3 项，共 **12/12 PASS**。这些异常由主机适配器注入，未声称在设备上制造原生磁盘错误或控制实际 flush 调度。

## 设备验收结果

nova 16 Pro 模拟器，Harmony API 22，系统 `6.0.0.130(SP7DEVC00E130R4P11)`；实际截图 1320×2856。`wm size` 探测不可用，原始回执保留，尺寸取自截图。Release 日志均为 `dev=false`。应用使用透明 RN 根视图，上方白色控制面板外的背景由真实主窗口提供，没有用 JS 背景色代替 SystemUI。

| 检查 | 预期与实际结果 |
| --- | --- |
| 新装首启 | Appearance 为 light；getter 和窗口均为白色 |
| 显式设置 | `#b42318`；getter 一致，窗口红色 |
| 16 次并发设置 | 最后请求 `#336699`；全部 Promise 完成后 getter 和窗口均为蓝色 |
| 深色主题 + null reset | `#000000`；窗口黑色，真实状态栏浅色图标 |
| 浅色主题 + null reset | `#ffffff`；窗口白色，真实状态栏深色图标 |
| 持久化完成 | `#336699`；getter 和窗口均为蓝色 |
| 后台 → 前台 | 观测到 background/active；同一 PID/boot，颜色保持蓝色 |
| 连续 3 次公共 reload | 同一 PID 6287、每次新 boot；未再次调用 setter 前已恢复蓝色 |
| 离线冷启动 | PID 6287 → 6414、新 boot；未调用 setter 前已恢复蓝色；无 8081 Metro、无 HDC 转发 |

上述 **11 个稳定采集点全部通过 getter/预期/窗口像素检查**；深浅主题另核对 `StatusBarOracle` 的原生窗口属性，并人工查看截图。每张图采样下半部 `(330,1713)-(990,2284)` 的 376,860 个像素，全部满足每通道误差 ≤1。测试日志按 boot 检查，没有观测到跨 boot 的旧回调或 failure。

两个采集脚本问题单独保留：首次按钮文本同时匹配 Button/Text，脚本在点击前停止，随后只选 clickable Button；第二次红色截图为 `(180,36,25)`，与预期 `(180,35,24)` 相差 1，原逐字节门禁拒绝。最终采用明确的每通道 ≤1 容差，原因未进一步归因到具体渲染环节。原失败截图/JSON 未覆盖；白色代理背景、旧蓝色、偏差 2 的反例均被同一像素表达式拒绝，容差及精确匹配正例通过，共 5/5。最终同一 HAP 继续完成后续阶段，未改产品代码绕过检查。

## 候选身份与复验

消费者：`/Users/zhansh/project/sdk54-ab-a-consumers/20261030-a04-system-ui-v1-npm`。真实 npm install 与 verify-install 通过；6 包 1,800 条源码记录核对通过，SystemUI 原生 host 输入及 JS 夹具与源码逐字节一致。Release 构建通过，hvigor 用时 3 分 10.349 秒；这是本次原生构建记录，不是 prebuild 性能结论。

| 工件 | SHA-256 |
| --- | --- |
| expo-system-ui tgz | `7f15082de766d735aea2cb9795f8808d55eb64eca326cdc782544895346bf6c1` |
| expo-modules-core tgz | `fbded3e7ca2ffa5840ae1e58fa900fd0365c3e52b0a21a8b09d0acca2a5b7c25` |
| Release HAP | `4d57deaaac99b997c170be9bf335b1c58aee5223055b178676d5aaebcd99e21b` |
| HAP 内 JS bundle | `ebfd7053d57b530c3be426ace6b8fd21ec96aca13de828f4e483d84d9e5fd3e8` |

`candidate-v1/` 保存 tgz、HAR、HAP、锁文件、入口、原生 host 输入及 bundle；`candidate-v1.json` 保存全部文件哈希。`acceptance-results.json` 汇总 11 点；`lifecycle-v1-attempt3.json` 保存完成后的生命周期操作；前两次失败记录继续保留。

复验时启动 nova 16 Pro，运行 `hdc -t 127.0.0.1:5555 shell aa start -a EntryAbility -b dev.expo.a04.systemui`。应用已保留，当前恢复值应为蓝色 `#336699`，不是新装白色。点击 Next 依次经过红色、并发蓝色、深色黑色、浅色白色、持久化蓝色；Reload 后应直接恢复蓝色。结合本目录日志、截图和原生属性核验，不只看面板文本。运行采集脚本必须使用新的 phase/输出目录，脚本拒绝覆盖已有证据。

本轮测试应用已停止并保留，24 个设备临时采集文件已清理，nova 模拟器已停止，HDC 无设备和转发。

## 范围边界及下一项

- getter 当前表示本模块最后成功应用的颜色，未承诺观测其他原生代码直接修改窗口；上游 getter 直接读取实际背景，这一差异保留为后续契约风险。
- null 在深浅主题下的即时效果已验证；null 删除偏好后独立冷启动、并发 setter 后立即冷启动、真实持久化失败及其他设备/API 版本未由本轮证明。持久化冷启动的证据来自显式 persist 阶段。
- 主题切换使用应用级 Appearance override，没有修改全局系统主题。StatusBar 只覆盖 auto 图标随主题变化；不代表完整 StatusBar、沉浸式、动画、多个组件栈或 Splash 验收。
- 下一项 A 可独立继续 A-04 的 Splash/StatusBar 生命周期与异常清理，再推进 Linking/Router/WebBrowser。正式 npm/pnpm × Debug/Release 与发行集成由 B 接入。
- `ExpoImage/default` 未解决，默认首页未解阻；本轮专项 PASS 不能关闭 A-04、M4 或项目整体验收。

## 证据封存

证据包：`outputs/sdk54/ai-e2e/20261030-a04-system-ui-evidence.tar.gz`。已从归档逐文件复核 227 个文件及清单，SHA-256 为 `b0751cd2fc42ca838d7e4131ccecd89ea00078b12be6fabd74a488ee5fae8ecf`。同目录 `.tar.json` / `.tar.sha256` 保存回执。包内报告为封存前快照，本节是封存后身份追加；此前 A-02/A-03 证据保持原样。
