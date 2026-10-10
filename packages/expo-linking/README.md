# @expo-oh/expo-linking

Expo Linking 的 HarmonyOS 适配版本，连接 UIAbility 的 URI 生命周期和 RNOH Linking。

上游基线：`expo-linking@8.0.12`。本包由 [expo-harmony-cli](https://github.com/stonehill-2345/expo-harmony-cli) 项目维护，非 Expo 官方发行版本。

[鸿蒙快速开始](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/harmony/getting-started.md) · [适配源码](https://github.com/stonehill-2345/expo-harmony-cli/tree/main/packages/expo-linking) · [验收记录](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/releases/2026-10-09-sdk54-expo-oh-candidate.md) · [问题反馈](https://github.com/stonehill-2345/expo-harmony-cli/issues)

## 安装

以下命令适用于已经配置好 `@expo-oh` SDK54 依赖组合的项目。普通 Expo 项目请先阅读[鸿蒙快速开始](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/harmony/getting-started.md)；仅安装此包不会自动完成 RNOH 和原生工程配置。

```bash
# npm
npm install --save-exact expo-linking@npm:@expo-oh/expo-linking@8.0.13

# pnpm
pnpm add --save-exact expo-linking@npm:@expo-oh/expo-linking@8.0.13
```

保留原依赖键：

```json
{
  "dependencies": {
    "expo-linking": "npm:@expo-oh/expo-linking@8.0.13"
  }
}
```

本包的鸿蒙适配已包含在 npm 产物中，无需额外应用本包的本地 patch。使用完整依赖组合及 overrides，保留锁文件；不要混装另一组 SDK 版本。

## 使用方式

从按钮事件打开 HTTPS 链接：

```ts
import * as Linking from "expo-linking";

export async function openWebsite() {
  return Linking.openURL("https://example.com");
}
```

订阅最新链接可使用 `useLinkingURL()`。自定义 scheme 需要配置实际应用的 URI skills 和 querySchemes；仅在 JS 中创建 URL 不会注册系统处理程序。

## 鸿蒙支持范围

| API / 场景 | HarmonyOS 行为与限制 |
| --- | --- |
| getLinkingURL / useLinkingURL | 读取当前 Ability 最近一次收到的非空 URI；未收到时为 null |
| onURLReceived | 由真实 onCreate/onNewWant 驱动；新订阅不会重放旧 URI |
| getInitialURL | 继续委托 RN Linking，语义是初次启动 URL，不等于最近 URI |
| openURL | 等待 RN 原生操作完成；将成功的 null/undefined 结果映射为 true，保留异常 |
| canOpenURL | 自定义 scheme 查询依赖 querySchemes；RNOH 的 tel/sms 查询并不保证存在处理程序 |
| openSettings | 目标由 RNOH/平台决定，不承诺与 iOS/Android 完全一致 |

需要保留 prebuild 生成的生命周期接线。并非所有外部协议、应用回跳和深链场景均完成设备验收。

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

- [上游参考](https://docs.expo.dev/versions/v54.0.0/sdk/linking/)：用于通用 API 或原始包说明；HarmonyOS 支持以本文为准。
- 原始来源：[Expo 源码](https://github.com/expo/expo/tree/main/packages/expo-linking)。
- 保留上游许可证和来源声明，详见包内 `LICENSE`。遵循 Expo 上游 MIT 许可证。
