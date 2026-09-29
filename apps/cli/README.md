# expo-harmony-cli

使用 Expo SDK 创建 React Native 项目，并注入 HarmonyOS（OpenHarmony）开发基线的命令行工具。

<p align="center">
  <strong>用 Expo 工作流，一套 React Native 代码同时覆盖 HarmonyOS、iOS、Android 三端</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/expo-harmony-cli"><img src="https://img.shields.io/npm/v/expo-harmony-cli" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/expo-harmony-cli"><img src="https://img.shields.io/npm/dm/expo-harmony-cli" alt="npm downloads"></a>
  <a href="https://github.com/stonehill-2345/expo-harmony-cli/blob/main/LICENSE"><img src="https://img.shields.io/github/license/stonehill-2345/expo-harmony-cli" alt="license"></a>
  <a href="https://github.com/stonehill-2345/expo-harmony-cli"><img src="https://img.shields.io/github/stars/stonehill-2345/expo-harmony-cli" alt="GitHub stars"></a>
</p>

## 这是什么？

**一句话**：`expo-harmony-cli` 是一个命令行工具，让你用 Expo SDK 创建项目，一键生成 HarmonyOS（OpenHarmony）原生工程，同一套 JS/TS 代码同时运行在鸿蒙、iOS、Android 上。

- 🎯 **问题**：React Native 生态缺乏标准化的鸿蒙开发工具链，手动配置鸿蒙原生工程繁琐且易出错
- ✅ **解决**：一条 `npx` 命令完成项目创建、鸿蒙工程生成、依赖管理、原生注册，沿用 Expo CNG（Continuous Native Generation）工作流

## 目录

