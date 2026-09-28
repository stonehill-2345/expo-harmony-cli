# Expo WebBrowser on Harmony

SDK54 / `expo-web-browser@15.0.11` / RNOH 0.82.30 的首版源码适配。
采用 Ability 持有的会话控制器、RNOH TurboModule 和 ArkWeb 原生全屏 modal。
应用继续使用 `import * as WebBrowser from 'expo-web-browser'`，无需应用 JS shim。

当前完成源码测试、公共 JS 类型检查、C++ 编译检查，以及包含 Splash/WebBrowser
自动生成浮层的 Debug/Release ArkTS HAR 编译。**完整 Expo HAP 和设备 API 尚未验收。**

## API 与边界

下表描述源码实现的行为，仍需设备验证。

| API / 场景 | Harmony 行为 |
| --- | --- |
| `openBrowserAsync(httpOrHttpsUrl)` | 应用内 ArkWeb，Promise 等待关闭；关闭按钮或 modal 返回产生 `cancel` |
| `dismissBrowser()` | 打开和关闭调用均返回 `dismiss`；无会话时拒绝 |
| 重复 `openBrowserAsync` | 返回 `locked`，保留原会话 |
| `openAuthSessionAsync(url, redirectUrl, options)` | 拦截实际顶层导航，匹配 redirect 后返回 `{ type: 'success', url }`；子 frame 不可完成认证 |
| 重复认证调用 | 拒绝 `ERR_WEB_BROWSER_ALREADY_OPEN`，不关闭原会话 |
| `dismissAuthSession()` | 认证会话返回 `dismiss`；无认证会话时无操作，不关闭普通浏览会话 |
| `toolbarColor` / `controlsColor` | 使用公共 JS `processColor` 后的原生颜色 |
| `preferEphemeralSession: true` | 拒绝 `ERR_WEB_BROWSER_UNSUPPORTED_OPTION` |
| Custom Tabs 查询 / warmup / mayInit / coolDown | Android-only；公共 JS 抛出 `UnavailabilityError` |
| `maybeCompleteAuthSession()` | 公共 JS 返回 `failed / Not supported on this platform` |
| 主文档加载失败、TLS 错误、renderer 退出 | 拒绝对应的 `ERR_WEB_BROWSER_*` 错误 |
| reload、模块/Ability 销毁、宿主卸载 | 拒绝未完成会话，释放回调；旧事件不能关闭新会话 |

认证使用应用的 ArkWeb Cookie 存储，不共享系统浏览器登录态，也不承诺隔离其他应用内
WebView 的 Cookie。它不是 `ASWebAuthenticationSession` 或 Custom Tabs 的等价实现；
拒绝 embedded user agent 的 OAuth 服务商可能无法使用。外部认证应用的 Want 回跳、
SSO、密码管理器、文件选择、下载、多窗口、权限请求和生产 OAuth 兼容矩阵不在本轮验收内。

redirect 需要完整回调地址。匹配允许追加 query/fragment，拒绝 `/callback-evil` 等路径前缀
冒充；不支持仅提供 scheme 前缀作为通配回调。未传 redirect 时可浏览并关闭，但不会返回
认证成功。调用方仍须校验 OAuth state/PKCE。

首版忽略其他平台专属展示选项及 `enableBarCollapsing`；普通页面的非 HTTP(S) 顶层导航
会拒绝会话，不自动拉起外部应用。HTTP 错误状态页（例如 404）仍是网页内容，可正常关闭。

## 自动接线

`expo-module.config.json` 声明 C++ / ETS package、`ExpoWebBrowserLifecycle` 和
`ExpoWebBrowserView`。当前 autolinking 会注入同一个 Ability-owned controller。
同时安装 Splash 与 WebBrowser 时，生成器使用单个 `Stack` 根节点，容器自身不参加
hit test，子浮层保留自己的交互规则。需使用包含本轮生成器修复的 autolinking。

标准 Harmony 模板已声明网络权限。手动维护原生工程时需保留 `ohos.permission.INTERNET`
以及 generated lifecycle / package / overlay 接线。

## 可复现检查

单元测试使用真实公共 JS、controller 和 TurboModule 源码，mock 的仅是平台依赖；
不把 Node 中的导航回调模拟视为设备证据。

```sh
EXPO_HARMONY_TOOLING_ROOT=/absolute/path/to/typescript-tooling \
  node --test packages/expo-web-browser/harmony/tests/web-browser.test.cjs
```

生成独立 HAR 编译 fixture（输出目录必须不存在；RNOH 输入只读）：

```sh
EXPO_HARMONY_TOOLING_ROOT=/absolute/path/to/typescript-tooling \
  node packages/expo-web-browser/harmony/tests/prepare-native-check.cjs \
  /tmp/expo-web-browser-native-check /absolute/path/to/rnoh-0.82.30

cd /tmp/expo-web-browser-native-check
DEVECO_SDK_HOME=/Applications/DevEco-Studio.app/Contents/sdk \
  /Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw \
  --mode module -p product=default -p module=browser@default \
  -p buildMode=debug assembleHar --no-daemon
```

将 `buildMode=debug` 改为 `release` 可检查另一个模式。fixture 当前 target API22、
compatible API20；它验证真实 ArkTS 接口和生成的多浮层结构，不打包 JS bundle、不编译
C++、不安装设备，不能替代 SDK54 完整 HAP 验收。

设备验收仍需：真实页面加载/关闭、系统返回、连续打开、程序 dismiss、并发、
主文档失败、真实 302/JS redirect、错误 redirect、pending auth/browser 时公共 reload、
RN 底层点击和 Splash 拦截回归，并分别验证 Debug 与真正 Release。
