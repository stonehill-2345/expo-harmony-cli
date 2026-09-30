# HarmonyOS 开发

SDK54 使用官方 Expo 命令入口和已应用 patch 的本地 Expo 包：

```bash
npx expo prebuild --platform harmony
npx expo run:harmony --device "$HARMONY_DEVICE_ID"
npx expo run:harmony --configuration Release --no-build-cache --device "$HARMONY_DEVICE_ID"
npx expo start
```

Default 模板将两处 `expo-image` Image 改为 React Native Image；本版本没有 expo-image Harmony backend。Router 验收范围是单层 `dismissTo`，ArkWeb 范围是普通页面打开与关闭，不等同系统浏览器认证会话。
