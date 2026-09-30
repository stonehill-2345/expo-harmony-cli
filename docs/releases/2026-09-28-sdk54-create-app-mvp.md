# Expo SDK54 Harmony fresh create-app MVP 迁移验收

日期：2026-09-28
状态：**通过，保留已记录能力边界**
发布状态：**未发布**

## 结论

正式 monorepo 中的十四个 Expo SDK54 Harmony 源码包已经完成迁移，并通过当前源码重新构建的十四个 TGZ 与十一只读外部 RNOH/navigation TGZ 完成 fresh 验收。

本轮真实执行官方 `npx create-expo-app@5.0.0` 创建：

1. `blank-typescript`；
2. `default@sdk-54` + Expo Router。

两个项目均完成：依赖接管、fresh install、Harmony prebuild、Debug 构建/安装/启动、clean Release 构建/安装/启动和无 Metro 冷启动。Default 模板还完成 Tabs、Modal、物理 Back、单层 `dismissTo` 和 WebBrowser 验收。

本任务没有修改 `apps/cli` compatibility table、injector、scanner 或 creator 产品逻辑。

## 来源与版本

- 临时 MVP 来源：`expo-harmony-template@2704a48cc52781f510b3996af17c882fb82e1090`
- 官方 Expo 来源：`expo/expo@5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`
- 目标分支验收 HEAD：`375875354c6526ca37e7c6d40af81dd07c0b2822`
- Expo：`54.0.37`
- Expo CLI：`54.0.27`
- Expo Router：`6.0.24`
- Expo WebBrowser：`15.0.11`
- React：`19.1.1`
- React Native：`0.82.1`
- RNOH：`0.82.30`

## 包与仓库门禁

- 14 个正式仓库 Expo 包；
- 11 个只读外部 RNOH/navigation 包；
- fresh staging 共 25 个 TGZ；
- 22 条内部 dependency/peerDependency 边；
- A/B clean build+pack 字节一致；
- package audit：0 failures；
- repository check：0 forbidden files / 0 forbidden text；
- 唯一可发布 workspace 包：`expo-harmony-cli`；
- SDK54 工具测试：144/144；
- CLI 类型检查：通过；
- CLI 源码测试：34 files / 372 tests 通过；
- `git diff --check`：通过。

发布型生成产物在一次性目录构建后再打包，正式源码树未写入生成的 CLI、Metro 或 Autolinking build 文件。

## Fresh blank TypeScript

创建命令：

```bash
npx create-expo-app@5.0.0 blank-app --template blank-typescript
```

`App.tsx`、`index.ts`、`app.json` 未修改，没有应用侧 Metro 配置、自定义 Harmony 入口、shim、polyfill、patch-package 或 postinstall。

### Debug

```bash
npx expo run:harmony --device 127.0.0.1:5555
```

结果：

- Hvigor Debug `BUILD SUCCESSFUL`；
- 安装和启动成功；
- Debug 使用 Metro、`dev:true`；
- HAP 不依赖 embedded Release bundle；
- UI tree 和截图显示官方文本：`Open up App.tsx to start working on your app!`；
- Debug HAP SHA-256：`bbe1184cfcb40d8167ac4d1274f5143bfbb06f54f79f69d75ababab8bbdd49a1`。

### Release

```bash
npx expo run:harmony --configuration Release --no-build-cache --device 127.0.0.1:5555
```

结果：

- clean Release `BUILD SUCCESSFUL`；
- HAP SHA-256：`977e4caddef7acf993bb58bd899362f7d88cfc229d2d9b4d6b33148f9afc94c2`；
- bundle SHA-256：`7807637cf61f88bfa038ef82ecf0fcb4dd0bd14c58446e2695f85b74aba31d4e`；
- HAP embedded bundle 与源 bundle 逐字节一致；
- `__DEV__=false`，不含 `__DEV__=true`；
- Metro 停止后 force-stop / cold start 成功；
- cold-start UI tree 仍显示同一官方 blank 页面。

## Fresh default + Router

创建命令：

```bash
npx create-expo-app@5.0.0 default-app --template default@sdk-54
```

原始 `app/modal.tsx`、`app/_layout.tsx`、`app.json` 保持不变。

当前 MVP 未实现 `expo-image` Harmony backend。按照批准的 fixture 边界，仅将：

```text
app/(tabs)/index.tsx
app/(tabs)/explore.tsx
```

中的简单 `expo-image` Image 替换为 React Native `Image`，并从临时 fixture 删除 `expo-image` 依赖。这不表示 `expo-image` 已适配。

### Debug

```bash
npx expo run:harmony --device 127.0.0.1:5555
```

验证通过：

- Welcome/Home/Explore；
- Home 与 Explore Tabs；
- MaterialIcons；
- Home 和 Explore 静态图片；
- Modal；
- `Go to home screen` 单层 `dismissTo` 返回 Home；
- 物理 Back 返回 Home；
- 两种返回均记录 ArkUI custom animation start/finish；
- Explore → File-based routing → Learn more 打开 ArkWeb；
- ArkWeb 显示 `https://docs.expo.dev/router/introduction` 和 Close；
- Close 返回 Explore；
- 双终端 Metro 模式按 `r` 输出 `Reloading apps` 并重新 bundle。

### Release

```bash
npx expo run:harmony --configuration Release --no-build-cache --device 127.0.0.1:5555
```

结果：

- clean Release `BUILD SUCCESSFUL`；
- HAP SHA-256：`7b8197754229f3a44219a2d88d9d906900d0b42b78b4979429da3815c8d17bc3`；
- bundle SHA-256：`00bb52b0c3c0e6dfe4bdceed849b0025b1c16fc45a52d86c6893cda8d10affb8`；
- HAP embedded bundle 与源 bundle 逐字节一致；
- `__DEV__=false`，不含 `__DEV__=true`；
- Metro 停止后 cold start 仍显示 Welcome/Home/Explore；
- Tabs、MaterialIcons 和 RN Image 正常；
- Modal `dismissTo` 和物理 Back 均返回 Home并记录 custom animation；
- WebBrowser 连续两轮打开均显示文档 URL 和 Close，关闭后返回 Explore。

## 能力边界

- `expo-image` Harmony backend 未实现；default 验收只做两处 RN Image fixture substitution；
- native-first `dismissTo` 只覆盖目标恰好为上一层路由的 Harmony `POP_TO`；
- WebBrowser 是应用内 ArkWeb，不等价于系统浏览器 Cookie/SSO 或完整认证会话；
- HAP 未签名，只用于本机 Harmony 模拟器验收；
- 不包含生产签名、混淆、商店流程、物理真机矩阵或完整 Android/iOS 回归；
- `apps/cli` 产品兼容、patch/template 分发和 SDK52/SDK54 产品流程切换属于另一个任务；
- 本轮未执行 npm publish、registry 写入或 push。

## Git 状态

- 分支：`feat/V1.5.0`；
- 暂存区为空；
- 未 commit；
- 未 push；
- 未 publish。
