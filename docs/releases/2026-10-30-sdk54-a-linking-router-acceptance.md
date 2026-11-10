# SDK54 A-04 Linking / Router 本地专项验收

日期：2026-10-30  
分支：`feat/sdk54-a-modules`  
基点：`19a0375cff7e0ef3bc62d54fd5ed57b913bb2000`

## 结论

Linking 与 Router 的本地 npm Release 专项为 **PASS**。最终 v3 候选在 nova 16 Pro
模拟器上通过 Home/Settings、动态参数、push/replace、UI Back、系统 Back、404 恢复、
冷/热深链、public reload 及前后台保持；运行时均为 `dev=false`，没有 Metro 8081
监听或 HDC 转发。

该专项结论不关闭 A-04：WebBrowser 已由同日后续独立专项验收，但 Screens 的手势及
扩展导航面仍未验收，`ExpoImage/default` 仍未注册，M4 仍为 0/7。因此 A-04
总状态保持 **PARTIAL**。

## 本轮修复

- Router fixture 同步 Splash 新构造契约，并补齐 `expo_splash_image_width=144vp`、
  `expo_splash_resize_mode=contain`。
- Screens 兼容 HAR 升级到 v2：注册 `RNSScreenContentWrapper`，根 screen 不再被
  modal Back handler 处理；A 的生成脚本与正式兼容脚本保持一致。
- Harmony Router reload 攅读 `ExpoLinking.getLinkingURL()`。RNOH
  `Linking.getInitialURL()` 只返回 Ability 初始 Want，热深链后不能代表当前 URL。
- `RouterProbe` 输出 `latestURL`，新增 `linking-reload.test.cjs` 锁定该行为。

## 主机与组装门禁

| 门禁 | 结果 |
| --- | --- |
| Expo Router Harmony | 17/17 PASS |
| Expo Linking Harmony | 9/9 PASS |
| Router fixture | 1/1 PASS |
| Screens artifact | 1/1 PASS |
| Worklets artifact | 1/1 PASS |
| 安装版本、peer 与原生 HAR | PASS |

Worklets 最终 `.so` 实际包含 `WorkletsTurboModuleFactoryDelegate`、
`WorkletsArkTsMessage`、`WorkletsUIScheduler`，没有残留对应的 Reanimated 私有类名；
这只证明当前冲突隔离，不扩大为 Reanimated 动画能力验收。

## 三轮候选

| 候选 | 构建/设备结果 | 处置 |
| --- | --- | --- |
| v1 | ArkTS 编译失败：`ExpoSplashScreenPackage` 需要 2 个参数，fixture 仍传 1 个；8.258 秒失败 | 保留失败，不安装 |
| v2 | Release 构建 2 分 51.506 秒；完整导航矩阵通过；冷链 `/details/42`、热链 `/details/7`，但 reload 错误回到 `/details/42` | 拒绝，保留 HAP 与设备失败证据 |
| v3 | Release 构建 3 分 50.794 秒；热链后 reload 保持 `/details/7`，前后台保持 | 最终本地候选，PASS |

v2 HAP SHA-256 为
`66da7b6e8f1c4b78cbc346d3a213a9e020b7b90e3f7bdc5a750fc543ef2535b1`。
`device-reload/` 保存其 reload 失败，不允许由 v3 结果覆盖。

## 设备验收

设备为本机 nova 16 Pro 模拟器，HDC target `127.0.0.1:5555`，Harmony API 22，
系统 `6.0.0.130(SP7DEVC00E130R4P11)`，截图 1320×2856、scale 3.5。安装包为
`dev.expo.harmony.router` 0.1.0 Release，声明 `lanebrouter` browsable scheme。

v2 用同一 PID/boot 完成以下导航矩阵：

| 场景 | 实际观察 |
| --- | --- |
| Tabs | Home ↔ Settings |
| 动态路由 | `/details/42`，`Query: 资源 space` |
| UI Back | 回到 Home |
| push | `/details/7` |
| replace | `/details/99` |
| 系统 Back | 回到 Home |
| 404 | `/missing-route` 显示 `Route not found`，随后回 Home |
| 冷深链 | `/details/42`，`Query: 资源 cold` |
| 热深链 | 同 PID/boot 到 `/details/7`，`Query: hot` |

v3 专门复验修复及生命周期：

| 阶段 | PID / boot | URL 与页面 |
| --- | --- | --- |
| 普通冷启动 | 15687 / `76113739-be88-4c1a-a692-08aad578d5d6` | `/`，`latestURL=null`，Home |
| 冷深链 | 15914 / `8b9cb4fe-df45-4069-91ea-cb8b626a00f6` | `/details/42`，`资源 cold` |
| 热深链 | 同 PID/boot | `/details/7`，`latestURL=lanebrouter://details/7?query=hot` |
| public reload | PID 15914 / 新 boot `07907ce2-0925-4b86-b77b-8d0043b4c342` | 仍为 `/details/7` 与 `Query: hot` |
| 后台/前台 | 同 PID/boot | `/details/7` 与最新 URL 均保持 |

确定性汇总见 `router-device-results.json`，每项均指向包含截图、完整 hilog、布局和
动作回执的原始设备目录。

## 工件身份

| 工件 | SHA-256 |
| --- | --- |
| expo-linking 8.0.12 tgz | `21bbdd22531026d2a0b1023bc7647955d6d128f173606ae59f06cacdce62219a` |
| expo-router 6.0.24 tgz | `f472f55636fb0a92b8513a3fc1322dfba1178f9ce18ee2453957bac7ea2c3902` |
| Release HAP | `165f48523f8f46dea74104284943a21df0d077ff94fa678f7384df3c317c815c` |
| HAP 内 JS bundle | `3fc0d43f88cdbe19d0917ca19200f5de69e40762fd50a970cdd778d7bf99ef23` |
| Screens v2 HAR | `78287fa54f91de5e345b88c678d47cc1b3f03f1f7af156ad899a24a4903c061b` |
| Worklets v2 HAR | `29c396e1f71d9e4a5347e9aa7aba7040724027ce558bde5ca677ee003887fce4` |

## 风险与未覆盖范围

- 设备日志持续出现 `fullScreenSwipeEnabled` 从 string 转 boolean 失败。当前 Stack、
  Tabs、深链和 Back 路径没有被阻塞，但手势返回不能登记为通过。
- Native Tabs、Drawer、sheet detents、旋转、多窗口和完整 Screens 属性面未覆盖。
- 本轮只有 npm Release 本地候选；npm/pnpm × Debug/Release 的正式发行矩阵仍由 B 接入。
- v3 比 v2 构建慢约 59 秒，主要耗时均在 Native Ninja。本轮没有足够受控重复样本，
  不将单次差异定性为性能回归，也不在功能专项中修改共享构建链。
- WebBrowser 的同日后续独立 npm Release 专项已 PASS；系统浏览器/Custom Tabs、生产
  OAuth/SSO 及正式四组合发行矩阵仍未验收。
- `ExpoImage/default` 与默认首页仍未解阻，本专项页面不能替代项目默认应用验收。

## B 接入要求

B 需以最终 tgz、HAP、bundle、Screens HAR、Worklets HAR 五组 hash 绑定正式候选，
保留 v1/v2 失败，不得只搜索页面文字判通过。正式 runner 至少复核 PID/boot、
`dev=false`、冷/热 URL、reload 前后 `latestURL`、404 恢复和无 Metro 条件；并将
`fullScreenSwipeEnabled` 登记为开放风险。A-04 继续 PARTIAL，M4 继续 0/7。

原始证据目录：
`outputs/sdk54/ai-e2e/20261030-a04-navigation-browser/`。
