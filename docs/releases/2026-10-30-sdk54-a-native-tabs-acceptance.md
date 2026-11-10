# SDK54 A-04 Native Tabs 专项验收

日期：2026-10-30  
分支：`feat/sdk54-a-modules`  
基点：`19a0375cff7e0ef3bc62d54fd5ed57b913bb2000`

## 结论

Expo Router `unstable-native-tabs` 的本地 npm Release 专项为 **PASS**。固定的 Screens
4.9.0 HAR 已补齐 `RNSBottomTabs` 与 `RNSBottomTabsScreen` 的 C++ descriptor、JSI
binder 和 ETS builder 三条注册链；nova 16 Pro 模拟器上真实显示 Home / Settings 原生
标签栏，并通过双向切换、public reload、前后台恢复及安全区检查。

该结论只关闭 Native Tabs 本地专项，不关闭 A-04。Drawer、sheet detents 和正式
npm/pnpm x Debug/Release 矩阵尚未完成；`ExpoImage/default` 仍未解阻，M4 仍为 0/7，
因此 A-04 总状态保持 **PARTIAL**。

## 修复与候选身份

原始 Screens HAR 已包含两个组件实现和生成代码，但缺少宿主注册。补丁器在固定输入
SHA-256 上增加以下内容，并拒绝来源漂移或重复应用：

- C++ package 注册两个 component descriptor，并暴露两个 JSI binder。
- ETS package 导入两个组件，在统一 builder 中构建，并注册两个 builder 名称。
- 保留此前的 content wrapper 与 modal back 修复。
- HAR 比较确认只有 ETS package、`RNSScreen.ets` 和生成的 C++ package 三个文件变化。

最终候选 SHA-256：

| 工件 | SHA-256 |
| --- | --- |
| patched Screens tgz | `07a2a26e88ea386de175ce1c4c4d0e701faab6c32e903332792ba4dc06f39231` |
| navigation-v3 Screens HAR | `dcccd7e52ac1615a2d74f30f32e222ae48431d748013bb2d093d24e1f522bd6c` |
| Worklets HAR | `29c396e1f71d9e4a5347e9aa7aba7040724027ce558bde5ca677ee003887fce4` |
| RNOH HAR | `0e0cf3dbb5b2e510f49c819ff5db2f43ad5a5918d38e840cc2714055c9f6fd83` |
| Release bundle | `a357ba9a6457f1a68a6b86b3d1ecd3536ad29b4f4f12caeabe30874994d766e7` |
| Release HAP | `d35734cbe6804ea6ad07581f9622d55600207350e23279114c6631ed4f7daf87` |

consumer 位于
`/Users/zhansh/project/sdk54-ab-a-consumers/20261030-a04-router-v5-native-tabs-npm`。
首次全新 Release 构建约 3 分 3 秒，其中 Ninja 约 2 分 45 秒；最终显式安全区版本的
增量 HAP 构建约 6.9 秒。

## 自动化门禁

| 门禁 | 结果 |
| --- | --- |
| Screens artifact | 1/1 PASS |
| Router fixture | 1/1 PASS |
| HAR 变化范围 | 仅固定的 3 个文件 |
| Release ArkTS / C++ / HAP | PASS |
| `git diff --check` | PASS |

Router fixture 默认引用 `screens-4.9.0-navigation-v3.har`。旧 v3/v4 consumer 和已封存
证据未被改写。

## 模拟器验收

设备为 nova 16 Pro，target `127.0.0.1:5555`，应用
`dev.expo.harmony.router`。最终候选 PID 始终为 `27815`，probe 均为 `dev=false`。

| 步骤 | 操作与断言 | 结果 |
| --- | --- | --- |
| 01-03 | 首个 Native Tabs 候选显示原生标签栏并完成双向切换，但页面内容未避让状态栏 | 保留失败候选 |
| 04 | 改用 `SafeAreaView`，其自定义 padding 在 Native Tabs 内容容器中未生效 | 保留失败候选 |
| 05 | 显式 `useSafeAreaInsets` 冷启动；Home 标题 bounds `[84,137][1236,179]`，pathname `/` | PASS |
| 06 | 点击 Settings；标题可见，pathname `/settings`，tab index `1` | PASS |
| 07 | 点击 Home；pathname `/`，tab index `0` | PASS |
| 08 | 再次进入 Settings，建立 reload 前置状态 | PASS |
| 09 | public reload；PID 不变、boot UUID 更新、无深链时回到默认 Home | PASS |
| 10 | Home 键切后台，PID 保持存活 | PASS |
| 11 | warm start 回前台，PID/boot 不变且 Home 与原生标签栏可见 | PASS |

reload 前后 boot UUID 分别为
`1c20bc48-9ff5-442d-9db8-f1d28f799eb8` 与
`31afcc3a-313d-4e91-95a4-bcaa24336878`。最终 7 组日志没有
`RNSBottomTabs` / `RNSBottomTabsScreen` 的 descriptor、binder、builder 注册失败，
也没有 `Fatal`、boolean 转换错误或进程退出。

设备日志仍包含两类既有宿主噪声：RNGH 初始化时查询名为 `getConstants` 的 component
binder，以及 reload 销毁旧 RN surface 时报告一次旧 surface 不存在。两者都没有指向
Native Tabs 组件，且后续 probe、UI 和交互完整恢复，本专项记为非阻断观察项；正式
runner 不应把它们误报为 Native Tabs 注册失败，也不能因此忽略组件名精确匹配的错误。

## 证据与边界

证据目录为 `outputs/sdk54/ai-e2e/20261030-a04-native-tabs/`。每一步保留 action、UI
树、probe、设备日志及截图；`evidence-manifest.json` 绑定全部历史尝试、最终 7 步证据
和外部二进制输入。失败候选被保留用于证明安全区问题的发现与修复，最终判定只使用
05-11 和最终 SHA-256。

B 接入正式矩阵时必须同时核验 HAR/HAP/bundle 身份、页面标题 bounds、pathname、tab
index、boot/PID、精确组件名日志负例和截图，不能只以 Home / Settings 标签可见判定通过。
