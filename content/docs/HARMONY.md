# HarmonyOS 开发指南

本文档说明 `expo-harmony-cli` 为 {{appName}} 做了什么，以及日常如何开发 HarmonyOS 端。

## CLI 注入了什么

创建项目时，CLI 会完成这些工作：

- 创建 Expo {{expoSdk}} 默认模板。
- 写入 HarmonyOS 入口 `index.harmony.js`。
- 写入 HarmonyOS 专用 Metro 配置。
- 注入 RNOH 运行依赖和 HarmonyOS 构建脚本。
- 注入 `patch-package` 和 `scripts/postinstall-harmony.js`。
- 注入默认兼容 patch 与 `shims/`。
- 清理默认模板中 HarmonyOS 不支持或首屏不需要的 Expo 能力。
- 写入 `.agent/skills/expo-harmony-adapter/SKILL.md` 作为对外适配入口。

执行 `prebuild --platform harmony` 后，CLI 会生成 `harmony/` 原生工程，并根据当前依赖同步 RNOH autolinking。

原生插件链接固定遵循：优先使用 RNOH 官方 `link-harmony`；官方未覆盖的插件使用 CLI 自研 mapping 补充；仍未覆盖时提示参考 `.agent/skills/expo-harmony-adapter/SKILL.md`。手动安装原生依赖后请执行 `pnpm dlx expo-harmony-cli sync`，构建工具不会代替 CLI 更新注册。

## 首次运行 HarmonyOS

```bash
pnpm install
pnpm dlx expo-harmony-cli prebuild --platform harmony
cd harmony && ohpm install
cd ..
pnpm start:harmony
```

随后在 DevEco Studio 中打开 `harmony/`，运行 `entry` 模块。

## 日常开发命令

```bash
# 启动 HarmonyOS Metro，与 Android/iOS 统一端口 8081
pnpm start:harmony

# Android
pnpm expo run:android

# iOS
pnpm expo run:ios

# 生成开发 JS bundle
pnpm dev:harmony

# 生成 release JS bundle 和 assets
pnpm bundle:harmony:release
```

## CLI 命令区别

| 命令 | 使用时机 |
| --- | --- |
| `install <pkg>` | 安装 JS/RN/Expo 包，并自动应用 HarmonyOS 兼容表、版本锁定、patch、alias 和原生注册。 |
| `uninstall <pkg>` / `remove <pkg>` | 卸载依赖，并清理 CLI 托管的 HarmonyOS 伴随资产。 |
| `scan` | 已经手动改过依赖时，对账并补齐可识别的 HarmonyOS 适配。 |
| `sync` | 只刷新 `harmony/` 中的原生注册，不覆盖整个工程。 |
| `prebuild --platform harmony` | 首次生成 `harmony/` 原生工程。 |
| `prebuild --platform harmony --force` | 模板升级、工程损坏或明确需要回到生成器基线时使用，会覆盖生成器管理的文件。 |

## 三方依赖

优先使用：

```bash
pnpm dlx expo-harmony-cli install <pkg>
```

不要优先使用：

```bash
expo install <pkg>
pnpm add <pkg>
```

原因是 CLI 会额外处理：

- 原包版本锁定。
- HarmonyOS 伴随包安装。
- Metro alias。
- patch 复制。
- `.expo-harmony/managed-state.json`。
- 已有 `harmony/` 时的增量原生注册。

如果已经手动 `pnpm add`，请执行：

```bash
pnpm install
pnpm dlx expo-harmony-cli scan
pnpm dlx expo-harmony-cli sync
```

## 原生注册机制（官方优先）

`sync` / `prebuild` / `install` / `uninstall` 共用同一套原生链接流程，规则固定：

1. **官方优先**：CLI 调用项目内安装的 RNOH 官方 `link-harmony`（识别 `package.json` 带 `harmony.autolinking` 声明的包），官方注册结果原样保留。
2. **mapping 补充**：官方未覆盖（如仅带 `harmony.alias` 的适配包）时，CLI 查询自研映射表补充注册片段。
3. **未覆盖提示**：两者都未覆盖的包不会自动注册，CLI 会逐包报告并提示参考 `list` 输出、本文件与 `.agent/skills/expo-harmony-adapter/SKILL.md`。

注意：

- **手动安装原生依赖后必须运行 `sync`**——Hvigor 构建不会替你更新原生注册文件。
- CLI 生成的项目默认未在 `hvigorfile.ts` 注册 `@rnoh/hvigor-plugin`，因此构建期不会重复执行 autolinking；若你自行注册该插件，请以 `autolinking: null` 初始化，否则构建会重写 `RNOHPackagesFactory.ets` 等受管文件并丢失 CLI 的补充注册。
- 链接成功不等同于运行时兼容，仍需真机验证。

## codegen

`pnpm codegen` 只在 CLI 输出明确提示 TurboModule/codegen 时执行，不需要每次 prebuild 后都运行。

## Release

最后一次 `prebuild --platform harmony` 后执行：

```bash
pnpm bundle:harmony:release
```

该命令会生成：

```text
harmony/entry/src/main/resources/rawfile/bundle.harmony.js
harmony/entry/src/main/resources/rawfile/assets/
```

然后在 DevEco Studio 中使用 release signing profile 构建 HAP/APP。

验收 release 包时，停止 `pnpm start:harmony`，移除端口转发，冷启动安装包；页面和静态资源必须仍可展示。

## 设备和调试

- 真机：开启开发者模式和 USB 调试。
- 模拟器：DevEco Studio -> Tools -> Device Manager。
- JS 日志：查看 Metro 控制台。
- 原生日志：查看 DevEco Studio LogViewer / hilog。
- 真机无法加载 bundle：查看 `pnpm start:harmony` 输出的 `<局域网 IP>:8081`，并在 RNOH Dev Settings 中填写。
