# @expo-oh/expo-metro-config

Expo Metro 配置的 HarmonyOS 适配版本，负责平台解析、RNOH 初始化和 npm/pnpm 别名路径。

上游基线：`@expo/metro-config@54.0.17`。本包由 [expo-harmony-cli](https://github.com/stonehill-2345/expo-harmony-cli) 项目维护，非 Expo 官方发行版本。

[鸿蒙快速开始](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/harmony/getting-started.md) · [适配源码](https://github.com/stonehill-2345/expo-harmony-cli/tree/main/packages/@expo/metro-config) · [验收记录](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/releases/2026-10-09-sdk54-expo-oh-candidate.md) · [问题反馈](https://github.com/stonehill-2345/expo-harmony-cli/issues)

## 安装

以下命令适用于已经配置好 `@expo-oh` SDK54 依赖组合的项目。普通 Expo 项目请先阅读[鸿蒙快速开始](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/harmony/getting-started.md)；仅安装此包不会自动完成 RNOH 和原生工程配置。

```bash
# npm
npm install --save-exact @expo/metro-config@npm:@expo-oh/expo-metro-config@54.0.18

# pnpm
pnpm add --save-exact @expo/metro-config@npm:@expo-oh/expo-metro-config@54.0.18
```

保留原依赖键：

```json
{
  "dependencies": {
    "@expo/metro-config": "npm:@expo-oh/expo-metro-config@54.0.18"
  }
}
```

本包的鸿蒙适配已包含在 npm 产物中，无需额外应用本包的本地 patch。使用完整依赖组合及 overrides，保留锁文件；不要混装另一组 SDK 版本。

## 使用方式

受管项目由适配 Expo CLI 自动启用 Harmony 配置，通常无需创建 `metro.config.js`：

```bash
npx expo start
```

如需自定义 Metro，以 Expo 默认配置为基础：

```js
const { getDefaultConfig } = require("expo/metro-config");
module.exports = getDefaultConfig(__dirname);
```

这个片段本身不能替代完整的 Harmony CLI 和 RNOH 项目配置。

## 鸿蒙支持范围

| 能力 | HarmonyOS 行为与边界 |
| --- | --- |
| 平台解析 | 增加 harmony 平台及 react-native 条件，交由 RNOH resolver 解析 |
| 初始化 | 按请求平台选择 RNOH InitializeCore，避免非 Harmony 请求加载鸿蒙初始化 |
| pnpm alias | 对声明 Harmony alias 且实际包名不同的依赖补充路径映射 |
| 构建产物 | 默认模板 Debug/Release 和冷启动已在发布组合中验证 |
| 自定义 resolver / serializer | 必须保留平台接入逻辑；任意第三方覆盖配置不在验收范围内 |

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

- [上游参考](https://docs.expo.dev/guides/customizing-metro/)：用于通用 API 或原始包说明；HarmonyOS 支持以本文为准。
- 原始来源：[Expo 源码](https://github.com/expo/expo/tree/main/packages/%40expo/metro-config)。
- 保留上游许可证和来源声明，详见包内 `LICENSE`。遵循 Expo 上游 MIT 许可证。
