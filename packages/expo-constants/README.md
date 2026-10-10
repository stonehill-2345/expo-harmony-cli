# @expo-oh/expo-constants

Expo Constants 的 HarmonyOS 适配版本，提供嵌入应用配置以及设备、窗口和运行环境信息。

上游基线：`expo-constants@18.0.14`。本包由 [expo-harmony-cli](https://github.com/stonehill-2345/expo-harmony-cli) 项目维护，非 Expo 官方发行版本。

[鸿蒙快速开始](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/harmony/getting-started.md) · [适配源码](https://github.com/stonehill-2345/expo-harmony-cli/tree/main/packages/expo-constants) · [验收记录](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/releases/2026-10-09-sdk54-expo-oh-candidate.md) · [问题反馈](https://github.com/stonehill-2345/expo-harmony-cli/issues)

## 安装

以下命令适用于已经配置好 `@expo-oh` SDK54 依赖组合的项目。普通 Expo 项目请先阅读[鸿蒙快速开始](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/harmony/getting-started.md)；仅安装此包不会自动完成 RNOH 和原生工程配置。

```bash
# npm
npm install --save-exact expo-constants@npm:@expo-oh/expo-constants@18.0.15

# pnpm
pnpm add --save-exact expo-constants@npm:@expo-oh/expo-constants@18.0.15
```

保留原依赖键：

```json
{
  "dependencies": {
    "expo-constants": "npm:@expo-oh/expo-constants@18.0.15"
  }
}
```

本包的鸿蒙适配已包含在 npm 产物中，无需额外应用本包的本地 patch。使用完整依赖组合及 overrides，保留锁文件；不要混装另一组 SDK 版本。

## 使用方式

在 `app.json` 中定义公开应用配置：

```json
{
  "expo": {
    "name": "My Harmony App",
    "slug": "my-harmony-app"
  }
}
```

业务代码继续从原包名读取配置：

```tsx
import Constants from "expo-constants";
import { Text } from "react-native";

export default function App() {
  return <Text>{Constants.expoConfig?.name ?? "未配置应用名称"}</Text>;
}
```

配置由构建流程生成并嵌入 `app.config`，修改后需要重新生成并构建原生工程。公开配置会进入客户端，请勿放入服务端密钥。

## 鸿蒙支持范围

| API / 字段 | HarmonyOS 实现与限制 |
| --- | --- |
| expoConfig | 公共 JS 读取嵌入配置；缺少 app.config 时原生 manifest 为 null，格式错误会报错 |
| deviceName / systemVersion | 分别来自设备型号与系统版本信息 |
| statusBarHeight | 从窗口系统避让区域读取，并转换为布局单位 |
| systemFonts | 从系统字体接口读取 |
| sessionId / debugMode | 原生模块会话 UUID 和 RNOH 调试状态 |
| getWebViewUserAgentAsync | 从 ArkWeb 获取默认 User Agent |
| Expo Go 专属信息 | 不合成 Expo Go 数据；expoVersion、expoRuntimeVersion 等原生值为 null |

以上是当前源码行为。发布组合已完成模板安装与运行验证，不代表所有字段均已逐项完成设备验收。

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

- [上游参考](https://docs.expo.dev/versions/v54.0.0/sdk/constants/)：用于通用 API 或原始包说明；HarmonyOS 支持以本文为准。
- 原始来源：[Expo 源码](https://github.com/expo/expo/tree/main/packages/expo-constants)。
- 保留上游许可证和来源声明，详见包内 `LICENSE`。遵循 Expo 上游 MIT 许可证。
