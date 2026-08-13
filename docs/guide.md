# expo-harmony-cli 使用指南

## 常用命令

| 命令                                                            | 用途                                                                                                    |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `npx expo-harmony-cli <目录名>`                                 | 创建 Expo SDK 52 项目并注入 HarmonyOS 基线；pnpm 用户也可用 `pnpm dlx expo-harmony-cli <目录名>`。      |
| `pnpm dlx expo-harmony-cli install <包名>`                      | 使用 Expo 安装依赖；命中兼容表时自动追加 HarmonyOS 适配依赖、patch 或原生工程刷新。                     |
| `pnpm dlx expo-harmony-cli uninstall <包名>`                    | 卸载原包，并清理 CLI 管理的 HarmonyOS 伴随包、alias、patch 与原生注册；`remove` 是同义别名。            |
| `pnpm dlx expo-harmony-cli scan`                                | 重新扫描现有 `package.json`，补齐可自动识别的 HarmonyOS 适配，并回收此前 CLI 管理但原包已不存在的残留。 |
| `pnpm dlx expo-harmony-cli sync`                                | 仅同步 HarmonyOS 原生注册，不覆盖 `harmony/`。手工安装原生包后使用。                                    |
| `pnpm dlx expo-harmony-cli prebuild --platform harmony --force` | 重新生成 HarmonyOS 原生工程。修改原生依赖或 `harmony/` 异常时使用。                                     |
| `pnpm start:harmony`                                            | 启动 HarmonyOS Metro，端口为 `8888`（iOS/Android 原生 Metro 使用 `8081`）。                                |
| `pnpm expo run:android` / `pnpm expo run:ios`                   | 按 Expo 标准方式构建 Android / iOS。                                                                    |

默认不带 `--platform` 的 `prebuild` 会同时执行 Expo 原生预构建和 HarmonyOS 工程生成；只调试 HarmonyOS 时建议显式使用 `--platform harmony`。

首次生成 `harmony/` 时不需要 `--force`。只有已有 `harmony/` 需要整体重生成、模板升级或工程异常需要回到生成器基线时，才使用 `prebuild --platform harmony --force`；该参数会覆盖生成器管理的文件。

## 环境要求

- Node.js `>= 18.18.0`
- pnpm `>= 10.19.0`
- DevEco Studio 5.0+，并安装可用的 OpenHarmony SDK
- HarmonyOS 真机已开启开发者模式和 USB 调试，或已创建可用模拟器
- iOS 本地构建建议使用 Xcode 16.4 及以下；原因是当前基线固定在 Expo SDK 52 / React Native 0.77.1

建议在 macOS 上将 `ohpm` 加入 `PATH`：

```bash
echo 'export PATH="/Applications/DevEco-Studio.app/Contents/tools/ohpm/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
ohpm --version
```

Windows PowerShell 可临时配置 DevEco 工具路径：

```powershell
$env:Path += ";C:\Program Files\Huawei\DevEco Studio\tools\ohpm\bin"
$env:HDC_PATH = "C:\Program Files\Huawei\DevEco Studio\sdk\default\openharmony\toolchains\hdc.exe"
ohpm --version
hdc version
```

## 支持范围

| 项目                            | 当前基线                                  |
| ------------------------------- | ----------------------------------------- |
| Expo                            | SDK 52                                    |
| React Native                    | 0.77.1                                    |
| React Native OpenHarmony (RNOH) | 0.77.71                                   |
| HarmonyOS 开发工具              | DevEco Studio 5.0+ 与对应 OpenHarmony SDK |
| iOS 构建工具                    | Xcode 16.4 及以下                         |

已验证的主路径是创建 Expo 默认模板、生成 HarmonyOS 工程、启动 HarmonyOS Metro，并在 DevEco Studio 中构建运行。

