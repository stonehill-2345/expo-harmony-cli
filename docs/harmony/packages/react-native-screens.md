# @expo-oh/react-native-screens

基于 RNOH Screens 4.9.0 完整 npm 包及本仓库 overlay 的 HarmonyOS 衍生包，为 SDK54 Router/Native Stack 提供兼容实现。

上游基线：`@react-native-ohos/react-native-screens@4.9.0`。本包由 [expo-harmony-cli](https://github.com/stonehill-2345/expo-harmony-cli) 项目维护，非 Expo 官方发行版本。

[鸿蒙快速开始](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/harmony/getting-started.md) · [适配源码](https://github.com/stonehill-2345/expo-harmony-cli/tree/main/scripts/sdk54/external-overlays/react-native-screens-4.9.0) · [验收记录](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/releases/2026-10-09-sdk54-expo-oh-candidate.md) · [问题反馈](https://github.com/stonehill-2345/expo-harmony-cli/issues)

## 安装

以下命令适用于已经配置好 `@expo-oh` SDK54 依赖组合的项目。普通 Expo 项目请先阅读[鸿蒙快速开始](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/harmony/getting-started.md)；仅安装此包不会自动完成 RNOH 和原生工程配置。

```bash
# npm
npm install --save-exact @react-native-ohos/react-native-screens@npm:@expo-oh/react-native-screens@4.9.1

# pnpm
pnpm add --save-exact @react-native-ohos/react-native-screens@npm:@expo-oh/react-native-screens@4.9.1
```

保留原依赖键：

```json
{
  "dependencies": {
    "@react-native-ohos/react-native-screens": "npm:@expo-oh/react-native-screens@4.9.1"
  }
}
```

本包的鸿蒙适配已包含在 npm 产物中，无需额外应用本包的本地 patch。使用完整依赖组合及 overrides，保留锁文件；不要混装另一组 SDK 版本。

## 使用方式

项目使用 RNOH 原依赖键安装此包；业务和导航库通常仍使用普通 Screens API：

```ts
import { enableScreens } from "react-native-screens";
enableScreens(true);
```

上面的 JS 导入由 RNOH 的 Harmony alias 机制接到适配实现。保留指南中完整导航依赖组合，不要将普通 `react-native-screens` 依赖键直接替换成本包。

## 鸿蒙支持范围

| 能力 | HarmonyOS 行为与边界 |
| --- | --- |
| 来源 | 完整 RNOH 上游包，包含 HAR 和许可证；overlay 本身不是完整 npm 包 |
| 原生身份 | 保留 ScreensPackage、OHPM 名称与 ETS/C++ 身份，npm scope 不改变原生注册名 |
| 自动链接与 Metro | 需要同组合的 Autolinking 和 Metro，以识别 scoped 包及 pnpm alias 路径 |
| Router 验收 | 默认模板首页、Modal、dismissTo 及系统返回已记录 |
| Native BottomTabs | 上游该候选标为不支持，不能由导出源码推断可用 |
| Sheet detents / 其他导航能力 | 不在已验证普通 Stack 和 JS Tabs 的保证范围内 |

本包不提供整个 RNOH 导航生态的任意版本兼容保证。更新时一起核对 Router、React Navigation、SafeArea 和 RNOH。

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

- [上游参考](https://www.npmjs.com/package/@react-native-ohos/react-native-screens)：用于通用 API 或原始包说明；HarmonyOS 支持以本文为准。
- 原始来源：[RNOH Screens npm 包](https://www.npmjs.com/package/@react-native-ohos/react-native-screens)。
- 保留上游许可证和来源声明，详见包内 `LICENSE`。保留 RNOH Screens 的 ISC 许可证。
