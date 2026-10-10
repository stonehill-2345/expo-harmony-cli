# @expo-oh/expo-cli

Expo CLI 的 HarmonyOS 适配版本，提供项目内的 `expo` 命令。它与创建项目用的无 scope `expo-harmony-cli` 是两个不同的工具。

上游基线：`@expo/cli@54.0.27`。本包由 [expo-harmony-cli](https://github.com/stonehill-2345/expo-harmony-cli) 项目维护，非 Expo 官方发行版本。

[鸿蒙快速开始](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/harmony/getting-started.md) · [适配源码](https://github.com/stonehill-2345/expo-harmony-cli/tree/main/packages/@expo/cli) · [验收记录](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/releases/2026-10-09-sdk54-expo-oh-candidate.md) · [问题反馈](https://github.com/stonehill-2345/expo-harmony-cli/issues)

## 安装

以下命令适用于已经配置好 `@expo-oh` SDK54 依赖组合的项目。普通 Expo 项目请先阅读[鸿蒙快速开始](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/harmony/getting-started.md)；仅安装此包不会自动完成 RNOH 和原生工程配置。

```bash
# npm
npm install --save-exact @expo/cli@npm:@expo-oh/expo-cli@54.0.28

# pnpm
pnpm add --save-exact @expo/cli@npm:@expo-oh/expo-cli@54.0.28
```

保留原依赖键：

```json
{
  "dependencies": {
    "@expo/cli": "npm:@expo-oh/expo-cli@54.0.28"
  }
}
```

本包的鸿蒙适配已包含在 npm 产物中，无需额外应用本包的本地 patch。使用完整依赖组合及 overrides，保留锁文件；不要混装另一组 SDK 版本。

## 使用方式

从已配置的项目根目录执行：

```bash
npx expo prebuild --platform harmony
npx expo run:harmony
npx expo start
npx expo install expo-font
npx expo install --check
npx expo install --fix
```

通常由 `@expo-oh/expo` 通过原依赖键 `@expo/cli` 引入，无需全局安装。

## 鸿蒙支持范围

| 能力 | HarmonyOS 行为与边界 |
| --- | --- |
| prebuild / run:harmony | 生成原生工程并使用本机 HarmonyOS 工具链构建、安装和启动 |
| start | 识别受管项目并启用 Harmony Metro 配置 |
| install / --check / --fix | 在受管的 scoped 项目中使用发布映射，保留适配包 alias |
| Release | 可使用 `run:harmony --configuration Release --no-build-cache`；需要本机签名和工具链 |
| 项目入口 | 单独安装此 CLI 不会补齐完整 RNOH 依赖组合或创建受管状态 |
| 云服务 | 本包不意味着 Expo Go、EAS Build 或 EAS Update 已支持鸿蒙 |

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

- [上游参考](https://docs.expo.dev/more/expo-cli/)：用于通用 API 或原始包说明；HarmonyOS 支持以本文为准。
- 原始来源：[Expo 源码](https://github.com/expo/expo/tree/main/packages/%40expo/cli)。
- 保留上游许可证和来源声明，详见包内 `LICENSE`。遵循 Expo 上游 MIT 许可证。
