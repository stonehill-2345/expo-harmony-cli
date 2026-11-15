# expo-harmony-cli

Expo 工作流的 HarmonyOS（OpenHarmony）扩展 CLI：创建项目、生成鸿蒙原生工程、依赖补丁管理、环境诊断——一套 React Native 代码同时运行在鸿蒙、iOS、Android。

> 🚀 **新项目推荐 SDK 54**：整包适配、支持 Fast Refresh 与 `expo run:harmony` 一条命令真机运行，见 [GitHub 主页快速开始](https://github.com/stonehill-2345/expo-harmony-cli#快速开始-sdk-54推荐)。
> 本包当前主要承载 **SDK 52（legacy patch 工作流）** 与通用诊断命令。

<p align="center">
  <a href="https://www.npmjs.com/package/expo-harmony-cli"><img src="https://img.shields.io/npm/v/expo-harmony-cli" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/expo-harmony-cli"><img src="https://img.shields.io/npm/dm/expo-harmony-cli" alt="npm downloads"></a>
  <a href="https://github.com/stonehill-2345/expo-harmony-cli"><img src="https://img.shields.io/github/stars/stonehill-2345/expo-harmony-cli" alt="GitHub stars"></a>
</p>

## 快速开始（SDK 52）

```bash
# 1. 创建项目
npx expo-harmony-cli@latest my-harmony-app --sdk 52
cd my-harmony-app

# 2. 安装依赖（含鸿蒙 patch）
pnpm install

# 3. 生成鸿蒙原生工程
npx expo-harmony-cli prebuild --platform harmony

# 4. 安装原生依赖并运行
cd harmony && ohpm install && cd ..
pnpm start:harmony
```

随后在 DevEco Studio 打开 `harmony/` 目录运行到真机/模拟器。完整指南：[SDK 52 使用指南](https://github.com/stonehill-2345/expo-harmony-cli/blob/main/docs/sdk52-guide.md)。

## 命令一览

| 命令 | 用途 |
| --- | --- |
| `create <dir> --sdk 52` | 创建 SDK52 鸿蒙项目 |
| `prebuild --platform harmony` | 生成/更新鸿蒙原生工程 |
| `install / uninstall <pkg>` | 安装/卸载并自动处理鸿蒙适配资产 |
| `scan` / `sync` | 重跑适配扫描 / 增量同步原生注册 |
| `env` / `doctor` | 工具链环境检查 / 项目健康诊断（退出码分级，可接 CI） |
| `list` | 查看依赖适配分类（纯 JS / alias / native / patch / unsupported） |

## 环境要求

Node ≥ 20.19.4 · pnpm ≥ 10.19.0 · DevEco Studio 5.0+（含 OpenHarmony SDK、ohpm、hdc）

## 文档与社区

- 📖 完整文档 / SDK54 指南 / 演示视频：[GitHub 仓库](https://github.com/stonehill-2345/expo-harmony-cli)
- 🐛 问题反馈：[Issues](https://github.com/stonehill-2345/expo-harmony-cli/issues)
- 💬 微信 / QQ 交流群：见仓库 README「交流与技术支持」

## License

MIT
