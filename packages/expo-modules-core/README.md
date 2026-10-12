# @expo-oh/expo-modules-core

Expo Modules 在 HarmonyOS 上的原生基础设施，连接 RNOH、JSI、原生模块与 JavaScript 公共入口。

上游基线：`expo-modules-core@3.0.30`。本包由 [expo-harmony-cli](https://github.com/stonehill-2345/expo-harmony-cli) 项目维护，非 Expo 官方发行版本。

[鸿蒙快速开始](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/harmony/getting-started.md) · [适配源码](https://github.com/stonehill-2345/expo-harmony-cli/tree/main/packages/expo-modules-core) · [验收记录](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/releases/2026-10-09-sdk54-expo-oh-candidate.md) · [问题反馈](https://github.com/stonehill-2345/expo-harmony-cli/issues)

## 安装

以下命令适用于已经配置好 `@expo-oh` SDK54 依赖组合的项目。普通 Expo 项目请先阅读[鸿蒙快速开始](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/harmony/getting-started.md)；仅安装此包不会自动完成 RNOH 和原生工程配置。

```bash
# npm
npm install --save-exact expo-modules-core@npm:@expo-oh/expo-modules-core@3.0.31

# pnpm
pnpm add --save-exact expo-modules-core@npm:@expo-oh/expo-modules-core@3.0.31
```

保留原依赖键：

```json
{
  "dependencies": {
    "expo-modules-core": "npm:@expo-oh/expo-modules-core@3.0.31"
  }
}
```

本包的鸿蒙适配已包含在 npm 产物中，无需额外应用本包的本地 patch。使用完整依赖组合及 overrides，保留锁文件；不要混装另一组 SDK 版本。

## 使用方式

应用通过原包名导入；下面示例查找本组合中的 Constants 原生模块：

```ts
import { requireNativeModule } from "expo-modules-core";
const constants = requireNativeModule("ExponentConstants");
```

业务读取应用信息优先使用 `expo-constants` 的公共 API。原生模块开发者还需要提供 Harmony C++/ArkTS 实现和模块配置，安装 Core 不会自动移植已有 Swift/Kotlin 模块。

## 鸿蒙支持范围

| 能力 | HarmonyOS 行为与边界 |
| --- | --- |
| 原生模块与事件 | 实现运行时级注册、查找、EventEmitter 和订阅 |
| JSI 基础对象 | 包含 NativeModule、SharedObject、SharedRef 及资源销毁处理 |
| 异步调用 | 原生任务通过 RNOH CallInvoker 完成 Promise；取消为协作式 |
| 原生视图 | 存在 Harmony 视图适配及 Fabric 示例，不代表所有视图契约完全对齐 |
| 模块开发 | 不提供完整 Expo Modules DSL 或 Swift/Kotlin 到 ArkTS 的自动转换 |
| 支持承诺 | SDK54 模板验收不等同于全部 Core API、原生视图或生产负载验收 |

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

- [上游参考](https://docs.expo.dev/modules/overview/)：用于通用 API 或原始包说明；HarmonyOS 支持以本文为准。
- 原始来源：[Expo 源码](https://github.com/expo/expo/tree/main/packages/expo-modules-core)。
- 保留上游许可证和来源声明，详见包内 `LICENSE`。遵循 Expo 上游 MIT 许可证。
