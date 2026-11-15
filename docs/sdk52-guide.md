# SDK 52 使用指南（Legacy）

`expo-harmony-cli` 在 SDK 52 时代以 **patch + 注入** 方式适配 HarmonyOS：CLI 负责创建项目、管理三方依赖补丁、生成鸿蒙原生工程。SDK 54 已切换为整包适配方案（见主 [README](../README.md)），SDK 52 流程保持 legacy 支持。

> 两个版本怎么选？新项目直接用 [SDK 54](../README.md#快速开始)；已有 SDK 52 项目继续按本文档维护。

## 环境要求

| 项 | 要求 |
| --- | --- |
| Node.js | ≥ 20.19.4 |
| pnpm | ≥ 10.19.0 |
| DevEco Studio | 5.0+（含 OpenHarmony SDK、ohpm、hdc） |
| Expo / RN / RNOH | Expo 52.x / React Native 0.77.x / RNOH 0.77.x |

## 创建项目

```bash
npx expo-harmony-cli@latest my-harmony-app --sdk 52
cd my-harmony-app
pnpm install
```

## 生成鸿蒙原生工程

```bash
npx expo-harmony-cli prebuild --platform harmony
```

首次生成会创建 `harmony/` 目录（DevEco Studio 工程），并通过 patch 机制为依赖注入鸿蒙适配。

## 安装原生依赖并运行

```bash
cd harmony
ohpm install        # 安装 ArkTS / HAR 原生依赖
cd ..
pnpm start:harmony  # 启动鸿蒙 Metro（8081 端口）
```

随后在 DevEco Studio 中打开 `harmony/` 目录，选择 `entry` 模块，运行到真机或模拟器。

## 三方依赖管理

CLI 对依赖分五类自动处理，均以 `pnpm dlx expo-harmony-cli list` 输出为准：

| 类别 | 行为 |
| --- | --- |
| 纯 JS 包 | 直接可用 |
| alias-only | 通过 alias 指向鸿蒙适配版 |
| native / bump-native | 调整原生版本并注册 |
| patch-only | 应用内置 patch |
| unsupported | 逐包提示适配指引 |

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npx expo-harmony-cli create <dir> --sdk 52` | 创建 SDK52 项目 |
| `npx expo-harmony-cli prebuild --platform harmony` | 生成/更新鸿蒙工程 |
| `npx expo-harmony-cli install <pkg>` | 安装并注入鸿蒙适配 |
| `npx expo-harmony-cli uninstall <pkg>` | 卸载并清理受管适配资产 |
| `npx expo-harmony-cli scan` | 重跑适配扫描 |
| `npx expo-harmony-cli env` / `doctor` | 环境与项目诊断 |

## 常见问题

**Q：SDK52 项目能直接升级到 SDK54 吗？**
不自动迁移。推荐用 SDK54 模板新建项目后迁移业务代码、资源与应用配置；SDK52 patch 不会带入新项目。

**Q：iOS / Android 还能用吗？**
可以。`expo run:ios` / `expo run:android` 工作流不受影响，鸿蒙只是新增的平台目标。

**Q：更多排障问题？**
见 [CLI 使用指南](../apps/cli/docs/guide.md)。
