# SDK 54 使用指南

SDK 54 是当前主线：保留标准 Expo 工作流，鸿蒙只是新增 `--platform harmony` 参数，底层经 npm alias 解析到 `@expo-oh` 整包适配，无 patch、无私有命令。

> 文档分工：环境基线、逐包适配与发布组合版本见 [HarmonyOS 快速开始](harmony/getting-started.md)；SDK 52 Legacy 工作流见 [SDK 52 使用指南](sdk52-guide.md)；本文专讲 SDK 54 的命令、参数与工作流。

## 目录

- [快速开始](#快速开始)
- [命令总览](#命令总览)
- [创建项目](#创建项目)
- [生成鸿蒙原生工程：prebuild](#生成鸿蒙原生工程prebuild)
- [真机运行：run:harmony](#真机运行runharmony)
- [日常开发与热更新：expo start](#日常开发与热更新expo-start)
- [依赖管理：expo install](#依赖管理expo-install)
- [诊断](#诊断)
- [导出与 Release](#导出与-release)
- [常见问题](#常见问题)
- [命令速查表](#命令速查表)

## 快速开始

```bash
# 1. 创建项目（default 模板含 Expo Router，可换 blank-typescript）
npx expo-harmony-cli@latest create my-app --sdk 54 --template default --npm

# 2. 生成 HarmonyOS 原生工程（创建 harmony/ 目录）
cd my-app
npx expo prebuild --platform harmony

# 3. 构建、安装并启动到鸿蒙设备（Debug 默认启动 Metro）
npx expo run:harmony

# 4. 日常开发：改代码秒级生效
npx expo start
```

iOS / Android 工作流不受影响：`npx expo run:ios`、`npx expo run:android` 照常使用。

## 命令总览

SDK 54 涉及两个命令入口：

**`expo-harmony-cli`**（项目外的全局工具，负责创建与诊断）：

| 命令 | 用途 |
| --- | --- |
| `npx expo-harmony-cli create <dir> --sdk 54` | 创建项目（统一入口，按 `--sdk` 分流到对应创建器） |
| `npx expo-harmony-cli doctor` | 环境汇总 + 项目诊断，含 SDK 54 发布组合检查 |
| `npx expo-harmony-cli env` | 环境工具链检查（node、hvigor、ohpm、hdc） |

**`npx expo`**（项目内的适配 Expo CLI，即 `@expo-oh/expo-cli`）：

| 命令 | 用途 |
| --- | --- |
| `npx expo run:harmony` | 构建、安装并启动到鸿蒙设备 |
| `npx expo prebuild --platform harmony` | 生成鸿蒙原生工程 |
| `npx expo start` | Metro 开发服务器，自动识别鸿蒙项目 |
| `npx expo install <pkg>` | 安装依赖，按发布组合解析鸿蒙兼容版本 |
| `npx expo export -p harmony` | 导出鸿蒙平台 bundle |
| `npx expo config` | 查看解析后的项目配置 |

另有 `run:ios` / `run:android` / `customize` / `lint` 等标准命令照常可用。`prebuild --no-platform-harmony` 时 `install` / `uninstall` / `scan` / `list` / `sync` 属 SDK 52 Legacy 命令——在 SDK 54 项目上执行 `expo-harmony-cli install` 会被直接拦截并提示改用 `npx expo install`。

## 创建项目

```bash
npx expo-harmony-cli@latest create <项目名> --sdk 54 [--template default] [--npm | --pnpm]
```

### 参数

| 参数 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `<项目名>` | 是 | — | 仅小写字母、数字、`.`、`_`、`-`，并以小写字母或数字开头 |
| `--sdk <52\|54>` | 非交互环境必填 | 交互模式默认 54 | 非交互（非 TTY）未指定会报错 |
| `--template <name>` | 否 | `default` | 仅 `default` / `blank-typescript`；SDK 52 仅支持 `default` |
| `--npm` / `--pnpm` / `--yarn` / `--bun` | 否 | `pnpm` | 四选一互斥；SDK 54 仅支持 npm / pnpm |

终端交互模式（TTY）下省略参数会弹出选择框；直接写裸项目名（如 `expo-harmony-cli my-app`）也会进入创建流程。以 `` 开头的未识别参数一律报错，不存在隐藏选项。

### 模板怎么选

- **default**：含 Expo Router 导航栈的完整模板，适合大多数应用
- **blank-typescript**：空白 TypeScript 模板，适合从零搭建或精简依赖

### 创建器内部做了什么

1. 调用 `@expo-oh/create-expo`（当前锁定 3.5.12）拉取鸿蒙适配模板
2. 按发布清单校验模板产物
3. default 模板将 expo-image 用法替换为 React Native Image
4. 重写 `package.json`：保留 `expo`、`expo-router` 等原依赖名，经 npm alias 指向 `npm:@expo-oh/*` 精确版本，并生成 npm / pnpm overrides
5. 用所选包管理器执行安装，并运行运行时探针校验
6. 写入受管状态与项目内文档（README、AGENTS.md）

从仓库源码运行 CLI 的方法见 [HarmonyOS 快速开始](harmony/getting-started.md#开发者从源码运行-cli)。

## 生成鸿蒙原生工程：prebuild

```bash
npx expo prebuild --platform harmony
```

`--platform` 默认是 `all`（仅 android + ios），**harmony 必须显式指定**。

### 参数

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `-p, --platform <all\|android\|ios\|harmony>` | `all` | harmony 分支为独立的鸿蒙生成流程 |
| `--bundle-name <name>` | 见下 | 鸿蒙应用 bundleName，优先级：CLI 参数 > `app.json` 的 `harmony.bundleName` > 派生值 `dev.expo.<清洗后 slug>` |
| `--clean` | 关 | 声明式重建；当前项目保留在 `.expo/harmony-backups` |
| `--no-install` | 关 | 跳过依赖安装 |
| `--npm` / `--pnpm` / `--yarn` / `--bun` | 按 lockfile 推断 | 与 `--no-install` 及彼此互斥 |
| `--template`、`--skip-dependency-update` | — | 通用分支参数，harmony 分支不使用 |

### 行为

校验并安装鸿蒙依赖基线（react 19.1.1 / react-native 0.82.1 / RNOH 0.82.30 等，或按项目 `harmony-release.json` 的组合）→ 读取 `app.json` 的 `harmony` 配置键 → 通过 expo-modules-autolinking 查询鸿蒙模块 → 同步 `harmony/` 原生工程（RNOH HAR、插件注册、资源校验）→ 把 Debug bundle URL 写入 `Index.ets`。

`app.json` 支持的 `harmony` 键：`name`、`bundleName`、`version`、`versionCode`、`icon`、`splash`、`scheme`、`permissions`、`orientation`、`userInterfaceStyle`、`extensions` 等（schema 见 `expo/harmony-config.schema.json`）。config plugin 未声明 harmony 平台时会告警，其平台 mods 不会执行。

## 真机运行：run:harmony

```bash
npx expo run:harmony [--configuration Debug|Release] [--device <serial>] [...]
```

### 参数

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `--configuration <Debug\|Release>` | `Debug` | 大小写不敏感；Release 时 `NODE_ENV=production` |
| `--device <serial>` | 自动选择 | hdc 目标设备。恰好 1 台时自动选中；多台未指定会报错并列出设备 |
| `--port <number>`（`-p`） | `8081` | Metro 端口，会同步改写 `Index.ets` 与 `EntryAbility.ets` 中的地址 |
| `--no-install` | 关 | 跳过鸿蒙依赖校验安装；依赖不匹配时仍会报错提示 |
| `--no-bundler` | 关 | Debug 下不启动交互式 Metro（Release 本来就不启动） |
| `--no-build-cache` | 关 | 构建前删除 `harmony/entry/build`、`harmony/entry/.cxx`、`harmony/.hvigor` |
| `--bundle-name <name>` | 同 prebuild | 覆盖鸿蒙 bundleName，优先级高于配置 |

### 执行流程

1. 内部先执行一次 prebuild（harmony 分支，不 clean）
2. 解析 DevEco 工具链（`DEVECO_HOME` / `DEVECO_SDK_HOME`，macOS 默认 `/Applications/DevEco-Studio.app/Contents`；hdc 取 PATH 或 SDK toolchains）
3. Debug：清理 rawfile 旧 bundle、启动 Metro、自动做端口直通；Release：离线打 bundle 进 rawfile（minify）
4. `harmony/entry` 下执行 `ohpm install`
5. hvigor 构建 HAP（产物 `entry/build/default/outputs/default/entry-default-unsigned.hap`）
6. 选设备 → `hdc install -r` → `hdc shell aa start` 启动应用

Debug 的端口直通是自动的：工具会检查并清理冲突的旧规则，再执行 `hdc rport tcp:<port> tcp:<port>`。hdc server 未运行时会自动 `hdc start -r` 重试一次。

## 日常开发与热更新：expo start

SDK 54 项目**直接 `npx expo start`**，无需任何平台参数——CLI 检测到 `@expo-oh/expo` + `harmony-release.json` 组合与 RNOH 依赖后，自动把 `harmony` 加入 Metro 平台列表，Fast Refresh 可用。

常用参数（均为标准 Expo 参数，无鸿蒙专属项）：

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `-p, --port <number>` | `8081` | Metro 端口 |
| `-c, --clear`（`--reset-cache`） | 关 | 清理 Metro 缓存 |
| `-m, --host <lan\|tunnel\|localhost>` | `lan` | 服务地址模式 |
| `--offline` | 关 | 离线模式（强制 lan） |
| `--no-dev` / `--minify` | dev 开 / 不压缩 | 产物模式 |
| `-a / -i / -w` | — | 直接指定 android / ios / web |

说明：`run:harmony` 的 Debug 分支已自动完成 `hdc rport` 端口直通；若只跑 `expo start` 后设备连不上 Metro，手动执行一次：

```bash
hdc rport tcp:8081 tcp:8081
```

## 依赖管理：expo install

```bash
npx expo install expo-font          # 安装（add 为同义命令）
npx expo install --check            # 只检查版本是否匹配发布组合
npx expo install --fix              # 自动修正为兼容版本
```

| 参数 | 说明 |
| --- | --- |
| `<packages...>` | 包名，可带 `@version` |
| `--check` | 只检查不安装（与 `--fix` 互斥）；加 `--json` 输出 JSON |
| `--fix` | 把无效版本修正为发布组合内的版本，并以 `npm:@expo-oh/<pkg>@<ver>` alias 形式写入 |
| `--dev` | 存为 devDependencies |
| `--npm` / `--pnpm` / `--yarn` / `--bun` | 指定包管理器（互斥） |
| `--` 之后 | 透传给底层包管理器 |

鸿蒙的差异全在版本解析：检测到 `@expo-oh/expo` 后，已知版本表来自项目 `harmony-release.json` 锁定的发布组合（详见 [HarmonyOS 快速开始](harmony/getting-started.md)），请求不在组合内的版本会被拒绝而不是静默安装。

注意两点：

- **`expo` 没有 uninstall 命令**：卸载直接用 `npm uninstall` / `pnpm remove`，但不要动 package.json 里的 npm / pnpm overrides（它们防止传递依赖解析出官方 Expo 副本）
- **不要用 `expo-harmony-cli install`**：SDK 54 项目会被 Legacy 命令拦截，提示改用 `npx expo install`

## 诊断

| 命令 | 用途 |
| --- | --- |
| `npx expo-harmony-cli doctor` | 环境汇总 + 项目诊断 + SDK 54 发布组合完整性检查 |
| `npx expo-harmony-cli env` | 工具链检查，退出码分级（0 通过 / 2 警告 / 1 失败），可接 CI |
| `npx expo install --check` | 依赖版本与发布组合的一致性检查 |

`npx expo doctor` 会重定向到官方 `npx expo-doctor`（并以退出码 1 结束），那是 Expo 官方工具，不含鸿蒙检查——鸿蒙诊断用上表命令。

环境变量：DevEco 自定义安装路径设 `DEVECO_HOME`（或 `DEVECO_SDK_HOME`），hdc 路径设 `HDC_PATH`。

## 导出与 Release

### Release 构建（推荐入口）

```bash
npx expo run:harmony --configuration Release --no-build-cache
```

流程：`NODE_ENV=production` → 离线打 bundle（minify 后写入 `harmony/entry/src/main/resources/rawfile/bundle.harmony.js` 与 `assets/`）→ hvigor Release 构建 → 安装启动。可选 `--device`、`--bundle-name`。

验收要点：关闭 Metro、移除 `hdc rport` 后冷启动安装包，页面与静态资源必须仍可展示。

### 通用导出

```bash
npx expo export -p harmony --output-dir dist
```

支持 `--dev`、`--no-minify`、`--no-bytecode`、`--source-maps`、`--clear` 等标准导出参数；harmony 平台无需出现在 `app.json` 的 `platforms` 数组中。

## 常见问题

**多台设备连着，run:harmony 报错？**
未指定 `--device` 且设备多于一台时会列出 serial 并要求显式选择：`npx expo run:harmony --device <serial>`。

**模拟器上 Metro 连不上？**
`run:harmony` Debug 会自动做端口直通；单独跑 `expo start` 或规则失效时手动执行 `hdc rport tcp:8081 tcp:8081`。

**`expo install --check` 报版本不符？**
用 `--fix` 修正为发布组合版本；default 模板的三个 React Navigation 依赖存在既有误报，先核对完整组合与锁文件，不要仅凭提示反复升级（详见 [HarmonyOS 快速开始](harmony/getting-started.md)）。

**误用了 SDK 52 的命令？**
`expo-harmony-cli install` / `scan` / `sync` 等在 SDK 54 项目上会被拦截并给出正确命令指引，直接按提示切换即可。

**`expo --version` 显示的版本和 npm 包不一致？**
`@expo-oh/expo-cli` 的命令输出是内嵌的上游基线版本号；实际 fork 版本看 `node_modules/@expo/cli/package.json`。

**原生模块装了没生效？**
原生依赖或 `app.json` 的 `harmony` 配置变更后，重新 `prebuild --platform harmony` 再构建；确认 autolinking 声明与 `harmony-release.json` 组合一致。

## 命令速查表

| 场景 | 命令 |
| --- | --- |
| 创建项目 | `npx expo-harmony-cli create <dir> --sdk 54 --template default --npm` |
| 生成鸿蒙工程 | `npx expo prebuild --platform harmony` |
| 跑到设备（Debug） | `npx expo run:harmony` |
| Release 构建 | `npx expo run:harmony --configuration Release --no-build-cache` |
| 指定设备 | `npx expo run:harmony --device <serial>` |
| 日常开发 | `npx expo start` |
| 装依赖 | `npx expo install <pkg>` |
| 检查依赖版本 | `npx expo install --check` |
| 环境与项目诊断 | `npx expo-harmony-cli doctor` |
| 导出 bundle | `npx expo export -p harmony` |
