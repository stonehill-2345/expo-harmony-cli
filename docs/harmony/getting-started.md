# Expo SDK54 HarmonyOS 快速开始

`@expo-oh` 提供 14 个 Expo 适配包和 1 个 RNOH Screens 衍生包。项目保留原依赖名，通过 npm alias 安装已经内置鸿蒙适配的包；新 scoped 项目不需要为这 15 个包复制 patch 或安装 patch-package。

## 先区分 CLI 和运行时包

- `expo-harmony-cli` 是无 scope 的项目创建工具，独立发布。
- `@expo-oh/expo-cli` 是项目内的适配 Expo CLI，提供 `npx expo` 命令。
- 无 scope CLI `expo-harmony-cli@1.6.0` 已发布，提供 scoped 创建流程，仍锁定首轮运行时组合 `sdk54-expo-oh-harmony.0`；1.5.x 的历史创建流程使用 patch。本页包清单对应本次 README 补丁发布组合 `sdk54-expo-oh-harmony.1`，产品 CLI 的默认组合将在后续独立发布时更新。

下面锁定 CLI 版本，避免 `latest` 的后续变化影响当前 SDK54 组合。

## 环境与版本

| 项目 | 基线 |
| --- | --- |
| Node.js | ≥ 20.19.4；仓库 SDK 工具检查建议使用 Node 22.20.0 |
| pnpm（仓库开发） | 10.19.0 |
| 模板 | SDK54 blank-typescript / default |
| React / React Native | 19.1.1 / 0.82.1 |
| RNOH / RNOH CLI | 0.82.30 |
| 项目包管理器 | npm 或 pnpm |
| 原生工具 | DevEco Studio、匹配的 HarmonyOS SDK、ohpm、hvigor、hdc 和可用签名 |

发布记录使用 OpenHarmony SDK 20 和 HarmonyOS 6.0 模拟器。其他系统与工具链组合需要实际验证，不由版本下限推导兼容。

## 创建新项目

在希望存放应用的目录执行：

```bash
npx expo-harmony-cli@1.6.0 create my-app --sdk 54 --template default --npm
```

轻量模板使用 `--template blank-typescript`；pnpm 项目改用 `--pnpm`。

创建过程拉取固定的 create-expo-app 模板，生成所选模板的 alias、精确依赖、npm/pnpm overrides 和受管状态，并执行安装及运行探针。15 包是完整发布集合，各模板按清单选择所需模块。应用从 npm registry 获取适配包，不依赖仓库内的 tgz 或源码路径。

### 开发者从源码运行 CLI

在仓库根目录：

```bash
pnpm install --frozen-lockfile
pnpm build
```

切换到希望存放应用的目录，然后执行（把绝对路径替换为实际仓库路径）：

```bash
node /absolute/path/to/expo-harmony-cli/apps/cli/dist/index.js create my-app \
  --sdk 54 --template default --npm
```

## 构建与开发

```bash
cd my-app
npx expo prebuild --platform harmony
npx expo run:harmony
npx expo start
```

首次运行前配置 DevEco 工具链、设备和签名。可用 DevEco 打开生成的 `harmony/` 工程检查构建配置。原生依赖或应用配置修改后重新 prebuild 和构建。

需要 clean Release 时：

```bash
npx expo run:harmony --configuration Release --no-build-cache
```

设备验收包含 Debug、clean Release 和无 Metro 冷启动，具体观察及限制见[发布记录](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/releases/2026-10-09-sdk54-expo-oh-candidate.md)；本指南本次更新未重新进行设备验收。

## 安装适配模块

已配置的 scoped 项目使用：

```bash
npx expo install expo-font
npx expo install --check
```

需要修正依赖组合时使用 `npx expo install --fix`，检查其变更并保留锁文件。各包 README 中还提供精确 alias 命令；它们适用于当前兼容组合，不是将任意旧项目直接升级的完整步骤。

npm 和 pnpm 的 overrides 用于防止传递 peer 解析出官方 Expo 副本。不要删除它们，不要用 `--force` 或 `--legacy-peer-deps` 代替依赖问题排查。

## 各包说明

本次版本变更见 [README 补丁发布记录](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/releases/2026-10-10-sdk54-expo-oh-readme-release.md)。

下表版本均已公开发布，`harmony` 和 `latest` 标签均已指向这些版本。`expo-harmony-cli@1.6.0 create` 仍安装首轮版本；使用下列新版本时，需同步 package.json 中已有的 alias、npm overrides 与 pnpm overrides，保持整组一致。不要只替换一个直接依赖而保留旧的 overrides。

