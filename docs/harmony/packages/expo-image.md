# @expo-oh/expo-image

Expo Image 3.0.11 的 HarmonyOS 初始适配版本，为 SDK54 default 模板提供 PNG 图片原生视图。

上游基线：`expo-image@3.0.11`。本包由 [expo-harmony-cli](https://github.com/stonehill-2345/expo-harmony-cli) 项目维护，非 Expo 官方发行版本。

[鸿蒙快速开始](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/harmony/getting-started.md) · [适配源码](https://github.com/stonehill-2345/expo-harmony-cli/tree/main/scripts/sdk54/external-overlays/expo-image-3.0.11) · [问题反馈](https://github.com/stonehill-2345/expo-harmony-cli/issues)

## 安装

以下命令适用于已经配置好 `@expo-oh` SDK54 依赖组合的项目：

```bash
# npm
npm install --save-exact expo-image@npm:@expo-oh/expo-image@3.0.12

# pnpm
pnpm add --save-exact expo-image@npm:@expo-oh/expo-image@3.0.12
```

保留官方依赖键：

```json
{
  "dependencies": {
    "expo-image": "npm:@expo-oh/expo-image@3.0.12"
  }
}
```

只安装本包不会自动完成 RNOH、Expo Modules Core、Asset 和原生工程配置；应使用同一 SDK54 release manifest 与 overrides。

## 使用方式

保留官方 Expo Image API：

```tsx
import { Image } from "expo-image";

export default function Logo() {
  return <Image source={require("./assets/logo.png")} contentFit="contain" />;
}
```

生成并运行原生工程：

```bash
npx expo prebuild --platform harmony
npx expo run:harmony
```

## 鸿蒙支持范围

| 能力 | HarmonyOS 实现与限制 |
| --- | --- |
| PNG 来源 | 支持 `asset://`、`resource://RAWFILE/`、`file:///` 及 HTTP(S) PNG URI |
| contentFit | 支持 `cover`、`contain`、`fill`，当前仅居中定位 |
| 生命周期事件 | 支持 loadStart、load、error、progress；loadEnd 由官方 JS 派生 |
| reloadAsync | 支持重新发起当前请求 |
| 请求替换/卸载 | 旧请求完成事件不会进入新请求；卸载清理原生节点 |
| 缓存 | `cacheType` 当前固定为 none，不承诺 Expo 缓存语义 |
| 未支持能力 | ImageRef、多 source、placeholder/hash、headers、动画、transition、tint、blur、完整缓存 API 等会明确拒绝 |

这是受限 PNG 初始实现，不等同 Expo Image 全 API 已支持。default 模板页面通过不代表网络、动画、缓存和所有设备组合已完成验收。

## 上游与许可证

- [上游参考](https://docs.expo.dev/versions/v54.0.0/sdk/image/)：用于通用 API 说明；HarmonyOS 支持以本文为准。
- 原始来源：[Expo Image npm 包](https://www.npmjs.com/package/expo-image/v/3.0.11)。
- 保留上游许可证和来源声明，详见包内 `LICENSE`。遵循 Expo 上游 MIT 许可证。
