# @expo-oh/expo

Expo SDK54 的 HarmonyOS 入口，连接适配版 Expo CLI、Metro、Modules Core 和自动链接工具。

上游基线：`expo@54.0.37`。本包由 [expo-harmony-cli](https://github.com/stonehill-2345/expo-harmony-cli) 项目维护，非 Expo 官方发行版本。

[鸿蒙快速开始](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/harmony/getting-started.md) · [适配源码](https://github.com/stonehill-2345/expo-harmony-cli/tree/main/packages/expo) · [验收记录](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/releases/2026-10-09-sdk54-expo-oh-candidate.md) · [问题反馈](https://github.com/stonehill-2345/expo-harmony-cli/issues)

## 安装

以下命令适用于已经配置好 `@expo-oh` SDK54 依赖组合的项目。普通 Expo 项目请先阅读[鸿蒙快速开始](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/harmony/getting-started.md)；仅安装此包不会自动完成 RNOH 和原生工程配置。

```bash
# npm
npm install --save-exact expo@npm:@expo-oh/expo@54.0.38

# pnpm
pnpm add --save-exact expo@npm:@expo-oh/expo@54.0.38
```

保留原依赖键：

```json
{
  "dependencies": {
    "expo": "npm:@expo-oh/expo@54.0.38"
  }
}
```

本包的鸿蒙适配已包含在 npm 产物中，无需额外应用本包的本地 patch。使用完整依赖组合及 overrides，保留锁文件；不要混装另一组 SDK 版本。

## 使用方式

项目创建流程负责生成完整 alias、overrides 和受管状态。已有兼容项目使用原 Expo 命令：

```bash
npx expo install --check
npx expo prebuild --platform harmony
npx expo run:harmony
npx expo start
```

普通非 Router 应用仍可使用 `registerRootComponent`；Router 项目使用 `expo-router/entry`。

## 鸿蒙支持范围

| 能力 | HarmonyOS 行为与边界 |
| --- | --- |
| SDK 入口与内部依赖 | 使用固定版本的适配 CLI、Metro、Core、Asset、Font、Constants 和 Autolinking |
| 创建项目 | expo-harmony-cli 1.6.0 支持 blank-typescript/default 的 scoped 流程；1.5.x 使用旧 patch 流程 |
| 设备验收 | 两模板的 Debug、clean Release 和无 Metro 冷启动已记录 |
| Expo Go / EAS | 本组合不提供 HarmonyOS Expo Go，也不承诺 EAS 云端鸿蒙构建或更新服务 |
| 其他 Expo 模块 | 包出现在依赖树中不等于其全部原生 API 已适配 |

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

- [上游参考](https://docs.expo.dev/versions/v54.0.0/sdk/expo/)：用于通用 API 或原始包说明；HarmonyOS 支持以本文为准。
- 原始来源：[Expo 源码](https://github.com/expo/expo/tree/main/packages/expo)。
- 保留上游许可证和来源声明，详见包内 `LICENSE`。遵循 Expo 上游 MIT 许可证。