| 发布包 | 原依赖键 | README 补丁版本 |
| --- | --- | --- |
| [@expo-oh/expo-cli](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/packages/@expo/cli/README.md) | @expo/cli | 54.0.28 |
| [@expo-oh/expo-metro-config](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/packages/@expo/metro-config/README.md) | @expo/metro-config | 54.0.18 |
| [@expo-oh/expo](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/packages/expo/README.md) | expo | 54.0.38 |
| [@expo-oh/expo-asset](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/packages/expo-asset/README.md) | expo-asset | 12.0.14 |
| [@expo-oh/expo-constants](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/packages/expo-constants/README.md) | expo-constants | 18.0.15 |
| [@expo-oh/expo-font](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/packages/expo-font/README.md) | expo-font | 14.0.13 |
| [@expo-oh/expo-linking](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/packages/expo-linking/README.md) | expo-linking | 8.0.13 |
| [@expo-oh/expo-modules-autolinking](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/packages/expo-modules-autolinking/README.md) | expo-modules-autolinking | 3.0.28 |
| [@expo-oh/expo-modules-core](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/packages/expo-modules-core/README.md) | expo-modules-core | 3.0.31 |
| [@expo-oh/expo-router](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/packages/expo-router/README.md) | expo-router | 6.0.25 |
| [@expo-oh/expo-splash-screen](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/packages/expo-splash-screen/README.md) | expo-splash-screen | 31.0.14 |
| [@expo-oh/expo-status-bar](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/packages/expo-status-bar/README.md) | expo-status-bar | 3.0.10 |
| [@expo-oh/expo-system-ui](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/packages/expo-system-ui/README.md) | expo-system-ui | 6.0.10 |
| [@expo-oh/expo-web-browser](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/packages/expo-web-browser/README.md) | expo-web-browser | 15.0.12 |
| [@expo-oh/react-native-screens](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/harmony/packages/react-native-screens.md) | @react-native-ohos/react-native-screens | 4.9.1 |

Screens 使用 RNOH 依赖键 `@react-native-ohos/react-native-screens`；业务中的普通 Screens 导入由 Harmony alias 处理，不要把两者混为一个依赖键。

## 支持范围与旧项目

- 新流程只覆盖 SDK54 的上述两种模板；SDK52 继续使用 legacy 流程。
- 旧 SDK54 patch 项目不自动迁移，不要直接删除其 patch 或 postinstall。先新建项目，再迁移业务代码与配置。
- Default 模板使用 React Native Image 替换既有 expo-image 用法；不代表提供了 expo-image 鸿蒙后端。
- 包内已实现与设备已验证是两种不同结论，各包 README 分别记录 API 限制。
- Expo Go、EAS 云构建/更新、其他 Expo 原生模块及任意第三方 config plugin 不由本组合自动提供鸿蒙支持。
- 本次仅升级并发布 15 个运行时包的补丁版本；产品 CLI 暂不改动、不发布。

## 常见问题

**default 模板提示三个 React Navigation 依赖需要更新？** 当前 `expo install --check` 对这三个版本区间存在既有误报，具体版本和新旧组合复现结果见[补丁发布记录](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/releases/2026-10-10-sdk54-expo-oh-readme-release.md)。先核对完整组合与锁文件，不要仅凭这三项提示反复升级依赖。

**`expo --version` 与 npm 包版本不同？** `@expo-oh/expo-cli` 的命令输出仍是内嵌的上游基线版本；实际 fork 版本请查看 `node_modules/@expo/cli/package.json`。

**原生模块找不到？** 检查实际 alias 和锁文件，使用同组合的 Core/Autolinking，重新 prebuild 和构建。手工工程还需核对原生包与生命周期注册。

**安装后拉入官方 Expo 副本？** 检查完整依赖和 overrides，保留安装日志与依赖树，不通过跳过 peer 校验掩盖问题。

**Metro 启动正常但设备白屏？** 检查原生构建日志、Screens 注册、设备连接及 JS 错误；仅 Metro 启动不能证明原生依赖可用。

请向[本仓库 Issues](https://github.com/stonehill-2345/expo-harmony-cli/issues) 提交包版本、设备/系统版本、最小复现和日志。Expo 官方文档作为通用 API 参考，鸿蒙问题由本项目跟踪。
