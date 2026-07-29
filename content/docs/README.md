# {{appName}}

这是由 `expo-harmony-cli` 创建的 Expo + HarmonyOS 项目。

项目保留 Expo 的 Android、iOS 与 Web 工作流，同时额外注入 HarmonyOS/OpenHarmony 开发基线，包括 RNOH 依赖、Metro 配置、HarmonyOS 原生工程生成能力、patch 管理、原生包适配规则和 Agent 辅助文档。

## 技术基线

| 项目 | 版本 |
| --- | --- |
| Expo | {{expoSdk}} |
| React Native | 0.77.1 |
| React Native OpenHarmony | {{rnohVersion}} |
| bundleName | `{{bundleName}}` |

RNOH 已固定为 `{{rnohVersion}}`，React Native 仍固定为 `0.77.1`。不要单独升级其中一个版本，避免 JS 依赖、HAR、C++/ArkTS 模板和 patch 失配。

## 快速开始

```bash
pnpm install
pnpm dlx expo-harmony-cli prebuild --platform harmony
cd harmony && ohpm install
cd ..
pnpm start:harmony
```

随后在 DevEco Studio 中打开 `harmony/` 目录，选择 `entry` 模块运行到真机或模拟器。

## 三端命令

```bash
# Android
pnpm expo run:android

# iOS
pnpm expo run:ios

# HarmonyOS
pnpm start:harmony
```

## 重要：依赖和 HarmonyOS 工程必须通过 CLI 管理

`expo-harmony-cli` 不只是包装 Expo 命令。它会维护 HarmonyOS 兼容表、依赖版本锁定、patch、Metro alias、RNOH 原生注册、`oh-package.json5`、CMake、PackageProvider 和 `RNOHPackagesFactory`。

请优先使用本 CLI，而不是直接使用 Expo 或包管理器命令。

| 操作 | 推荐命令 | 不推荐 |
| --- | --- | --- |
| 安装依赖 | `pnpm dlx expo-harmony-cli install <pkg>` | `expo install <pkg>` / `pnpm add <pkg>` |
| 卸载依赖 | `pnpm dlx expo-harmony-cli uninstall <pkg>` | `pnpm remove <pkg>` |
| 卸载依赖别名 | `pnpm dlx expo-harmony-cli remove <pkg>` | 手动删 `package.json` |
| 扫描已有依赖 | `pnpm dlx expo-harmony-cli scan` | 手动补 patch / alias |
| 同步原生注册 | `pnpm dlx expo-harmony-cli sync` | 手动改 `harmony/` |
| 生成 HarmonyOS 工程 | `pnpm dlx expo-harmony-cli prebuild --platform harmony` | `expo prebuild` / `npx expo prebuild` |

绕过 CLI 可能导致 JS 依赖、patch 和 HarmonyOS 原生工程状态不一致。

## 文档入口

- HarmonyOS 开发与 CLI 机制：`docs/HARMONY.md`
- patch 说明：`docs/PATCHES.md`
- 常见问题：`docs/TROUBLESHOOTING.md`
- 签名配置：`harmony/SIGNING.md`（执行 prebuild 后生成）
- Agent 工作指南：`AGENTS.md`

## Agent Skills

对外只需要使用这个入口：

```text
.agent/skills/expo-harmony-adapter/SKILL.md
```

它用于辅助适配未内置支持的 Expo/RN 包。内部需要的 HarmonyOS 原生插件集成资料会由该 skill 引导，不需要用户额外记忆入口。
