# expo-harmony-cli

使用 Expo SDK 52 创建 React Native 项目，并注入 HarmonyOS（OpenHarmony）开发基线的命令行工具。

一条命令，一键初始化一个开箱即跑鸿蒙的 Expo（基于 RN）工程——同一套代码覆盖鸿蒙、iOS、安卓三端，全程沿用 Expo 的 CNG（配置驱动、随时重建）工作流。

## Key features

- 创建 Expo SDK 52 项目，并自动注入 HarmonyOS 开发基线
- 生成 HarmonyOS 原生工程、Metro 配置、RNOH 依赖和开发文档
- 通过 CLI 管理三方依赖、patch、Metro alias 与 HarmonyOS 原生注册
- 内置 `env` / `doctor` 诊断命令：工具链环境检查、项目健康诊断，退出码分级可接入 CI
- HarmonyOS 原生文件变更保护：autolinking 托管文件被手动修改时阻断覆盖并给出指引，事务写入失败自动回滚
- 保留 Android、iOS 与 Web 的 Expo 标准工作流

## 使用方法

### Quick Start

```bash
# 1. 创建项目
npx expo-harmony-cli my-harmony-app
# pnpm 用户也可以使用：
pnpm dlx expo-harmony-cli my-harmony-app

# 2. 安装 JS 依赖并应用 HarmonyOS patch
cd my-harmony-app
pnpm install

# 3. 首次生成 HarmonyOS 原生工程
pnpm dlx expo-harmony-cli prebuild --platform harmony

# 4. 安装 ArkTS / HAR 原生依赖
cd harmony
ohpm install

# 5. 回到项目根目录，启动 HarmonyOS Metro
cd ..
pnpm start:harmony
```

随后在 DevEco Studio 中打开项目的 `harmony/` 目录，选择 `entry` 模块并运行到真机或模拟器。

`pnpm start:harmony` 会启动 8081 端口的 Harmony Metro（与 Android/iOS 统一），自动执行 `hdc rport tcp:8081 tcp:8081`，并输出局域网地址。

### 环境诊断

```bash
# 检查 node / hvigor / ohpm / hdc 等工具链的版本与可用性
pnpm dlx expo-harmony-cli env

# 环境汇总 + 项目诊断（受管文件漂移、依赖基线），并给出下一步建议
pnpm dlx expo-harmony-cli doctor
```

退出码：`0` 全部通过、`1` 存在失败、`2` 仅有警告，可直接接入 CI。

CLI 生成的 autolinking 托管文件（`RNOHPackagesFactory.ets/.h`、`autolinking.cmake` 及 `oh-package.json5` 中托管依赖条目）被手动修改后，`sync` / `install` / `uninstall` 会保护性阻断，需还原修改或加 `--force` 覆盖；自定义 Package 请注册在 `PackageProvider.ets` / `PackageProvider.cpp`（归用户管理，CLI 不会覆盖）。

## Documentation

完整说明和维护命令见 [使用指南](./docs/guide.md)。