HarmonyOS release 通过 `pnpm bundle:harmony:release` 生成嵌入 HAP rawfile 的生产 JS bundle；签名和 HAP/APP 构建仍由 DevEco Studio 完成。首次接入项目时必须按下文[构建 HarmonyOS Release](#构建-harmonyos-release)关闭 Metro 验收。

## 依赖和 HarmonyOS 工程管理

`expo-harmony-cli` 不只是创建项目的入口。它还负责维护 HarmonyOS 兼容表、依赖版本锁定、patch、Metro alias、RNOH 原生注册、`oh-package.json5`、CMake、PackageProvider 与 `RNOHPackagesFactory`。

因此在本 CLI 创建的项目中，安装、卸载、扫描、同步和 HarmonyOS prebuild 都应通过本 CLI 执行：

```bash
pnpm dlx expo-harmony-cli install <包名>
pnpm dlx expo-harmony-cli uninstall <包名>
pnpm dlx expo-harmony-cli remove <包名>
pnpm dlx expo-harmony-cli scan
pnpm dlx expo-harmony-cli sync
pnpm dlx expo-harmony-cli prebuild --platform harmony
```

不要优先使用 `expo install`、`pnpm add`、`pnpm remove`、`expo prebuild` 或 `npx expo prebuild` 来处理 HarmonyOS 相关依赖和工程生成，否则容易出现 JS 依赖、patch 和 HarmonyOS 原生工程状态不一致。

## 三方依赖

统一使用 CLI 安装，而不是直接执行 `expo install` 或 `pnpm add`：

```bash
pnpm dlx expo-harmony-cli install react-native-svg
```

CLI 会将依赖分为以下类型：

| 类型                     | 行为                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 纯 JS 包                 | 直接安装，通常无需 HarmonyOS 原生处理。                                                                                               |
| `alias-only`             | 安装对应 HarmonyOS JS 包，不触发原生工程刷新。                                                                                        |
| `native` / `bump-native` | 安装对应 HarmonyOS 原生包；已有 `harmony/` 时自动增量同步原生注册，不覆盖工程。之后运行 `ohpm install`，再用 DevEco Studio 重新构建。 |
| `patch-only`             | 固定与 patch 相匹配的版本，并复制对应 patch。                                                                                         |
| `unsupported`            | 不自动适配；请评估原生能力需求后自行适配。                                                                                            |

卸载通过 CLI 添加的依赖时，也应使用 CLI 命令：

```bash
pnpm dlx expo-harmony-cli uninstall react-native-svg
# remove 为同义别名
pnpm dlx expo-harmony-cli remove react-native-svg
```

CLI 只会清理 `.expo-harmony/managed-state.json` 中记录为自身管理的资产；用户手工安装或改写的 HarmonyOS 配置不会被自动删除。若此前直接用包管理器卸载了原包，可执行一次 `scan` 对账清理残留。

使用以下命令查看当前兼容表：

```bash
pnpm dlx expo-harmony-cli list
```

未在兼容表中的包也建议先通过 CLI 安装：纯 JS 包通常会按 Expo 兼容版本完成安装；如果包含原生模块，请阅读生成项目中的 `docs/HARMONY.md`，并参考 `.agent/skills/expo-harmony-adapter/SKILL.md`

## 构建 HarmonyOS Release

完成签名配置后，在最后一次 HarmonyOS prebuild 之后执行：

```bash
pnpm bundle:harmony:release
```

该命令显式生成：

```text
harmony/entry/src/main/resources/rawfile/bundle.harmony.js
harmony/entry/src/main/resources/rawfile/assets/
```

随后在 DevEco Studio 中以 release signing profile 构建 signed HAP/APP。验收时关闭 Metro、移除 `hdc rport`，再冷启动安装包；页面和静态资源必须仍可展示。

## 常见问题

### `ohpm: command not found`

确认 DevEco Studio 已安装，并将其 `ohpm/bin` 加入 shell 的 `PATH`。完整命令见[环境要求](#环境要求)。

### 真机提示无法加载 bundle

确认 `pnpm start:harmony` 正在运行，设备与开发机处于可通信网络；终端会打印 Metro LAN URL。必要时使用：

```bash
hdc rport tcp:8888 tcp:8888
hdc rport tcp:8081 tcp:8888
```

再在 RNOH Dev Settings 中填写 `<局域网 IP>:8888` 并 Reload。

### 新增原生依赖后 DevEco 构建失败

先通过 CLI `install` 安装该包；CLI 会自动增量同步已有 HarmonyOS 工程。随后执行：

```bash
cd harmony && ohpm install
```

如果此前误用 `expo install`、`pnpm add` 或 `pnpm remove` 处理过原生包，请先执行 `pnpm dlx expo-harmony-cli scan` 对账，再用 `pnpm dlx expo-harmony-cli sync` 刷新原生注册；只有工程需要整体重建时才使用 `prebuild --platform harmony --force`。

如果依赖包含 TurboModule 或 codegen，根据 CLI 输出运行项目提供的 `pnpm codegen`，然后重新构建。

### `bundle:harmony:release` 提示缺少 React Native CLI

新版 CLI 创建的项目会自动包含该依赖。旧项目执行一次：

```bash
pnpm add -D @react-native-community/cli@20.1.1
```

更多排障信息请见生成项目中的 `docs/TROUBLESHOOTING.md`；签名配置见 `harmony/SIGNING.md`。

## 已知限制

- 仅以 Expo SDK 52、React Native 0.77.1 和 RNOH 0.77.71 组合为当前支持基线。RNOH 已升级到 0.77.71，但 React Native 仍固定为 0.77.1，两者不要单独拆开升级。
- 不是所有 Expo / React Native 原生模块都已适配 HarmonyOS；请以 `list` 输出、生成项目的 `docs/HARMONY.md` 和 `.agent/skills/expo-harmony-adapter/SKILL.md` 适配资料为准。
- HarmonyOS release bundle 采用 JS rawfile；Hermes HBC 尚未作为默认发布格式提供。

## 源码仓库

- GitHub：https://github.com/stonehill-2345/expo-harmony-cli
- Gitee：https://gitee.com/stonehill-2345/expo-harmony-cli
