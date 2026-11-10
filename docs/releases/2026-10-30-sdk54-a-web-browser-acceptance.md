# SDK54 A-04 WebBrowser 本地专项验收

日期：2026-10-30  
分支：`feat/sdk54-a-modules`  
基点：`19a0375cff7e0ef3bc62d54fd5ed57b913bb2000`

## 结论

WebBrowser 的本地 npm Release 专项为 **PASS**。最终 v2 候选在 nova 16 Pro 模拟器
通过真实 ArkWeb 页面加载、Close、系统 Back、程序 dismiss、普通/认证并发、认证回调、
错误回调、主文档连接失败、pending public reload、前后台保持和冷启动隔离。所有 boot
均为 `dev=false`，无 Metro 8081 或 HDC 转发。

该结果不等价于系统浏览器、Custom Tabs 或生产 OAuth 兼容性通过；也不关闭正式四组合
发行矩阵。A-04 保持 **PARTIAL**，M4 保持 0/7，`ExpoImage/default` 仍未解阻。

## 实现与门禁

- 独立 fixture 通过 Ability-owned `ExpoWebBrowserLifecycle`、ETS/C++ Package 和
  `ExpoWebBrowserView` ArkUI overlay 组装，不使用应用 JS shim。
- 本机 HTTP 夹具提供普通页面、精确认证 callback、前缀冒充 callback 和连接重置；
  设备直接访问 `10.0.2.2:18082`，服务器保存实际请求。
- 包内 controller、TurboModule、公开 JS、生成 HAR 和设备 fixture 共 19/19 PASS。
- v1 已完成设备矩阵，但缺少 `dismissAuthSession()` 设备场景；它作为历史候选保留。
- v2 增加认证并发与公开 dismiss 场景，Release 构建 2 分 38.869 秒，为最终候选。

v1 HAP 为 `bbcfea7f12cc23d9dae671bd19691445db52a8019b783420daa71ad7d36437ca`；
它不是最终通过候选。v2 全部设备证据位于 `device-v2-*`，没有覆盖 v1 目录。

## 设备结果

设备为 nova 16 Pro 模拟器，Harmony API 22，系统
`6.0.0.130(SP7DEVC00E130R4P11)`，截图 1320×2856、scale 3.5。应用为
`dev.expo.harmony.browser` 0.1.0 Release。

| 场景 | 实际结果 |
| --- | --- |
| 冷启动基线 | PID 9860、boot 1793348536527；8 项错误/平台边界通过，页面 Ready |
| 真实页面 | ArkWeb 显示 URL、原生 Close、`A04 Browser Fixture` 和页面正文 |
| Close / 系统 Back | 两条路径均使 `openBrowserAsync` 返回 `cancel` |
| 程序 dismiss | `dismissBrowser()` 与原 open Promise 均返回 `dismiss` |
| 普通并发 | 第二次 open 返回 `locked`，第一会话保持并可 dismiss |
| 认证成功 | 返回 `success` 及 `lanebbrowser://callback?code=123&state=device` |
| 认证并发 / dismiss | 第二次认证拒绝 `ERR_WEB_BROWSER_ALREADY_OPEN`；首会话返回 `dismiss` |
| 错误 callback | `/callback-evil` 拒绝为 `ERR_WEB_BROWSER_UNSUPPORTED_SCHEME` |
| 加载失败 | 服务器重置主文档连接，拒绝为 `ERR_WEB_BROWSER_LOAD_FAILED` |
| pending reload | 同 PID；旧会话拒绝 `ERR_WEB_BROWSER_UNAVAILABLE`，新 boot 1793348622608 无残留 overlay |
| 前后台 | 同 PID/新 boot 返回前台后 ArkWeb 页面仍打开，关闭返回 `cancel` |
| 冷启动隔离 | 新 PID 10112、boot 1793348656324，页面 Ready、无残留 overlay |

机器汇总与反向校验分别为 `browser-device-results.json` 和
`verify-browser-evidence.cjs`；原始目录均包含动作、布局、hilog、截图和解析结果。

## 工件身份

| 工件 | SHA-256 |
| --- | --- |
| expo-web-browser 15.0.11 tgz | `e6bbd0dbcfa45b839327adc27ae5b79b699cfd8bd4122c512bf43631fee74338` |
| Release HAP | `3c4320c0355f33939e6cc1eaf871d9e6c97e8bb2da476bb4449c87680cb628fe` |
| HAP 内 JS bundle | `c53da025ebd575609d4bb58a3d1781cc5fe60157320207f03eaac84a09007a03` |

## 风险与边界

- Harmony 使用应用内 ArkWeb Cookie 存储，不共享系统浏览器登录态。拒绝 embedded
  user agent 的 OAuth 服务商仍可能失败；调用方仍须校验 state/PKCE。
- 有效 TLS、TLS 失败、renderer 退出、真实公网 OAuth/SSO、密码管理器、下载、文件选择、
  权限请求、多窗口未做设备验收。
- v2 设备已证明错误 `code`，但 bridge 后错误对象的 message/Error 原型形态未单独验收。
- ArkWeb 首次初始化日志有两条 `dlns_create` errno 17；实际页面与后续流程正常，仍作为
  nova 模拟器风险保留，不推定真机无此日志。
- 最终设备 fixture 未同时安装 Splash；Splash + WebBrowser 多 overlay 只完成生成/ArkTS
  编译测试，真实叠层和 hit-test 组合仍未覆盖。
- Ability force-stop 只证明新进程无残留，未观察到可核验的 JS pending rejection；
  onDestroy 清理由主机测试覆盖。Debug、pnpm 和正式发行组合仍由 B 验收。

原始证据：`outputs/sdk54/ai-e2e/20261030-a04-web-browser/`。
