# @expo-oh/expo-asset

Expo Asset 的 HarmonyOS 适配版本，用于下载资源和解析嵌入应用的资源文件。

上游基线：`expo-asset@12.0.13`。本包由 [expo-harmony-cli](https://github.com/stonehill-2345/expo-harmony-cli) 项目维护，非 Expo 官方发行版本。

[鸿蒙快速开始](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/harmony/getting-started.md) · [适配源码](https://github.com/stonehill-2345/expo-harmony-cli/tree/main/packages/expo-asset) · [验收记录](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/releases/2026-10-09-sdk54-expo-oh-candidate.md) · [问题反馈](https://github.com/stonehill-2345/expo-harmony-cli/issues)

## 安装

以下命令适用于已经配置好 `@expo-oh` SDK54 依赖组合的项目。普通 Expo 项目请先阅读[鸿蒙快速开始](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/harmony/getting-started.md)；仅安装此包不会自动完成 RNOH 和原生工程配置。

```bash
# npm
npm install --save-exact expo-asset@npm:@expo-oh/expo-asset@12.0.14

# pnpm
pnpm add --save-exact expo-asset@npm:@expo-oh/expo-asset@12.0.14
```

保留原依赖键：

```json
{
  "dependencies": {
    "expo-asset": "npm:@expo-oh/expo-asset@12.0.14"
  }
}
```

本包的鸿蒙适配已包含在 npm 产物中，无需额外应用本包的本地 patch。使用完整依赖组合及 overrides，保留锁文件；不要混装另一组 SDK 版本。

## 使用方式

先将图片放到项目的 `assets/logo.png`：

```ts
import { Asset } from "expo-asset";

export async function loadLogo() {
  const asset = Asset.fromModule(require("./assets/logo.png"));
  await asset.downloadAsync();
  return asset.localUri;
}
```

网络资源使用 `Asset.fromURI(url)`；HTTP/HTTPS 下载需要应用声明 `ohos.permission.INTERNET`。生成的标准 Harmony 工程已配置网络权限。

## 鸿蒙支持范围

| 能力 | HarmonyOS 实现与限制 |
| --- | --- |
| downloadAsync | 原生后端处理 HTTP/HTTPS 和嵌入 rawfile，返回 file:// URI |
| 缓存 | 临时文件写入、可选 MD5 校验和原子重命名；提供 hash 时复核已有缓存 |
| 内嵌资源 | RNOH assetsDest 必须与 Metro rawfile 输出路径一致 |
| 生命周期 | 模块销毁时取消请求并清理临时文件；不承诺底层连接立即断开 |
| 其他 URI | 不将任意 URI 协议或上游全部平台行为视为鸿蒙支持 |

模板运行验收不等于所有资源类型、网络异常和缓存场景均完成设备验证。

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

- [上游参考](https://docs.expo.dev/versions/v54.0.0/sdk/asset/)：用于通用 API 或原始包说明；HarmonyOS 支持以本文为准。
- 原始来源：[Expo 源码](https://github.com/expo/expo/tree/main/packages/expo-asset)。
- 保留上游许可证和来源声明，详见包内 `LICENSE`。遵循 Expo 上游 MIT 许可证。