- [1.5.0：SDK54 package-patch](#150sdk54-package-patch)
- [快速开始](#快速开始)
- [核心能力](#核心能力)
- [效果预览](#效果预览)
- [常用命令](#常用命令)
- [环境与支持范围](#环境与支持范围)
- [与 Expo 标准工作流的关系](#与-expo-标准工作流的关系)
- [常见问题](#常见问题)
- [文档](#文档)
- [源码仓库](#源码仓库)

## 1.5.0：SDK54 package-patch

SDK54 在 1.5.0 中使用官方 `create-expo-app@5.0.0` 创建 fresh 项目，并通过精确版本 package patches 提供 Harmony 能力；SDK52 继续使用原有 legacy 流程。

### 创建 SDK54 Default + Expo Router

```bash
npx expo-harmony-cli@1.5.0 create my-app \
  --sdk 54 \
  --template default \
  --pnpm
```

### 创建 SDK54 Blank TypeScript

```bash
npx expo-harmony-cli@1.5.0 create my-blank-app \
  --sdk 54 \
  --template blank-typescript \
  --pnpm
```

SDK54 支持 npm 和 pnpm；使用 npm 时将 `--pnpm` 换为 `--npm`。Yarn/Bun 会在创建目录前失败关闭。

项目创建后使用项目内经过 patch 的官方 Expo CLI：

```bash
cd my-app
npx expo prebuild --platform harmony
npx expo start
npx expo run:harmony

# clean Release
npx expo run:harmony --configuration Release --no-build-cache
```

SDK54 1.5.0 的公开保证范围是 fresh `default` 和 `blank-typescript`：

- Default 模板只将 `app/(tabs)/index.tsx`、`app/(tabs)/explore.tsx` 中的 `expo-image` 用法替换为 React Native `Image`；本版本没有 `expo-image` Harmony backend。
- Router `dismissTo` 验收范围为单层返回；ArkWeb 验收范围为普通页面打开/关闭。
- 旧 SDK54 项目只诊断、不自动迁移；建议 fresh create 后迁移业务源码和配置，不要复制旧 `harmony/`、shim 或 patch。
- SDK55 及更高版本会明确拒绝，不会静默套用 SDK54 patch。

### 对 SDK52 的影响

SDK52 的 creator、injector、scanner、cleanup、依赖管理和 Harmony generator 保持 legacy 流程。创建命令仍为：

```bash
npx expo-harmony-cli@1.5.0 create my-sdk52-app --sdk 52
```

## 快速开始

> 以下步骤是 SDK52 legacy 工作流。SDK54 请使用上面的 1.5.0 package-patch 命令。

```bash
# 1. 创建 SDK52 项目
npx expo-harmony-cli@1.5.0 my-harmony-app --sdk 52

# 2. 安装 JS 依赖并应用 HarmonyOS patch
cd my-harmony-app
pnpm install

# 3. 首次生成 HarmonyOS 原生工程
npx expo-harmony-cli prebuild --platform harmony

# 4. 安装 ArkTS / HAR 原生依赖
cd harmony
ohpm install

# 5. 回到项目根目录，启动 HarmonyOS Metro
cd ..
pnpm start:harmony
```

随后在 DevEco Studio 中打开项目的 `harmony/` 目录，选择 `entry` 模块并运行到真机或模拟器。

## 核心能力

| 能力                | 说明                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------- |
| 🚀 **一键创建**     | `npx expo-harmony-cli <目录名> [--sdk=52\|54]` 创建 Expo 项目，自动注入 HarmonyOS 开发基线    |
| 🧬 **原生工程生成** | 生成 HarmonyOS 原生工程、Metro 配置、RNOH（React Native OpenHarmony）依赖和开发文档           |
| 📦 **依赖管理**     | 通过 CLI 统一管理三方依赖、patch、Metro alias 与 HarmonyOS 原生注册                           |
| 🔗 **智能原生注册** | 官方优先：优先调用 RNOH 官方 `link-harmony`，未覆盖由内置映射表补充，均未覆盖逐包提示适配指引 |
| 🩺 **环境诊断**     | 内置 `env` / `doctor` 命令，工具链检查 + 项目健康诊断，退出码分级可接入 CI                    |
| 🛡️ **文件保护**     | autolinking 托管文件被手动修改时阻断覆盖，事务写入失败自动回滚                                |
| 🔄 **Expo 兼容**    | 保留 Android、iOS 与 Web 的 Expo 标准工作流，不影响现有开发生态                               |

## 效果预览

<p align="center">
  <img src="./assets/screenshot.png" alt="鸿蒙运行效果" width="435">
</p>

## 常用命令

SDK54 项目使用官方 Expo 命令：

| 命令 | 用途 |
| --- | --- |
| `npx expo-harmony-cli@1.5.0 doctor` | 检查 managed-state、patch、版本和 runtime probes |
| `npx expo prebuild --platform harmony` | 生成 SDK54 Harmony 原生工程 |
| `npx expo start` | 启动 SDK54 Harmony Metro |
| `npx expo run:harmony` | Debug 构建、安装并启动 |
| `npx expo run:harmony --configuration Release --no-build-cache` | clean Release 构建、安装并启动 |

下面保留的 `expo-harmony-cli install/prebuild/scan/sync` 等命令对应 SDK52 legacy 流程：

| 命令                                               | 用途                                   |
| -------------------------------------------------- | -------------------------------------- |
| `npx expo-harmony-cli <目录名>`                    | 创建项目并注入 HarmonyOS 基线          |
| `npx expo-harmony-cli install <包名>`              | 安装依赖，自动追加 HarmonyOS 适配      |
| `npx expo-harmony-cli prebuild --platform harmony` | 生成 HarmonyOS 原生工程                |
| `npx expo-harmony-cli doctor`                      | 环境 + 项目健康诊断（退出码可接入 CI） |
| `pnpm start:harmony`                               | 启动 HarmonyOS Metro（端口 8081）      |

> 完整命令参考（`sync`、`scan`、`env`、`list`、`uninstall` 等）见 [使用指南 → 常用命令](./docs/guide.md#常用命令)。

## 环境与支持范围

| 项                               | 要求 / 基线                               |
| -------------------------------- | ----------------------------------------- |
| Node.js                          | ≥ 20.19.4                                 |
| pnpm                             | ≥ 10.19.0                                 |
| DevEco Studio                    | 5.0+（含 OpenHarmony SDK、ohpm、hdc）     |
| Expo                             | SDK 52（Expo 52.x）或 SDK 54（Expo 54.x） |
| React Native                     | 0.77.x（SDK 52）或 0.82.x（SDK 54）       |
| RNOH（React Native OpenHarmony） | 0.77.x（SDK 52）或 0.82.x（SDK 54）       |
| iOS 构建                         | 遵循对应 Expo SDK 版本官方要求            |

> 详细环境配置见 [使用指南 → 环境要求](./docs/guide.md#环境要求)。

## 与 Expo 标准工作流的关系

`expo-harmony-cli` **不是 Expo 的替代品**，而是 Expo 的 HarmonyOS 扩展层：

- ✅ 沿用 Expo CNG（配置驱动、随时重建原生工程）工作流
- ✅ `expo run:android` / `expo run:ios` 照常使用
- ✅ 鸿蒙 Metro 与 Android/iOS 统一使用 8081 端口
- ✅ 鸿蒙构建通过 DevEco Studio 完成，CLI 负责工程生成与依赖同步

本质上，你在 Expo 项目里多了一个 `--platform harmony` 选项，其他一切不变。

## 常见问题

### 为什么需要这个工具？直接用 Expo 不行吗？

Expo 官方目前不支持 HarmonyOS 平台。`expo-harmony-cli` 在 Expo SDK 基础上，通过 RNOH（React Native OpenHarmony）桥接层，让同一套 React Native 代码能运行在鸿蒙设备上。

### 支持哪些 React Native 库？

CLI 对依赖分五类自动处理：纯 JS 包、alias-only、native/bump-native、patch-only、unsupported。以 `pnpm dlx expo-harmony-cli list` 输出为准。详见 [使用指南 → 三方依赖](./docs/guide.md#三方依赖)。

### 旧 SDK54 项目可以直接升级到 1.5.0 吗？

不自动升级。1.5.0 只对旧 SDK54 项目做只读诊断，推荐使用同模板 fresh create 新项目后迁移业务代码、资源和应用配置。

### 和 [react-native-harmony](https://github.com/react-native-oh-library/react-native-harmony) 是什么关系？

`expo-harmony-cli` 底层依赖 RNOH 作为鸿蒙桥接层，在此基础上封装了 Expo CNG 工作流、自动化依赖管理、原生注册。直接用 RNOH 裸 SDK 需手动完成所有原生工程配置；本工具把这些自动化了。

> 更多排障问题（依赖安装、构建失败、bundle 加载等）见 [使用指南 → 常见问题](./docs/guide.md#常见问题)。

## 文档

完整使用指南见 [docs/guide.md](./docs/guide.md)。

## 源码仓库

- GitHub：[stonehill-2345/expo-harmony-cli](https://github.com/stonehill-2345/expo-harmony-cli)
- Gitee：[stonehill-2345/expo-harmony-cli](https://gitee.com/stonehill-2345/expo-harmony-cli)
- AtomGit：[stonehill-2345/expo-harmony-cli](https://atomgit.com/stonehill-2345/expo-harmony-cli)

## 赞赏

如果这个项目帮到了你，随手点个 ⭐ Star 就是最好的支持——也让更多做鸿蒙 React Native 开发的朋友能搜到它 🙏

## License

MIT
