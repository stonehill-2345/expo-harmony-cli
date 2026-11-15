# expo-harmony-cli

**expo-harmony-cli 是一个让 React Native / Expo 项目运行在鸿蒙（HarmonyOS / OpenHarmony）上的开源命令行工具**：一条命令创建项目、一条命令生成鸿蒙原生工程、一条命令真机运行，同一套 JS/TS 代码同时覆盖鸿蒙、iOS、Android 三端。

<p align="center">
  <a href="https://www.npmjs.com/package/expo-harmony-cli"><img src="https://img.shields.io/npm/v/expo-harmony-cli" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/expo-harmony-cli"><img src="https://img.shields.io/npm/dm/expo-harmony-cli" alt="npm downloads"></a>
  <a href="https://github.com/stonehill-2345/expo-harmony-cli/blob/main/LICENSE"><img src="https://img.shields.io/github/license/stonehill-2345/expo-harmony-cli" alt="license"></a>
  <a href="https://github.com/stonehill-2345/expo-harmony-cli"><img src="https://img.shields.io/github/stars/stonehill-2345/expo-harmony-cli" alt="GitHub stars"></a>
</p>

> **速答：React Native / Expo 怎么跑在鸿蒙上？**
> 三步：① `npx @expo-oh/create-expo my-app` 创建项目；② `npx expo prebuild --platform harmony` 生成鸿蒙原生工程；③ `npx expo run:harmony` 构建并安装到真机/模拟器。底层基于 [RNOH](https://github.com/react-native-oh-library/react-native-harmony)（React Native OpenHarmony 官方桥接层），Expo 标准工作流全部保留。

## 30 秒快速开始（SDK 54）

```bash
# 1. 创建项目（default 模板含 Expo Router；可换 --template blank-typescript）
npx @expo-oh/create-expo@latest my-app --template default

# 2. 生成 HarmonyOS 原生工程
cd my-app
npx expo prebuild --platform harmony

# 3. 构建、安装并启动到鸿蒙设备
npx expo run:harmony

# 4. 日常开发：改代码秒级生效（Fast Refresh）
npx expo start
```

> 模拟器热更新需一次端口直通：`hdc rport tcp:8081 tcp:8081`；干净 Release 构建：`npx expo run:harmony --configuration Release --no-build-cache`。

项目保留 `expo`、`expo-router`、`@expo/cli` 等原始依赖名与 import，运行时经 npm alias 解析到 `@expo-oh/*` 适配包——**业务代码与标准 Expo 项目完全一致**，iOS/Android 工作流不受影响。

## 效果演示

**从创建到真机运行**

[![overview](docs/assets/video-overview.mp4)](docs/assets/video-overview.mp4)

**Fast Refresh：改代码，秒级生效**

[![fast-refresh](docs/assets/video-fast-refresh.mp4)](docs/assets/video-fast-refresh.mp4)

**Tabs / Modal / 导航（Expo 默认模板原样运行）**

[![ui-tour](docs/assets/video-ui-tour.mp4)](docs/assets/video-ui-tour.mp4)

<p align="center"><img src="apps/cli/assets/screenshot.png" alt="鸿蒙运行效果" width="435"></p>

## 支持哪些能力？

| 能力 | 说明 |
| --- | --- |
| 🚀 一键创建 | `@expo-oh/create-expo` 创建即含鸿蒙支持 |
| 🧬 原生工程生成 | `expo prebuild --platform harmony` 生成 OpenHarmony 工程与 RNOH 依赖 |
| ⚡ 热更新 | 鸿蒙端完整支持 Metro Fast Refresh / reload |
| 🔓 Release 流水线 | `expo run:harmony --configuration Release` 一条命令构建+安装+启动 |
| 📦 依赖管理 | `expo install/uninstall` 自动处理鸿蒙原生注册；16 个 `@expo-oh` 适配包覆盖 Expo 核心 |
| 🔗 智能原生注册 | 官方优先：RNOH `link-harmony` → 内置映射表 → 逐包提示 |
| 🩺 环境诊断 | `env` / `doctor` 工具链检查，退出码分级可接 CI |
| 🛡️ 文件保护 | 受管文件被手改时阻断覆盖，事务失败自动回滚 |

**质量数据**：11 个 Expo 核心模块（Router/Font/Asset/Image/Linking 等）完成真机验收；4 种工程组合 × Debug/Release 共 8 条链路全部真机通过；全量自动化检查 1581 项 0 失败。

## 两个 SDK 版本怎么选？

| | SDK 54（推荐） | SDK 52（Legacy） |
| --- | --- | --- |
| 适配方式 | `@expo-oh` 整包适配 | patch + 注入 |
| React Native | 0.82.x | 0.77.x |
| 创建命令 | `npx @expo-oh/create-expo` | `npx expo-harmony-cli <dir> --sdk 52` |
| 热更新 | ✅ Fast Refresh | ✅ Metro reload |
| 适用场景 | 新项目 | 存量项目维护 |

SDK 52 完整流程见 **[SDK 52 使用指南](docs/sdk52-guide.md)**。

## 常见问题

**React Native 怎么运行在鸿蒙上？**
通过 RNOH（React Native OpenHarmony）桥接层——本项目把 RNOH 封装进 Expo 工作流，免去手动配置原生工程，三条命令跑通。

**Expo 官方支持鸿蒙吗？**
Expo 官方目前不支持。本项目是 Expo 的鸿蒙扩展层：`expo run:ios` / `run:android` 照常使用，鸿蒙只是新增的 `--platform harmony`。

**支持哪些三方库？**
纯 JS 包直接可用；常见原生库经 `@expo-oh` 适配或内置 patch 覆盖；未覆盖的在安装时明确提示，不会静默失败。

**支持 HarmonyOS NEXT（纯血鸿蒙）吗？**
支持。目标平台为 OpenHarmony / HarmonyOS（API 12+），DevEco 模拟器与真机均可运行。

**热更新（Fast Refresh）在鸿蒙上能用吗？**
能。Metro 完整可用，改代码秒级生效；Release 构建则离线打包资源。

**SDK 52 项目能升级到 SDK 54 吗？**
不自动迁移。推荐 SDK 54 模板新建项目后迁移业务代码，两套流程并存互不影响。

## 环境要求

| 项 | 要求 |
| --- | --- |
| Node.js | ≥ 20.19.4 |
| pnpm / npm | pnpm ≥ 10.19.0 / npm ≥ 10 |
| DevEco Studio | 5.0+（含 OpenHarmony SDK、ohpm、hdc） |

## 与 Expo / RNOH / OpenHarmony 的关系

- [Expo](https://expo.dev)：本项目沿用其 CNG 工作流与全部标准命令，是扩展而非替代
- [RNOH](https://github.com/react-native-oh-library/react-native-harmony)：底层鸿蒙桥接层，本项目负责其上的工程化封装
- [OpenHarmony](https://www.openharmony.cn/) / [HarmonyOS](https://developer.huawei.com/consumer/cn/harmonyos/)：目标运行平台

## 交流与技术支持

<p align="center">
  <table>
    <tr>
      <td align="center"><img src="docs/assets/community-wechat-qr.png" alt="个人微信" width="180"><br><sub>加我微信进群</sub></td>
      <td align="center"><img src="docs/assets/community-qq-qr.png" alt="QQ 交流群" width="180"><br><sub>QQ 交流群</sub></td>
    </tr>
  </table>
</p>

- 使用问题或功能建议：[GitHub Issues](https://github.com/stonehill-2345/expo-harmony-cli/issues)
- 想参与贡献：见 [贡献指南](CONTRIBUTING.md)
- 觉得有用就点个 ⭐ Star，让更多做鸿蒙 RN 开发的朋友找到它

## 文档

- [SDK 52 使用指南（Legacy）](docs/sdk52-guide.md)
- [CLI 使用指南](apps/cli/docs/guide.md)
- [HarmonyOS 快速开始与逐包说明](docs/harmony/getting-started.md)
- [配置插件](docs/harmony-config-plugins.md) · [原生工程生成](docs/harmony-generation.md) · [模块开发](docs/harmony-module-authoring.md)
- [更新日志](apps/cli/CHANGELOG.md) · [贡献指南](CONTRIBUTING.md) · [安全策略](SECURITY.md) · [行为准则](CODE_OF_CONDUCT.md) · [第三方声明](NOTICE.md)

## 仓库与链接

- npm：[expo-harmony-cli](https://www.npmjs.com/package/expo-harmony-cli)
- GitHub：[stonehill-2345/expo-harmony-cli](https://github.com/stonehill-2345/expo-harmony-cli)
- Gitee：[stonehill-2345/expo-harmony-cli](https://gitee.com/stonehill-2345/expo-harmony-cli)
- AtomGit：[stonehill-2345/expo-harmony-cli](https://atomgit.com/stonehill-2345/expo-harmony-cli)

## License

MIT

---

<sub>最近更新：2026-11 · 当前版本 v1.7.0（支持 Expo SDK 54 与 SDK 52）</sub>
