# SDK54 A-04 Screens boolean / 全屏手势专项验收

日期：2026-10-30  
分支：`feat/sdk54-a-modules`  
基点：`19a0375cff7e0ef3bc62d54fd5ed57b913bb2000`

## 结论

Screens boolean 修复与全屏返回手势的本地 npm Release 专项为 **PASS**。固定
`@react-native-ohos/react-native-screens@4.9.0` 后，Harmony Fabric 路径直接传递
boolean，不再把 `fullScreenSwipeEnabled` 转成字符串。nova 16 Pro 模拟器上已验证
全屏长滑成功返回、短滑取消、UI Back、系统 Back、public reload 和前后台恢复。

该结论只关闭 Screens boolean / 全屏手势专项，不关闭 A-04。Native Tabs、Drawer、
sheet detents 尚未形成真实运行证据，正式 npm/pnpm x Debug/Release 矩阵仍由 B 负责；
`ExpoImage/default` 仍未解阻，M4 仍为 0/7，因此 A-04 总状态保持 **PARTIAL**。

## 修复与候选身份

- `react-native-screens` 的 src、CommonJS、ESM overlay 均仅在 Harmony 分支直接返回
  boolean，其他平台维持上游行为。
- Router fixture 的 Stack 明确启用 `fullScreenGestureEnabled` 与 `gestureEnabled`。
- 固定上游包：`@react-native-ohos/react-native-screens@4.9.0`，registry integrity 为
  `sha512-eBvNhA0KU/o9MCoGXjP/xtQbd2IuCLfoQwEFL5+gZlXFLqWGZBUg/tRmpF1vhc0oTkdRVR5tzYp8nMr5mr/8YA==`。
- patched tgz SHA-256：
  `07a2a26e88ea386de175ce1c4c4d0e701faab6c32e903332792ba4dc06f39231`。
- Release bundle SHA-256：
  `bf1b3222c4ddd6786675c171fc10d1a517e7470d66fc8ed6451de2b4c7edae14`。
- Release HAP SHA-256：
  `16f3b397c5ec1c6bb32549332dc900363e2c94f39ca7fa1d102534806bb72494`。
- Screens、Worklets、RNOH HAR SHA-256 分别为
  `78287fa54f91de5e345b88c678d47cc1b3f03f1f7af156ad899a24a4903c061b`、
  `29c396e1f71d9e4a5347e9aa7aba7040724027ce558bde5ca677ee003887fce4`、
  `0e0cf3dbb5b2e510f49c819ff5db2f43ad5a5918d38e840cc2714055c9f6fd83`。

consumer 的 direct dependency 与 override 均指向同一 patched tgz；`npm ls` 只解析出
一份 Screens 4.9.0。Release bundle 中 Harmony 平台已折叠，转换函数实际执行
`return prop`。HAP 构建成功，耗时约 2 分 41 秒。

## 自动化门禁

| 门禁 | 结果 |
| --- | --- |
| Screens Harmony boolean 回归 | 1/1 PASS |
| Router fixture | 1/1 PASS |
| `npm ls @react-native-ohos/react-native-screens` | 单实例 4.9.0 |
| src/CommonJS/ESM overlay | 均含 Harmony boolean 分支 |
| Release bundle | Harmony 分支折叠为直接返回 boolean |
| `git diff --check` | PASS |

Router fixture 测试使用
`EXPO_HARMONY_TOOLING_ROOT=/Users/zhansh/project/sdk54-ab-a-consumers/20261030-a04-router-v3-npm`。
consumer v4 位于
`/Users/zhansh/project/sdk54-ab-a-consumers/20261030-a04-router-v4-gesture-npm`。

## 模拟器验收

设备为 nova 16 Pro，target `127.0.0.1:5555`，应用
`dev.expo.harmony.router`。本轮进程 PID 始终为 `4285`，所有 probe 均为
`dev=false`。

| 步骤 | 操作与断言 | 结果 |
| --- | --- | --- |
| 01 | Release 冷启动，pathname `/` | PASS |
| 02 | Push details 7，pathname `/` -> `/details/7` | PASS |
| 03 | 屏幕中央长滑 `660 -> 1240`，回到 `/` | PASS |
| 04 | 再次 Push details 7，进入 `/details/7` | PASS |
| 05 | 屏幕中央短拖 `660 -> 780`，仍为 `/details/7` | PASS |
| 06 | 页面 Back，回到 `/` | PASS |
| 07 | 再次进入 `/details/7`，为系统 Back 建立前置状态 | PASS |
| 08 | 系统 Back，回到 `/` | PASS |
| 09 | public reload，boot UUID 改变且 PID 不变，仍为 `/` | PASS |
| 10 | Home 切后台，PID 仍存活 | PASS |
| 11 | warm start 恢复前台，PID 不变且仍为 `/` | PASS |

reload 前后 boot UUID 分别为
`ed87ada1-d17f-4654-b32b-c61701d661db` 与
`eb7f17cd-e48d-44db-91ce-d6debcc07654`。11 组 `device.log` 均未出现
`fullScreenSwipeEnabled`、`expected a boolean`、`Error while converting prop`、
`Fatal` 或 `FATAL`。

## 证据与边界

证据目录为
`outputs/sdk54/ai-e2e/20261030-a04-screens-gestures/`。每一步保留 action、UI
树、probe、设备日志及截图；`evidence-manifest.json` 绑定全部文件和外部二进制输入。

本专项没有验证 Native Tabs、Drawer、sheet detents，也没有证明正式发布组合。B 接入
时必须使用 manifest 中的 tgz/HAR/bundle/HAP 身份，并同时检查 route、boot、PID、
设备日志负例与截图，不能只以页面文字或单条 PASS 日志判定通过。
