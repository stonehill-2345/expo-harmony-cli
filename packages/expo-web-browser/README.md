# @expo-oh/expo-web-browser

Expo WebBrowser 的 HarmonyOS 适配版本，使用应用内 ArkWeb 全屏浮层打开网页。

上游基线：`expo-web-browser@15.0.11`。本包由 [expo-harmony-cli](https://github.com/stonehill-2345/expo-harmony-cli) 项目维护，非 Expo 官方发行版本。

[鸿蒙快速开始](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/harmony/getting-started.md) · [适配源码](https://github.com/stonehill-2345/expo-harmony-cli/tree/main/packages/expo-web-browser) · [验收记录](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/releases/2026-10-09-sdk54-expo-oh-candidate.md) · [问题反馈](https://github.com/stonehill-2345/expo-harmony-cli/issues)

## 安装

以下命令适用于已经配置好 `@expo-oh` SDK54 依赖组合的项目。普通 Expo 项目请先阅读[鸿蒙快速开始](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/harmony/getting-started.md)；仅安装此包不会自动完成 RNOH 和原生工程配置。

```bash
# npm
npm install --save-exact expo-web-browser@npm:@expo-oh/expo-web-browser@15.0.12

# pnpm
pnpm add --save-exact expo-web-browser@npm:@expo-oh/expo-web-browser@15.0.12
```

保留原依赖键：

```json
{
  "dependencies": {
    "expo-web-browser": "npm:@expo-oh/expo-web-browser@15.0.12"
  }
}
```

本包的鸿蒙适配已包含在 npm 产物中，无需额外应用本包的本地 patch。使用完整依赖组合及 overrides，保留锁文件；不要混装另一组 SDK 版本。

## 使用方式

```ts
import * as WebBrowser from "expo-web-browser";

export async function openWebsite() {
  const result = await WebBrowser.openBrowserAsync("https://example.com");
  return result.type;
}
```

Promise 等待页面关闭。标准生成工程包含网络权限；手工工程需保留 `ohos.permission.INTERNET` 和生命周期、浮层接线。

## 鸿蒙支持范围

| API / 场景 | HarmonyOS 行为与限制 |
| --- | --- |
| openBrowserAsync | 应用内 ArkWeb；关闭按钮或返回产生 cancel；重复打开返回 locked |
| dismissBrowser | 正常打开的浏览会话返回 dismiss；无会话时拒绝 |
| openAuthSessionAsync | 源码实现顶层导航 redirect 匹配，尚不代表生产 OAuth 兼容验收 |
| Cookie / SSO | 使用应用 ArkWeb Cookie，不共享系统浏览器登录态；不承诺独立隔离 WebView Cookie |
| preferEphemeralSession | true 会被拒绝，不提供临时隔离认证会话 |
| Custom Tabs / warmup | Android 专属能力，鸿蒙公共入口抛 UnavailabilityError |
| maybeCompleteAuthSession | 返回 failed / Not supported on this platform |
| 设备验收 | 已观察默认模板普通 WebBrowser 页面；认证、下载、文件选择、多窗口等不在该结论内 |

认证回调须提供完整 redirect 地址，调用方校验 state/PKCE。拒绝嵌入式浏览器的 OAuth 服务商可能无法使用。

## 生成和运行原生工程

从已配置项目根目录执行：

```bash
npx expo prebuild --platform harmony
npx expo run:harmony
```

日常开发启动 Metro：`npx expo start`。安装或更新原生依赖、应用配置后，需要重新生成并构建；重启 Metro 不能替代原生构建。

兼容基线为 Expo SDK54、React 19.1.1、React Native 0.82.1、RNOH 0.82.30。设备、DevEco、签名要求见[快速开始](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/harmony/getting-started.md)。普通 Expo Go 不能作为本组合的鸿蒙运行容器。

## 排查与反馈

- 安装后版本或功能不符：检查 package.json alias、overrides 和锁文件，使用 `npx expo install --check` 核对受管组合。
- 原生模块缺失或更新无效：确认使用同组合的 Core/Autolinking，重新 prebuild、构建并安装。
- 旧 patch 项目不会自动迁移；保留原项目，按指南新建项目后迁移业务代码，不叠加旧补丁。

请在[本仓库 Issues](https://github.com/stonehill-2345/expo-harmony-cli/issues) 提供包版本、RNOH/系统版本、设备类型、最小复现及日志。已记录的模板运行结果不代表全部 API 或所有设备均已验证。

## 上游与许可证

- [上游参考](https://docs.expo.dev/versions/v54.0.0/sdk/webbrowser/)：用于通用 API 或原始包说明；HarmonyOS 支持以本文为准。
- 原始来源：[Expo 源码](https://github.com/expo/expo/tree/main/packages/expo-web-browser)。
- 保留上游许可证和来源声明，详见包内 `LICENSE`。遵循 Expo 上游 MIT 许可证。
