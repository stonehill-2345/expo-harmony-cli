# @expo-oh/expo-splash-screen

Expo SplashScreen 的 HarmonyOS 适配版本，通过 ArkUI 覆盖层与 RNOH 内容加载生命周期管理启动屏。

上游基线：`expo-splash-screen@31.0.13`。本包由 [expo-harmony-cli](https://github.com/stonehill-2345/expo-harmony-cli) 项目维护，非 Expo 官方发行版本。

[鸿蒙快速开始](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/harmony/getting-started.md) · [适配源码](https://github.com/stonehill-2345/expo-harmony-cli/tree/main/packages/expo-splash-screen) · [验收记录](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/releases/2026-10-09-sdk54-expo-oh-candidate.md) · [问题反馈](https://github.com/stonehill-2345/expo-harmony-cli/issues)

## 安装

以下命令适用于已经配置好 `@expo-oh` SDK54 依赖组合的项目。普通 Expo 项目请先阅读[鸿蒙快速开始](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/harmony/getting-started.md)；仅安装此包不会自动完成 RNOH 和原生工程配置。

```bash
# npm
npm install --save-exact expo-splash-screen@npm:@expo-oh/expo-splash-screen@31.0.14

# pnpm
pnpm add --save-exact expo-splash-screen@npm:@expo-oh/expo-splash-screen@31.0.14
```

保留原依赖键：

```json
{
  "dependencies": {
    "expo-splash-screen": "npm:@expo-oh/expo-splash-screen@31.0.14"
  }
}
```

本包的鸿蒙适配已包含在 npm 产物中，无需额外应用本包的本地 patch。使用完整依赖组合及 overrides，保留锁文件；不要混装另一组 SDK 版本。

## 使用方式

在组件外声明启动屏控制，在页面布局就绪后隐藏：

```tsx
import * as SplashScreen from "expo-splash-screen";
import { Text, View } from "react-native";

SplashScreen.preventAutoHideAsync().catch(console.error);

export default function App() {
  return (
    <View style={{ flex: 1 }} onLayout={() => SplashScreen.hide()}>
      <Text>应用已就绪</Text>
    </View>
  );
}
```

需要异步加载字体或资源时，待资源就绪且根视图完成布局再隐藏。Router 有内部启动屏控制，业务显式 prevent 后仍需自行 hide。

## 鸿蒙支持范围

| API / 场景 | HarmonyOS 实现与限制 |
| --- | --- |
| preventAutoHideAsync / hide / hideAsync | 显式控制真实 ArkUI 启动屏覆盖层 |
| 自动隐藏 | 未被显式持有时，响应 RNOH CONTENT_APPEARED |
| setOptions | duration 默认 400、fade 默认 false；fade 使用 ArkUI 动画 |
| reload / 销毁 | 使用运行时代次隔离旧回调，并清理监听器 |
| 原生接入 | 必须保留同一个 Ability controller、生命周期及覆盖层；仅注册 TurboModule 不够 |
| 验收边界 | 模板启动已验证，不能推导所有动画参数与生命周期组合均已设备验证 |

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

- [上游参考](https://docs.expo.dev/versions/v54.0.0/sdk/splash-screen/)：用于通用 API 或原始包说明；HarmonyOS 支持以本文为准。
- 原始来源：[Expo 源码](https://github.com/expo/expo/tree/main/packages/expo-splash-screen)。
- 保留上游许可证和来源声明，详见包内 `LICENSE`。遵循 Expo 上游 MIT 许可证。
