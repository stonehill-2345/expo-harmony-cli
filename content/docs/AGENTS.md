# Agent Guide

本文档给 AI/Agent 和维护者使用，说明 `{{appName}}` 由 `expo-harmony-cli` 管理后的边界和推荐操作。

## 项目基线

- Expo {{expoSdk}}
- React Native 0.77.1
- React Native OpenHarmony {{rnohVersion}}
- bundleName: `{{bundleName}}`

## 管理边界

以下内容由 CLI 生成或维护：

- `app.json` 中的 `expo.harmony` 配置
- `metro.config.js`
- `index.harmony.js`
- `scripts/start-harmony.js`
- `scripts/bundle-harmony-dev.js`
- `scripts/bundle-harmony-release.js`
- `patches/`
- `shims/`
- `.expo-harmony/managed-state.json`
- `harmony/` 中生成器管理的模板文件

不要绕过 CLI 手动安装、卸载或同步 HarmonyOS 原生依赖。

## 推荐命令

```bash
pnpm dlx expo-harmony-cli install <pkg>
pnpm dlx expo-harmony-cli uninstall <pkg>
pnpm dlx expo-harmony-cli remove <pkg>
pnpm dlx expo-harmony-cli scan
pnpm dlx expo-harmony-cli sync
pnpm dlx expo-harmony-cli prebuild --platform harmony
pnpm start:harmony
```

Android 和 iOS 保持 Expo 标准流程：

```bash
pnpm expo run:android
pnpm expo run:ios
```

## 不推荐

```bash
expo install <pkg>
pnpm add <pkg>
pnpm remove <pkg>
expo prebuild
npx expo prebuild
```

这些命令不会维护 HarmonyOS patch、alias、原生注册和托管状态。

## Skill 入口

- `.agent/skills/expo-harmony-adapter/SKILL.md`：适配 Expo/RN 包到 HarmonyOS。

优先使用 CLI 兼容表已有能力；只有包不在兼容表或 CLI 提示 unsupported 时，再参考该 skill 手动适配。它会在需要时引导使用内部的 HarmonyOS 原生插件集成资料，不需要额外暴露第二个入口。
