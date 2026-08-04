# expo-harmony-cli

使用 Expo SDK 52 创建 React Native 项目，并注入 HarmonyOS（OpenHarmony）开发基线的命令行工具。

它保留 Expo 的 Android、iOS 与 Web 工作流，同时为 HarmonyOS 写入 Metro 配置、RNOH 依赖、原生工程模板、适配规则、patch 与开发文档。

## Key features

- 创建 Expo SDK 52 项目，并自动注入 HarmonyOS 开发基线
- 生成 HarmonyOS 原生工程、Metro 配置、RNOH 依赖和开发文档
- 通过 CLI 管理三方依赖、patch、Metro alias 与 HarmonyOS 原生注册
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

`pnpm start:harmony` 会启动 8888 端口的 Metro，自动尝试执行 `hdc rport tcp:8888 tcp:8888`，并输出局域网地址。真机仍无法加载 bundle 时，在 RNOH Dev Settings 中填写终端输出的 `<局域网 IP>:8888`；也可设置 `HARMONY_METRO_HOST=<局域网 IP>` 显式指定地址。

## Documentation

完整说明和维护命令见 [使用指南](./docs/guide.md)。
